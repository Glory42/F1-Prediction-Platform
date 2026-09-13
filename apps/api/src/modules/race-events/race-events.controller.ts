import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { RaceEventsService } from './race-events.service';
import { CACHE_COMPLETED } from '../../common/cache';

const service = new RaceEventsService();

export const RaceEventsController = {
  getRaceControl: async (c: Context<{ Bindings: Bindings }>) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'id must be a number' } }, 400);
    }
    const db = createDb(c.env.DATABASE_URL);
    if (!(await service.raceExists(db, id))) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Race ${id} not found` } }, 404);
    }
    const data = await service.getRaceControlMessages(db, id);
    // Race control messages only exist once ingested post-race, and never change afterward.
    c.header('Cache-Control', CACHE_COMPLETED);
    return c.json({ data, error: null });
  },

  getOvertakes: async (c: Context<{ Bindings: Bindings }>) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'id must be a number' } }, 400);
    }
    const db = createDb(c.env.DATABASE_URL);
    if (!(await service.raceExists(db, id))) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Race ${id} not found` } }, 404);
    }
    const data = await service.getOvertakes(db, id);
    c.header('Cache-Control', CACHE_COMPLETED);
    return c.json({ data, error: null });
  },

  getTeamRadio: async (c: Context<{ Bindings: Bindings }>) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'id must be a number' } }, 400);
    }
    const db = createDb(c.env.DATABASE_URL);
    if (!(await service.raceExists(db, id))) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Race ${id} not found` } }, 404);
    }
    const data = await service.getTeamRadio(db, id);
    c.header('Cache-Control', CACHE_COMPLETED);
    return c.json({ data, error: null });
  },
};
