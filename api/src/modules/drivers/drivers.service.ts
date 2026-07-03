import { eq, and, desc, inArray } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { drivers, teams, seasons, driverSeasonStats, raceResults, races } from '../../db/schema';
import type { Driver, DriverDetailResponse, DriverStanding, DriverYearStats } from '../../common/types';

function toDriver(d: typeof drivers.$inferSelect, t: typeof teams.$inferSelect): Driver {
  return {
    id: d.id, seasonId: d.seasonId, teamId: d.teamId, driverNumber: d.driverNumber,
    code: d.code, firstName: d.firstName, lastName: d.lastName,
    fullName: `${d.firstName} ${d.lastName}`, nationality: d.nationality,
    headshotUrl: d.headshotUrl ?? null,
    team: { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality },
  };
}

function toDriverStats(s: typeof driverSeasonStats.$inferSelect) {
  return {
    racesEntered: s.racesEntered, racesFinished: s.racesFinished,
    wins: s.wins, podiums: s.podiums, poles: s.poles,
    totalPoints: s.totalPoints, championshipPosition: s.championshipPosition,
    avgFinishPosition: s.avgFinishPosition, winRate: s.winRate, avgPositionGain: s.avgPositionGain,
    dnfCount: s.dnfCount, dnfRate: s.dnfRate ?? null,
    avgSector1Ms: s.avgSector1Ms ?? null, avgSector2Ms: s.avgSector2Ms ?? null,
    avgSector3Ms: s.avgSector3Ms ?? null, topSpeedAvg: s.topSpeedAvg ?? null,
    teammateQualiDelta: s.teammateQualiDelta ?? null,
  };
}

const emptyDriverStats = {
  racesEntered: 0, racesFinished: 0, wins: 0, podiums: 0, poles: 0,
  totalPoints: '0', championshipPosition: null, avgFinishPosition: null,
  winRate: null, avgPositionGain: null, dnfCount: 0, dnfRate: null,
  avgSector1Ms: null, avgSector2Ms: null, avgSector3Ms: null,
  topSpeedAvg: null, teammateQualiDelta: null,
};

export class DriversService {
  async findAll(db: Db, year: number, teamId?: number): Promise<Driver[]> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return [];

    const rows = await db
      .select()
      .from(drivers)
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(
        teamId
          ? and(eq(drivers.seasonId, seasonRows[0].id), eq(drivers.teamId, teamId))
          : eq(drivers.seasonId, seasonRows[0].id)
      );

    return rows.map((r) => toDriver(r.drivers, r.teams));
  }

  async findStandings(db: Db, year: number): Promise<DriverStanding[]> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return [];

    const rows = await db
      .select()
      .from(drivers)
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(eq(drivers.seasonId, seasonRows[0].id));

    if (!rows.length) return [];
    const driverIds = rows.map((r) => r.drivers.id);

    const statsRows = await db
      .select()
      .from(driverSeasonStats)
      .where(and(
        eq(driverSeasonStats.seasonId, seasonRows[0].id),
        inArray(driverSeasonStats.driverId, driverIds),
      ));

    const statsById = new Map(statsRows.map((s) => [s.driverId, s]));

    const result: DriverStanding[] = rows.map((r) => {
      const s = statsById.get(r.drivers.id);
      return {
        driver: toDriver(r.drivers, r.teams),
        stats: s ? toDriverStats(s) : emptyDriverStats,
      };
    });

    return result.sort((a, b) => {
      const posA = a.stats.championshipPosition ?? 999;
      const posB = b.stats.championshipPosition ?? 999;
      if (posA !== posB) return posA - posB;
      return Number(b.stats.totalPoints) - Number(a.stats.totalPoints);
    });
  }

  async findCareerStats(db: Db, driverId: number): Promise<DriverYearStats[]> {
    const driverRow = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driverRow[0]) return [];

    const { firstName, lastName } = driverRow[0];

    const allEntries = await db
      .select()
      .from(drivers)
      .innerJoin(seasons, eq(drivers.seasonId, seasons.id))
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(
        and(
          eq(drivers.firstName, firstName),
          eq(drivers.lastName, lastName)
        )
      )
      .orderBy(desc(seasons.year));

    if (!allEntries.length) return [];

    const allIds = allEntries.map((e) => e.drivers.id);
    const statsRows = await db
      .select()
      .from(driverSeasonStats)
      .where(inArray(driverSeasonStats.driverId, allIds));

    const statsById = new Map(statsRows.map((s) => [s.driverId, s]));

    return allEntries.map((e) => {
      const s = statsById.get(e.drivers.id);
      return {
        year: e.seasons.year,
        driverId: e.drivers.id,
        driverNumberThatYear: e.drivers.driverNumber,
        teamName: e.teams.name,
        headshotUrl: e.drivers.headshotUrl ?? null,
        stats: s ? toDriverStats(s) : null,
      };
    });
  }

  async findById(db: Db, driverId: number, year: number): Promise<DriverDetailResponse | null> {
    const driverRows = await db
      .select()
      .from(drivers)
      .innerJoin(teams, eq(drivers.teamId, teams.id))
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driverRows[0]) return null;
    const driver = toDriver(driverRows[0].drivers, driverRows[0].teams);

    const [statsRows, recentRows] = await Promise.all([
      db
        .select()
        .from(driverSeasonStats)
        .where(and(eq(driverSeasonStats.driverId, driverId), eq(driverSeasonStats.seasonId, driverRows[0].drivers.seasonId)))
        .limit(1),

      db
        .select({ result: raceResults, race: { name: races.name, raceDate: races.raceDate } })
        .from(raceResults)
        .innerJoin(races, eq(raceResults.raceId, races.id))
        .where(eq(raceResults.driverId, driverId))
        .orderBy(desc(races.raceDate))
        .limit(5),
    ]);

    const stats = statsRows[0];

    return {
      driver,
      seasonStats: stats ? toDriverStats(stats) : emptyDriverStats,
      recentResults: recentRows.map((r) => ({
        id: r.result.id, raceId: r.result.raceId, driverId: r.result.driverId,
        finishPosition: r.result.finishPosition, gridPosition: r.result.gridPosition,
        points: r.result.points, status: r.result.status, fastestLap: r.result.fastestLap,
        driver, race: { name: r.race.name, raceDate: r.race.raceDate },
      })),
    };
  }
}
