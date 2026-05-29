import { eq, and, asc, desc, isNotNull, sql, inArray } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { races, circuits, raceResults, qualifyingResults, lapTimes, drivers, teams } from '../../db/schema';
import type { CircuitHistoryItem } from '../../common/types';
import type { Race, RaceDetailResponse, RaceResult, QualifyingResult, LapSummary } from '../../common/types';

function toDriver(d: typeof drivers.$inferSelect, t: typeof teams.$inferSelect) {
  return {
    id: d.id,
    seasonId: d.seasonId,
    teamId: d.teamId,
    driverNumber: d.driverNumber,
    code: d.code,
    firstName: d.firstName,
    lastName: d.lastName,
    fullName: `${d.firstName} ${d.lastName}`,
    nationality: d.nationality,
    headshotUrl: d.headshotUrl ?? null,
    team: { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality },
  };
}

function toRace(race: typeof races.$inferSelect, circuit: typeof circuits.$inferSelect) {
  return {
    id: race.id, seasonId: race.seasonId, roundNumber: race.roundNumber,
    name: race.name, raceDate: race.raceDate, status: race.status, weather: race.weather,
    safetyCarLaps: race.safetyCarLaps ?? null,
    vscLaps: race.vscLaps ?? null,
    airTempAvg: race.airTempAvg ?? null,
    trackTempAvg: race.trackTempAvg ?? null,
    humidityAvg: race.humidityAvg ?? null,
    circuit: {
      id: circuit.id, circuitKey: circuit.circuitKey, name: circuit.name,
      country: circuit.country, city: circuit.city, lapCount: circuit.lapCount,
      trackLengthKm: circuit.trackLengthKm, overtakeRate: circuit.overtakeRate,
    },
  };
}

export class RacesService {
  async findAll(db: Db, year: number, status?: string): Promise<Race[]> {
    const rows = await db
      .select()
      .from(races)
      .innerJoin(circuits, eq(races.circuitId, circuits.id))
      .where(
        status
          ? and(eq(sql`extract(year from ${races.raceDate}::date)`, year), eq(races.status, status as any))
          : eq(sql`extract(year from ${races.raceDate}::date)`, year)
      )
      .orderBy(asc(races.raceDate));

    return rows.map((r) => toRace(r.races, r.circuits));
  }

  async findCircuitHistory(db: Db, circuitKey: string, limit = 6): Promise<CircuitHistoryItem[]> {
    const raceRows = await db
      .select()
      .from(races)
      .innerJoin(circuits, eq(races.circuitId, circuits.id))
      .where(and(eq(circuits.circuitKey, circuitKey), eq(races.status, 'completed')))
      .orderBy(desc(races.raceDate))
      .limit(limit);

    if (!raceRows.length) return [];

    const raceIds = raceRows.map((r) => r.races.id);
    const winnerRows = await db
      .select()
      .from(raceResults)
      .innerJoin(drivers, eq(raceResults.driverId, drivers.id))
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(and(inArray(raceResults.raceId, raceIds), eq(raceResults.finishPosition, 1)));

    const winnerMap = new Map<number, typeof winnerRows[0]>();
    for (const w of winnerRows) winnerMap.set(w.race_results.raceId, w);

    return raceRows.map((r) => {
      const w = winnerMap.get(r.races.id);
      return {
        raceId: r.races.id,
        raceName: r.races.name,
        raceDate: r.races.raceDate,
        year: new Date(r.races.raceDate).getFullYear(),
        winner: w ? toDriver(w.drivers, w.teams) : null,
      };
    });
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
