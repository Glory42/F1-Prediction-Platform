import type { Db } from '../config/database';
import type { races, circuits, drivers, teams } from '../db/schema';
import type { Driver, Race } from './types';
import { toDriver, toRace } from './mappers';

export type PredictionMeta = {
  predictedWinnerId: number;
  computedAt: Date;
  modelVersion: string;
};

export type RaceRowResult = {
  prediction: PredictionMeta;
  race: typeof races.$inferSelect;
  circuit: typeof circuits.$inferSelect;
};

export type NormalizedFeatureRow<TRaw> = {
  driverId: number;
  driver: typeof drivers.$inferSelect;
  team: typeof teams.$inferSelect;
  winProbability: string;
  predictedPosition: number | null;
  raw: TRaw;
};

export type GenericDriverPrediction<TFeatures> = {
  driver: Driver;
  winProbability: string;
  predictedPosition: number | null;
  features: TFeatures;
};

export type GenericPredictionResponse<TFeatures> = {
  race: Race;
  predictedWinner: Driver;
  computedAt: string;
  modelVersion: string;
  drivers: GenericDriverPrediction<TFeatures>[];
};

export type PredictionResponseConfig<TRaw, TFeatures> = {
  target: 'upcoming' | number;
  queryUpcoming: (db: Db) => Promise<RaceRowResult[]>;
  queryById: (db: Db, raceId: number) => Promise<RaceRowResult[]>;
  fetchFeatureRows: (db: Db, raceId: number) => Promise<NormalizedFeatureRow<TRaw>[]>;
  toFeatures: (raw: TRaw) => TFeatures;
};

export async function buildPredictionResponse<TRaw, TFeatures>(
  db: Db,
  config: PredictionResponseConfig<TRaw, TFeatures>,
): Promise<GenericPredictionResponse<TFeatures> | null> {
  const raceRows = config.target === 'upcoming'
    ? await config.queryUpcoming(db)
    : await config.queryById(db, config.target);

  const raceRow = raceRows[0];
  if (!raceRow) return null;
  const { prediction, race, circuit } = raceRow;

  const featureRows = await config.fetchFeatureRows(db, race.id);
  const winnerRow = featureRows.find((r) => r.driverId === prediction.predictedWinnerId);
  if (!winnerRow) return null;

  const driverPredictions: GenericDriverPrediction<TFeatures>[] = featureRows.map((r) => ({
    driver: toDriver(r.driver, r.team),
    winProbability: r.winProbability,
    predictedPosition: r.predictedPosition,
    features: config.toFeatures(r.raw),
  }));

  return {
    race: toRace(race, circuit),
    predictedWinner: toDriver(winnerRow.driver, winnerRow.team),
    computedAt: prediction.computedAt.toISOString(),
    modelVersion: prediction.modelVersion,
    drivers: driverPredictions,
  };
}
