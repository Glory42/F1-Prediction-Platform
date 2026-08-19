import { eq, desc, inArray } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { drivers, teams, seasons, lapTimes, raceResults, races } from '../../db/schema';
import type { CircuitHistoryItem, CircuitDetailResponse, Driver } from '../../common/types';
import { SPRINT_FORMATS } from '../../common/constants';
import { toDriver, toTeam } from '../../common/mappers';

type RaceRow = typeof races.$inferSelect;
type TeamRow = typeof teams.$inferSelect;
type DriverRow = typeof drivers.$inferSelect;
type RaceResultRow = typeof raceResults.$inferSelect;
type LapTimeRow = typeof lapTimes.$inferSelect;

export interface WinnerRow {
  race_results: RaceResultRow;
  drivers: DriverRow;
  teams: TeamRow;
}

export interface FastestLapRow {
  lap_times: LapTimeRow;
  drivers: DriverRow;
  teams: TeamRow;
  races: RaceRow;
}

export type Era = 'all' | 'modern' | 'legacy' | 'nineties';
export type EraMap<T> = Record<Era, T>;

const ERAS: Era[] = ['all', 'modern', 'legacy', 'nineties'];

interface TeamWinEntry {
  team: TeamRow;
  wins: number;
  bestIdx: number;
}

interface DriverWinEntry {
  driver: DriverRow;
  team: TeamRow;
  wins: number;
  bestIdx: number;
}

export interface EraWinAggregates {
  teamWinsByEra: EraMap<Map<string, TeamWinEntry>>;
  driverWinsByEra: EraMap<Map<string, DriverWinEntry>>;
}

// F1 team identities get rebranded across seasons (Alpha Tauri -> RB -> Racing
// Bulls, Alfa Romeo -> Alfa Romeo Racing, etc). Without this, wins for the same
// constructor lineage would split across team_key variants in the dominance tallies.
const TEAM_KEY_ALIASES: Record<string, string> = {
  red_bull: 'red_bull_racing',
  rb: 'racing_bulls',
  alphatauri: 'alpha_tauri',
  alfa_romeo: 'alfa_romeo_racing',
  lotus_f1: 'lotus',
};

export function normalizeTeamKey(rawKey: string): string {
  return TEAM_KEY_ALIASES[rawKey] ?? rawKey;
}

function erasForYear(year: number): Era[] {
  const applicableEras: Era[] = ['all'];
  if (year >= 2018) applicableEras.push('modern');
  else if (year >= 2000) applicableEras.push('legacy');
  else if (year >= 1990) applicableEras.push('nineties');
  return applicableEras;
}

function driverKeyFor(driver: DriverRow): string {
  return `${driver.firstName} ${driver.lastName}`;
}

function emptyEraMap<T>(factory: () => T): EraMap<T> {
  return { all: factory(), modern: factory(), legacy: factory(), nineties: factory() };
}

export function aggregateEraWins(
  winnerRows: WinnerRow[],
  raceMap: Map<number, RaceRow>,
  raceOrder: Map<number, number>
): EraWinAggregates {
  const teamWinsByEra = emptyEraMap<Map<string, TeamWinEntry>>(() => new Map());
  const driverWinsByEra = emptyEraMap<Map<string, DriverWinEntry>>(() => new Map());

  for (const winner of winnerRows) {
    const currentIdx = raceOrder.get(winner.race_results.raceId) ?? 999;
    const race = raceMap.get(winner.race_results.raceId);
    const year = race ? new Date(race.raceDate).getFullYear() : 2000;
    const teamKey = normalizeTeamKey(winner.teams.teamKey);
    const driverKey = driverKeyFor(winner.drivers);

    for (const era of erasForYear(year)) {
      const teamWins = teamWinsByEra[era];
      const existingTeam = teamWins.get(teamKey);
      if (!existingTeam) {
        teamWins.set(teamKey, { team: winner.teams, wins: 1, bestIdx: currentIdx });
      } else {
        if (currentIdx < existingTeam.bestIdx) {
          existingTeam.bestIdx = currentIdx;
          existingTeam.team = winner.teams;
        }
        existingTeam.wins += 1;
      }

      const driverWins = driverWinsByEra[era];
      const existingDriver = driverWins.get(driverKey);
      if (!existingDriver) {
        driverWins.set(driverKey, { driver: winner.drivers, team: winner.teams, wins: 1, bestIdx: currentIdx });
      } else {
        if (currentIdx < existingDriver.bestIdx) {
          existingDriver.bestIdx = currentIdx;
          existingDriver.driver = winner.drivers;
          existingDriver.team = winner.teams;
        }
        existingDriver.wins += 1;
      }
    }
  }

  return { teamWinsByEra, driverWinsByEra };
}

