import type { AccuracyBucket, PredictionHistoryItem, SeasonAccuracy } from './types';

function toBucket(items: PredictionHistoryItem[]): AccuracyBucket {
  const decided = items.filter((i) => i.correct !== null);
  const correct = decided.filter((i) => i.correct === true).length;
  return {
    races: decided.length,
    correct,
    accuracyPct: decided.length > 0 ? Math.round((correct / decided.length) * 100) : null,
  };
}

// Groups by the race's calendar year (read directly off raceDate — 'YYYY-MM-DD' — rather
// than via Date/getFullYear() to sidestep any timezone ambiguity), splitting GP vs sprint
// so a season with many sprint races doesn't skew the GP model's own accuracy or vice versa.
export function aggregateAccuracyBySeason(items: PredictionHistoryItem[]): SeasonAccuracy[] {
  const byYear = new Map<number, { gp: PredictionHistoryItem[]; sprint: PredictionHistoryItem[] }>();

  for (const item of items) {
    const year = Number(item.raceDate.slice(0, 4));
    if (!byYear.has(year)) byYear.set(year, { gp: [], sprint: [] });
    const bucket = byYear.get(year)!;
    (item.isSprint ? bucket.sprint : bucket.gp).push(item);
  }

  return Array.from(byYear.entries())
    .map(([year, { gp, sprint }]) => ({
      year,
      gp: toBucket(gp),
      sprint: toBucket(sprint),
      overall: toBucket([...gp, ...sprint]),
    }))
    // A season with predictions but no race run yet (overall.races === 0) has nothing to report.
    .filter((season) => season.overall.races > 0)
    .sort((a, b) => b.year - a.year);
}
