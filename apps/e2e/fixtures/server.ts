import {
  predictionResponse, raceDetailResponse, predictionHistory, intelStandings,
  seasons, modelInfo, circuitDetailResponse,
} from './data';

const PORT = Number(process.env.FIXTURE_API_PORT ?? 4310);

function ok(data: unknown): Response {
  return Response.json({ data, error: null });
}

function notFound(): Response {
  return Response.json({ data: null, error: { code: 'not_found', message: 'no fixture for this route' } }, { status: 404 });
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

    return notFound();
  },
});

console.log(`[e2e fixture server] listening on http://localhost:${PORT}`);
