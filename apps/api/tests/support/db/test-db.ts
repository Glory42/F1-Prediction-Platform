import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../../../src/config/database';
import {
  seasons, circuits, teams, drivers, races, raceResults, qualifyingResults,
  lapTimes, sprintResults, sprintLapTimes, driverSeasonStats, teamSeasonStats,
  racePredictions, sprintPredictions, driverPredictionFeatures, driverSprintFeatures,
  fp2LongRunTimes, dataQualityIssues, dataQualityRuns,
} from '../../../src/db/schema';

export const getTestDatabaseUrl = (): string => {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? '';
  if (!databaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required for apps/api integration tests. Point it at a dedicated Neon test branch (see apps/api/.env.example).'
    );
  }
  return databaseUrl;
};

// Neon hostnames never contain "test", so string-matching isn't meaningful here — the real
// safety boundary is that TEST_DATABASE_URL must differ from DATABASE_URL.
const assertResetAllowed = (testDatabaseUrl: string): void => {
  const allowManualOverride = process.env.TEST_DB_ALLOW_RESET === '1';
  if (allowManualOverride) return;

  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (databaseUrl && databaseUrl === testDatabaseUrl) {
    throw new Error(
      'Refusing to truncate: TEST_DATABASE_URL is identical to DATABASE_URL. ' +
      'Set TEST_DB_ALLOW_RESET=1 to override.'
    );
  }
};

let cachedDb: Db | null = null;

export const getTestDb = (): Db => {
  if (!cachedDb) {
    const url = getTestDatabaseUrl();
    assertResetAllowed(url);
    cachedDb = createDb(url);
  }
  return cachedDb;
};

const ALL_TABLES = [
  dataQualityIssues, dataQualityRuns,
  driverPredictionFeatures, driverSprintFeatures,
  racePredictions, sprintPredictions,
  fp2LongRunTimes, sprintLapTimes, lapTimes,
  sprintResults, raceResults, qualifyingResults,
  driverSeasonStats, teamSeasonStats,
  races, drivers, teams, circuits, seasons,
];

export const truncateAll = async (db: Db): Promise<void> => {
  // CASCADE handles FK ordering for us — one statement covering every table.
  const tableList = sql.join(ALL_TABLES.map((t) => sql`${t}`), sql.raw(', '));
  await db.execute(sql`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
};
