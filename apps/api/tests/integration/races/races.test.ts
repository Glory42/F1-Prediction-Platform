import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { apiRequest } from '../../support/app/request';
import { getTestDb, truncateAll } from '../../support/db/test-db';
import { createSeason } from '../../support/factories/season.factory';
import { createCircuit } from '../../support/factories/circuit.factory';
import { createTeam } from '../../support/factories/team.factory';
import { createDriver } from '../../support/factories/driver.factory';
import { createRace } from '../../support/factories/race.factory';
import { createRaceResult } from '../../support/factories/raceResult.factory';
import { createQualifyingResult } from '../../support/factories/qualifying.factory';

describe('races (integration)', () => {
  const db = getTestDb();
  let raceId: number;
  let circuitKey: string;

  beforeAll(async () => {
    await truncateAll(db);

    const season = await createSeason(db, { year: 2099 });
    const circuit = await createCircuit(db, { circuitKey: 'races-test-circuit', name: 'Races Test Circuit' });
    const team = await createTeam(db, season.id);
    const driverA = await createDriver(db, season.id, team.id, { driverNumber: 1, code: 'AAA' });
    const driverB = await createDriver(db, season.id, team.id, { driverNumber: 2, code: 'BBB' });
    const race = await createRace(db, season.id, circuit.id, {
      roundNumber: 1,
      name: 'Races Test Grand Prix',
      raceDate: '2099-03-01',
      status: 'completed',
    });

    await createRaceResult(db, race.id, driverA.id, { finishPosition: 1, gridPosition: 1 });
    await createRaceResult(db, race.id, driverB.id, { finishPosition: 2, gridPosition: 2 });
    await createQualifyingResult(db, race.id, driverA.id, { gridPosition: 1 });
    await createQualifyingResult(db, race.id, driverB.id, { gridPosition: 2 });

    raceId = race.id;
    circuitKey = circuit.circuitKey;
  });

  afterAll(async () => {
    await truncateAll(db);
  });

  it('lists races for a year with the joined circuit', async () => {
    const res = await apiRequest('/api/races?year=2099');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Array<{ name: string; circuit: { name: string } }> };
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Races Test Grand Prix');
    expect(data[0].circuit.name).toBe('Races Test Circuit');
  });

  it('filters by status', async () => {
    const scheduled = await apiRequest('/api/races?year=2099&status=scheduled');
    const { data: scheduledData } = (await scheduled.json()) as { data: unknown[] };
    expect(scheduledData).toHaveLength(0);

    const completed = await apiRequest('/api/races?year=2099&status=completed');
    const { data: completedData } = (await completed.json()) as { data: unknown[] };
    expect(completedData).toHaveLength(1);
  });

  it('returns full race detail with results and qualifying joined to drivers', async () => {
    const res = await apiRequest(`/api/races/${raceId}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { results: Array<{ finishPosition: number; driver: { code: string } }>; qualifying: unknown[] };
    };
    expect(data.results).toHaveLength(2);
    const winner = data.results.find((r) => r.finishPosition === 1);
    expect(winner?.driver.code).toBe('AAA');
    expect(data.qualifying).toHaveLength(2);
  });

  it('returns 404 for a race that does not exist', async () => {
    const res = await apiRequest('/api/races/999999999');
    expect(res.status).toBe(404);
    const { data, error } = (await res.json()) as { data: null; error: { code: string } };
    expect(data).toBeNull();
    expect(error.code).toBe('NOT_FOUND');
  });

  it('returns circuit history with the completed race as the winner entry', async () => {
    const res = await apiRequest(`/api/races/circuit/${circuitKey}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { circuit: { name: string }; history: unknown[] } };
    expect(data.circuit.name).toBe('Races Test Circuit');
    expect(data.history).toHaveLength(1);
  });
});
