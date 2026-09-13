import type {
  drivers, teams, races, circuits, raceResults, qualifyingResults, sprintResults,
} from '../db/schema';
import type {
  Driver, Team, Race, Circuit, RaceResult, QualifyingResult, SprintResult,
} from './types';
import { SPRINT_FORMATS } from './constants';

type WithDriverTeam<T> = { drivers: typeof drivers.$inferSelect; teams: typeof teams.$inferSelect } & T;

export function toTeam(t: typeof teams.$inferSelect): Team {
  return { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality };
}

export function toDriver(d: typeof drivers.$inferSelect, t: typeof teams.$inferSelect): Driver {
  return {
    id: d.id, seasonId: d.seasonId, teamId: d.teamId, driverNumber: d.driverNumber,
    code: d.code, firstName: d.firstName, lastName: d.lastName,
    fullName: `${d.firstName} ${d.lastName}`, nationality: d.nationality,
    headshotUrl: d.headshotUrl ?? null,
    team: toTeam(t),
  };
}

export function toCircuit(circuit: typeof circuits.$inferSelect): Circuit {
  const r2PublicUrl = globalThis.process?.env?.R2_PUBLIC_URL || '';
  const cleanBase = r2PublicUrl.replace(/\/$/, '');
  
  let imageUrl = circuit.imageUrl ?? null;
  if (imageUrl) {
    if (imageUrl.startsWith('/') && cleanBase) {
      imageUrl = `${cleanBase}${imageUrl}`;
    }
  } else if (circuit.circuitKey) {
    imageUrl = cleanBase 
      ? `${cleanBase}/circuits/${circuit.circuitKey}.jpg`
      : `/circuits/${circuit.circuitKey}.jpg`;
  }

  return {
    id: circuit.id, circuitKey: circuit.circuitKey, name: circuit.name,
    country: circuit.country, city: circuit.city, lapCount: circuit.lapCount,
    trackLengthKm: circuit.trackLengthKm, overtakeRate: circuit.overtakeRate,
    numberOfCorners: circuit.numberOfCorners ?? null,
    drsZones: circuit.drsZones ?? null,
    scProbability: circuit.scProbability ?? null,
    imageUrl,
  };
}

export function toRaceResult(r: WithDriverTeam<{ race_results: typeof raceResults.$inferSelect }>): RaceResult {
  return {
    id: r.race_results.id,
    raceId: r.race_results.raceId,
    driverId: r.race_results.driverId,
    finishPosition: r.race_results.finishPosition,
    gridPosition: r.race_results.gridPosition,
    points: r.race_results.points,
    status: r.race_results.status,
    fastestLap: r.race_results.fastestLap,
    driver: toDriver(r.drivers, r.teams),
  };
}

export function toQualifyingResult(
  r: WithDriverTeam<{ qualifying_results: typeof qualifyingResults.$inferSelect }>
): QualifyingResult {
  const q = r.qualifying_results;
  return {
    id: q.id,
    driverId: q.driverId,
    gridPosition: q.gridPosition,
    q1TimeMs: q.q1TimeMs,
    q2TimeMs: q.q2TimeMs,
    q3TimeMs: q.q3TimeMs,
    sector1Ms: q.sector1Ms ?? null,
    sector2Ms: q.sector2Ms ?? null,
    sector3Ms: q.sector3Ms ?? null,
    speedSt: q.speedSt ?? null,
    driver: toDriver(r.drivers, r.teams),
  };
}

export function toSprintResult(
  r: WithDriverTeam<{ sprint_results: typeof sprintResults.$inferSelect }>
): SprintResult {
  const s = r.sprint_results;
  return {
    id: s.id,
    raceId: s.raceId,
    driverId: s.driverId,
    finishPosition: s.finishPosition,
    gridPosition: s.gridPosition,
    points: s.points,
    status: s.status,
    fastestLap: s.fastestLap,
    sq1TimeMs: s.sq1TimeMs ?? null,
    sq2TimeMs: s.sq2TimeMs ?? null,
    sq3TimeMs: s.sq3TimeMs ?? null,
    sqSector1Ms: s.sqSector1Ms ?? null,
    sqSector2Ms: s.sqSector2Ms ?? null,
    sqSector3Ms: s.sqSector3Ms ?? null,
    sqSpeedSt: s.sqSpeedSt ?? null,
    driver: toDriver(r.drivers, r.teams),
  };
}

export function toRace(race: typeof races.$inferSelect, circuit: typeof circuits.$inferSelect): Race {
  return {
    id: race.id, seasonId: race.seasonId, roundNumber: race.roundNumber,
    name: race.name, raceDate: race.raceDate,
    raceDateUtc: race.raceDateUtc?.toISOString() ?? null,
    status: race.status,
    eventFormat: race.eventFormat,
    qualifyingDate: race.qualifyingDate?.toISOString() ?? null,
    sprintDate: race.sprintDate?.toISOString() ?? null,
    sprintQualifyingDate: race.sprintQualifyingDate?.toISOString() ?? null,
    hasSprint: (SPRINT_FORMATS as readonly string[]).includes(race.eventFormat),
    weather: race.weather ?? null,
    safetyCarLaps: race.safetyCarLaps ?? null,
    vscLaps: race.vscLaps ?? null,
    airTempAvg: race.airTempAvg ?? null,
    trackTempAvg: race.trackTempAvg ?? null,
    humidityAvg: race.humidityAvg ?? null,
    sprintWeather: race.sprintWeather ?? null,
    sprintSafetyCarLaps: race.sprintSafetyCarLaps ?? null,
    sprintVscLaps: race.sprintVscLaps ?? null,
    sprintAirTempAvg: race.sprintAirTempAvg ?? null,
    sprintTrackTempAvg: race.sprintTrackTempAvg ?? null,
    sprintHumidityAvg: race.sprintHumidityAvg ?? null,
    circuit: toCircuit(circuit),
  };
}
