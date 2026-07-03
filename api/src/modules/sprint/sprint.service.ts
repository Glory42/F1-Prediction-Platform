import { eq, asc, desc, inArray, and, gte, sql } from 'drizzle-orm';
import type { Db } from '../../config/database';
import {
  races, circuits, sprintPredictions, driverSprintFeatures,
  sprintResults, sprintLapTimes, drivers, teams,
} from '../../db/schema';
import type {
  Driver, SprintPredictionResponse, DriverSprintPrediction,
  SprintResult, SprintDetailResponse, SprintFeatureScores, LapSummary,
} from '../../common/types';
import { SPRINT_FORMATS } from '../../common/constants';
import { toDriver, toRace } from '../../common/mappers';

function toSprintFeatures(f: typeof driverSprintFeatures.$inferSelect): SprintFeatureScores {
  return {
    carPerformance: f.carPerformanceScore,
    startingPosition: f.startingPositionScore,
    driverRating: f.driverRatingScore,
    trackOvertake: f.trackOvertakeScore ?? null,
    shortRunPace: f.shortRunPaceScore,
    weatherImpact: f.weatherImpactScore,
    winRate: f.winRateScore,
    luckFactor: f.luckFactorScore,
    circuitAdjStartPos: f.circuitAdjStartPosScore ?? null,
    sqQualifyingDelta: f.sqQualifyingDeltaScore ?? null,
  };
}

export class SprintService {
  async findUpcoming(db: Db): Promise<SprintPredictionResponse | null> {
    return this.buildPredictionResponse(db, 'upcoming');
  }

  async findByRaceId(db: Db, raceId: number): Promise<SprintPredictionResponse | null> {
    return this.buildPredictionResponse(db, raceId);
  }

  async findDetailByRaceId(db: Db, raceId: number): Promise<SprintDetailResponse | null> {
    const raceRows = await db
      .select()
      .from(races)
      .innerJoin(circuits, eq(races.circuitId, circuits.id))
      .where(eq(races.id, raceId))
      .limit(1);

    if (!raceRows[0]) return null;
    const { races: race, circuits: circuit } = raceRows[0];

    if (!(SPRINT_FORMATS as readonly string[]).includes(race.eventFormat)) return null;

    const prediction = await this.buildPredictionResponse(db, raceId);

    const [resultRows, lapRows] = await Promise.all([
      db
        .select()
        .from(sprintResults)
        .innerJoin(drivers, eq(sprintResults.driverId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(eq(sprintResults.raceId, raceId))
        .orderBy(asc(sprintResults.finishPosition)),
      db
        .select()
        .from(sprintLapTimes)
        .innerJoin(drivers, eq(sprintLapTimes.driverId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(eq(sprintLapTimes.raceId, raceId)),
    ]);

    // Return all rows (including grid_set placeholder rows) so frontend can render qualifying times
    const completedResults: SprintResult[] = resultRows
      .map((r) => ({
        id: r.sprint_results.id,
        raceId: r.sprint_results.raceId,
        driverId: r.sprint_results.driverId,
        finishPosition: r.sprint_results.finishPosition,
        gridPosition: r.sprint_results.gridPosition,
        points: r.sprint_results.points,
        status: r.sprint_results.status,
        fastestLap: r.sprint_results.fastestLap,
        sq1TimeMs: r.sprint_results.sq1TimeMs ?? null,
        sq2TimeMs: r.sprint_results.sq2TimeMs ?? null,
        sq3TimeMs: r.sprint_results.sq3TimeMs ?? null,
        sqSector1Ms: r.sprint_results.sqSector1Ms ?? null,
        sqSector2Ms: r.sprint_results.sqSector2Ms ?? null,
        sqSector3Ms: r.sprint_results.sqSector3Ms ?? null,
        sqSpeedSt: r.sprint_results.sqSpeedSt ?? null,
        driver: toDriver(r.drivers, r.teams),
      }));

    const lapsByDriver = new Map<number, { lapTimes: number[]; total: number; driver: typeof drivers.$inferSelect; team: typeof teams.$inferSelect }>();
    for (const row of lapRows) {
      const driverId = row.sprint_lap_times.driverId;
      if (!lapsByDriver.has(driverId)) {
        lapsByDriver.set(driverId, { lapTimes: [], total: 0, driver: row.drivers, team: row.teams });
      }
      const entry = lapsByDriver.get(driverId)!;
      entry.total += 1;
      if (row.sprint_lap_times.lapTimeMs) entry.lapTimes.push(row.sprint_lap_times.lapTimeMs);
    }

    const laps: LapSummary[] = [...lapsByDriver.values()].map(({ lapTimes, total, driver: d, team: t }) => ({
      driverId: d.id,
      fastestLapMs: lapTimes.length > 0 ? Math.min(...lapTimes) : null,
      avgLapMs: lapTimes.length > 0 ? Math.round(lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length) : null,
      totalLaps: total,
      driver: toDriver(d, t),
    })).sort((a, b) => (a.fastestLapMs ?? Infinity) - (b.fastestLapMs ?? Infinity));

    return {
      race: toRace(race, circuit),
      prediction,
      results: completedResults,
      laps,
    };
  }

  private async buildPredictionResponse(
    db: Db,
    target: 'upcoming' | number,
  ): Promise<SprintPredictionResponse | null> {
    const predRows =
      target === 'upcoming'
        ? await db
            .select()
            .from(sprintPredictions)
            .innerJoin(races, eq(sprintPredictions.raceId, races.id))
            .innerJoin(circuits, eq(races.circuitId, circuits.id))
            .where(and(
              inArray(races.status, ['sprint_qualifying_done', 'sprint_done', 'qualifying_done']),
              gte(sql`DATE(${races.sprintDate})`, sql`CURRENT_DATE`),
            ))
            .orderBy(asc(races.sprintDate))
            .limit(1)
        : await db
            .select()
            .from(sprintPredictions)
            .innerJoin(races, eq(sprintPredictions.raceId, races.id))
            .innerJoin(circuits, eq(races.circuitId, circuits.id))
            .where(eq(sprintPredictions.raceId, target))
            .limit(1);

    if (!predRows[0]) return null;
    const { sprint_predictions: pred, races: race, circuits: circuit } = predRows[0];

    const featureRows = await db
      .select()
      .from(driverSprintFeatures)
      .innerJoin(drivers, eq(driverSprintFeatures.driverId, drivers.id))
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(eq(driverSprintFeatures.raceId, race.id))
      .orderBy(asc(driverSprintFeatures.predictedPosition));

    const winnerRow = featureRows.find((r) => r.drivers.id === pred.predictedWinnerId);
    if (!winnerRow) return null;

    const driverPredictions: DriverSprintPrediction[] = featureRows.map((r) => ({
      driver: toDriver(r.drivers, r.teams),
      winProbability: r.driver_sprint_features.winProbability,
      predictedPosition: r.driver_sprint_features.predictedPosition,
      features: toSprintFeatures(r.driver_sprint_features),
    }));

    return {
      race: toRace(race, circuit),
      predictedWinner: toDriver(winnerRow.drivers, winnerRow.teams),
      computedAt: pred.computedAt.toISOString(),
      modelVersion: pred.modelVersion,
      drivers: driverPredictions,
    };
  }
}
