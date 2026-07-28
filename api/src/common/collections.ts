export function toKeyedMap<T, K, V = T>(
  rows: T[],
  keyFn: (row: T) => K,
  valueFn?: (row: T) => V
): Map<K, V> {
  return new Map(rows.map((row) => [keyFn(row), valueFn ? valueFn(row) : (row as unknown as V)]));
}
