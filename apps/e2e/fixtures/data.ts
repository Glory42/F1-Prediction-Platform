import type {
  Circuit, Team, Driver, Race, RaceResult, QualifyingResult, LapSummary,
  FeatureScores, DriverPrediction, PredictionResponse, RaceDetailResponse,
  PredictionHistoryItem, IntelStandingRow, SeasonSummary, ModelInfo, CircuitDetailResponse,
  DriverSeasonStats, DriverYearStats, DriverDetailResponse, TeamSeasonStats, TeamYearStats,
  TeamDetailResponse, DriverStanding,
} from '../../web/src/types';

export const circuit: Circuit = {
  id: 5, circuitKey: 'monza', name: 'Autodromo Nazionale Monza', country: 'Italy', city: 'Monza',
  lapCount: 53, trackLengthKm: '5.793', overtakeRate: '0.850',
  numberOfCorners: 11, drsZones: 2, scProbability: '0.300', imageUrl: null,
};

export const team: Team = {
  id: 1, seasonId: 2025, teamKey: 'red-bull', name: 'Red Bull Racing', nationality: 'Austrian',
};

export const teamB: Team = {
  id: 2, seasonId: 2025, teamKey: 'ferrari', name: 'Ferrari', nationality: 'Italian',
};

export const driver: Driver = {
  id: 10, seasonId: 2025, teamId: 1, driverNumber: 1, code: 'VER',
  firstName: 'Max', lastName: 'Verstappen', fullName: 'Max Verstappen',
  nationality: 'Dutch', headshotUrl: null, team,
};

export const driverB: Driver = {
  id: 11, seasonId: 2025, teamId: 2, driverNumber: 16, code: 'LEC',
  firstName: 'Charles', lastName: 'Leclerc', fullName: 'Charles Leclerc',
  nationality: 'Monegasque', headshotUrl: null, team: teamB,
};

export const race: Race = {
  id: 1, seasonId: 2025, roundNumber: 16, name: 'Italian Grand Prix',
  raceDate: '2025-09-07', raceDateUtc: '2025-09-07T13:00:00.000Z',
  status: 'completed', eventFormat: 'conventional',
  qualifyingDate: '2025-09-06T14:00:00.000Z', sprintDate: null, sprintQualifyingDate: null,
  hasSprint: false, weather: 'dry',
  safetyCarLaps: 0, vscLaps: 0, airTempAvg: '24.5', trackTempAvg: '38.2', humidityAvg: '45.0',
  sprintWeather: null, sprintSafetyCarLaps: null, sprintVscLaps: null,
  sprintAirTempAvg: null, sprintTrackTempAvg: null, sprintHumidityAvg: null,
  circuit,
};

const featureScores: FeatureScores = {
  carPerformance: '0.80000', driverRating: '0.75000', startingPosition: '0.90000', winRate: '0.70000',
  luckFactor: '0.50000', weatherImpact: '0.50000', trackOvertake: null, positionGain: '0.55000',
  longRunPace: '0.65000', reliability: '0.85000',
  qualifyingDelta: '0.60000', sectorStrength: '0.70000',
  tyreDeg: '0.60000', circuitAdjStartPos: '0.72000', circuitAdjPositionGain: '0.40000',
};

const driverPredictions: DriverPrediction[] = [
  { driver, winProbability: '0.62000', predictedPosition: 1, features: featureScores },
  { driver: driverB, winProbability: '0.38000', predictedPosition: 2, features: featureScores },
];

export const predictionResponse: PredictionResponse = {
  race, predictedWinner: driver, computedAt: '2025-09-07T12:00:00.000Z',
  modelVersion: 'weighted-v3', drivers: driverPredictions,
};

const raceResults: RaceResult[] = [
  { id: 1, raceId: 1, driverId: 10, finishPosition: 1, gridPosition: 1, points: '25', status: 'Finished', fastestLap: true, driver },
  { id: 2, raceId: 1, driverId: 11, finishPosition: 2, gridPosition: 2, points: '18', status: 'Finished', fastestLap: false, driver: driverB },
];

const qualifyingResults: QualifyingResult[] = [
  { id: 1, driverId: 10, gridPosition: 1, q1TimeMs: 80000, q2TimeMs: 79500, q3TimeMs: 79000, sector1Ms: 25000, sector2Ms: 27000, sector3Ms: 27000, speedSt: '345.2', driver },
  { id: 2, driverId: 11, gridPosition: 2, q1TimeMs: 80200, q2TimeMs: 79700, q3TimeMs: 79200, sector1Ms: 25100, sector2Ms: 27050, sector3Ms: 27050, speedSt: '344.1', driver: driverB },
];

const laps: LapSummary[] = [
  { driverId: 10, fastestLapMs: 82500, avgLapMs: 84000, totalLaps: 53, driver },
  { driverId: 11, fastestLapMs: 82700, avgLapMs: 84200, totalLaps: 53, driver: driverB },
];

