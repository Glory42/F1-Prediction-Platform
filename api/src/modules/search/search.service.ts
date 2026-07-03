import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { drivers, teams, circuits, seasons } from '../../db/schema';
import type { Driver } from '../../common/types';

export class SearchService {
  async getGlobalSearchData(db: Db) {
    const allTeamsRows = await db
      .select({ team: teams })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .orderBy(desc(seasons.year));

    const uniqueTeamsMap = new Map();
    for (const r of allTeamsRows) {
      if (!uniqueTeamsMap.has(r.team.teamKey)) uniqueTeamsMap.set(r.team.teamKey, r.team);
    }
    const uniqueTeams = Array.from(uniqueTeamsMap.values());

    const allDriversRows = await db
      .select({ driver: drivers })
      .from(drivers)
      .innerJoin(seasons, eq(drivers.seasonId, seasons.id))
      .orderBy(desc(seasons.year));

    const uniqueDriversMap = new Map();
    for (const r of allDriversRows) {
      const fullName = `${r.driver.firstName} ${r.driver.lastName}`;
      if (!uniqueDriversMap.has(fullName)) {
        uniqueDriversMap.set(fullName, r.driver);
      }
    }
    const uniqueDriversRaw = Array.from(uniqueDriversMap.values());

    // Build map for quick team lookup by teamId across all team records, not just unique ones.
    const allTeamsLookup = await db.select().from(teams);
    const teamMap = new Map(allTeamsLookup.map(t => [t.id, t]));

    const mappedDrivers: Driver[] = uniqueDriversRaw.map(d => {
      const t = teamMap.get(d.teamId)!;
      return {
        id: d.id, seasonId: d.seasonId, teamId: d.teamId, driverNumber: d.driverNumber,
        code: d.code, firstName: d.firstName, lastName: d.lastName,
        fullName: `${d.firstName} ${d.lastName}`, nationality: d.nationality,
        headshotUrl: d.headshotUrl ?? null,
        team: { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality },
      };
    });

    const allCircuits = await db.select().from(circuits);

    return {
      drivers: mappedDrivers,
      teams: uniqueTeams.map(t => ({ id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality })),
      circuits: allCircuits,
    };
  }
}

