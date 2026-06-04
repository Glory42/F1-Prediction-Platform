import type { drivers, teams, races, circuits } from '../db/schema';
import type { Driver, Race, Circuit } from './types';
import { SPRINT_FORMATS } from './constants';

export function toDriver(d: typeof drivers.$inferSelect, t: typeof teams.$inferSelect): Driver {
  return {
    id: d.id, seasonId: d.seasonId, teamId: d.teamId, driverNumber: d.driverNumber,
    code: d.code, firstName: d.firstName, lastName: d.lastName,
    fullName: `${d.firstName} ${d.lastName}`, nationality: d.nationality,
    headshotUrl: d.headshotUrl ?? null,
    team: { id: t.id, seasonId: t.seasonId, teamKey: t.teamKey, name: t.name, nationality: t.nationality },
  };
}

export function toCircuit(circuit: typeof circuits.$inferSelect): Circuit {
  return {
    id: circuit.id, circuitKey: circuit.circuitKey, name: circuit.name,
    country: circuit.country, city: circuit.city, lapCount: circuit.lapCount,
    trackLengthKm: circuit.trackLengthKm, overtakeRate: circuit.overtakeRate,
  };
}

export function toRace(race: typeof races.$inferSelect, circuit: typeof circuits.$inferSelect): Race {
  return {
    id: race.id, seasonId: race.seasonId, roundNumber: race.roundNumber,
    name: race.name, raceDate: race.raceDate, status: race.status,
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
