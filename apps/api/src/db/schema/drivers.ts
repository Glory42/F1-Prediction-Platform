import { pgTable, serial, integer, varchar, char, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { seasons } from './seasons';
import { teams } from './teams';

export const drivers = pgTable('drivers', {
  id: serial('id').primaryKey(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  teamId: integer('team_id').notNull().references(() => teams.id),
  driverNumber: integer('driver_number').notNull(),
  code: char('code', { length: 3 }).notNull(),
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }).notNull(),
  nationality: varchar('nationality', { length: 50 }),
  headshotUrl: varchar('headshot_url', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('drivers_season_number_idx').on(t.seasonId, t.driverNumber),
]);
