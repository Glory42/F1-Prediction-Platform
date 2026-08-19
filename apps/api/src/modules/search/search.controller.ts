import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb } from '../../config/database';
import { SearchService } from './search.service';

const service = new SearchService();

export const SearchController = {
  getAll: async (c: Context<{ Bindings: Bindings }>) => {
    const data = await service.getGlobalSearchData(createDb(c.env.DATABASE_URL));
    return c.json({ data, error: null });
  }
};
