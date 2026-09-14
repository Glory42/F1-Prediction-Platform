import { describe, expect, test } from 'vitest';
import { unwrapSettled } from '../../../src/lib/utils';

describe('unwrapSettled', () => {
  test('returns the value when the settled result is fulfilled', () => {
    const result: PromiseSettledResult<number> = { status: 'fulfilled', value: 42 };
    expect(unwrapSettled(result, 0)).toBe(42);
  });

  test('returns the fallback when the settled result is rejected', () => {
    const result: PromiseSettledResult<number> = { status: 'rejected', reason: new Error('boom') };
    expect(unwrapSettled(result, 0)).toBe(0);
  });

  test('works with array fallbacks', () => {
    const result: PromiseSettledResult<string[]> = { status: 'rejected', reason: new Error('boom') };
    expect(unwrapSettled(result, [])).toEqual([]);
  });
});
