import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