export async function backfillDriverHeadshots(
  db: Db,
  driverWinsByEra: EraMap<Map<string, DriverWinEntry>>
): Promise<void> {
  const driverLastNames = Array.from(driverWinsByEra.all.values())
    .map((entry) => entry.driver.lastName)
    .filter((lastName) => lastName !== null);

  if (driverLastNames.length === 0) return;

  const latestProfiles = await db
    .select({ driver: drivers, team: teams, year: seasons.year })
    .from(drivers)
    .innerJoin(teams, eq(drivers.teamId, teams.id))
    .innerJoin(seasons, eq(drivers.seasonId, seasons.id))
    .where(inArray(drivers.lastName, driverLastNames))
    .orderBy(desc(seasons.year));

  const seenFullNames = new Set<string>();
  for (const profile of latestProfiles) {
    const fullName = driverKeyFor(profile.driver);
    if (!fullName || seenFullNames.has(fullName)) continue;
    seenFullNames.add(fullName);

    for (const era of ERAS) {
      const entry = driverWinsByEra[era].get(fullName);
      if (entry) {
        entry.driver = profile.driver;
        entry.team = profile.team;
      }
    }
  }
}

export function buildDominanceByEra(
  teamWinsByEra: EraMap<Map<string, TeamWinEntry>>,
  driverWinsByEra: EraMap<Map<string, DriverWinEntry>>
): CircuitDetailResponse['dominance'] {
  const dominanceByEra = {} as CircuitDetailResponse['dominance'];

  for (const era of ERAS) {
    dominanceByEra[era] = {
      constructors: Array.from(teamWinsByEra[era].values())
        .sort((a, b) => b.wins - a.wins)
        .map((entry) => ({ team: toTeam(entry.team), wins: entry.wins })),
      drivers: Array.from(driverWinsByEra[era].values())
        .sort((a, b) => b.wins - a.wins)
        .map((entry) => ({ driver: toDriver(entry.driver, entry.team), wins: entry.wins })),
    };
  }

  return dominanceByEra;
}

export function buildCircuitHistory(
  raceRows: RaceRow[],
  winnerMap: Map<number, WinnerRow>,
  driverWinsAllEra: Map<string, DriverWinEntry>,
  limit: number
): CircuitHistoryItem[] {
  return raceRows.slice(0, limit).map((race) => {
    const winnerRow = winnerMap.get(race.id);
    let winner: Driver | null = null;

    if (winnerRow) {
      const driverKey = driverKeyFor(winnerRow.drivers);
      const latestProfile = driverWinsAllEra.get(driverKey);
      winner = toDriver(winnerRow.drivers, winnerRow.teams);
      if (!winner.headshotUrl && latestProfile?.driver.headshotUrl) {
        winner.headshotUrl = latestProfile.driver.headshotUrl;
      }
    }

    return {
      raceId: race.id,
      raceName: race.name,
      raceDate: race.raceDate,
      year: new Date(race.raceDate).getFullYear(),
      hasSprint: (SPRINT_FORMATS as readonly string[]).includes(race.eventFormat),
      winner,
    };
  });
}

export function computeQualifyingImpactStats(winnerRows: WinnerRow[]): CircuitDetailResponse['qualifyingImpact'] {
  let poleWins = 0;
  let totalWinnerGridPos = 0;
  const completedWinnerCount = winnerRows.length;

  for (const winner of winnerRows) {
    const gridPos = winner.race_results.gridPosition;
    if (gridPos === 1) poleWins++;
    totalWinnerGridPos += gridPos !== null && gridPos !== undefined ? gridPos : 1;
  }

  return {
    poleToWinRate: completedWinnerCount > 0 ? poleWins / completedWinnerCount : 0,
    avgWinnerGridPos: completedWinnerCount > 0 ? totalWinnerGridPos / completedWinnerCount : 1.0,
  };
}

export function computeWeatherStats(raceRows: RaceRow[]): CircuitDetailResponse['weatherStats'] {
  const weatherStats = { dry: 0, wet: 0, mixed: 0, unknown: 0 };

  for (const race of raceRows) {
    const weather = (race.weather || '').toLowerCase();
    if (weather.includes('wet') || weather.includes('rain')) weatherStats.wet++;
    else if (weather.includes('mixed') || weather.includes('changeable')) weatherStats.mixed++;
    else if (weather.includes('dry') || weather.includes('clear') || weather.includes('sunny') || weather.includes('cloudy')) weatherStats.dry++;
    else weatherStats.unknown++;
  }

  return weatherStats;
}

export function computeSafetyCarStats(raceRows: RaceRow[]): CircuitDetailResponse['safetyCarStats'] {
  let completedRacesWithScData = 0;
  let totalScLaps = 0;
  let racesWithSc = 0;

  for (const race of raceRows) {
    if (race.safetyCarLaps !== null && race.safetyCarLaps !== undefined) {
      completedRacesWithScData++;
      totalScLaps += race.safetyCarLaps;
      if (race.safetyCarLaps > 0) racesWithSc++;
    }
  }

  return {
    avgScLaps: completedRacesWithScData > 0 ? totalScLaps / completedRacesWithScData : 0,
    scRaceRate: completedRacesWithScData > 0 ? racesWithSc / completedRacesWithScData : 0,
  };
}

export function pickFastestLap(lapRows: FastestLapRow[]): CircuitDetailResponse['fastestLap'] {
  if (lapRows.length === 0) return null;
  const row = lapRows[0];
  return {
    timeMs: row.lap_times.lapTimeMs!,
    driver: toDriver(row.drivers, row.teams),
    year: new Date(row.races.raceDate).getFullYear(),
  };
}
