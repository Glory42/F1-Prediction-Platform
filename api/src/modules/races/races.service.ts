import { eq, and, asc, desc, gte, lte, isNotNull, sql, inArray } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { races, circuits, raceResults, qualifyingResults, lapTimes, drivers, teams, seasons } from '../../db/schema';
import type { CircuitHistoryItem } from '../../common/types';
import type { Race, RaceDetailResponse, RaceResult, QualifyingResult, LapSummary, CircuitDetailResponse } from '../../common/types';
import { SPRINT_FORMATS } from '../../common/constants';
import { toDriver, toRace, toCircuit } from '../../common/mappers';

export class RacesService {
  async findAll(db: Db, year: number, status?: string): Promise<Race[]> {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const rows = await db
      .select()
      .from(races)
      .innerJoin(circuits, eq(races.circuitId, circuits.id))
      .where(
        status
          ? and(gte(races.raceDate, yearStart), lte(races.raceDate, yearEnd), eq(races.status, status as any))
          : and(gte(races.raceDate, yearStart), lte(races.raceDate, yearEnd))
      )
      .orderBy(asc(races.raceDate));

    return rows.map((r) => toRace(r.races, r.circuits));
  }

  async findAllCircuits(db: Db) {
    const rows = await db
      .select()
      .from(circuits)
      .orderBy(asc(circuits.name));
    return rows.map((r) => toCircuit(r));
  }

