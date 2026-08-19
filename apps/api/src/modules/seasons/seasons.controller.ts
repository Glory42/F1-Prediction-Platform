import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { SeasonsService } from './seasons.service';

const service = new SeasonsService();

export const SeasonsController = {
  getAll: async (c: Context<{ Bindings: Bindings }>) => {
    const data = await service.findAll(createDb(c.env.DATABASE_URL));
    return c.json({ data, error: null });
  },
};
