import { desc, count, eq } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { seasons, races } from '../../db/schema';

export class SeasonsService {
  async findAll(db: Db): Promise<{ year: number; raceCount: number }[]> {
    const rows = await db
      .select({ year: seasons.year, raceCount: count(races.id) })
      .from(seasons)
      .leftJoin(races, eq(races.seasonId, seasons.id))
      .groupBy(seasons.year)
      .orderBy(desc(seasons.year));

    return rows.map((r) => ({ year: r.year, raceCount: r.raceCount }));
  }
}
