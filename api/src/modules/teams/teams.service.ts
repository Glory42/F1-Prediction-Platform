import { eq, and, inArray, desc } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { teams, seasons, drivers, teamSeasonStats } from '../../db/schema';
import type { Team, Driver, TeamDetailResponse, TeamStanding, TeamYearStats } from '../../common/types';

function toTeam(t: typeof teams.$inferSelect): Team {
  return { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality };
}

function toTeamStats(s: typeof teamSeasonStats.$inferSelect) {
  return {
    racesCompleted: s.racesCompleted, wins: s.wins, podiums: s.podiums,
    totalPoints: s.totalPoints, championshipPosition: s.championshipPosition,
    avgFinishPosition: s.avgFinishPosition, carPerformanceScore: s.carPerformanceScore,
    dnfCount: s.dnfCount, reliabilityScore: s.reliabilityScore ?? null,
  };
}

const emptyTeamStats = {
  racesCompleted: 0, wins: 0, podiums: 0, totalPoints: '0',
  championshipPosition: null, avgFinishPosition: null, carPerformanceScore: null,
  dnfCount: 0, reliabilityScore: null,
};

export class TeamsService {
  async findAll(db: Db, year: number): Promise<Team[]> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return [];
    const rows = await db.select().from(teams).where(eq(teams.seasonId, seasonRows[0].id));
    return rows.map(toTeam);
  }

  async findStandings(db: Db, year: number): Promise<TeamStanding[]> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return [];

    const teamRows = await db.select().from(teams).where(eq(teams.seasonId, seasonRows[0].id));
    if (!teamRows.length) return [];

    const teamIds = teamRows.map((t) => t.id);
    const statsRows = await db
      .select()
      .from(teamSeasonStats)
      .where(and(
        eq(teamSeasonStats.seasonId, seasonRows[0].id),
        inArray(teamSeasonStats.teamId, teamIds),
      ));

    const statsById = new Map(statsRows.map((s) => [s.teamId, s]));

    const result: TeamStanding[] = teamRows.map((t) => {
      const s = statsById.get(t.id);
      return {
        team: toTeam(t),
        stats: s ? toTeamStats(s) : emptyTeamStats,
      };
    });

    return result.sort((a, b) => {
      const posA = a.stats.championshipPosition ?? 999;
      const posB = b.stats.championshipPosition ?? 999;
      if (posA !== posB) return posA - posB;
      return Number(b.stats.totalPoints) - Number(a.stats.totalPoints);
    });
  }

  async findCareerStats(db: Db, teamId: number): Promise<TeamYearStats[]> {
    const teamRow = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!teamRow[0]) return [];

    const key = teamRow[0].teamKey;

    const allEntries = await db
      .select()
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .where(eq(teams.teamKey, key))
      .orderBy(desc(seasons.year));

    if (!allEntries.length) return [];

    const allIds = allEntries.map((e) => e.teams.id);
    const statsRows = await db
      .select()
      .from(teamSeasonStats)
      .where(inArray(teamSeasonStats.teamId, allIds));

    const statsById = new Map(statsRows.map((s) => [s.teamId, s]));

    return allEntries.map((e) => {
      const s = statsById.get(e.teams.id);
      return {
        year: e.seasons.year,
        teamId: e.teams.id,
        stats: s ? toTeamStats(s) : null,
      };
    });
  }

  async findById(db: Db, teamId: number, year: number): Promise<TeamDetailResponse | null> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return null;

    const teamRows = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.seasonId, seasonRows[0].id)))
      .limit(1);

    if (!teamRows[0]) return null;
    const team = toTeam(teamRows[0]);

    const [statsRows, driverRows] = await Promise.all([
      db
        .select()
        .from(teamSeasonStats)
        .where(and(eq(teamSeasonStats.teamId, teamId), eq(teamSeasonStats.seasonId, seasonRows[0].id)))
        .limit(1),

      db
        .select()
        .from(drivers)
        .where(and(eq(drivers.teamId, teamId), eq(drivers.seasonId, seasonRows[0].id))),
    ]);

    const stats = statsRows[0];
    const teamDrivers: Driver[] = driverRows.map((d) => ({
      id: d.id, seasonId: d.seasonId, teamId: d.teamId, driverNumber: d.driverNumber,
      code: d.code, firstName: d.firstName, lastName: d.lastName,
      fullName: `${d.firstName} ${d.lastName}`, nationality: d.nationality,
      headshotUrl: d.headshotUrl ?? null, team,
    }));

    return {
      team,
      seasonStats: stats ? toTeamStats(stats) : emptyTeamStats,
      drivers: teamDrivers,
    };
  }
}
