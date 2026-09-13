import { eq, asc } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { races, raceControlMessages, raceOvertakes, teamRadioClips } from '../../db/schema';
import type { RaceControlMessage, RaceOvertake, TeamRadioClip } from '../../common/types';
import { toRaceControlMessage, toRaceOvertake, toTeamRadioClip } from '../../common/openf1-mappers';

export class RaceEventsService {
  async raceExists(db: Db, raceId: number): Promise<boolean> {
    const rows = await db.select({ id: races.id }).from(races).where(eq(races.id, raceId)).limit(1);
    return rows.length > 0;
  }

  async getRaceControlMessages(db: Db, raceId: number): Promise<RaceControlMessage[]> {
    const rows = await db
      .select()
      .from(raceControlMessages)
      .where(eq(raceControlMessages.raceId, raceId))
      .orderBy(asc(raceControlMessages.date));

    return rows.map(toRaceControlMessage);
  }

  async getOvertakes(db: Db, raceId: number): Promise<RaceOvertake[]> {
    const rows = await db
      .select()
      .from(raceOvertakes)
      .where(eq(raceOvertakes.raceId, raceId))
      .orderBy(asc(raceOvertakes.date));

    return rows.map(toRaceOvertake);
  }

  async getTeamRadio(db: Db, raceId: number): Promise<TeamRadioClip[]> {
    const rows = await db
      .select()
      .from(teamRadioClips)
      .where(eq(teamRadioClips.raceId, raceId))
      .orderBy(asc(teamRadioClips.date));

    return rows.map(toTeamRadioClip);
  }
}
