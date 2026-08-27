import type { Db } from '../../../src/config/database';
import { seasons } from '../../../src/db/schema';

type SeasonInsert = typeof seasons.$inferInsert;

export async function createSeason(db: Db, overrides: Partial<SeasonInsert> = {}) {
  const [row] = await db
    .insert(seasons)
    .values({ year: 2099, ...overrides })
    .returning();
  return row;
}
