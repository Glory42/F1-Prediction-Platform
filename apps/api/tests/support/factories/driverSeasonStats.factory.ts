import type { Db } from '../../../src/config/database';
import { driverSeasonStats } from '../../../src/db/schema';

type DriverSeasonStatsInsert = typeof driverSeasonStats.$inferInsert;

export async function createDriverSeasonStats(
  db: Db,
  seasonId: number,
  driverId: number,
  overrides: Partial<DriverSeasonStatsInsert> = {}
) {
  const [row] = await db
    .insert(driverSeasonStats)
    .values({
      seasonId,
      driverId,
      racesEntered: 10,
      racesFinished: 9,
      wins: 3,
      podiums: 6,
      poles: 2,
      totalPoints: '200.0',
      championshipPosition: 1,
      ...overrides,
    })
    .returning();
  return row;
}
