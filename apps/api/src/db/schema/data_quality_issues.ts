import { pgTable, serial, integer, varchar, boolean, index, timestamp } from 'drizzle-orm/pg-core';
import { dataQualityRuns } from './data_quality_runs';
import { races } from './races';

export const dataQualityIssues = pgTable('data_quality_issues', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => dataQualityRuns.id),
  raceId: integer('race_id').references(() => races.id),
  roundNumber: integer('round_number'),
  year: integer('year').notNull(),
  tableName: varchar('table_name', { length: 40 }),
  checkName: varchar('check_name', { length: 60 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull(),
  detail: varchar('detail', { length: 500 }),
  fixable: boolean('fixable').notNull().default(false),
  isSprint: boolean('is_sprint').notNull().default(false),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('data_quality_issues_run_idx').on(t.runId),
  index('data_quality_issues_race_idx').on(t.raceId),
]);