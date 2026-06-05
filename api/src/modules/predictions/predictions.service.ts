import { eq, desc, asc, inArray, and, gte, sql } from 'drizzle-orm';
import type { Db } from '../../config/database';
import {
  races, circuits, racePredictions, driverPredictionFeatures,
  drivers, teams, raceResults, seasons, driverSeasonStats,
  sprintPredictions, sprintResults, driverSprintFeatures,
} from '../../db/schema';
import type {
  PredictionResponse, DriverPrediction, Driver,
  PredictionHistoryItem, IntelStandingRow, ModelInfo,
} from '../../common/types';
import { toDriver, toRace, toCircuit } from '../../common/mappers';

function toFeatures(f: typeof driverPredictionFeatures.$inferSelect) {
  return {
    carPerformance: f.carPerformanceScore,
    driverRating: f.driverRatingScore,
    startingPosition: f.startingPositionScore,
    winRate: f.winRateScore,
    luckFactor: f.luckFactorScore,
    weatherImpact: f.weatherImpactScore,
    trackOvertake: f.trackOvertakeScore ?? null,
    positionGain: f.positionGainScore,
    longRunPace: f.longRunPaceScore ?? null,
    reliability: f.reliabilityScore ?? null,
    qualifyingDelta: f.qualifyingDeltaScore ?? null,
    sectorStrength: f.sectorStrengthScore ?? null,
    tyreDeg: f.tyreDegScore ?? null,
    circuitAdjStartPos: f.circuitAdjStartPosScore ?? null,
    circuitAdjPositionGain: f.circuitAdjPositionGainScore ?? null,
  };
}

export class PredictionsService {
  async findUpcoming(db: Db): Promise<PredictionResponse | null> {
    return this.buildResponse(db, 'upcoming');
  }

  async findByRaceId(db: Db, raceId: number): Promise<PredictionResponse | null> {
    return this.buildResponse(db, raceId);
  }

