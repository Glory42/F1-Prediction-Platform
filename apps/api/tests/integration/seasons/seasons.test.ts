import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { apiRequest } from '../../support/app/request';
import { getTestDb, truncateAll } from '../../support/db/test-db';
import { createSeason } from '../../support/factories/season.factory';
import { createCircuit } from '../../support/factories/circuit.factory';
import { createRace } from '../../support/factories/race.factory';

describe('seasons (integration)', () => {
  const db = getTestDb();

  beforeAll(async () => {
    await truncateAll(db);

    const season = await createSeason(db, { year: 2096 });
    const circuit = await createCircuit(db, { circuitKey: 'seasons-test-circuit' });
    await createRace(db, season.id, circuit.id, { roundNumber: 1, raceDate: '2096-01-01', name: 'Seasons Test GP 1' });
    await createRace(db, season.id, circuit.id, { roundNumber: 2, raceDate: '2096-02-01', name: 'Seasons Test GP 2' });

    await createSeason(db, { year: 2095 });
  });

  afterAll(async () => {
    await truncateAll(db);
  });

  it('lists seasons with their race counts, newest first', async () => {
    const res = await apiRequest('/api/seasons');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Array<{ year: number; raceCount: number }> };

    const withRaces = data.find((s) => s.year === 2096);
    const withoutRaces = data.find((s) => s.year === 2095);
    expect(withRaces?.raceCount).toBe(2);
    expect(withoutRaces?.raceCount).toBe(0);
    expect(data.indexOf(withRaces!)).toBeLessThan(data.indexOf(withoutRaces!));
  });
});
