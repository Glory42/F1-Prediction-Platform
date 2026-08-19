import { pgTable, serial, integer, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { races } from './races';
import { drivers } from './drivers';

export const qualifyingResults = pgTable('qualifying_results', {
  id: serial('id').primaryKey(),
  raceId: integer('race_id').notNull().references(() => races.id),
  driverId: integer('driver_id').notNull().references(() => drivers.id),
  q1TimeMs: integer('q1_time_ms'),
  q2TimeMs: integer('q2_time_ms'),
  q3TimeMs: integer('q3_time_ms'),
  sector1Ms: integer('sector1_ms'),
  sector2Ms: integer('sector2_ms'),
  sector3Ms: integer('sector3_ms'),
  speedSt: numeric('speed_st', { precision: 5, scale: 1 }),
  gridPosition: integer('grid_position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('qualifying_race_driver_idx').on(t.raceId, t.driverId),
]);
