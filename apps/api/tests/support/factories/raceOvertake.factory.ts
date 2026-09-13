import type { Db } from '../../../src/config/database';
import { raceOvertakes } from '../../../src/db/schema';

type RaceOvertakeInsert = typeof raceOvertakes.$inferInsert;

export async function createRaceOvertake(
  db: Db,
  raceId: number,
  overtakingDriverId: number,
  overtakenDriverId: number,
  overrides: Partial<RaceOvertakeInsert> = {}
) {
  const [row] = await db
    .insert(raceOvertakes)
    .values({
      raceId,
      overtakingDriverId,
      overtakenDriverId,
      date: new Date('2099-03-01T14:10:00Z'),
      position: 1,
      ...overrides,
    })
    .returning();
  return row;
}
