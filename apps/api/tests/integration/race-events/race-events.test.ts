import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { apiRequest } from '../../support/app/request';
import { getTestDb, truncateAll } from '../../support/db/test-db';
import { createSeason } from '../../support/factories/season.factory';
import { createCircuit } from '../../support/factories/circuit.factory';
import { createTeam } from '../../support/factories/team.factory';
import { createDriver } from '../../support/factories/driver.factory';
import { createRace } from '../../support/factories/race.factory';
import { createRaceControlMessage } from '../../support/factories/raceControlMessage.factory';
import { createRaceOvertake } from '../../support/factories/raceOvertake.factory';
import { createTeamRadioClip } from '../../support/factories/teamRadioClip.factory';

describe('race-events (integration)', () => {
  const db = getTestDb();
  let raceId: number;

  beforeAll(async () => {
    await truncateAll(db);

    const season = await createSeason(db, { year: 2098 });
    const circuit = await createCircuit(db, { circuitKey: 'race-events-test-circuit', name: 'Race Events Test Circuit' });
    const team = await createTeam(db, season.id);
    const driverA = await createDriver(db, season.id, team.id, { driverNumber: 1, code: 'AAA' });
    const driverB = await createDriver(db, season.id, team.id, { driverNumber: 2, code: 'BBB' });
    const race = await createRace(db, season.id, circuit.id, {
      roundNumber: 1,
      name: 'Race Events Test Grand Prix',
      raceDate: '2098-03-01',
      status: 'completed',
    });

    await createRaceControlMessage(db, race.id, {
      date: new Date('2098-03-01T14:10:00Z'),
      category: 'Flag',
      flag: 'YELLOW',
      lapNumber: 5,
      message: 'YELLOW IN TRACK SECTOR 4',
    });
    await createRaceControlMessage(db, race.id, {
      date: new Date('2098-03-01T14:00:00Z'),
      category: 'SafetyCar',
      flag: null,
      message: 'SAFETY CAR DEPLOYED',
    });

    await createRaceOvertake(db, race.id, driverA.id, driverB.id, {
      date: new Date('2098-03-01T14:05:00Z'),
      position: 3,
    });
    await createRaceOvertake(db, race.id, driverB.id, driverA.id, {
      date: new Date('2098-03-01T14:01:00Z'),
      position: 7,
    });

    await createTeamRadioClip(db, race.id, driverA.id, {
      date: new Date('2098-03-01T14:12:00Z'),
      recordingUrl: 'https://example.com/clip-a.mp3',
    });
    await createTeamRadioClip(db, race.id, driverB.id, {
      date: new Date('2098-03-01T14:02:00Z'),
      recordingUrl: 'https://example.com/clip-b.mp3',
    });

    raceId = race.id;
  });

  afterAll(async () => {
    await truncateAll(db);
  });

  it('returns race control messages ordered by date ascending', async () => {
    const res = await apiRequest(`/api/races/${raceId}/race-control`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Array<{ category: string; message: string }> };
    expect(data).toHaveLength(2);
    expect(data[0].category).toBe('SafetyCar');
    expect(data[1].category).toBe('Flag');
  });

  it('returns 404 for a race that does not exist', async () => {
    const res = await apiRequest('/api/races/999999999/race-control');
    expect(res.status).toBe(404);
    const { data, error } = (await res.json()) as { data: null; error: { code: string } };
    expect(data).toBeNull();
    expect(error.code).toBe('NOT_FOUND');
  });

  it('returns overtakes ordered by date ascending', async () => {
    const res = await apiRequest(`/api/races/${raceId}/overtakes`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Array<{ position: number }> };
    expect(data).toHaveLength(2);
    expect(data[0].position).toBe(7);
    expect(data[1].position).toBe(3);
  });

  it('returns 404 for overtakes on a race that does not exist', async () => {
    const res = await apiRequest('/api/races/999999999/overtakes');
    expect(res.status).toBe(404);
    const { data, error } = (await res.json()) as { data: null; error: { code: string } };
    expect(data).toBeNull();
    expect(error.code).toBe('NOT_FOUND');
  });

  it('returns team radio clips ordered by date ascending', async () => {
    const res = await apiRequest(`/api/races/${raceId}/team-radio`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Array<{ recordingUrl: string }> };
    expect(data).toHaveLength(2);
    expect(data[0].recordingUrl).toBe('https://example.com/clip-b.mp3');
    expect(data[1].recordingUrl).toBe('https://example.com/clip-a.mp3');
  });

  it('returns 404 for team radio on a race that does not exist', async () => {
    const res = await apiRequest('/api/races/999999999/team-radio');
    expect(res.status).toBe(404);
    const { data, error } = (await res.json()) as { data: null; error: { code: string } };
    expect(data).toBeNull();
    expect(error.code).toBe('NOT_FOUND');
  });
});
