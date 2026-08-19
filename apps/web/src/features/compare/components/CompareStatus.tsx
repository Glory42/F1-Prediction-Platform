interface Props {
  loading: boolean;
  error: string | null;
  entityLabel: string;
}

export function CompareStatus({ loading, error, entityLabel }: Props) {
  if (loading) {
    return (
      <div key="loading" className="fade-swap py-20 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase animate-pulse">Analyzing statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div key="error" className="fade-swap border border-destructive/40 bg-destructive/10 p-8 text-center">
        <p className="font-mono text-[10px] text-destructive tracking-widest uppercase">Error comparing {entityLabel}</p>
        <p className="mt-2 font-mono text-[9px] text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="py-8 text-center text-muted-foreground font-mono text-[9px] tracking-widest uppercase">
      No stats available for these {entityLabel}
    </div>
  );
}
