import { describe, expect, test } from 'vitest';
import { timeOf, dotColor } from '../../../../src/features/races/raceEventDisplay';
import type { Driver } from '../../../../src/types';

describe('timeOf', () => {
  test('extracts the HH:MM:SS clock time from a UTC ISO string', () => {
    expect(timeOf('2024-11-03T15:31:01.000Z')).toBe('15:31:01');
  });
});

describe('dotColor', () => {
  const driver: Driver = {
    id: 10, seasonId: 2025, teamId: 1, driverNumber: 1, code: 'VER',
    firstName: 'Max', lastName: 'Verstappen', fullName: 'Max Verstappen',
    nationality: 'Dutch', headshotUrl: null,
    team: { id: 1, seasonId: 2025, teamKey: 'red_bull_racing', name: 'Red Bull Racing', nationality: 'Austrian' },
  };

  test('returns the team color for a known driver', () => {
    expect(dotColor(driver)).toBe('#3671C6');
  });

  test('returns a fallback grey when the driver is undefined', () => {
    expect(dotColor(undefined)).toBe('#6B7280');
  });
});
