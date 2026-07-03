import { asc, eq, and, inArray, desc } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { teams, seasons, drivers, teamSeasonStats, raceResults, sprintResults, races } from '../../db/schema';
import type { Team, Driver, TeamDetailResponse, TeamStanding, TeamYearStats, TeamProgression } from '../../common/types';

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
    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!teamRows[0]) return null;
    const team = toTeam(teamRows[0]);

    const [statsRows, driverRows] = await Promise.all([
      db
        .select()
        .from(teamSeasonStats)
        .where(and(eq(teamSeasonStats.teamId, teamId), eq(teamSeasonStats.seasonId, teamRows[0].seasonId)))
        .limit(1),

      db
        .select()
        .from(drivers)
        .where(and(eq(drivers.teamId, teamId), eq(drivers.seasonId, teamRows[0].seasonId))),
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
  async findStandingsProgression(db: Db, year: number): Promise<TeamProgression[]> {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.year, year)).limit(1);
    if (!seasonRows[0]) return [];

    const statsRows = await db
      .select()
      .from(teamSeasonStats)
      .where(and(eq(teamSeasonStats.seasonId, seasonRows[0].id)))
      .orderBy(asc(teamSeasonStats.championshipPosition))
      .limit(10);

    if (!statsRows.length) return [];
    const teamIds = statsRows.map((s) => s.teamId);

    const teamRows = await db
      .select()
      .from(teams)
      .where(inArray(teams.id, teamIds));
    const teamMap = new Map(teamRows.map((t) => [t.id, toTeam(t)]));

    const driverRows = await db
      .select()
      .from(drivers)
      .where(inArray(drivers.teamId, teamIds));
    const driverTeamMap = new Map(driverRows.map((d) => [d.id, d.teamId]));
    const allDriverIds = driverRows.map((d) => d.id);

    const raceList = await db
      .select()
      .from(races)
      .where(eq(races.seasonId, seasonRows[0].id))
      .orderBy(asc(races.roundNumber));

    const raceIds = raceList.map((r) => r.id);
    if (!raceIds.length || !allDriverIds.length) return [];

    const [mainRes, sprintRes] = await Promise.all([
      db.select().from(raceResults).where(and(inArray(raceResults.raceId, raceIds), inArray(raceResults.driverId, allDriverIds))),
      db.select().from(sprintResults).where(and(inArray(sprintResults.raceId, raceIds), inArray(sprintResults.driverId, allDriverIds))),
    ]);

    const resultsByRaceAndTeam = new Map<string, number>();
    for (const r of mainRes) {
      const teamId = driverTeamMap.get(r.driverId);
      if (!teamId) continue;
      const key = `${r.raceId}-${teamId}`;
      resultsByRaceAndTeam.set(key, (resultsByRaceAndTeam.get(key) ?? 0) + Number(r.points));
    }
    for (const r of sprintRes) {
      const teamId = driverTeamMap.get(r.driverId);
      if (!teamId) continue;
      const key = `${r.raceId}-${teamId}`;
      resultsByRaceAndTeam.set(key, (resultsByRaceAndTeam.get(key) ?? 0) + Number(r.points));
    }

    return statsRows.map((s) => {
      const team = teamMap.get(s.teamId)!;
      let cumulativePoints = 0;
      const progression = [];
      for (const race of raceList) {
        if (race.status === 'scheduled') continue;
        const pts = resultsByRaceAndTeam.get(`${race.id}-${team.id}`) ?? 0;
        cumulativePoints += pts;
        progression.push({
          round: race.roundNumber,
          raceName: race.name,
          pointsGained: pts,
          cumulativePoints,
        });
      }
      return { team, progression };
    });
  }
}
