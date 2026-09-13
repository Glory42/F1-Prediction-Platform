import { eq, asc } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { races, raceControlMessages } from '../../db/schema';
import type { RaceControlMessage } from '../../common/types';
import { toRaceControlMessage } from '../../common/mappers';

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
}
