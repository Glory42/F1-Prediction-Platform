import type { Db } from '../../../src/config/database';
import { qualifyingResults } from '../../../src/db/schema';

type QualifyingInsert = typeof qualifyingResults.$inferInsert;

export async function createQualifyingResult(
  db: Db,
  raceId: number,
  driverId: number,
  overrides: Partial<QualifyingInsert> = {}
) {
  const [row] = await db
    .insert(qualifyingResults)
    .values({
      raceId,
      driverId,
      gridPosition: 1,
      q1TimeMs: 80000,
      q2TimeMs: 79500,
      q3TimeMs: 79000,
      ...overrides,
    })
    .returning();
  return row;
}
