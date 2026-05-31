export type Circuit = {
  id: number; circuitKey: string; name: string; country: string; city: string;
  lapCount: number; trackLengthKm: string; overtakeRate: string | null;
};
export type Team = {
  id: number; seasonId: number; teamKey: string; name: string; nationality: string | null;
};
export type Driver = {
  id: number; seasonId: number; teamId: number; driverNumber: number;
  code: string; firstName: string; lastName: string; fullName: string;
  nationality: string | null; headshotUrl: string | null; team: Team;
};
export type Race = {
  id: number; seasonId: number; roundNumber: number; name: string;
  raceDate: string; status: 'scheduled' | 'qualifying_done' | 'completed';
  weather: string | null;
  safetyCarLaps: number | null; vscLaps: number | null;
  airTempAvg: string | null; trackTempAvg: string | null; humidityAvg: string | null;
  circuit: Circuit;
};
export type RaceResult = {
  id: number; raceId: number; driverId: number; finishPosition: number | null; gridPosition: number;
  points: string; status: string; fastestLap: boolean; driver: Driver;
};
export type QualifyingResult = {
  id: number; driverId: number; gridPosition: number;
  q1TimeMs: number | null; q2TimeMs: number | null; q3TimeMs: number | null;
  sector1Ms: number | null; sector2Ms: number | null; sector3Ms: number | null;
  speedSt: string | null; driver: Driver;
};
export type LapSummary = {
  driverId: number; fastestLapMs: number | null; avgLapMs: number | null;
  totalLaps: number; driver: Driver;
};
export type DriverSeasonStats = {
  racesEntered: number; racesFinished: number; wins: number; podiums: number; poles: number;
  totalPoints: string; championshipPosition: number | null; avgFinishPosition: string | null;
  winRate: string | null; avgPositionGain: string | null;
  dnfCount: number; dnfRate: string | null;
  avgSector1Ms: number | null; avgSector2Ms: number | null; avgSector3Ms: number | null;
  topSpeedAvg: string | null; teammateQualiDelta: string | null;
};
export type TeamSeasonStats = {
  racesCompleted: number; wins: number; podiums: number; totalPoints: string;
  championshipPosition: number | null; avgFinishPosition: string | null; carPerformanceScore: string | null;
  dnfCount: number; reliabilityScore: string | null;
};
export type FeatureScores = {
  carPerformance: string; driverRating: string; startingPosition: string; winRate: string;
  luckFactor: string; weatherImpact: string; trackOvertake: string; positionGain: string;
  longRunPace: string | null; reliability: string | null;
  qualifyingDelta: string | null; sectorStrength: string | null;
};
export type DriverPrediction = {
  driver: Driver; winProbability: string; predictedPosition: number | null; features: FeatureScores;
};
export type PredictionResponse = {
  race: Race; predictedWinner: Driver; computedAt: string; modelVersion: string; drivers: DriverPrediction[];
};
export type RaceDetailResponse = {
  race: Race; results: RaceResult[]; qualifying: QualifyingResult[]; laps: LapSummary[];
};
export type DriverDetailResponse = {
  driver: Driver; seasonStats: DriverSeasonStats;
  recentResults: (RaceResult & { race: { name: string; raceDate: string } })[];
};
export type TeamDetailResponse = { team: Team; seasonStats: TeamSeasonStats; drivers: Driver[] };

export type DriverStanding = { driver: Driver; stats: DriverSeasonStats };
export type TeamStanding = { team: Team; stats: TeamSeasonStats };
export type PredictionHistoryItem = {
  raceId: number; raceName: string; raceDate: string; roundNumber: number; circuit: Circuit;
  predictedWinner: Driver; actualWinner: Driver | null; winProbability: string;
  correct: boolean | null; computedAt: string;
};
export type IntelStandingRow = {
  driver: Driver; features: FeatureScores; rawWeightedScore: string;
  winProbability: string; predictedPosition: number | null; overallScore: number;
};
export type CircuitHistoryItem = {
  raceId: number; raceName: string; raceDate: string; year: number; winner: Driver | null;
};
export type DriverYearStats = {
  year: number; driverId: number; driverNumberThatYear: number; teamName: string; headshotUrl: string | null; stats: DriverSeasonStats | null;
};
export type TeamYearStats = { year: number; teamId: number; stats: TeamSeasonStats | null };
export type SeasonSummary = { year: number; raceCount: number };
