import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { DriverPrediction } from '@/types';

const FEATURE_LABELS: Record<string, string> = {
  carPerformance:    'Car Performance (30%)',
  driverRating:      'Driver Rating (15%)',
  startingPosition:  'Starting Position (15%)',
  winRate:           'Win Rate (15%)',
  luckFactor:        'Luck Factor (10%)',
  weatherImpact:     'Weather Impact (5%)',
  trackOvertake:     'Track Overtake Rate (5%)',
  positionGain:      'Position Gain Rate (5%)',
};

function FeatureBar({ score }: { score: string }) {
  const pct = (Number(score) * 100).toFixed(0);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}</span>
    </div>
  );
}

interface Props {
  drivers: DriverPrediction[];
  predictedWinnerId: number;
}

export function PredictionTable({ drivers, predictedWinnerId }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Pos</TableHead>
          <TableHead className="w-16">Code</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Probability</TableHead>
          <TableHead className="w-16 text-right">%</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {drivers.map((dp) => {
          const isWinner = dp.driver.id === predictedWinnerId;
          const pct = (Number(dp.winProbability) * 100).toFixed(1);
          return (
            <tr key={dp.driver.id} className="border-b transition-colors hover:bg-muted/30">
              <TableCell>
                <span className={`font-bold ${isWinner ? 'text-primary' : 'text-muted-foreground'}`}>
                  {dp.predictedPosition ?? '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs font-semibold tracking-widest">
                  {dp.driver.code}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${isWinner ? 'text-primary' : ''}`}>
                    {dp.driver.fullName}
                  </span>
                  {isWinner && (
                    <Badge className="text-[10px] px-1.5 py-0">Predicted</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{dp.driver.team.name}</TableCell>
              <TableCell>
                <div className="h-2 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${isWinner ? 'bg-primary' : 'bg-primary/50'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{pct}%</TableCell>
              {/* Feature breakdown using native details/summary */}
              <td colSpan={6} className="px-0 pb-0 pt-0">
                <details className="group">
                  <summary className="cursor-pointer select-none px-4 py-1 text-xs text-muted-foreground hover:text-foreground">
                    ↳ Feature breakdown
                  </summary>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 px-4 pb-3 pt-1 sm:grid-cols-4">
                    {Object.entries(dp.features).map(([key, val]) => (
                      <div key={key} className="space-y-0.5">
                        <p className="text-[10px] text-muted-foreground">{FEATURE_LABELS[key]}</p>
                        <FeatureBar score={val} />
                      </div>
                    ))}
                  </div>
                </details>
              </td>
            </tr>
          );
        })}
      </TableBody>
    </Table>
  );
}
