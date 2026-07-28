import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { drivers, teams, circuits, seasons } from '../../db/schema';
import type { Driver } from '../../common/types';
import { toDriver, toTeam } from '../../common/mappers';

export class SearchService {
  async getGlobalSearchData(db: Db) {
    const uniqueTeams = (
      await db
        .selectDistinctOn([teams.teamKey], { team: teams })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .orderBy(teams.teamKey, desc(seasons.year))
    ).map((r) => r.team);

    const fullNameExpr = sql`${drivers.firstName} || ' ' || ${drivers.lastName}`;
    const uniqueDrivers = (
      await db
        .selectDistinctOn([fullNameExpr], { driver: drivers, team: teams })
        .from(drivers)
        .innerJoin(seasons, eq(drivers.seasonId, seasons.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .orderBy(fullNameExpr, desc(seasons.year))
    );

    const mappedDrivers: Driver[] = uniqueDrivers.map(({ driver: d, team: t }) => toDriver(d, t));

    const allCircuits = await db.select().from(circuits);

    return {
      drivers: mappedDrivers,
      teams: uniqueTeams.map(toTeam),
      circuits: allCircuits,
    };
  }
}

