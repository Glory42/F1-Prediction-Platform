import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { PredictionsService } from './predictions.service';

const service = new PredictionsService();

export const PredictionsController = {
  getUpcoming: async (c: Context<{ Bindings: Bindings }>) => {
    const data = await service.findUpcoming(createDb(c.env.DATABASE_URL));
    if (!data) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'No upcoming prediction available' } }, 404);
    }
    return c.json({ data, error: null });
  },

  getByRaceId: async (c: Context<{ Bindings: Bindings }>) => {
    const raceId = Number(c.req.param('raceId'));
    if (isNaN(raceId)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'raceId must be a number' } }, 400);
    }
    const data = await service.findByRaceId(createDb(c.env.DATABASE_URL), raceId);
    if (!data) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `No prediction for race ${raceId}` } }, 404);
    }
    return c.json({ data, error: null });
  },

  getHistory: async (c: Context<{ Bindings: Bindings }>) => {
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    const data = await service.findHistory(createDb(c.env.DATABASE_URL), year);
    return c.json({ data, error: null });
  },

  getIntelStandings: async (c: Context<{ Bindings: Bindings }>) => {
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    const data = await service.findIntelStandings(createDb(c.env.DATABASE_URL), year);
    return c.json({ data, error: null });
  },

  getModelInfo: async (c: Context<{ Bindings: Bindings }>) => {
    const data = await service.getModelInfo(createDb(c.env.DATABASE_URL));
    return c.json({ data, error: null });
  },
};
