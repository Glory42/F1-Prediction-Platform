import type {
  PredictionResponse, RaceDetailResponse, DriverDetailResponse, TeamDetailResponse,
  Race, Driver, Team, DriverStanding, TeamStanding, Circuit,
  PredictionHistoryItem, IntelStandingRow, CircuitHistoryItem, CircuitDetailResponse,
  DriverYearStats, TeamYearStats, SeasonSummary,
  SprintPredictionResponse, SprintDetailResponse, ModelInfo,
} from '@/types';

const API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8787';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  const json = (await res.json()) as { data: T; error: null } | { data: null; error: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.data;
}

export const api = {
  // Predictions
  getModelInfo: () => get<ModelInfo>('/api/predictions/model-info'),
  getUpcomingPrediction: () => get<PredictionResponse>('/api/predictions/upcoming'),
  getPredictionByRace: (raceId: number) => get<PredictionResponse>(`/api/predictions/race/${raceId}`),
  getPredictionHistory: (year: number) => get<PredictionHistoryItem[]>(`/api/predictions/history?year=${year}`),
  getIntelStandings: (year: number) => get<IntelStandingRow[]>(`/api/predictions/standings?year=${year}`),

  // Races
  getRaces: (year: number, status?: string) => {
    const q = status ? `?year=${year}&status=${status}` : `?year=${year}`;
    return get<Race[]>(`/api/races${q}`);
  },
  getRaceById: (id: number) => get<RaceDetailResponse>(`/api/races/${id}`),
  getCircuitDetails: (circuitKey: string) => get<CircuitDetailResponse>(`/api/races/circuit/${circuitKey}`),
  getCircuits: () => get<Circuit[]>('/api/races/circuits'),

  // Drivers
  getDrivers: (year: number) => get<Driver[]>(`/api/drivers?year=${year}`),
  getDriverStandings: (year: number) => get<DriverStanding[]>(`/api/drivers/standings?year=${year}`),
  getDriverById: (id: number, year: number) => get<DriverDetailResponse>(`/api/drivers/${id}?year=${year}`),
  getDriverCareer: (id: number) => get<DriverYearStats[]>(`/api/drivers/${id}/career`),

  // Sprint
  getSprintUpcoming: () => get<SprintPredictionResponse>('/api/sprint/upcoming'),
  getSprintByRaceId: (raceId: number) => get<SprintPredictionResponse>(`/api/sprint/race/${raceId}`),
  getSprintDetail: (raceId: number) => get<SprintDetailResponse>(`/api/sprint/race/${raceId}/detail`),

  // Seasons
  getSeasons: () => get<SeasonSummary[]>('/api/seasons'),

  // Search
  getGlobalSearch: () => get<{ drivers: Driver[]; teams: Team[]; circuits: Circuit[] }>('/api/search'),

  // Teams
  getTeams: (year: number) => get<Team[]>(`/api/teams?year=${year}`),
  getTeamStandings: (year: number) => get<TeamStanding[]>(`/api/teams/standings?year=${year}`),
  getTeamById: (id: number, year: number) => get<TeamDetailResponse>(`/api/teams/${id}?year=${year}`),
  getTeamCareer: (id: number) => get<TeamYearStats[]>(`/api/teams/${id}/career`),
};
