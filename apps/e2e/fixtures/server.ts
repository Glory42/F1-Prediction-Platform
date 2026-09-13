import {
  predictionResponse, raceDetailResponse, raceControlMessages, raceOvertakes, teamRadioClips, predictionHistory, intelStandings,
  seasons, modelInfo, circuitDetailResponse,
  driverCareer, driverBCareer, driverDetailResponse, driverBDetailResponse,
  teamCareer, teamDetailResponse, driverStandingsResponse, driversListResponse,
  globalSearchResponse,
  teamsListResponse, teamBDetailResponse, teamBCareer,
  sprintPredictionResponse, sprintDetailResponse,
} from './data';

const PORT = Number(process.env.FIXTURE_API_PORT ?? 4310);

// GlobalSearch/DriverCompareTool/TeamCompareTool fetch client-side (see CLAUDE.md), a real
// cross-origin request to this fixture server, so it needs CORS like the real API does.
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
    if (url.pathname === '/api/sprint/race/2') return ok(sprintPredictionResponse);
    if (url.pathname === '/api/sprint/race/2/detail') return ok(sprintDetailResponse);

    if (url.pathname === '/api/races/1') return ok(raceDetailResponse);
    if (url.pathname === '/api/races/1/race-control') return ok(raceControlMessages);
    if (url.pathname === '/api/races/1/overtakes') return ok(raceOvertakes);
    if (url.pathname === '/api/races/1/team-radio') return ok(teamRadioClips);
    if (url.pathname === '/api/predictions/race/1') return ok(predictionResponse);
    if (url.pathname === '/api/races/circuit/monza') return ok(circuitDetailResponse);

    if (url.pathname === '/api/search') return ok(globalSearchResponse);

    if (url.pathname === '/api/drivers') return ok(driversListResponse);
    if (url.pathname === '/api/drivers/10') return ok(driverDetailResponse);
    if (url.pathname === '/api/drivers/11') return ok(driverBDetailResponse);
    if (url.pathname === '/api/drivers/10/career') return ok(driverCareer);
    if (url.pathname === '/api/drivers/11/career') return ok(driverBCareer);
    if (url.pathname === '/api/drivers/standings') return ok(driverStandingsResponse);

    if (url.pathname === '/api/teams') return ok(teamsListResponse);
    if (url.pathname === '/api/teams/1') return ok(teamDetailResponse);
    if (url.pathname === '/api/teams/1/career') return ok(teamCareer);
    if (url.pathname === '/api/teams/2') return ok(teamBDetailResponse);
    if (url.pathname === '/api/teams/2/career') return ok(teamBCareer);

    return notFound();
  },
});

console.log(`[e2e fixture server] listening on http://localhost:${PORT}`);
