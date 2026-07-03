import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { RacesService } from './races.service';

const service = new RacesService();

export const RacesController = {
  getAll: async (c: Context<{ Bindings: Bindings }>) => {
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    const status = c.req.query('status');
    if (isNaN(year)) {
      return c.json({ data: null, error: { code: 'INVALID_YEAR', message: 'year must be a number' } }, 400);
    }
    const data = await service.findAll(createDb(c.env.DATABASE_URL), year, status);
    return c.json({ data, error: null });
  },

  getCircuitDetails: async (c: Context<{ Bindings: Bindings }>) => {
    const circuitKey = c.req.param('circuitKey') ?? '';
    const data = await service.findCircuitDetails(createDb(c.env.DATABASE_URL), circuitKey);
    return c.json({ data, error: null });
  },

  getById: async (c: Context<{ Bindings: Bindings }>) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'id must be a number' } }, 400);
    }
    const data = await service.findById(createDb(c.env.DATABASE_URL), id);
    if (!data) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Race ${id} not found` } }, 404);
    }
    return c.json({ data, error: null });
  },
};