  async findHistory(db: Db, year: number): Promise<PredictionHistoryItem[]> {
    const [rows, sprintRows] = await Promise.all([
      db.select()
        .from(racePredictions)
        .innerJoin(races, eq(racePredictions.raceId, races.id))
        .innerJoin(seasons, eq(races.seasonId, seasons.id))
        .innerJoin(circuits, eq(races.circuitId, circuits.id))
        .innerJoin(drivers, eq(racePredictions.predictedWinnerId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(eq(seasons.year, year))
        .orderBy(desc(races.raceDate)),
      db.select()
        .from(sprintPredictions)
        .innerJoin(races, eq(sprintPredictions.raceId, races.id))
        .innerJoin(seasons, eq(races.seasonId, seasons.id))
        .innerJoin(circuits, eq(races.circuitId, circuits.id))
        .innerJoin(drivers, eq(sprintPredictions.predictedWinnerId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(eq(seasons.year, year))
        .orderBy(desc(races.raceDate)),
    ]);

    const completedRaceIds = rows.filter((r) => r.races.status === 'completed').map((r) => r.races.id);
    const sprintDoneIds = sprintRows
      .filter((r) => ['sprint_done', 'qualifying_done', 'completed'].includes(r.races.status))
      .map((r) => r.races.id);
    const raceIds = rows.map((r) => r.races.id);
    const sprintRaceIds = sprintRows.map((r) => r.races.id);

    // Fetch actual winners and win probabilities in two parallel pairs
    const [mainWinnerRows, sprintWinnerRows] = await Promise.all([
      completedRaceIds.length > 0
        ? db.select()
            .from(raceResults)
            .innerJoin(drivers, eq(raceResults.driverId, drivers.id))
            .innerJoin(teams, eq(drivers.teamId, teams.id))
            .where(and(inArray(raceResults.raceId, completedRaceIds), eq(raceResults.finishPosition, 1)))
        : Promise.resolve([]),
      sprintDoneIds.length > 0
        ? db.select()
            .from(sprintResults)
            .innerJoin(drivers, eq(sprintResults.driverId, drivers.id))
            .innerJoin(teams, eq(drivers.teamId, teams.id))
            .where(and(inArray(sprintResults.raceId, sprintDoneIds), eq(sprintResults.finishPosition, 1)))
        : Promise.resolve([]),
    ]);

    const [probRows, sprintProbRows] = await Promise.all([
      raceIds.length > 0
        ? db.select({
            raceId: driverPredictionFeatures.raceId,
            driverId: driverPredictionFeatures.driverId,
            winProbability: driverPredictionFeatures.winProbability,
          })
          .from(driverPredictionFeatures)
          .where(inArray(driverPredictionFeatures.raceId, raceIds))
        : Promise.resolve([]),
      sprintRaceIds.length > 0
        ? db.select({
            raceId: driverSprintFeatures.raceId,
            driverId: driverSprintFeatures.driverId,
            winProbability: driverSprintFeatures.winProbability,
          })
          .from(driverSprintFeatures)
          .where(inArray(driverSprintFeatures.raceId, sprintRaceIds))
        : Promise.resolve([]),
    ]);

    const actualWinnerMap = new Map<number, Driver>();
    for (const w of mainWinnerRows) {
      actualWinnerMap.set(w.race_results.raceId, toDriver(w.drivers, w.teams));
    }

    const sprintActualMap = new Map<number, Driver>();
    for (const w of sprintWinnerRows) {
      sprintActualMap.set(w.sprint_results.raceId, toDriver(w.drivers, w.teams));
    }

    const probMap = new Map<string, string>();
    for (const p of probRows) probMap.set(`${p.raceId}:${p.driverId}`, p.winProbability);

    const sprintProbMap = new Map<string, string>();
    for (const p of sprintProbRows) sprintProbMap.set(`${p.raceId}:${p.driverId}`, p.winProbability);

    const mainItems: PredictionHistoryItem[] = rows.map((r) => {
      const { races: race, circuits: circuit, drivers: driver, teams: team, race_predictions: pred } = r;
      const predictedWinner = toDriver(driver, team);
      const actualWinner = race.status === 'completed' ? (actualWinnerMap.get(race.id) ?? null) : null;
      return {
        raceId: race.id, raceName: race.name, raceDate: race.raceDate,
        roundNumber: race.roundNumber, circuit: toCircuit(circuit),
        predictedWinner, actualWinner,
        winProbability: probMap.get(`${race.id}:${driver.id}`) ?? '0',
        correct: (race.status === 'completed' && actualWinner !== null)
          ? (actualWinner.id === predictedWinner.id)
          : null,
        computedAt: pred.computedAt.toISOString(),
        isSprint: false,
      };
    });

    const sprintItems: PredictionHistoryItem[] = sprintRows.map((r) => {
      const { races: race, circuits: circuit, drivers: driver, teams: team, sprint_predictions: pred } = r;
      const predictedWinner = toDriver(driver, team);
      const isDone = ['sprint_done', 'qualifying_done', 'completed'].includes(race.status);
      const actualWinner = isDone ? (sprintActualMap.get(race.id) ?? null) : null;
      return {
        raceId: race.id, raceName: race.name, raceDate: race.raceDate,
        roundNumber: race.roundNumber, circuit: toCircuit(circuit),
        predictedWinner, actualWinner,
        winProbability: sprintProbMap.get(`${race.id}:${driver.id}`) ?? '0',
        correct: (isDone && actualWinner !== null) ? (actualWinner.id === predictedWinner.id) : null,
        computedAt: pred.computedAt.toISOString(),
        isSprint: true,
      };
    });

    return [...mainItems, ...sprintItems].sort((a, b) =>
      new Date(b.raceDate).getTime() - new Date(a.raceDate).getTime()
    );
  }

  async findIntelStandings(db: Db, year: number): Promise<IntelStandingRow[]> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return [];

    const raceIdsRows = await db
      .selectDistinct({ id: races.id })
      .from(races)
      .innerJoin(racePredictions, eq(racePredictions.raceId, races.id))
      .where(eq(races.seasonId, seasonRows[0].id));

    if (!raceIdsRows.length) return [];
    const raceIds = raceIdsRows.map((r) => r.id);

    const featureRows = await db
      .select()
      .from(driverPredictionFeatures)
      .innerJoin(drivers, eq(driverPredictionFeatures.driverId, drivers.id))
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .innerJoin(races, eq(driverPredictionFeatures.raceId, races.id))
      .where(inArray(driverPredictionFeatures.raceId, raceIds))
      .orderBy(asc(races.raceDate));

    if (!featureRows.length) return [];

    type Agg = {
      driver: ReturnType<typeof toDriver>;
      raw: number[];
      carPerf: number[]; driverRating: number[]; startingPos: number[];
      winRate: number[]; luckFactor: number[]; weatherImpact: number[];
      trackOvertake: number[]; positionGain: number[];
      longRunPace: number[]; reliability: number[];
      qualifyingDelta: number[]; sectorStrength: number[];
      tyreDeg: number[]; circuitAdjStartPos: number[]; circuitAdjPositionGain: number[];
      winProb: number[];
    };

    const byCode = new Map<string, Agg>();

    for (const row of featureRows) {
      const code = row.drivers.code;
      const f = row.driver_prediction_features;
      if (!byCode.has(code)) {
        byCode.set(code, {
          driver: toDriver(row.drivers, row.teams),
          raw: [], carPerf: [], driverRating: [], startingPos: [],
          winRate: [], luckFactor: [], weatherImpact: [], trackOvertake: [],
          positionGain: [], longRunPace: [], reliability: [],
          qualifyingDelta: [], sectorStrength: [],
          tyreDeg: [], circuitAdjStartPos: [], circuitAdjPositionGain: [],
          winProb: [],
        });
      }
      const agg = byCode.get(code)!;
      agg.driver = toDriver(row.drivers, row.teams);
      agg.raw.push(Number(f.rawWeightedScore));
      agg.carPerf.push(Number(f.carPerformanceScore));
      agg.driverRating.push(Number(f.driverRatingScore));
      agg.startingPos.push(Number(f.startingPositionScore));
      agg.winRate.push(Number(f.winRateScore));
      agg.luckFactor.push(Number(f.luckFactorScore));
      agg.weatherImpact.push(Number(f.weatherImpactScore));
      if (f.trackOvertakeScore != null) agg.trackOvertake.push(Number(f.trackOvertakeScore));
      agg.positionGain.push(Number(f.positionGainScore));
      if (f.longRunPaceScore != null) agg.longRunPace.push(Number(f.longRunPaceScore));
      if (f.reliabilityScore != null) agg.reliability.push(Number(f.reliabilityScore));
      if (f.qualifyingDeltaScore != null) agg.qualifyingDelta.push(Number(f.qualifyingDeltaScore));
      if (f.sectorStrengthScore != null) agg.sectorStrength.push(Number(f.sectorStrengthScore));
      if (f.tyreDegScore != null) agg.tyreDeg.push(Number(f.tyreDegScore));
      if (f.circuitAdjStartPosScore != null) agg.circuitAdjStartPos.push(Number(f.circuitAdjStartPosScore));
      if (f.circuitAdjPositionGainScore != null) agg.circuitAdjPositionGain.push(Number(f.circuitAdjPositionGainScore));
      agg.winProb.push(Number(f.winProbability));
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const avgStr = (arr: number[]) => String(avg(arr));
    const avgNullable = (arr: number[]) => arr.length ? String(avg(arr)) : null;

    const results = Array.from(byCode.values()).map((agg) => {
      const avgRaw = avg(agg.raw);
      return {
        driver: agg.driver,
        features: {
          carPerformance: avgStr(agg.carPerf),
          driverRating: avgStr(agg.driverRating),
          startingPosition: avgStr(agg.startingPos),
          winRate: avgStr(agg.winRate),
          luckFactor: avgStr(agg.luckFactor),
          weatherImpact: avgStr(agg.weatherImpact),
          trackOvertake: avgNullable(agg.trackOvertake),
          positionGain: avgStr(agg.positionGain),
          longRunPace: avgNullable(agg.longRunPace),
          reliability: avgNullable(agg.reliability),
          qualifyingDelta: avgNullable(agg.qualifyingDelta),
          sectorStrength: avgNullable(agg.sectorStrength),
          tyreDeg: avgNullable(agg.tyreDeg),
          circuitAdjStartPos: avgNullable(agg.circuitAdjStartPos),
          circuitAdjPositionGain: avgNullable(agg.circuitAdjPositionGain),
        },
        rawWeightedScore: String(avgRaw),
        winProbability: String(avg(agg.winProb)),
        predictedPosition: null,
        _avgRaw: avgRaw,
      };
    });

    results.sort((a, b) => b._avgRaw - a._avgRaw);

    const rawVals = results.map((r) => r._avgRaw);
    const minScore = Math.min(...rawVals);
    const maxScore = Math.max(...rawVals);
    const range = maxScore - minScore || 1;

    const driverIds = results.map((r) => r.driver.id);
    const sprintStatsRows = driverIds.length > 0
      ? await db
          .select({
            driverId: driverSeasonStats.driverId,
            sprintWins: driverSeasonStats.sprintWins,
            sprintPodiums: driverSeasonStats.sprintPodiums,
            sprintTotalPoints: driverSeasonStats.sprintTotalPoints,
          })
          .from(driverSeasonStats)
          .where(and(
            inArray(driverSeasonStats.driverId, driverIds),
            eq(driverSeasonStats.seasonId, seasonRows[0].id),
          ))
      : [];
    const sprintMap = new Map(sprintStatsRows.map((s) => [s.driverId, s]));

    return results.map((r) => {
      const sprint = sprintMap.get(r.driver.id);
      return {
        driver: r.driver,
        features: r.features,
        rawWeightedScore: r.rawWeightedScore,
        winProbability: r.winProbability,
        predictedPosition: r.predictedPosition,
        overallScore: Math.round(((r._avgRaw - minScore) / range) * 100),
        sprintWins: sprint?.sprintWins ?? 0,
        sprintPodiums: sprint?.sprintPodiums ?? 0,
        sprintTotalPoints: sprint?.sprintTotalPoints ?? '0',
      };
    });
  }

  private async buildResponse(db: Db, target: 'upcoming' | number): Promise<PredictionResponse | null> {
    const raceRows =
      target === 'upcoming'
        ? await db
            .select()
            .from(racePredictions)
            .innerJoin(races, eq(racePredictions.raceId, races.id))
            .innerJoin(circuits, eq(races.circuitId, circuits.id))
            .where(and(
              eq(races.status, 'qualifying_done'),
              gte(races.raceDate, sql`CURRENT_DATE`),
            ))
            .orderBy(asc(races.raceDate))
            .limit(1)
        : await db
            .select()
            .from(racePredictions)
            .innerJoin(races, eq(racePredictions.raceId, races.id))
            .innerJoin(circuits, eq(races.circuitId, circuits.id))
            .where(eq(racePredictions.raceId, target))
            .limit(1);

    if (!raceRows[0]) return null;
    const { race_predictions: prediction, races: race, circuits: circuit } = raceRows[0];

    const featureRows = await db
      .select()
      .from(driverPredictionFeatures)
      .innerJoin(drivers, eq(driverPredictionFeatures.driverId, drivers.id))
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(eq(driverPredictionFeatures.raceId, race.id))
      .orderBy(asc(driverPredictionFeatures.predictedPosition));

    const winnerRow = featureRows.find((r) => r.drivers.id === prediction.predictedWinnerId);
    if (!winnerRow) return null;

    const driverPredictions: DriverPrediction[] = featureRows.map((r) => ({
      driver: toDriver(r.drivers, r.teams),
      winProbability: r.driver_prediction_features.winProbability,
      predictedPosition: r.driver_prediction_features.predictedPosition,
      features: toFeatures(r.driver_prediction_features),
    }));

    return {
      race: toRace(race, circuit),
      predictedWinner: toDriver(winnerRow.drivers, winnerRow.teams),
      computedAt: prediction.computedAt.toISOString(),
      modelVersion: prediction.modelVersion,
      drivers: driverPredictions,
    };
  }

  async getModelInfo(db: Db): Promise<ModelInfo> {
    const [gp, sprint] = await Promise.all([
      db.select({ version: racePredictions.modelVersion })
        .from(racePredictions)
        .orderBy(desc(racePredictions.computedAt))
        .limit(1),
      db.select({ version: sprintPredictions.modelVersion })
        .from(sprintPredictions)
        .orderBy(desc(sprintPredictions.computedAt))
        .limit(1),
    ]);
    return {
      gpVersion: gp[0]?.version ?? 'weighted-v3',
      sprintVersion: sprint[0]?.version ?? 'sprint-v2',
    };
  }
}
