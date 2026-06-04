import { pgTable, serial, varchar, integer, numeric, timestamp } from 'drizzle-orm/pg-core';

export const circuits = pgTable('circuits', {
  id: serial('id').primaryKey(),
  circuitKey: varchar('circuit_key', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  country: varchar('country', { length: 50 }).notNull(),
  city: varchar('city', { length: 50 }).notNull(),
  lapCount: integer('lap_count').notNull(),
  trackLengthKm: numeric('track_length_km', { precision: 5, scale: 3 }).notNull(),
  overtakeRate: numeric('overtake_rate', { precision: 4, scale: 3 }),
  numberOfCorners: integer('number_of_corners'),
  drsZones: integer('drs_zones'),
  scProbability: numeric('sc_probability', { precision: 4, scale: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
