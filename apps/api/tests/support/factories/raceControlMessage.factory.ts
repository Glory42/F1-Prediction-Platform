import type { Db } from '../../../src/config/database';
import { raceControlMessages } from '../../../src/db/schema';

type RaceControlMessageInsert = typeof raceControlMessages.$inferInsert;

export async function createRaceControlMessage(
  db: Db,
  raceId: number,
  overrides: Partial<RaceControlMessageInsert> = {}
) {
  const [row] = await db
    .insert(raceControlMessages)
    .values({
      raceId,
      date: new Date('2099-03-01T14:00:00Z'),
      category: 'Flag',
      flag: 'YELLOW',
      message: 'YELLOW IN TRACK SECTOR 4',
      ...overrides,
    })
    .returning();
  return row;
}
