import { api } from '@/lib/api';
import {
  contributions,
  radarFeatures,
  GP_WEIGHTS,
  FEATURE_META,
  SPRINT_WEIGHTS,
  SPRINT_FEATURE_META,
  type FeatureContribution,
  type Weights,
} from '@/lib/predictionMath';
import { GP_ACCENT, SPRINT_ACCENT, type PredictionAccent, type PredictionDriverVM, type FeatureMeta } from './types';
import type { Race, Driver } from '@/types';

export type PredictionPageKind = 'gp' | 'sprint';

interface RawResultRow {
  driver: { id: number; fullName: string };
  finishPosition: number | null;
  status?: string | null;
}

interface RawPrediction {
  race: Race;
  predictedWinner: Driver;
  computedAt: string;
  modelVersion: string;
  drivers: PredictionDriverVM[];
}

interface RawDetail {
  race: Race;
  results?: RawResultRow[];
}

interface KindConfig {
  fetchPrediction: (raceId: number) => Promise<RawPrediction>;
  fetchDetail: (raceId: number) => Promise<RawDetail>;
  weights: Weights;
  featureMeta: FeatureMeta;
  accent: PredictionAccent;
  radarShortLabels: Partial<Record<string, string>>;
  pageTitle: (raceName: string) => string;
  fallbackTitle: string;
  kicker: (roundNumber: number) => string;
  dateField: (race: Race) => string;
  notFoundMessage: string;
  fetchErrorMessage: string;
  actualLabel: string;
  actualWinnerLabel: string;
  gridColLabel: string;
  weightsHeading: string;
  weightsNote?: string;
  sliderMax: number;
  whatIfBlurb: string;
}

// Only real differences between the GP and sprint prediction pages live here — the fetch,
// winner-pick, and view-model assembly below is identical for both.
const KIND_CONFIG: Record<PredictionPageKind, KindConfig> = {
  gp: {
    fetchPrediction: api.getPredictionByRace,
    fetchDetail: api.getRaceById,
    weights: GP_WEIGHTS,
    featureMeta: FEATURE_META,
    accent: GP_ACCENT,
    radarShortLabels: {
      qualifyingDelta: 'Quali Delta',
      circuitAdjStartPos: 'Adj. Grid Pos',
      circuitAdjPositionGain: 'Adj. Pos Gain',
      weatherImpact: 'Weather',
    },
    pageTitle: (raceName) => `${raceName} Prediction`,
    fallbackTitle: 'Race Prediction',
    kicker: (roundNumber) => `./round-${String(roundNumber).padStart(2, '0')}`,
    dateField: (race) => race.raceDate,
    notFoundMessage: 'No prediction for this race',
    fetchErrorMessage: 'No prediction available for this race',
    actualLabel: 'actual winner',
    actualWinnerLabel: 'actual winner',
    gridColLabel: 'Qual Pos',
    weightsHeading: './model weights',
    sliderMax: 30,
    whatIfBlurb:
      'Drag the weights to see how the predicted order shifts. Recomputed live in your browser — the model itself is unchanged.',
  },
  sprint: {
    fetchPrediction: api.getSprintByRaceId,
    fetchDetail: api.getSprintDetail,
    weights: SPRINT_WEIGHTS,
    featureMeta: SPRINT_FEATURE_META,
    accent: SPRINT_ACCENT,
    radarShortLabels: {
      circuitAdjStartPos: 'Adj. Grid Pos',
      weatherImpact: 'Weather',
    },
    pageTitle: (raceName) => `Sprint Prediction · ${raceName}`,
    fallbackTitle: 'Sprint Prediction',
    kicker: (roundNumber) => `./round-${String(roundNumber).padStart(2, '0')} · sprint prediction`,
    dateField: (race) => race.sprintDate ?? race.raceDate,
    notFoundMessage: 'No sprint prediction for this race',
    fetchErrorMessage: 'No sprint prediction available for this race',
    actualLabel: 'actual sprint winner',
    actualWinnerLabel: 'sprint winner',
    gridColLabel: 'Grid',
    weightsHeading: './sprint weights',
    weightsNote: 'Grid position weighted higher — no pit stop strategy in ~17 lap sprint.',
    sliderMax: 35,
    whatIfBlurb:
      'Drag the weights to see how the predicted sprint order shifts. Recomputed live in your browser — the model itself is unchanged.',
  },
};

export interface PredictionPageData {
  title: string;
  kicker: string;
  race: Race | null;
  date: string | null;
  prediction: RawPrediction | null;
  results: RawResultRow[] | undefined;
  error: string | null;
  raceYear: number;
  actualWinner: RawResultRow | null;
  correct: boolean | null;
  winner: PredictionDriverVM | null;
  breakdown: FeatureContribution[];
  radarFeatures: [string, string][];
  weights: Weights;
  featureMeta: FeatureMeta;
  accent: PredictionAccent;
  notFoundMessage: string;
  actualLabel: string;
  actualWinnerLabel: string;
  gridColLabel: string;
  weightsHeading: string;
  weightsNote?: string;
  sliderMax: number;
  whatIfBlurb: string;
}

export async function buildPredictionPageData(kind: PredictionPageKind, raceId: number): Promise<PredictionPageData> {
  const config = KIND_CONFIG[kind];

  let prediction: RawPrediction | null = null;
  let detail: RawDetail | null = null;
  let error: string | null = null;

  const [predResult, detailResult] = await Promise.allSettled([
    config.fetchPrediction(raceId),
    config.fetchDetail(raceId),
  ]);

  if (predResult.status === 'fulfilled') prediction = predResult.value;
  else error = config.fetchErrorMessage;
  if (detailResult.status === 'fulfilled') detail = detailResult.value;

  const race = prediction?.race ?? detail?.race ?? null;
  const raceYear = race ? new Date(race.raceDate).getFullYear() : new Date().getFullYear();
  const results = detail?.results;
  const actualWinner = results?.find((r) => r.finishPosition === 1) ?? null;
  const correct = prediction && actualWinner ? prediction.predictedWinner.id === actualWinner.driver.id : null;

  const winner = prediction
    ? (prediction.drivers.find((d) => d.driver.id === prediction!.predictedWinner.id) ?? prediction.drivers[0] ?? null)
    : null;
  const breakdown = winner ? contributions(winner.features, config.weights) : [];

  return {
    title: race ? config.pageTitle(race.name) : config.fallbackTitle,
    kicker: race ? config.kicker(race.roundNumber) : '',
    race,
    date: race ? config.dateField(race) : null,
    prediction,
    results,
    error,
    raceYear,
    actualWinner,
    correct,
    winner,
    breakdown,
    radarFeatures: radarFeatures(config.featureMeta, config.radarShortLabels),
    weights: config.weights,
    featureMeta: config.featureMeta,
    accent: config.accent,
    notFoundMessage: config.notFoundMessage,
    actualLabel: config.actualLabel,
    actualWinnerLabel: config.actualWinnerLabel,
    gridColLabel: config.gridColLabel,
    weightsHeading: config.weightsHeading,
    weightsNote: config.weightsNote,
    sliderMax: config.sliderMax,
    whatIfBlurb: config.whatIfBlurb,
  };
}
