import { useMemo } from 'react';
import { api } from '@/lib/api';
import type { Driver, DriverDetailResponse, DriverYearStats, SeasonSummary } from '@/types';
import { getTeamColor } from '@/lib/teamColors';
import { getNationalityFlag, getDriverFlagByCode } from '@/lib/countryFlags';
import { aggregateCareerStats, DEFAULT_COMPARE_YEAR } from '../compareStats';
import { Zap } from 'lucide-react';
import { useCompareController } from '../useCompareController';
import { SearchSelect } from '@/components/ui/search-select';
import { ComparisonRow } from './ComparisonRow';
import { CompareModeToggle } from './CompareModeToggle';
import { CompareYearSelect } from './CompareYearSelect';
import { CompareStatus } from './CompareStatus';
import { CompareEntityCard } from './CompareEntityCard';
import { seasonStatConfig, careerStatConfig } from '../driverCompareConfig';

interface Props {
  allSeasons: SeasonSummary[];
  initialDrivers: Driver[];
  allDrivers: Driver[];
}

export function DriverCompareTool({ allSeasons, initialDrivers, allDrivers }: Props) {
  const years = useMemo(() => allSeasons.map((s) => s.year).sort((a, b) => b - a), [allSeasons]);
  const defaultYear = years[0] || DEFAULT_COMPARE_YEAR;

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

  const driverSubtitle = (d: Driver) => (
    <div className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground tracking-wider uppercase mt-1">
      <span className="text-[#a855f7] font-bold">#{d.driverNumber || '—'}</span>
      <span>•</span>
      <span>{d.team?.name || 'No Team'}</span>
    </div>
  );

  const driverFlag = (d: Driver) => (
    <span className="text-3xl shrink-0 select-none opacity-80" title={d.nationality ?? undefined}>
      {d.nationality ? getNationalityFlag(d.nationality) : getDriverFlagByCode(d.code)}
    </span>
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
            {driverA && (
              <CompareEntityCard
                entityType="driver"
                href={`/drivers/${driverA.id}${isCareer ? '' : `?year=${year}`}`}
                imageUrl={driverA.headshotUrl}
                imageAlt={driverA.fullName}
                borderColor={colorA}
                name={driverA.fullName}
                subtitle={driverSubtitle(driverA)}
                flag={driverFlag(driverA)}
              />
            )}

            {driverB && (
              <CompareEntityCard
                entityType="driver"
                href={`/drivers/${driverB.id}${isCareer ? '' : `?year=${year}`}`}
                imageUrl={driverB.headshotUrl}
                imageAlt={driverB.fullName}
                borderColor={colorB}
                name={driverB.fullName}
                subtitle={driverSubtitle(driverB)}
                flag={driverFlag(driverB)}
              />
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
                  {seasonStatConfig.map((row) => {
                    const statsA = comparison.a.seasonStats;
                    const statsB = comparison.b.seasonStats;
                    if (row.show && !row.show(statsA, statsB)) return null;
                    return (
                      <ComparisonRow
                        key={row.label}
                        label={row.label}
                        valA={row.value(statsA)}
                        valB={row.value(statsB)}
                        format={row.format}
                        lowerBetter={row.lowerBetter}
                        colorA={colorA} colorB={colorB}
                      />
                    );
                  })}
                </>
              ) : comparison?.mode === 'career' && careerA && careerB ? (
                <>
                  {careerStatConfig.map((row) => (
                    <ComparisonRow
                      key={row.label}
                      label={row.label}
                      valA={row.value(careerA)}
                      valB={row.value(careerB)}
                      format={row.format}
                      lowerBetter={row.lowerBetter}
                      colorA={colorA} colorB={colorB}
                    />
                  ))}
                </>
              ) : (
                <CompareStatus loading={false} error={null} entityLabel="drivers" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
