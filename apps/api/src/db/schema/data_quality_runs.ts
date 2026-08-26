import { pgTable, serial, integer, numeric, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { races } from './races';

export const dataQualityRuns = pgTable('data_quality_runs', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  raceId: integer('race_id').references(() => races.id),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  healthScore: numeric('health_score', { precision: 5, scale: 2 }).notNull(),
  summary: jsonb('summary').notNull(),
}, (t) => [
  index('data_quality_runs_year_idx').on(t.year),
  index('data_quality_runs_race_idx').on(t.raceId),
  uniqueIndex('data_quality_runs_year_agg_idx').on(t.year).where(sql`race_id IS NULL`),
]);