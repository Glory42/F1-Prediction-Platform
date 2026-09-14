import { pgTable, bigserial, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { races } from './races';
import { drivers } from './drivers';

export const trackLocations = pgTable('track_locations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  raceId: integer('race_id').notNull().references(() => races.id),
  driverId: integer('driver_id').notNull().references(() => drivers.id),
  date: timestamp('date', { withTimezone: true }).notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('track_locations_race_driver_date_idx').on(t.raceId, t.driverId, t.date),
  index('track_locations_race_driver_idx').on(t.raceId, t.driverId),
]);
