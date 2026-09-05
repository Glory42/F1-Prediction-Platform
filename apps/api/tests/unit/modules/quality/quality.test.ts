import { describe, expect, test } from 'bun:test';
import { castSeverity } from '../../../../src/modules/quality/quality';
import type { QualitySeverity } from '../../../../src/common/types';

describe('castSeverity', () => {
  test('passes through valid severities', () => {
    expect(castSeverity('high')).toBe('high' satisfies QualitySeverity);
    expect(castSeverity('medium')).toBe('medium' satisfies QualitySeverity);
    expect(castSeverity('low')).toBe('low' satisfies QualitySeverity);
  });

  test('falls back to medium for unexpected values', () => {
    expect(castSeverity('CRITICAL')).toBe('medium');
    expect(castSeverity('')).toBe('medium');
    expect(castSeverity('')).toBe('medium');
  });
});