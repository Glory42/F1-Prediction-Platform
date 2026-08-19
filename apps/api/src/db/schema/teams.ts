import { pgTable, serial, integer, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { seasons } from './seasons';

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  teamKey: varchar('team_key', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  nationality: varchar('nationality', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('teams_season_team_key_idx').on(t.seasonId, t.teamKey),
]);
