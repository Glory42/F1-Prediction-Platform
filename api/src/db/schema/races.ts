import { pgTable, serial, integer, varchar, numeric, date, timestamp, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { seasons } from './seasons';
import { circuits } from './circuits';

export const raceStatusEnum = pgEnum('race_status', ['scheduled', 'qualifying_done', 'completed']);

export const races = pgTable('races', {
  id: serial('id').primaryKey(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  circuitId: integer('circuit_id').notNull().references(() => circuits.id),
  roundNumber: integer('round_number').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  raceDate: date('race_date').notNull(),
  status: raceStatusEnum('status').notNull().default('scheduled'),
  weather: varchar('weather', { length: 30 }),
  safetyCarLaps: integer('safety_car_laps').default(0),
  vscLaps: integer('vsc_laps').default(0),
  airTempAvg: numeric('air_temp_avg', { precision: 4, scale: 1 }),
  trackTempAvg: numeric('track_temp_avg', { precision: 4, scale: 1 }),
  humidityAvg: numeric('humidity_avg', { precision: 4, scale: 1 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('races_season_round_idx').on(t.seasonId, t.roundNumber),
]);
