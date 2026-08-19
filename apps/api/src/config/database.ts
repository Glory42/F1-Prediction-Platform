import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '../db/schema';

const dbCache = new Map<string, NeonHttpDatabase<typeof schema>>();

export function createDb(url: string) {
  if (!dbCache.has(url)) {
    dbCache.set(url, drizzle(neon(url), { schema }));
  }
  return dbCache.get(url)!;
}

export type Db = ReturnType<typeof createDb>;
