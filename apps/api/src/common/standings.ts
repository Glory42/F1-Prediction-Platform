import { eq } from 'drizzle-orm';
import type { Db } from '../config/database';
import { seasons } from '../db/schema';
import { toKeyedMap } from './collections';

export type Season = typeof seasons.$inferSelect;

export async function resolveSeason(db: Db, year: number): Promise<Season | null> {
  const rows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
  return rows[0] ?? null;
}

type ChampionshipStats = {
  championshipPosition: number | null;
  totalPoints: string;
};

export function sortByChampionshipStanding<T extends { stats: ChampionshipStats }>(a: T, b: T): number {
  const posA = a.stats.championshipPosition ?? 999;
  const posB = b.stats.championshipPosition ?? 999;
  if (posA !== posB) return posA - posB;
  return Number(b.stats.totalPoints) - Number(a.stats.totalPoints);
}

export function buildStandings<Entity, StatsRow, Stats extends ChampionshipStats, Out extends { stats: Stats }>(
  entityRows: Entity[],
  statsRows: StatsRow[],
  getEntityId: (entity: Entity) => number,
  getStatsEntityId: (statsRow: StatsRow) => number,
  toStats: (statsRow: StatsRow) => Stats,
  emptyStats: Stats,
  toOutput: (entity: Entity, stats: Stats) => Out
): Out[] {
  const statsById = toKeyedMap(statsRows, getStatsEntityId);
  const result = entityRows.map((entity) => {
    const statsRow = statsById.get(getEntityId(entity));
    return toOutput(entity, statsRow ? toStats(statsRow) : emptyStats);
  });
  return result.sort(sortByChampionshipStanding);
}

export function buildCareerStats<Entry, StatsRow, Stats, Out>(
  entries: Entry[],
  statsRows: StatsRow[],
  getEntryId: (entry: Entry) => number,
  getStatsEntryId: (statsRow: StatsRow) => number,
  toStats: (statsRow: StatsRow) => Stats,
  toOutput: (entry: Entry, stats: Stats | null) => Out
): Out[] {
  const statsById = toKeyedMap(statsRows, getStatsEntryId);
  return entries.map((entry) => {
    const statsRow = statsById.get(getEntryId(entry));
    return toOutput(entry, statsRow ? toStats(statsRow) : null);
  });
}
