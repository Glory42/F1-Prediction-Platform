import { http, HttpResponse } from 'msw';
import { driver, driverB, team, teamB, globalSearchResponse } from './fixtures';

const API_URL = 'http://localhost:8787';

function ok(data: unknown) {
  return HttpResponse.json({ data, error: null });
}

export const handlers = [
  http.get(`${API_URL}/api/search`, () => ok(globalSearchResponse)),

  http.get(`${API_URL}/api/drivers`, () => ok([driver, driverB])),
  http.get(`${API_URL}/api/drivers/:id`, ({ params }) => {
    const found = [driver, driverB].find((d) => d.id === Number(params.id));
    return found ? ok(found) : HttpResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'not found' } }, { status: 404 });
  }),
  http.get(`${API_URL}/api/drivers/:id/career`, () => ok([])),

  http.get(`${API_URL}/api/teams`, () => ok([team, teamB])),
  http.get(`${API_URL}/api/teams/:id`, ({ params }) => {
    const found = [team, teamB].find((t) => t.id === Number(params.id));
    return found ? ok(found) : HttpResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'not found' } }, { status: 404 });
  }),
  http.get(`${API_URL}/api/teams/:id/career`, () => ok([])),
];
