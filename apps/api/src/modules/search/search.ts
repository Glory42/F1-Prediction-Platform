import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import type { Bindings, Driver } from '../../common/types';
import { createDb, type Db } from '../../config/database';
import { drivers, teams, circuits, seasons } from '../../db/schema';
import { toDriver, toTeam, toCircuit } from '../../common/mappers';

async function getGlobalSearchData(db: Db) {
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

  const mappedDrivers: Driver[] = driverRows.map(({ driver: d, team: t }) => toDriver(d, t));

  return {
    drivers: mappedDrivers,
    teams: teamRows.map((r) => r.team).map(toTeam),
    circuits: allCircuits.map(toCircuit),
  };
}

const searchModule = new Hono<{ Bindings: Bindings }>();

searchModule.get('/', async (c) => {
  const data = await getGlobalSearchData(createDb(c.env.DATABASE_URL));
  return c.json({ data, error: null });
});

export default searchModule;
