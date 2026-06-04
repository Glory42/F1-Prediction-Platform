import { pgTable, serial, integer, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { races } from './races';
import { drivers } from './drivers';

export const driverPredictionFeatures = pgTable('driver_prediction_features', {
  id: serial('id').primaryKey(),
  raceId: integer('race_id').notNull().references(() => races.id),
  driverId: integer('driver_id').notNull().references(() => drivers.id),

  carPerformanceScore: numeric('car_performance_score', { precision: 6, scale: 5 }).notNull(),
  driverRatingScore: numeric('driver_rating_score', { precision: 6, scale: 5 }).notNull(),
  startingPositionScore: numeric('starting_position_score', { precision: 6, scale: 5 }).notNull(),
  winRateScore: numeric('win_rate_score', { precision: 6, scale: 5 }).notNull(),
  luckFactorScore: numeric('luck_factor_score', { precision: 6, scale: 5 }).notNull(),
  weatherImpactScore: numeric('weather_impact_score', { precision: 6, scale: 5 }).notNull(),
  trackOvertakeScore: numeric('track_overtake_score', { precision: 6, scale: 5 }),
  positionGainScore: numeric('position_gain_score', { precision: 6, scale: 5 }).notNull(),
  longRunPaceScore: numeric('long_run_pace_score', { precision: 6, scale: 5 }),
  reliabilityScore: numeric('reliability_score', { precision: 6, scale: 5 }),
  qualifyingDeltaScore: numeric('qualifying_delta_score', { precision: 6, scale: 5 }),
  sectorStrengthScore: numeric('sector_strength_score', { precision: 6, scale: 5 }),
  tyreDegScore: numeric('tyre_deg_score', { precision: 6, scale: 5 }),
  circuitAdjStartPosScore: numeric('circuit_adj_start_pos_score', { precision: 6, scale: 5 }),
  circuitAdjPositionGainScore: numeric('circuit_adj_position_gain_score', { precision: 6, scale: 5 }),

  rawWeightedScore: numeric('raw_weighted_score', { precision: 8, scale: 6 }).notNull(),
  winProbability: numeric('win_probability', { precision: 6, scale: 5 }).notNull(),
  predictedPosition: integer('predicted_position'),

  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('driver_prediction_features_race_driver_idx').on(t.raceId, t.driverId),
]);
