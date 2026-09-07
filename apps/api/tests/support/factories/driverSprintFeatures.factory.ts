import type { Db } from '../../../src/config/database';
import { driverSprintFeatures } from '../../../src/db/schema';

type SprintFeaturesInsert = typeof driverSprintFeatures.$inferInsert;

export async function createDriverSprintFeatures(
  db: Db,
  raceId: number,
  driverId: number,
  overrides: Partial<SprintFeaturesInsert> = {}
) {
  const [row] = await db
    .insert(driverSprintFeatures)
    .values({
      raceId,
      driverId,
      carPerformanceScore: '0.80000',
      startingPositionScore: '0.90000',
      driverRatingScore: '0.70000',
      trackOvertakeScore: '0.40000',
      shortRunPaceScore: '0.65000',
      circuitAdjStartPosScore: '0.85000',
      sqQualifyingDeltaScore: '0.60000',
      weatherImpactScore: '0.50000',
      winRateScore: '0.60000',
      luckFactorScore: '0.50000',
      rawWeightedScore: '0.712000',
      winProbability: '0.40000',
      predictedPosition: 1,
      ...overrides,
    })
    .returning();
  return row;
}
