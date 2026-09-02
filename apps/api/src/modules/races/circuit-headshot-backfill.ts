import { eq, desc, inArray } from 'drizzle-orm';
import type { Db } from '../../config/database';
import { drivers, teams, seasons } from '../../db/schema';
import { ERAS, driverKeyFor, type EraMap, type DriverWinEntry } from './circuit-era.helpers';

// Historical race rows often lack headshot URLs. This reads each winning driver's
// most recent season profile and swaps its richer driver/team records into the
// per-era win entries in place — a read + in-memory enrichment, no DB writes
// (the API never writes to Neon; ETL owns that).
export async function backfillDriverHeadshots(
  db: Db,
  driverWinsByEra: EraMap<Map<string, DriverWinEntry>>
): Promise<void> {
  const driverLastNames = Array.from(driverWinsByEra.all.values())
    .map((entry) => entry.driver.lastName)
    .filter((lastName) => lastName !== null);

  if (driverLastNames.length === 0) return;

  const latestProfiles = await db
    .select({ driver: drivers, team: teams, year: seasons.year })
    .from(drivers)
    .innerJoin(teams, eq(drivers.teamId, teams.id))
    .innerJoin(seasons, eq(drivers.seasonId, seasons.id))
    .where(inArray(drivers.lastName, driverLastNames))
    .orderBy(desc(seasons.year));

  const seenFullNames = new Set<string>();
  for (const profile of latestProfiles) {
    const fullName = driverKeyFor(profile.driver);
    if (!fullName || seenFullNames.has(fullName)) continue;
    seenFullNames.add(fullName);

    for (const era of ERAS) {
      const entry = driverWinsByEra[era].get(fullName);
      if (entry) {
        entry.driver = profile.driver;
        entry.team = profile.team;
      }
    }
  }
}
