import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { SprintService } from './sprint.service';

const service = new SprintService();

export const SprintController = {
  getUpcoming: async (c: Context<{ Bindings: Bindings }>) => {
    const data = await service.findUpcoming(createDb(c.env.DATABASE_URL));
    if (!data) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'No upcoming sprint prediction available' } }, 404);
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
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `No sprint prediction for race ${raceId}` } }, 404);
    }
    return c.json({ data, error: null });
  },

  getDetailByRaceId: async (c: Context<{ Bindings: Bindings }>) => {
    const raceId = Number(c.req.param('raceId'));
    if (isNaN(raceId)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'raceId must be a number' } }, 400);
    }
    const data = await service.findDetailByRaceId(createDb(c.env.DATABASE_URL), raceId);
    if (!data) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `No sprint data for race ${raceId}` } }, 404);
    }
    return c.json({ data, error: null });
  },
};
