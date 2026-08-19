import { useMemo } from 'react';
import { api } from '@/lib/api';
import type { Driver, DriverDetailResponse, DriverYearStats, SeasonSummary } from '@/types';
import { getTeamColor } from '@/lib/teamColors';
import { getNationalityFlag, getDriverFlagByCode } from '@/lib/countryFlags';
import { aggregateCareerStats } from '../compareStats';
import { User, Zap } from 'lucide-react';
import { useCompareController } from '../useCompareController';
import { SearchSelect } from '@/components/ui/search-select';
import { ComparisonRow } from './ComparisonRow';
import { CompareModeToggle } from './CompareModeToggle';
import { CompareYearSelect } from './CompareYearSelect';
import { CompareStatus } from './CompareStatus';

interface Props {
  allSeasons: SeasonSummary[];
  initialDrivers: Driver[];
  allDrivers: Driver[];
}

export function DriverCompareTool({ allSeasons, initialDrivers, allDrivers }: Props) {
  const years = useMemo(() => allSeasons.map((s) => s.year).sort((a, b) => b - a), [allSeasons]);
  const defaultYear = years[0] || 2026;

  const {
    year,
    items: drivers,
    aId: driverAId,
    bId: driverBId,
    itemA: driverA, itemB: driverB,
    isCareer,
    comparison,
    loading, error,
    actions: { setYear, setAId: setDriverAId, setBId: setDriverBId, setIsCareer },
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

  const driverACareer = comparison?.mode === 'career' ? comparison.a : null;
  const driverBCareer = comparison?.mode === 'career' ? comparison.b : null;
  const driverAData = comparison?.mode === 'season' ? comparison.a : null;
  const driverBData = comparison?.mode === 'season' ? comparison.b : null;

  const colorA = useMemo(() => {
    if (driverACareer && driverACareer.length > 0) {
      const sorted = [...driverACareer].sort((x, y) => y.year - x.year);
      return getTeamColor(sorted[0]?.teamName.toLowerCase().replace(/ /g, '_') || '');
    }
    return getTeamColor(driverAData?.driver.team?.teamKey || '');
  }, [driverAData, driverACareer]);

  const colorB = useMemo(() => {
    if (driverBCareer && driverBCareer.length > 0) {
      const sorted = [...driverBCareer].sort((x, y) => y.year - x.year);
      return getTeamColor(sorted[0]?.teamName.toLowerCase().replace(/ /g, '_') || '');
    }
    return getTeamColor(driverBData?.driver.team?.teamKey || '');
  }, [driverBData, driverBCareer]);

  // Compute Career summaries
  const careerA = useMemo(
    () => aggregateCareerStats(driverACareer, (s) => s.racesEntered, (s) => s.poles),
    [driverACareer]
  );
  const careerB = useMemo(
    () => aggregateCareerStats(driverBCareer, (s) => s.racesEntered, (s) => s.poles),
    [driverBCareer]
  );

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
          {!isCareer && <CompareYearSelect years={years} year={year} setYear={setYear} />}

          <CompareModeToggle isCareer={isCareer} setIsCareer={setIsCareer} />
        </div>
      </div>

      {loading || error ? (
        <CompareStatus loading={loading} error={error} entityLabel="drivers" />
      ) : (
        <div key="content" className="fade-swap space-y-8">
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
              {comparison?.mode === 'season' ? (
                <>
                  <ComparisonRow
                    label="Championship Points"
                    valA={parseFloat(comparison.a.seasonStats.totalPoints)}
                    valB={parseFloat(comparison.b.seasonStats.totalPoints)}
                    format={(v) => v.toString()}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Grand Prix Wins"
                    valA={comparison.a.seasonStats.wins}
                    valB={comparison.b.seasonStats.wins}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Podium Finishes"
                    valA={comparison.a.seasonStats.podiums}
                    valB={comparison.b.seasonStats.podiums}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Poles Secured"
                    valA={comparison.a.seasonStats.poles}
                    valB={comparison.b.seasonStats.poles}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Avg Finish Position"
                    valA={parseFloat(comparison.a.seasonStats.avgFinishPosition || '20')}
                    valB={parseFloat(comparison.b.seasonStats.avgFinishPosition || '20')}
                    format={(v) => `P${v.toFixed(1)}`}
                    lowerBetter={true}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Races Entered"
                    valA={comparison.a.seasonStats.racesEntered}
                    valB={comparison.b.seasonStats.racesEntered}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Total DNFs"
                    valA={comparison.a.seasonStats.dnfCount}
                    valB={comparison.b.seasonStats.dnfCount}
                    lowerBetter={true}
                    colorA={colorA} colorB={colorB}
                  />
                  {(comparison.a.seasonStats.avgSector1Ms || comparison.b.seasonStats.avgSector1Ms) && (
                    <ComparisonRow
                      label="Avg Sector 1"
                      valA={comparison.a.seasonStats.avgSector1Ms || 99999}
                      valB={comparison.b.seasonStats.avgSector1Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                      colorA={colorA} colorB={colorB}
                    />
                  )}
                  {(comparison.a.seasonStats.avgSector2Ms || comparison.b.seasonStats.avgSector2Ms) && (
                    <ComparisonRow
                      label="Avg Sector 2"
                      valA={comparison.a.seasonStats.avgSector2Ms || 99999}
                      valB={comparison.b.seasonStats.avgSector2Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                      colorA={colorA} colorB={colorB}
                    />
                  )}
                  {(comparison.a.seasonStats.avgSector3Ms || comparison.b.seasonStats.avgSector3Ms) && (
                    <ComparisonRow
                      label="Avg Sector 3"
                      valA={comparison.a.seasonStats.avgSector3Ms || 99999}
                      valB={comparison.b.seasonStats.avgSector3Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                      colorA={colorA} colorB={colorB}
                    />
                  )}
                </>
              ) : comparison?.mode === 'career' && careerA && careerB ? (
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
