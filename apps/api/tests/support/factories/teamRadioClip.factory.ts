import type { Db } from '../../../src/config/database';
import { teamRadioClips } from '../../../src/db/schema';

type TeamRadioClipInsert = typeof teamRadioClips.$inferInsert;

export async function createTeamRadioClip(
  db: Db,
  raceId: number,
  driverId: number,
  overrides: Partial<TeamRadioClipInsert> = {}
) {
  const [row] = await db
    .insert(teamRadioClips)
    .values({
      raceId,
      driverId,
      date: new Date('2099-03-01T14:10:00Z'),
      recordingUrl: 'https://livetiming.formula1.com/static/clip.mp3',
      ...overrides,
    })
    .returning();
  return row;
}
