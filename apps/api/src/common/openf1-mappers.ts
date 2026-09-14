import type { raceControlMessages, raceOvertakes, teamRadioClips, trackLocations } from '../db/schema';
import type { RaceControlMessage, RaceOvertake, TeamRadioClip, TrackLocation } from './types';

export function toRaceControlMessage(m: typeof raceControlMessages.$inferSelect): RaceControlMessage {
  return {
    id: m.id,
    raceId: m.raceId,
    date: m.date.toISOString(),
    category: m.category,
    flag: m.flag ?? null,
    lapNumber: m.lapNumber ?? null,
    driverNumber: m.driverNumber ?? null,
    scope: m.scope ?? null,
    sector: m.sector ?? null,
    message: m.message,
  };
}

export function toRaceOvertake(o: typeof raceOvertakes.$inferSelect): RaceOvertake {
  return {
    id: o.id,
    raceId: o.raceId,
    date: o.date.toISOString(),
    overtakingDriverId: o.overtakingDriverId,
    overtakenDriverId: o.overtakenDriverId,
    position: o.position,
  };
}

export function toTeamRadioClip(c: typeof teamRadioClips.$inferSelect): TeamRadioClip {
  return {
    id: c.id,
    raceId: c.raceId,
    driverId: c.driverId,
    date: c.date.toISOString(),
    recordingUrl: c.recordingUrl,
  };
}

export function toTrackLocation(l: typeof trackLocations.$inferSelect): TrackLocation {
  return {
    id: l.id,
    raceId: l.raceId,
    driverId: l.driverId,
    date: l.date.toISOString(),
    x: l.x,
    y: l.y,
  };
}
