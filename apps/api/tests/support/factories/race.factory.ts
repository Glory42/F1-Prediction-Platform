import type { Db } from '../../../src/config/database';
import { races } from '../../../src/db/schema';

type RaceInsert = typeof races.$inferInsert;

export async function createRace(
  db: Db,
  seasonId: number,
  circuitId: number,
  overrides: Partial<RaceInsert> = {}
) {
  const [row] = await db
    .insert(races)
    .values({
      seasonId,
      circuitId,
      roundNumber: 1,
      name: 'Test Grand Prix',
      raceDate: '2099-01-01',
      status: 'completed',
      eventFormat: 'conventional',
      weather: 'dry',
      ...overrides,
    })
    .returning();
  return row;
}
