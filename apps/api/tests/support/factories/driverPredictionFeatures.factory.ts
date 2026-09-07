import type { Db } from '../../../src/config/database';
import { driverPredictionFeatures } from '../../../src/db/schema';

type FeaturesInsert = typeof driverPredictionFeatures.$inferInsert;

export async function createDriverPredictionFeatures(
  db: Db,
  raceId: number,
  driverId: number,
  overrides: Partial<FeaturesInsert> = {}
) {
  const [row] = await db
    .insert(driverPredictionFeatures)
    .values({
      raceId,
      driverId,
      carPerformanceScore: '0.80000',
      driverRatingScore: '0.70000',
      startingPositionScore: '0.90000',
      winRateScore: '0.60000',
      luckFactorScore: '0.50000',
      weatherImpactScore: '0.50000',
      trackOvertakeScore: '0.40000',
      positionGainScore: '0.55000',
      longRunPaceScore: '0.65000',
      reliabilityScore: '0.75000',
      qualifyingDeltaScore: '0.60000',
      sectorStrengthScore: '0.70000',
      tyreDegScore: '0.50000',
      circuitAdjStartPosScore: '0.85000',
      circuitAdjPositionGainScore: '0.30000',
      rawWeightedScore: '0.712000',
      winProbability: '0.35000',
      predictedPosition: 1,
      ...overrides,
    })
    .returning();
  return row;
}
