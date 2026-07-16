import { pgTable, serial, integer, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { seasons } from './seasons';
import { teams } from './teams';

export const teamSeasonStats = pgTable('team_season_stats', {
  id: serial('id').primaryKey(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  teamId: integer('team_id').notNull().references(() => teams.id),
  racesCompleted: integer('races_completed').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  podiums: integer('podiums').notNull().default(0),
  totalPoints: numeric('total_points', { precision: 6, scale: 1 }).notNull().default('0'),
  championshipPosition: integer('championship_position'),
  avgFinishPosition: numeric('avg_finish_position', { precision: 4, scale: 2 }),
  carPerformanceScore: numeric('car_performance_score', { precision: 5, scale: 4 }),
  dnfCount: integer('dnf_count').notNull().default(0),
  reliabilityScore: numeric('reliability_score', { precision: 5, scale: 4 }),
  sprintWins: integer('sprint_wins').notNull().default(0),
  sprintPodiums: integer('sprint_podiums').notNull().default(0),
  sprintTotalPoints: numeric('sprint_total_points', { precision: 6, scale: 1 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('team_season_stats_season_team_idx').on(t.seasonId, t.teamId),
  index('team_season_stats_team_idx').on(t.teamId),
]);
