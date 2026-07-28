import { useMemo } from 'react';
import { api } from '@/lib/api';
import type { Driver, DriverDetailResponse, DriverYearStats, SeasonSummary } from '@/types';
import { getTeamColor } from '@/lib/teamColors';
import { getNationalityFlag, getDriverFlagByCode } from '@/lib/countryFlags';
import { User, Zap } from 'lucide-react';
import { useCompareController } from '@/lib/useCompareController';
import { SearchSelect } from './SearchSelect';
import { ComparisonRow } from './ComparisonRow';

interface Props {
  allSeasons: SeasonSummary[];
  initialDrivers: Driver[];
  allDrivers: Driver[];
}

export function DriverCompareTool({ allSeasons, initialDrivers, allDrivers }: Props) {
  const years = useMemo(() => allSeasons.map((s) => s.year).sort((a, b) => b - a), [allSeasons]);
  const defaultYear = years[0] || 2026;

  const {
    year, setYear,
    items: drivers,
    aId: driverAId, setAId: setDriverAId,
    bId: driverBId, setBId: setDriverBId,
    isCareer, setIsCareer,
    itemA: driverA, itemB: driverB,
    aData: driverAData, bData: driverBData,
    aCareer: driverACareer, bCareer: driverBCareer,
    loading, error,
  } = useCompareController<Driver, DriverDetailResponse, DriverYearStats>({
    years,
    defaultYear,
    initialItems: initialDrivers,
    allItems: allDrivers,
    entityLabel: 'drivers',
    fetchItemsForYear: (y) => api.getDrivers(y),
    fetchDetail: (id, y) => api.getDriverById(id, y),
    fetchCareer: (id) => api.getDriverCareer(id),
  });

  const colorA = useMemo(() => {
    if (isCareer && driverACareer && driverACareer.length > 0) {
      const sorted = [...driverACareer].sort((x, y) => y.year - x.year);
      return getTeamColor(sorted[0]?.teamName.toLowerCase().replace(/ /g, '_') || '');
    }
    return getTeamColor(driverAData?.driver.team?.teamKey || '');
  }, [driverAData, driverACareer, isCareer]);

  const colorB = useMemo(() => {
    if (isCareer && driverBCareer && driverBCareer.length > 0) {
      const sorted = [...driverBCareer].sort((x, y) => y.year - x.year);
      return getTeamColor(sorted[0]?.teamName.toLowerCase().replace(/ /g, '_') || '');
    }
    return getTeamColor(driverBData?.driver.team?.teamKey || '');
  }, [driverBData, driverBCareer, isCareer]);

  // Compute Career summaries
  const careerA = useMemo(() => {
    if (!driverACareer) return null;
    return driverACareer.reduce((acc, curr) => {
      if (!curr.stats) return acc;
      acc.entries += curr.stats.racesEntered;
      acc.wins += curr.stats.wins;
      acc.podiums += curr.stats.podiums;
      acc.poles += curr.stats.poles;
      acc.points += parseFloat(curr.stats.totalPoints);
      acc.dnfs += curr.stats.dnfCount;
      if (curr.stats.championshipPosition) {
        acc.bestFin = acc.bestFin ? Math.min(acc.bestFin, curr.stats.championshipPosition) : curr.stats.championshipPosition;
      }
      return acc;
    }, { entries: 0, wins: 0, podiums: 0, poles: 0, points: 0, dnfs: 0, bestFin: null as number | null });
  }, [driverACareer]);

  const careerB = useMemo(() => {
    if (!driverBCareer) return null;
    return driverBCareer.reduce((acc, curr) => {
      if (!curr.stats) return acc;
      acc.entries += curr.stats.racesEntered;
      acc.wins += curr.stats.wins;
      acc.podiums += curr.stats.podiums;
      acc.poles += curr.stats.poles;
      acc.points += parseFloat(curr.stats.totalPoints);
      acc.dnfs += curr.stats.dnfCount;
      if (curr.stats.championshipPosition) {
        acc.bestFin = acc.bestFin ? Math.min(acc.bestFin, curr.stats.championshipPosition) : curr.stats.championshipPosition;
      }
      return acc;
    }, { entries: 0, wins: 0, podiums: 0, poles: 0, points: 0, dnfs: 0, bestFin: null as number | null });
  }, [driverBCareer]);

  const driverMatches = (d: Driver, q: string) =>
    d.fullName.toLowerCase().includes(q) || (d.team?.name || '').toLowerCase().includes(q);
  const driverInputLabel = (d: Driver) => `${d.fullName} (${d.team?.name || 'No Team'})`;
  const driverOption = (d: Driver) => (
    <>
      {d.fullName} <span className="text-[8px] text-muted-foreground/60 ml-1">({d.team?.name || 'No Team'})</span>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Controls: Autocomplete Selectors and Toggle */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between border-b border-white/[0.06] pb-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-3xl">
          <div className="flex-1 min-w-[200px]">
            <SearchSelect<Driver>
              items={drivers}
              selectedId={driverAId}
              onSelect={setDriverAId}
              placeholder="Search Driver A..."
              getInputLabel={driverInputLabel}
              renderOption={driverOption}
              matches={driverMatches}
              noResultsLabel="No drivers found"
            />
          </div>

          <div className="flex justify-center shrink-0">
            <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase px-2 align-middle self-center">vs</span>
          </div>

          <div className="flex-1 min-w-[200px]">
            <SearchSelect<Driver>
              items={drivers}
              selectedId={driverBId}
              onSelect={setDriverBId}
              placeholder="Search Driver B..."
              getInputLabel={driverInputLabel}
              renderOption={driverOption}
              matches={driverMatches}
              noResultsLabel="No drivers found"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
          {/* Year selector (only visible if not career totals) */}
          {!isCareer && (
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="bg-black border border-white/[0.08] text-white text-xs font-mono px-3 py-2 uppercase tracking-wider focus:outline-none focus:border-[#a855f7]/40"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y} Season</option>
              ))}
            </select>
          )}

          {/* Toggle buttons for Season vs Career */}
          <div className="flex items-center border border-white/[0.08] overflow-hidden">
            <button
              onClick={() => setIsCareer(false)}
              className={`font-mono text-[8px] tracking-[0.15em] uppercase px-3 py-2 transition-colors duration-150 ${
                !isCareer
                  ? 'bg-[rgba(168,85,247,0.12)] text-[#a855f7]'
                  : 'text-muted-foreground hover:text-foreground'
              } border-r border-white/[0.08]`}
            >
              Season
            </button>
            <button
              onClick={() => setIsCareer(true)}
              className={`font-mono text-[8px] tracking-[0.15em] uppercase px-3 py-2 transition-colors duration-150 ${
                isCareer
                  ? 'bg-[rgba(168,85,247,0.12)] text-[#a855f7]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Career
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block w-6 h-6 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase animate-pulse">Analyzing statistics...</p>
        </div>
      ) : error ? (
        <div className="border border-destructive/40 bg-destructive/10 p-8 text-center">
          <p className="font-mono text-[10px] text-destructive tracking-widest uppercase">Error comparing drivers</p>
          <p className="mt-2 font-mono text-[9px] text-muted-foreground">{error}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Driver Profiles Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Driver A Card */}
            {driverA && (
              <a
                href={`/drivers/${driverA.id}${isCareer ? '' : `?year=${year}`}`}
                className="group border border-white/[0.06] bg-black hover:border-white/[0.12] hover:shadow-[0_0_15px_rgba(255,255,255,0.015)] p-5 flex items-center justify-between transition-all duration-300 transform hover:-translate-y-0.5"
                style={{ borderLeft: `3px solid ${colorA}` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 border border-white/[0.08] bg-white/[0.01] flex items-end justify-center shrink-0 overflow-hidden">
                    {driverA.headshotUrl ? (
                      <img src={driverA.headshotUrl} alt={driverA.fullName} className="w-full h-full object-cover object-top" />
                    ) : (
                      <User size={32} className="text-white/20 mb-1" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight group-hover:text-[#a855f7] transition-colors">{driverA.fullName}</h3>
                    <div className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground tracking-wider uppercase mt-1">
                      <span className="text-[#a855f7] font-bold">#{driverA.driverNumber || '—'}</span>
                      <span>•</span>
                      <span>{driverA.team?.name || 'No Team'}</span>
                    </div>
                  </div>
                </div>
                <span className="text-3xl shrink-0 select-none opacity-80" title={driverA.nationality ?? undefined}>
                  {driverA.nationality ? getNationalityFlag(driverA.nationality) : getDriverFlagByCode(driverA.code)}
                </span>
              </a>
            )}

            {/* Driver B Card */}
            {driverB && (
              <a
                href={`/drivers/${driverB.id}${isCareer ? '' : `?year=${year}`}`}
                className="group border border-white/[0.06] bg-black hover:border-white/[0.12] hover:shadow-[0_0_15px_rgba(255,255,255,0.015)] p-5 flex items-center justify-between transition-all duration-300 transform hover:-translate-y-0.5"
                style={{ borderLeft: `3px solid ${colorB}` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 border border-white/[0.08] bg-white/[0.01] flex items-end justify-center shrink-0 overflow-hidden">
                    {driverB.headshotUrl ? (
                      <img src={driverB.headshotUrl} alt={driverB.fullName} className="w-full h-full object-cover object-top" />
                    ) : (
                      <User size={32} className="text-white/20 mb-1" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight group-hover:text-[#a855f7] transition-colors">{driverB.fullName}</h3>
                    <div className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground tracking-wider uppercase mt-1">
                      <span className="text-[#a855f7] font-bold">#{driverB.driverNumber || '—'}</span>
                      <span>•</span>
                      <span>{driverB.team?.name || 'No Team'}</span>
                    </div>
                  </div>
                </div>
                <span className="text-3xl shrink-0 select-none opacity-80" title={driverB.nationality ?? undefined}>
                  {driverB.nationality ? getNationalityFlag(driverB.nationality) : getDriverFlagByCode(driverB.code)}
                </span>
              </a>
            )}
          </div>

          {/* Stats Metrics Column */}
          <div className="border border-white/[0.06] bg-black p-6 space-y-6">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              <Zap size={11} /> head-to-head comparison
            </div>

            <div className="space-y-4">
              {!isCareer && driverAData?.seasonStats && driverBData?.seasonStats ? (
                <>
                  {/* Season Stats comparisons */}
                  <ComparisonRow
                    label="Championship Points"
                    valA={parseFloat(driverAData.seasonStats.totalPoints)}
                    valB={parseFloat(driverBData.seasonStats.totalPoints)}
                    format={(v) => v.toString()}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Grand Prix Wins"
                    valA={driverAData.seasonStats.wins}
                    valB={driverBData.seasonStats.wins}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Podium Finishes"
                    valA={driverAData.seasonStats.podiums}
                    valB={driverBData.seasonStats.podiums}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Poles Secured"
                    valA={driverAData.seasonStats.poles}
                    valB={driverBData.seasonStats.poles}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Avg Finish Position"
                    valA={parseFloat(driverAData.seasonStats.avgFinishPosition || '20')}
                    valB={parseFloat(driverBData.seasonStats.avgFinishPosition || '20')}
                    format={(v) => `P${v.toFixed(1)}`}
                    lowerBetter={true}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Races Entered"
                    valA={driverAData.seasonStats.racesEntered}
                    valB={driverBData.seasonStats.racesEntered}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Total DNFs"
                    valA={driverAData.seasonStats.dnfCount}
                    valB={driverBData.seasonStats.dnfCount}
                    lowerBetter={true}
                    colorA={colorA} colorB={colorB}
                  />
                  {/* Sector Times */}
                  {(driverAData.seasonStats.avgSector1Ms || driverBData.seasonStats.avgSector1Ms) && (
                    <ComparisonRow
                      label="Avg Sector 1"
                      valA={driverAData.seasonStats.avgSector1Ms || 99999}
                      valB={driverBData.seasonStats.avgSector1Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                      colorA={colorA} colorB={colorB}
                    />
                  )}
                  {(driverAData.seasonStats.avgSector2Ms || driverBData.seasonStats.avgSector2Ms) && (
                    <ComparisonRow
                      label="Avg Sector 2"
                      valA={driverAData.seasonStats.avgSector2Ms || 99999}
                      valB={driverBData.seasonStats.avgSector2Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                      colorA={colorA} colorB={colorB}
                    />
                  )}
                  {(driverAData.seasonStats.avgSector3Ms || driverBData.seasonStats.avgSector3Ms) && (
                    <ComparisonRow
                      label="Avg Sector 3"
                      valA={driverAData.seasonStats.avgSector3Ms || 99999}
                      valB={driverBData.seasonStats.avgSector3Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                      colorA={colorA} colorB={colorB}
                    />
                  )}
                </>
              ) : isCareer && careerA && careerB ? (
                <>
                  {/* Career Stats comparisons */}
                  <ComparisonRow
                    label="Best Championship Finish"
                    valA={careerA.bestFin || 20}
                    valB={careerB.bestFin || 20}
                    format={(v) => v === 20 ? '—' : `P${v}`}
                    lowerBetter={true}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Total Points"
                    valA={careerA.points}
                    valB={careerB.points}
                    format={(v) => v.toFixed(1)}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Career Wins"
                    valA={careerA.wins}
                    valB={careerB.wins}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Career Podiums"
                    valA={careerA.podiums}
                    valB={careerB.podiums}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Career Poles"
                    valA={careerA.poles}
                    valB={careerB.poles}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Career Entries"
                    valA={careerA.entries}
                    valB={careerB.entries}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Total DNFs"
                    valA={careerA.dnfs}
                    valB={careerB.dnfs}
                    lowerBetter={true}
                    colorA={colorA} colorB={colorB}
                  />
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground font-mono text-[9px] tracking-widest uppercase">
                  No stats available for these drivers
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
