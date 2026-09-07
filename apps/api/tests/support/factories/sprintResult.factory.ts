import type { Db } from '../../../src/config/database';
import { sprintResults } from '../../../src/db/schema';

type SprintResultInsert = typeof sprintResults.$inferInsert;

export async function createSprintResult(
  db: Db,
  raceId: number,
  driverId: number,
  overrides: Partial<SprintResultInsert> = {}
) {
  const [row] = await db
    .insert(sprintResults)
    .values({
      raceId,
      driverId,
      finishPosition: 1,
      gridPosition: 1,
      points: '8.0',
      status: 'Finished',
      fastestLap: false,
      ...overrides,
    })
    .returning();
  return row;
}
