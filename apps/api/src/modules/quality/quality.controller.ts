import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { QualityService } from './quality.service';
import { cacheControlForYear } from '../../common/cache';

const service = new QualityService();

export const QualityController = {
  getLatest: async (c: Context<{ Bindings: Bindings }>) => {
    const year = Number(c.req.query('year') ?? new Date().getFullYear());
    const data = await service.findLatest(createDb(c.env.DATABASE_URL), year);
    if (!data) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `No quality report for ${year}` } }, 404);
    }
    c.header('Cache-Control', cacheControlForYear(year));
    return c.json({ data, error: null });
  },
};