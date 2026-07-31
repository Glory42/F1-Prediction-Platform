interface Props {
  label: string;
  valA: number;
  valB: number;
  format?: (v: number) => string;
  lowerBetter?: boolean;
  colorA: string;
  colorB: string;
}

export function ComparisonRow({ label, valA, valB, format, lowerBetter = false, colorA, colorB }: Props) {
  const total = valA + valB;
  const pctA = total > 0 ? (lowerBetter ? (valB / total) * 100 : (valA / total) * 100) : 50;
  const pctB = total > 0 ? (lowerBetter ? (valA / total) * 100 : (valB / total) * 100) : 50;

  const isWinnerA = lowerBetter ? valA < valB : valA > valB;
  const isWinnerB = lowerBetter ? valB < valA : valB > valA;
  const isTie = valA === valB;

  return (
    <div className="space-y-1.5 py-3 border-b border-white/[0.04] last:border-b-0">
      <div className="flex justify-between items-baseline font-mono text-[9px] tracking-wider uppercase text-muted-foreground">
        <span className={isWinnerA ? 'text-white font-bold' : ''}>
          {format ? format(valA) : valA.toFixed(0)}
        </span>
        <span className="text-white/60">{label}</span>
        <span className={isWinnerB ? 'text-white font-bold' : ''}>
          {format ? format(valB) : valB.toFixed(0)}
        </span>
      </div>
      <div className="flex h-1.5 w-full bg-white/[0.03] overflow-hidden">
        <div
          className="h-full bar-fill"
          style={{
            width: `${pctA}%`,
            backgroundColor: isWinnerA ? colorA : (isTie ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.15)'),
            opacity: isWinnerA ? 1 : 0.6
          }}
        />
        <div
          className="h-full bar-fill"
          style={{
            width: `${pctB}%`,
            backgroundColor: isWinnerB ? colorB : (isTie ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.15)'),
            opacity: isWinnerB ? 1 : 0.6
          }}
        />
      </div>
    </div>
  );
}
