import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { drivers, teams, circuits, seasons } from '../../db/schema';
import type { Driver } from '../../common/types';

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

    const mappedDrivers: Driver[] = uniqueDrivers.map(({ driver: d, team: t }) => ({
      id: d.id,
      seasonId: d.seasonId,
      teamId: d.teamId,
      driverNumber: d.driverNumber,
      code: d.code,
      firstName: d.firstName,
      lastName: d.lastName,
      fullName: `${d.firstName} ${d.lastName}`,
      nationality: d.nationality,
      headshotUrl: d.headshotUrl ?? null,
      team: { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality },
    }));

    const allCircuits = await db.select().from(circuits);

    return {
      drivers: mappedDrivers,
      teams: uniqueTeams.map(t => ({ id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality })),
      circuits: allCircuits,
    };
  }
}

