import type { Db } from '../../../src/config/database';
import { teamSeasonStats } from '../../../src/db/schema';

type TeamSeasonStatsInsert = typeof teamSeasonStats.$inferInsert;

export async function createTeamSeasonStats(
  db: Db,
  seasonId: number,
  teamId: number,
  overrides: Partial<TeamSeasonStatsInsert> = {}
) {
  const [row] = await db
    .insert(teamSeasonStats)
    .values({
      seasonId,
      teamId,
      racesCompleted: 10,
      wins: 5,
      podiums: 12,
      totalPoints: '400.0',
      championshipPosition: 1,
      carPerformanceScore: '0.850',
      ...overrides,
    })
    .returning();
  return row;
}
