import type { Db } from '../../../src/config/database';
import { circuits } from '../../../src/db/schema';

type CircuitInsert = typeof circuits.$inferInsert;

export async function createCircuit(db: Db, overrides: Partial<CircuitInsert> = {}) {
  const [row] = await db
    .insert(circuits)
    .values({
      circuitKey: 'test-circuit',
      name: 'Test Circuit',
      country: 'Testland',
      city: 'Test City',
      lapCount: 50,
      trackLengthKm: '5.000',
      overtakeRate: '0.500',
      numberOfCorners: 15,
      drsZones: 2,
      scProbability: '0.300',
      imageUrl: null,
      ...overrides,
    })
    .returning();
  return row;
}