  async findCircuitDetails(db: Db, circuitKey: string, limit = 10): Promise<CircuitDetailResponse | null> {
    const circuitRows = await db
      .select()
      .from(circuits)
      .where(eq(circuits.circuitKey, circuitKey))
      .limit(1);

    if (!circuitRows.length) return null;
    const circuit = circuitRows[0];

    const raceRows = await db
      .select()
      .from(races)
      .where(and(eq(races.circuitId, circuit.id), eq(races.status, 'completed')))
      .orderBy(desc(races.raceDate));

    const raceIds = raceRows.map((r) => r.id);
    let history: CircuitHistoryItem[] = [];
    let constructorDominance: { team: any; wins: number }[] = [];
    let driverDominance: { driver: any; wins: number }[] = [];
    let weatherStats = { dry: 0, wet: 0, mixed: 0, unknown: 0 };
    let fastestLapResult: CircuitDetailResponse['fastestLap'] = null;
    let dominance: CircuitDetailResponse['dominance'] = {
      all: { constructors: [], drivers: [] },
      modern: { constructors: [], drivers: [] },
      legacy: { constructors: [], drivers: [] },
      nineties: { constructors: [], drivers: [] },
    };
    let poleToWinRate = 0;
    let avgWinnerGridPos = 1.0;
    let completedRacesWithScData = 0;
    let totalScLaps = 0;
    let racesWithSc = 0;
    let avgScLaps = 0;
    let scRaceRate = 0;

    if (raceIds.length > 0) {
      const winnerRows = await db
        .select()
        .from(raceResults)
        .innerJoin(drivers, eq(raceResults.driverId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(and(inArray(raceResults.raceId, raceIds), eq(raceResults.finishPosition, 1)));

      const winnerMap = new Map<number, typeof winnerRows[0]>();
      const raceMap = new Map(raceRows.map(r => [r.id, r]));

      const teamWinsByEra: Record<string, Map<string, { team: any; wins: number; bestIdx: number }>> = {
        all: new Map(),
        modern: new Map(),
        legacy: new Map(),
        nineties: new Map(),
      };
      const driverWinsByEra: Record<string, Map<string, { driver: any; team: any; wins: number; bestIdx: number }>> = {
        all: new Map(),
        modern: new Map(),
        legacy: new Map(),
        nineties: new Map(),
      };

      const raceOrder = new Map(raceIds.map((id, idx) => [id, idx]));

      for (const w of winnerRows) {
        winnerMap.set(w.race_results.raceId, w);
        const currentIdx = raceOrder.get(w.race_results.raceId) ?? 999;
        const race = raceMap.get(w.race_results.raceId);
        const year = race ? new Date(race.raceDate).getFullYear() : 2000;

        let teamKey = w.teams.teamKey;
        if (teamKey === 'red_bull') teamKey = 'red_bull_racing';
        if (teamKey === 'rb') teamKey = 'racing_bulls';
        if (teamKey === 'alphatauri') teamKey = 'alpha_tauri';
        if (teamKey === 'alfa_romeo') teamKey = 'alfa_romeo_racing';
        if (teamKey === 'lotus_f1') teamKey = 'lotus';

        const targetEras = ['all'];
        if (year >= 2018) targetEras.push('modern');
        else if (year >= 2000) targetEras.push('legacy');
        else if (year >= 1990) targetEras.push('nineties');

        for (const era of targetEras) {
          const teamWins = teamWinsByEra[era];
          if (!teamWins.has(teamKey)) {
            teamWins.set(teamKey, { team: w.teams, wins: 0, bestIdx: currentIdx });
          } else {
            const existing = teamWins.get(teamKey)!;
            if (currentIdx < existing.bestIdx) {
              existing.bestIdx = currentIdx;
              existing.team = w.teams;
            }
          }
          teamWins.get(teamKey)!.wins += 1;

          const driverWinsMap = driverWinsByEra[era];
          const driverKey = `${w.drivers.firstName} ${w.drivers.lastName}`;
          if (!driverWinsMap.has(driverKey)) {
            driverWinsMap.set(driverKey, { driver: w.drivers, team: w.teams, wins: 0, bestIdx: currentIdx });
          } else {
            const existing = driverWinsMap.get(driverKey)!;
            if (currentIdx < existing.bestIdx) {
              existing.bestIdx = currentIdx;
              existing.driver = w.drivers;
              existing.team = w.teams;
            }
          }
          driverWinsMap.get(driverKey)!.wins += 1;
        }
      }

      const driverLastNames = Array.from(driverWinsByEra.all.values())
        .map(v => v.driver.lastName)
        .filter(c => c !== null);
      if (driverLastNames.length > 0) {
        const latestProfiles = await db
          .select({
            driver: drivers,
            team: teams,
            year: seasons.year
          })
          .from(drivers)
          .innerJoin(teams, eq(drivers.teamId, teams.id))
          .innerJoin(seasons, eq(drivers.seasonId, seasons.id))
          .where(inArray(drivers.lastName, driverLastNames))
          .orderBy(desc(seasons.year));

        const seenFullNames = new Set<string>();
        for (const p of latestProfiles) {
          const fullName = `${p.driver.firstName} ${p.driver.lastName}`;
          if (fullName && !seenFullNames.has(fullName)) {
            seenFullNames.add(fullName);
            for (const era of ['all', 'modern', 'legacy', 'nineties']) {
              const entry = driverWinsByEra[era].get(fullName);
              if (entry) {
                entry.driver = p.driver;
                entry.team = p.team;
              }
            }
          }
        }
      }

      history = raceRows.slice(0, limit).map((r) => {
        const w = winnerMap.get(r.id);
        let winnerObj = null;
        if (w) {
          const driverKey = `${w.drivers.firstName} ${w.drivers.lastName}`;
          const latestProfile = driverWinsByEra.all.get(driverKey);
          winnerObj = toDriver(w.drivers, w.teams);
          if (!winnerObj.headshotUrl && latestProfile?.driver.headshotUrl) {
            winnerObj.headshotUrl = latestProfile.driver.headshotUrl;
          }
        }
        
        return {
          raceId: r.id,
          raceName: r.name,
          raceDate: r.raceDate,
          year: new Date(r.raceDate).getFullYear(),
          hasSprint: (SPRINT_FORMATS as readonly string[]).includes(r.eventFormat),
          winner: winnerObj,
        };
      });

      const getEraDominance = (era: string) => {
        const teamWins = teamWinsByEra[era];
        const driverWinsMap = driverWinsByEra[era];
        
        const constructors = Array.from(teamWins.values())
          .sort((a, b) => b.wins - a.wins);
        const drivers = Array.from(driverWinsMap.values())
          .sort((a, b) => b.wins - a.wins)
          .map((d) => ({
            driver: toDriver(d.driver, d.team),
            wins: d.wins,
          }));
        return { constructors, drivers };
      };

      dominance = {
        all: getEraDominance('all'),
        modern: getEraDominance('modern'),
        legacy: getEraDominance('legacy'),
        nineties: getEraDominance('nineties'),
      };

      constructorDominance = dominance.all.constructors;
      driverDominance = dominance.all.drivers;

      // Qualifying Impact & Safety Car calculations
      let poleWins = 0;
      let totalWinnerGridPos = 0;
      const completedWinnerCount = winnerRows.length;

      for (const w of winnerRows) {
        const gridPos = w.race_results.gridPosition;
        if (gridPos === 1) {
          poleWins++;
        }
        if (gridPos !== null && gridPos !== undefined) {
          totalWinnerGridPos += gridPos;
        } else {
          totalWinnerGridPos += 1;
        }
      }

      poleToWinRate = completedWinnerCount > 0 ? (poleWins / completedWinnerCount) : 0;
      avgWinnerGridPos = completedWinnerCount > 0 ? (totalWinnerGridPos / completedWinnerCount) : 1.0;

      for (const r of raceRows) {
        const w = (r.weather || '').toLowerCase();
        if (w.includes('wet') || w.includes('rain')) weatherStats.wet++;
        else if (w.includes('mixed') || w.includes('changeable')) weatherStats.mixed++;
        else if (w.includes('dry') || w.includes('clear') || w.includes('sunny') || w.includes('cloudy')) weatherStats.dry++;
        else weatherStats.unknown++;

        if (r.safetyCarLaps !== null && r.safetyCarLaps !== undefined) {
          completedRacesWithScData++;
          totalScLaps += r.safetyCarLaps;
          if (r.safetyCarLaps > 0) {
            racesWithSc++;
          }
        }
      }

      avgScLaps = completedRacesWithScData > 0 ? (totalScLaps / completedRacesWithScData) : 0;
      scRaceRate = completedRacesWithScData > 0 ? (racesWithSc / completedRacesWithScData) : 0;

      const lapRows = await db
        .select()
        .from(lapTimes)
        .innerJoin(drivers, eq(lapTimes.driverId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .innerJoin(races, eq(lapTimes.raceId, races.id))
        .where(and(inArray(lapTimes.raceId, raceIds), isNotNull(lapTimes.lapTimeMs), eq(lapTimes.isPitLap, false)))
        .orderBy(asc(lapTimes.lapTimeMs))
        .limit(1);

      if (lapRows.length > 0) {
        const row = lapRows[0];
        fastestLapResult = {
          timeMs: row.lap_times.lapTimeMs!,
          driver: toDriver(row.drivers, row.teams),
          year: new Date(row.races.raceDate).getFullYear(),
        };
      }
    }

    return {
      circuit: toCircuit(circuit),
      history,
      fastestLap: fastestLapResult,
      dominance,
      constructorDominance,
      driverDominance,
      weatherStats,
      qualifyingImpact: {
        poleToWinRate,
        avgWinnerGridPos,
      },
      safetyCarStats: {
        avgScLaps,
        scRaceRate,
      },
    };
  }

  async findById(db: Db, raceId: number): Promise<RaceDetailResponse | null> {
    const raceRows = await db
      .select()
      .from(races)
      .innerJoin(circuits, eq(races.circuitId, circuits.id))
      .where(eq(races.id, raceId))
      .limit(1);

    if (!raceRows[0]) return null;
    const { races: race, circuits: circuit } = raceRows[0];

    const [resultsRows, qualifyingRows, lapRows] = await Promise.all([
      db
        .select()
        .from(raceResults)
        .innerJoin(drivers, eq(raceResults.driverId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(eq(raceResults.raceId, raceId))
        .orderBy(asc(raceResults.finishPosition)),

      db
        .select()
        .from(qualifyingResults)
        .innerJoin(drivers, eq(qualifyingResults.driverId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(eq(qualifyingResults.raceId, raceId))
        .orderBy(asc(qualifyingResults.gridPosition)),

      db
        .select({
          driverId: lapTimes.driverId,
          fastestLapMs: sql<number>`min(${lapTimes.lapTimeMs})`,
          avgLapMs: sql<number>`round(avg(${lapTimes.lapTimeMs}))`,
          totalLaps: sql<number>`count(*)`,
        })
        .from(lapTimes)
        .where(and(eq(lapTimes.raceId, raceId), isNotNull(lapTimes.lapTimeMs), eq(lapTimes.isPitLap, false)))
        .groupBy(lapTimes.driverId),
    ]);

    const driverMap = new Map(resultsRows.map((r) => [r.drivers.id, toDriver(r.drivers, r.teams)]));

    const results: RaceResult[] = resultsRows.map((r) => ({
      id: r.race_results.id,
      raceId: r.race_results.raceId,
      driverId: r.race_results.driverId,
      finishPosition: r.race_results.finishPosition,
      gridPosition: r.race_results.gridPosition,
      points: r.race_results.points,
      status: r.race_results.status,
      fastestLap: r.race_results.fastestLap,
      driver: toDriver(r.drivers, r.teams),
    }));

    const qualifying: QualifyingResult[] = qualifyingRows.map((r) => ({
      id: r.qualifying_results.id,
      driverId: r.qualifying_results.driverId,
      gridPosition: r.qualifying_results.gridPosition,
      q1TimeMs: r.qualifying_results.q1TimeMs,
      q2TimeMs: r.qualifying_results.q2TimeMs,
      q3TimeMs: r.qualifying_results.q3TimeMs,
      sector1Ms: r.qualifying_results.sector1Ms ?? null,
      sector2Ms: r.qualifying_results.sector2Ms ?? null,
      sector3Ms: r.qualifying_results.sector3Ms ?? null,
      speedSt: r.qualifying_results.speedSt ?? null,
      driver: toDriver(r.drivers, r.teams),
    }));

    const laps: LapSummary[] = lapRows
      .map((r) => ({
        driverId: r.driverId,
        fastestLapMs: r.fastestLapMs,
        avgLapMs: r.avgLapMs,
        totalLaps: Number(r.totalLaps),
        driver: driverMap.get(r.driverId)!,
      }))
      .filter((l) => l.driver);

    return { race: toRace(race, circuit), results, qualifying, laps };
  }
}
