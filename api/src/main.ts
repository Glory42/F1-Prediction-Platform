import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { sql } from 'drizzle-orm';
import { createDb } from './config/database';
import racesModule from './modules/races/races.module';
import driversModule from './modules/drivers/drivers.module';
import teamsModule from './modules/teams/teams.module';
import predictionsModule from './modules/predictions/predictions.module';
import seasonsModule from './modules/seasons/seasons.module';
import type { Bindings } from './common/types';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', logger());
app.use('*', cors({
  origin: ['https://f1.gorkemkaryol.dev', 'http://localhost:4321', 'http://localhost:8787'],
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.get('/api/health', async (c) => {
  try {
    await createDb(c.env.DATABASE_URL).execute(sql`SELECT 1`);
    return c.json({ data: { status: 'ok', db: 'connected', timestamp: new Date().toISOString() }, error: null });
  } catch {
    return c.json({ data: null, error: { code: 'DB_ERROR', message: 'Database unreachable' } }, 503);
  }
});

app.route('/api/races', racesModule);
app.route('/api/drivers', driversModule);
app.route('/api/teams', teamsModule);
app.route('/api/predictions', predictionsModule);
app.route('/api/seasons', seasonsModule);

app.onError((err, c) => {
  console.error(err.message);
  return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
});

app.notFound((c) => {
  return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
});

export default app;
