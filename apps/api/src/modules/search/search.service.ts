import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { drivers, teams, circuits, seasons } from '../../db/schema';
import type { Driver } from '../../common/types';
import { toDriver, toTeam, toCircuit } from '../../common/mappers';

export class SearchService {
  async getGlobalSearchData(db: Db) {
    const fullNameExpr = sql`${drivers.firstName} || ' ' || ${drivers.lastName}`;

    const [teamRows, driverRows, allCircuits] = await Promise.all([
      db
        .selectDistinctOn([teams.teamKey], { team: teams })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .orderBy(teams.teamKey, desc(seasons.year)),
      db
        .selectDistinctOn([fullNameExpr], { driver: drivers, team: teams })
        .from(drivers)
        .innerJoin(seasons, eq(drivers.seasonId, seasons.id))
        .innerJoin(teams, eq(drivers.teamId, teams.id))
        .orderBy(fullNameExpr, desc(seasons.year)),
      db.select().from(circuits),
    ]);

    const uniqueTeams = teamRows.map((r) => r.team);
    const mappedDrivers: Driver[] = driverRows.map(({ driver: d, team: t }) => toDriver(d, t));

    return {
      drivers: mappedDrivers,
      teams: uniqueTeams.map(toTeam),
      circuits: allCircuits.map(toCircuit),
    };
  }
}

