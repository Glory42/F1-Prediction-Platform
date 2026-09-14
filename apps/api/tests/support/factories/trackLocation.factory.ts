import type { Db } from '../../../src/config/database';
import { trackLocations } from '../../../src/db/schema';

type TrackLocationInsert = typeof trackLocations.$inferInsert;

export async function createTrackLocation(
  db: Db,
  raceId: number,
  driverId: number,
  overrides: Partial<TrackLocationInsert> = {}
) {
  const [row] = await db
    .insert(trackLocations)
    .values({
      raceId,
      driverId,
      date: new Date('2099-03-01T14:10:00Z'),
      x: 100,
      y: 200,
      ...overrides,
    })
    .returning();
  return row;
}
