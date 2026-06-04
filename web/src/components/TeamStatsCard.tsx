import { Card, CardContent } from '@/components/ui/card';
import type { TeamSeasonStats, Driver } from '@/types';

interface Props {
  stats: TeamSeasonStats;
  drivers: Driver[];
}

export function TeamStatsCard({ stats, drivers }: Props) {
  const carScore = stats.carPerformanceScore
    ? `${(Number(stats.carPerformanceScore) * 100).toFixed(0)}/100`
    : '—';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[
          { label: 'Championship Pos', value: stats.championshipPosition ? `P${stats.championshipPosition}` : '—' },
          { label: 'Points', value: stats.totalPoints },
          { label: 'Wins', value: stats.wins },
          { label: 'Podiums', value: stats.podiums },
          { label: 'Races', value: stats.racesCompleted },
          { label: 'Car Performance', value: carScore },
          { label: 'Avg Finish', value: stats.avgFinishPosition ? `P${Number(stats.avgFinishPosition).toFixed(1)}` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Drivers
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <a key={d.id} href={`/drivers/${d.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="flex items-center gap-4 p-4">
                  <span className="text-3xl font-black text-muted-foreground/30">
                    {d.driverNumber}
                  </span>
                  <div>
                    <p className="font-semibold">{d.fullName}</p>
                    <p className="font-mono text-xs text-muted-foreground tracking-widest">{d.code}</p>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
