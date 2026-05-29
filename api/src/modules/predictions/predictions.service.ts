import { eq, desc, asc, inArray, and } from 'drizzle-orm';
import type { Db } from '../../config/database';
import {
  races, circuits, racePredictions, driverPredictionFeatures,
  drivers, teams, raceResults, seasons,
} from '../../db/schema';
import type {
  PredictionResponse, DriverPrediction, Driver,
  PredictionHistoryItem, IntelStandingRow,
} from '../../common/types';

function toDriver(d: typeof drivers.$inferSelect, t: typeof teams.$inferSelect): Driver {
  return {
    id: d.id, seasonId: d.seasonId, teamId: d.teamId, driverNumber: d.driverNumber,
    code: d.code, firstName: d.firstName, lastName: d.lastName,
    fullName: `${d.firstName} ${d.lastName}`, nationality: d.nationality,
    headshotUrl: d.headshotUrl ?? null,
    team: { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality },
  };
}

function toFeatures(f: typeof driverPredictionFeatures.$inferSelect) {
  return {
    carPerformance: f.carPerformanceScore,
    driverRating: f.driverRatingScore,
    startingPosition: f.startingPositionScore,
    winRate: f.winRateScore,
    luckFactor: f.luckFactorScore,
    weatherImpact: f.weatherImpactScore,
    trackOvertake: f.trackOvertakeScore,
    positionGain: f.positionGainScore,
    longRunPace: f.longRunPaceScore ?? null,
    reliability: f.reliabilityScore ?? null,
    qualifyingDelta: f.qualifyingDeltaScore ?? null,
    sectorStrength: f.sectorStrengthScore ?? null,
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
    circuit: { id: circuit.id, circuitKey: circuit.circuitKey, name: circuit.name,
      country: circuit.country, city: circuit.city, lapCount: circuit.lapCount,
      trackLengthKm: circuit.trackLengthKm, overtakeRate: circuit.overtakeRate },
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
    const rows = await db
      .select()
      .from(racePredictions)
      .innerJoin(races, eq(racePredictions.raceId, races.id))
      .innerJoin(seasons, eq(races.seasonId, seasons.id))
      .innerJoin(circuits, eq(races.circuitId, circuits.id))
      .innerJoin(drivers, eq(racePredictions.predictedWinnerId, drivers.id))
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(eq(seasons.year, year))
      .orderBy(desc(races.raceDate));

    if (!rows.length) return [];

    const completedRaceIds = rows
      .filter((r) => r.races.status === 'completed')
      .map((r) => r.races.id);

    // Actual winners for completed races
    const actualWinnerMap = new Map<number, Driver>();
    if (completedRaceIds.length > 0) {
      const winnerRows = await db
        .select()
        .from(raceResults)
        .innerJoin(drivers, eq(raceResults.driverId, drivers.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .where(and(inArray(raceResults.raceId, completedRaceIds), eq(raceResults.finishPosition, 1)));
      for (const w of winnerRows) {
        actualWinnerMap.set(w.race_results.raceId, toDriver(w.drivers, w.teams));
      }
    }

    // Win probabilities for predicted winners
    const raceIds = rows.map((r) => r.races.id);
    const probRows = await db
      .select({
        raceId: driverPredictionFeatures.raceId,
        driverId: driverPredictionFeatures.driverId,
        winProbability: driverPredictionFeatures.winProbability,
      })
      .from(driverPredictionFeatures)
      .where(inArray(driverPredictionFeatures.raceId, raceIds));

    const probMap = new Map<string, string>();
    for (const p of probRows) {
      probMap.set(`${p.raceId}:${p.driverId}`, p.winProbability);
    }

    return rows.map((r) => {
      const { races: race, circuits: circuit, drivers: driver, teams: team, race_predictions: pred } = r;
      const predictedWinner = toDriver(driver, team);
      const actualWinner = race.status === 'completed' ? (actualWinnerMap.get(race.id) ?? null) : null;
      const correct = race.status === 'completed'
        ? actualWinner?.id === predictedWinner.id
        : null;
      const winProbability = probMap.get(`${race.id}:${driver.id}`) ?? '0';

      return {
        raceId: race.id,
        raceName: race.name,
        raceDate: race.raceDate,
        roundNumber: race.roundNumber,
        circuit: {
          id: circuit.id, circuitKey: circuit.circuitKey, name: circuit.name,
          country: circuit.country, city: circuit.city, lapCount: circuit.lapCount,
          trackLengthKm: circuit.trackLengthKm, overtakeRate: circuit.overtakeRate,
        },
        predictedWinner,
        actualWinner,
        winProbability,
        correct,
        computedAt: pred.computedAt.toISOString(),
      };
    });
  }

  async findIntelStandings(db: Db, year: number): Promise<IntelStandingRow[]> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return [];

    // All races that have predictions for this year
    const raceIdsRows = await db
      .selectDistinct({ id: races.id })
      .from(races)
      .innerJoin(racePredictions, eq(racePredictions.raceId, races.id))
      .where(eq(races.seasonId, seasonRows[0].id));

    if (!raceIdsRows.length) return [];
    const raceIds = raceIdsRows.map((r) => r.id);

    // All feature rows across every predicted race, ordered by date so latest team info wins
    const featureRows = await db
      .select()
      .from(driverPredictionFeatures)
      .innerJoin(drivers, eq(driverPredictionFeatures.driverId, drivers.id))
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .innerJoin(races, eq(driverPredictionFeatures.raceId, races.id))
      .where(inArray(driverPredictionFeatures.raceId, raceIds))
      .orderBy(asc(races.raceDate));

    if (!featureRows.length) return [];

    // Aggregate by driver code across all races
    type Agg = {
      driver: ReturnType<typeof toDriver>;
      raw: number[];
      carPerf: number[]; driverRating: number[]; startingPos: number[];
      winRate: number[]; luckFactor: number[]; weatherImpact: number[];
      trackOvertake: number[]; positionGain: number[];
      longRunPace: number[]; reliability: number[];
      qualifyingDelta: number[]; sectorStrength: number[];
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
          qualifyingDelta: [], sectorStrength: [], winProb: [],
        });
      }
      const agg = byCode.get(code)!;
      agg.driver = toDriver(row.drivers, row.teams); // last write = most recent race
      agg.raw.push(Number(f.rawWeightedScore));
      agg.carPerf.push(Number(f.carPerformanceScore));
      agg.driverRating.push(Number(f.driverRatingScore));
      agg.startingPos.push(Number(f.startingPositionScore));
      agg.winRate.push(Number(f.winRateScore));
      agg.luckFactor.push(Number(f.luckFactorScore));
      agg.weatherImpact.push(Number(f.weatherImpactScore));
      agg.trackOvertake.push(Number(f.trackOvertakeScore));
      agg.positionGain.push(Number(f.positionGainScore));
      if (f.longRunPaceScore != null) agg.longRunPace.push(Number(f.longRunPaceScore));
      if (f.reliabilityScore != null) agg.reliability.push(Number(f.reliabilityScore));
      if (f.qualifyingDeltaScore != null) agg.qualifyingDelta.push(Number(f.qualifyingDeltaScore));
      if (f.sectorStrengthScore != null) agg.sectorStrength.push(Number(f.sectorStrengthScore));
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
          trackOvertake: avgStr(agg.trackOvertake),
          positionGain: avgStr(agg.positionGain),
          longRunPace: avgNullable(agg.longRunPace),
          reliability: avgNullable(agg.reliability),
          qualifyingDelta: avgNullable(agg.qualifyingDelta),
          sectorStrength: avgNullable(agg.sectorStrength),
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

    return results.map((r) => ({
      driver: r.driver,
      features: r.features,
      rawWeightedScore: r.rawWeightedScore,
      winProbability: r.winProbability,
      predictedPosition: r.predictedPosition,
      overallScore: Math.round(((r._avgRaw - minScore) / range) * 100),
    }));
  }

  private async buildResponse(db: Db, target: 'upcoming' | number): Promise<PredictionResponse | null> {
    const raceRows =
      target === 'upcoming'
        ? await db
            .select()
            .from(racePredictions)
            .innerJoin(races, eq(racePredictions.raceId, races.id))
            .innerJoin(circuits, eq(races.circuitId, circuits.id))
            .where(eq(races.status, 'qualifying_done'))
            .orderBy(desc(races.raceDate))
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
}
