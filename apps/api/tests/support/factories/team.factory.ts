import type { Db } from '../../../src/config/database';
import { teams } from '../../../src/db/schema';

type TeamInsert = typeof teams.$inferInsert;

export async function createTeam(db: Db, seasonId: number, overrides: Partial<TeamInsert> = {}) {
  const [row] = await db
    .insert(teams)
    .values({
      seasonId,
      teamKey: 'test-team',
      name: 'Test Racing Team',
      nationality: 'Testland',
      ...overrides,
    })
    .returning();
  return row;
}
