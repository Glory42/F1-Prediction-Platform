import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { TeamsService } from './teams.service';

const service = new TeamsService();

export const TeamsController = {
  getAll: async (c: Context<{ Bindings: Bindings }>) => {
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    const data = await service.findAll(createDb(c.env.DATABASE_URL), year);
    return c.json({ data, error: null });
  },

  getStandings: async (c: Context<{ Bindings: Bindings }>) => {
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    const data = await service.findStandings(createDb(c.env.DATABASE_URL), year);
    return c.json({ data, error: null });
  },

  getStandingsProgression: async (c: Context<{ Bindings: Bindings }>) => {
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    const data = await service.findStandingsProgression(createDb(c.env.DATABASE_URL), year);
    return c.json({ data, error: null });
  },

  getCareerStats: async (c: Context<{ Bindings: Bindings }>) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'id must be a number' } }, 400);
    }
    const data = await service.findCareerStats(createDb(c.env.DATABASE_URL), id);
    return c.json({ data, error: null });
  },

  getById: async (c: Context<{ Bindings: Bindings }>) => {
    const id = Number(c.req.param('id'));
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    if (isNaN(id)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'id must be a number' } }, 400);
    }
    const data = await service.findById(createDb(c.env.DATABASE_URL), id, year);
    if (!data) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Team ${id} not found for year ${year}` } }, 404);
    }
    return c.json({ data, error: null });
  },
};
