// A completed race's results/predictions never change (idempotent ETL) — safe to cache long
// and immutable. Anything still in progress can change as the weekend progresses.
export const CACHE_COMPLETED = 'public, max-age=86400, immutable';
export const CACHE_ACTIVE = 'public, max-age=30';

export function cacheControlForStatus(status: string): string {
  return status === 'completed' ? CACHE_COMPLETED : CACHE_ACTIVE;
}

export function cacheControlForYear(year: number, now: Date = new Date()): string {
  return year < now.getFullYear() ? CACHE_COMPLETED : CACHE_ACTIVE;
}
