import { describe, expect, test } from 'bun:test';
import { toKeyedMap } from '../../../src/common/collections';

describe('toKeyedMap', () => {
  test('keys rows by keyFn, values default to the row itself', () => {
    const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    const map = toKeyedMap(rows, (r) => r.id);
    expect(map.get(1)).toEqual({ id: 1, name: 'a' });
    expect(map.get(2)).toEqual({ id: 2, name: 'b' });
  });

  test('applies valueFn when provided', () => {
    const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    const map = toKeyedMap(rows, (r) => r.id, (r) => r.name);
    expect(map.get(1)).toBe('a');
    expect(map.get(2)).toBe('b');
  });

  test('duplicate keys keep the last row', () => {
    const rows = [{ id: 1, name: 'first' }, { id: 1, name: 'second' }];
    const map = toKeyedMap(rows, (r) => r.id);
    expect(map.get(1)).toEqual({ id: 1, name: 'second' });
  });

  test('empty input yields an empty map', () => {
    const map = toKeyedMap([] as { id: number }[], (r) => r.id);
    expect(map.size).toBe(0);
  });
});
