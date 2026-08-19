import { pgTable, bigserial, integer, varchar, boolean, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { races } from './races';
import { drivers } from './drivers';

export const lapTimes = pgTable('lap_times', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  raceId: integer('race_id').notNull().references(() => races.id),
  driverId: integer('driver_id').notNull().references(() => drivers.id),
  lapNumber: integer('lap_number').notNull(),
  lapTimeMs: integer('lap_time_ms'),
  sector1Ms: integer('sector1_ms'),
  sector2Ms: integer('sector2_ms'),
  sector3Ms: integer('sector3_ms'),
  speedSt: numeric('speed_st', { precision: 5, scale: 1 }),
  compound: varchar('compound', { length: 20 }),
  tyreLife: integer('tyre_life'),
  freshTyre: boolean('fresh_tyre'),
  isPitLap: boolean('is_pit_lap').notNull().default(false),
  stintNumber: integer('stint_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('lap_times_race_driver_lap_idx').on(t.raceId, t.driverId, t.lapNumber),
  index('lap_times_race_driver_idx').on(t.raceId, t.driverId),
]);
