import { pgTable, serial, integer, numeric, varchar, boolean, bigint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { races } from './races';
import { drivers } from './drivers';

export const raceResults = pgTable('race_results', {
  id: serial('id').primaryKey(),
  raceId: integer('race_id').notNull().references(() => races.id),
  driverId: integer('driver_id').notNull().references(() => drivers.id),
  finishPosition: integer('finish_position'),
  gridPosition: integer('grid_position').notNull(),
  points: numeric('points', { precision: 4, scale: 1 }).notNull().default('0'),
  status: varchar('status', { length: 30 }).notNull(),
  totalRaceTimeMs: bigint('total_race_time_ms', { mode: 'number' }),
  fastestLap: boolean('fastest_lap').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('race_results_race_driver_idx').on(t.raceId, t.driverId),
]);