export const raceDetailResponse: RaceDetailResponse = {
  race, results: raceResults, qualifying: qualifyingResults, laps,
};

export const predictionHistory: PredictionHistoryItem[] = [
  {
    raceId: 1, raceName: 'Italian Grand Prix', raceDate: '2025-09-07', roundNumber: 16, circuit,
    predictedWinner: driver, actualWinner: driver, winProbability: '0.62000',
    correct: true, computedAt: '2025-09-07T12:00:00.000Z', isSprint: false,
    actualWinnerPredictedPosition: 1,
  },
];

export const intelStandings: IntelStandingRow[] = [
  {
    driver, features: featureScores, rawWeightedScore: '0.680000',
    winProbability: '0.62000', predictedPosition: 1, overallScore: 0.68,
    sprintWins: 0, sprintPodiums: 0, sprintTotalPoints: '0',
  },
  {
    driver: driverB, features: featureScores, rawWeightedScore: '0.520000',
    winProbability: '0.38000', predictedPosition: 2, overallScore: 0.52,
    sprintWins: 0, sprintPodiums: 0, sprintTotalPoints: '0',
  },
];

export const seasons: SeasonSummary[] = [
  { year: 2025, raceCount: 16 },
  { year: 2024, raceCount: 24 },
];

export const modelInfo: ModelInfo = { gpVersion: 'weighted-v3', sprintVersion: 'sprint-v2' };

const driverSeasonStats: DriverSeasonStats = {
  racesEntered: 16, racesFinished: 15, wins: 8, podiums: 12, poles: 6,
  totalPoints: '350', championshipPosition: 1, avgFinishPosition: '2.1',
  winRate: '0.500', avgPositionGain: '1.2', dnfCount: 1, dnfRate: '0.06',
  avgSector1Ms: null, avgSector2Ms: null, avgSector3Ms: null, topSpeedAvg: null, teammateQualiDelta: null,
};

const driverBSeasonStats: DriverSeasonStats = {
  ...driverSeasonStats, wins: 3, podiums: 9, poles: 2, totalPoints: '210', championshipPosition: 2,
};

export const driverCareer: DriverYearStats[] = [
  { year: 2026, driverId: 10, driverNumberThatYear: 1, teamName: 'Red Bull Racing', headshotUrl: null, stats: driverSeasonStats },
];

export const driverBCareer: DriverYearStats[] = [
  { year: 2026, driverId: 11, driverNumberThatYear: 16, teamName: 'Ferrari', headshotUrl: null, stats: driverBSeasonStats },
];

export const driverDetailResponse: DriverDetailResponse = {
  driver,
  seasonStats: driverSeasonStats,
  recentResults: [
    { ...raceResults[0], race: { name: 'Italian Grand Prix', raceDate: '2025-09-07' } },
  ],
};

export const driverBDetailResponse: DriverDetailResponse = {
  driver: driverB,
  seasonStats: driverBSeasonStats,
  recentResults: [
    { ...raceResults[1], race: { name: 'Italian Grand Prix', raceDate: '2025-09-07' } },
  ],
};

const teamSeasonStats: TeamSeasonStats = {
  racesCompleted: 16, wins: 8, podiums: 15, totalPoints: '600',
  championshipPosition: 1, avgFinishPosition: '3.5', carPerformanceScore: '0.85',
  dnfCount: 2, reliabilityScore: '0.90',
};

export const teamCareer: TeamYearStats[] = [
  { year: 2026, teamId: 1, stats: teamSeasonStats },
];

export const teamDetailResponse: TeamDetailResponse = {
  team, seasonStats: teamSeasonStats, drivers: [driver],
};

export const driverStandingsResponse: DriverStanding[] = [
  { driver, stats: driverSeasonStats },
  { driver: driverB, stats: driverBSeasonStats },
];

export const driversListResponse: Driver[] = [driver, driverB];

export const globalSearchResponse = { drivers: [driver, driverB], teams: [team, teamB], circuits: [circuit] };

export const circuitDetailResponse: CircuitDetailResponse = {
  circuit,
  history: [
    { raceId: 1, raceName: 'Italian Grand Prix', raceDate: '2025-09-07', year: 2025, hasSprint: false, winner: driver },
  ],
  fastestLap: { timeMs: 80800, driver, year: 2024 },
  dominance: {
    all: { constructors: [{ team, wins: 5 }], drivers: [{ driver, wins: 5 }] },
    modern: { constructors: [{ team, wins: 3 }], drivers: [{ driver, wins: 3 }] },
    legacy: { constructors: [], drivers: [] },
    nineties: { constructors: [], drivers: [] },
  },
  weatherStats: { dry: 8, wet: 1, mixed: 0, unknown: 0 },
  qualifyingImpact: { poleToWinRate: 0.5, avgWinnerGridPos: 1.8 },
  safetyCarStats: { avgScLaps: 2.1, scRaceRate: 0.4 },
};
