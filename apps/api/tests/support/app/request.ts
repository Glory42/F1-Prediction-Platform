import app from '../../../src/main';
import type { Bindings } from '../../../src/common/types';
import { getTestDatabaseUrl } from '../db/test-db';

export const testEnv: Bindings = {
  DATABASE_URL: getTestDatabaseUrl(),
  ENVIRONMENT: 'test',
};

export const apiRequest = async (path: string, init?: RequestInit): Promise<Response> => {
  return app.request(path, init, testEnv);
};
