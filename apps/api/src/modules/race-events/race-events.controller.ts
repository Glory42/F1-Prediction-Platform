import type { Context } from 'hono';
import type { Bindings } from '../../common/types';
import { createDb, type Db } from '../../config/database';
import { RaceEventsService } from './race-events.service';
import { CACHE_COMPLETED } from '../../common/cache';

const service = new RaceEventsService();

function raceSubResource<T>(getter: (db: Db, raceId: number) => Promise<T[]>) {
  return async (c: Context<{ Bindings: Bindings }>) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ data: null, error: { code: 'INVALID_ID', message: 'id must be a number' } }, 400);
    }
    const db = createDb(c.env.DATABASE_URL);
    if (!(await service.raceExists(db, id))) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Race ${id} not found` } }, 404);
    }
    // Every race-event sub-resource only exists once ingested post-race, and never changes
    // afterward, so they all share one Cache-Control rule.
    const data = await getter(db, id);
    c.header('Cache-Control', CACHE_COMPLETED);
    return c.json({ data, error: null });
  };
}

export const RaceEventsController = {
  getRaceControl: raceSubResource((db, id) => service.getRaceControlMessages(db, id)),
  getOvertakes: raceSubResource((db, id) => service.getOvertakes(db, id)),
  getTeamRadio: raceSubResource((db, id) => service.getTeamRadio(db, id)),
};
