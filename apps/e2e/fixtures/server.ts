import {
  predictionResponse, raceDetailResponse, predictionHistory, intelStandings,
  seasons, modelInfo, circuitDetailResponse,
  driverCareer, driverBCareer, driverDetailResponse, driverBDetailResponse,
  teamCareer, teamDetailResponse, driverStandingsResponse, driversListResponse,
  globalSearchResponse,
} from './data';

const PORT = Number(process.env.FIXTURE_API_PORT ?? 4310);

// GlobalSearch/DriverCompareTool/TeamCompareTool fetch client-side (the sanctioned
// exception to Astro's server-only data fetching — see CLAUDE.md) — from the browser
// that's a genuine cross-origin request to this fixture server, so it needs CORS
// headers the same way the real Hono API does, unlike the server-side Astro fetches
// every other fixture route only ever serves.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function ok(data: unknown): Response {
  return Response.json({ data, error: null }, { headers: CORS_HEADERS });
}

function notFound(): Response {
  return Response.json(
    { data: null, error: { code: 'not_found', message: 'no fixture for this route' } },
    { status: 404, headers: CORS_HEADERS }
  );
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/health') return new Response('ok');

    if (url.pathname === '/api/predictions/model-info') return ok(modelInfo);
    if (url.pathname === '/api/predictions/upcoming') return ok(predictionResponse);
    if (url.pathname === '/api/predictions/history') return ok(predictionHistory);
    if (url.pathname === '/api/predictions/standings') return ok(intelStandings);
    if (url.pathname === '/api/seasons') return ok(seasons);
    if (url.pathname === '/api/sprint/upcoming') return notFound();

    if (url.pathname === '/api/races/1') return ok(raceDetailResponse);
    if (url.pathname === '/api/predictions/race/1') return ok(predictionResponse);
    if (url.pathname === '/api/races/circuit/monza') return ok(circuitDetailResponse);

    if (url.pathname === '/api/search') return ok(globalSearchResponse);

    if (url.pathname === '/api/drivers') return ok(driversListResponse);
    if (url.pathname === '/api/drivers/10') return ok(driverDetailResponse);
    if (url.pathname === '/api/drivers/11') return ok(driverBDetailResponse);
    if (url.pathname === '/api/drivers/10/career') return ok(driverCareer);
    if (url.pathname === '/api/drivers/11/career') return ok(driverBCareer);
    if (url.pathname === '/api/drivers/standings') return ok(driverStandingsResponse);

    if (url.pathname === '/api/teams/1') return ok(teamDetailResponse);
    if (url.pathname === '/api/teams/1/career') return ok(teamCareer);

    return notFound();
  },
});

console.log(`[e2e fixture server] listening on http://localhost:${PORT}`);
