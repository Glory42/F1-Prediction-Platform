import { pgTable, serial, integer, numeric, varchar, boolean, bigint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { races } from './races';
import { drivers } from './drivers';

export const sprintResults = pgTable('sprint_results', {
  id: serial('id').primaryKey(),
  raceId: integer('race_id').notNull().references(() => races.id),
  driverId: integer('driver_id').notNull().references(() => drivers.id),
  finishPosition: integer('finish_position'),
  gridPosition: integer('grid_position').notNull(),
  points: numeric('points', { precision: 4, scale: 1 }).notNull().default('0'),
  status: varchar('status', { length: 30 }).notNull(),
  totalSprintTimeMs: bigint('total_sprint_time_ms', { mode: 'number' }),
  fastestLap: boolean('fastest_lap').notNull().default(false),
  sq1TimeMs: integer('sq1_time_ms'),
  sq2TimeMs: integer('sq2_time_ms'),
  sq3TimeMs: integer('sq3_time_ms'),
  sqSector1Ms: integer('sq_sector1_ms'),
  sqSector2Ms: integer('sq_sector2_ms'),
  sqSector3Ms: integer('sq_sector3_ms'),
  sqSpeedSt: numeric('sq_speed_st', { precision: 5, scale: 1 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('sprint_results_race_driver_idx').on(t.raceId, t.driverId),
]);
