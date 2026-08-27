import type { Db } from '../../../src/config/database';
import { raceResults } from '../../../src/db/schema';

type RaceResultInsert = typeof raceResults.$inferInsert;

export async function createRaceResult(
  db: Db,
  raceId: number,
  driverId: number,
  overrides: Partial<RaceResultInsert> = {}
) {
  const [row] = await db
    .insert(raceResults)
    .values({
      raceId,
      driverId,
      finishPosition: 1,
      gridPosition: 1,
      points: '25.0',
      status: 'Finished',
      fastestLap: false,
      ...overrides,
    })
    .returning();
  return row;
}
