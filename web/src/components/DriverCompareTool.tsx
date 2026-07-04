import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import type { Driver, DriverDetailResponse, DriverYearStats, SeasonSummary } from '@/types';
import { getTeamColor } from '@/lib/teamColors';
import { getCountryFlag } from '@/lib/countryFlags';
import { User, Shield, Trophy, Activity, Zap } from 'lucide-react';

interface Props {
  allSeasons: SeasonSummary[];
  initialDrivers: Driver[];
  allDrivers: Driver[];
}

function SearchSelect({
  items,
  selectedId,
  onSelect,
  placeholder = "Search driver..."
}: {
  items: Driver[];
  selectedId: number;
  onSelect: (id: number) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  
  const selectedItem = items.find(item => item.id === selectedId);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item => 
      item.fullName.toLowerCase().includes(q) || 
      (item.team?.name || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen && selectedItem) {
      setQuery('');
    }
  }, [isOpen, selectedItem]);

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={isOpen ? query : (selectedItem ? `${selectedItem.fullName} (${selectedItem.team?.name || 'No Team'})` : '')}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="bg-black border border-white/[0.08] text-white text-xs font-mono px-3 py-2 uppercase tracking-wider focus:outline-none focus:border-[#a855f7]/40 w-full pr-8 cursor-text"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none text-[8px] font-mono select-none">
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto border border-white/[0.08] bg-black shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
          {filtered.length > 0 ? (
            filtered.map((item) => {
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item.id);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`w-full text-left px-3 py-2 font-mono text-[10px] tracking-wider uppercase border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.04] transition-colors duration-100 ${
                    active ? 'text-[#a855f7] bg-white/[0.02]' : 'text-muted-foreground'
                  }`}
                >
                  {item.fullName} <span className="text-[8px] text-muted-foreground/60 ml-1">({item.team?.name || 'No Team'})</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 font-mono text-[9px] text-muted-foreground uppercase tracking-widest text-center">
              No drivers found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DriverCompareTool({ allSeasons, initialDrivers, allDrivers }: Props) {
  const years = useMemo(() => allSeasons.map((s) => s.year).sort((a, b) => b - a), [allSeasons]);
  const defaultYear = years[0] || 2026;

  // State
  const [year, setYear] = useState<number>(defaultYear);
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [driverAId, setDriverAId] = useState<number>(initialDrivers[0]?.id || 0);
  const [driverBId, setDriverBId] = useState<number>(initialDrivers[1]?.id || initialDrivers[0]?.id || 0);
  const [isCareer, setIsCareer] = useState<boolean>(false);

  // Detail data
  const [driverAData, setDriverAData] = useState<DriverDetailResponse | null>(null);
  const [driverBData, setDriverBData] = useState<DriverDetailResponse | null>(null);
  const [driverACareer, setDriverACareer] = useState<DriverYearStats[] | null>(null);
  const [driverBCareer, setDriverBCareer] = useState<DriverYearStats[] | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramYear = params.get('year');
    const paramA = params.get('a');
    const paramB = params.get('b');
    const paramCareer = params.get('career');

    const isCareerMode = paramCareer === 'true';
    if (paramYear) setYear(parseInt(paramYear));
    if (isCareerMode) setIsCareer(true);

    if (isCareerMode) {
      setDrivers(allDrivers);
      if (paramA) setDriverAId(parseInt(paramA));
      if (paramB) setDriverBId(parseInt(paramB));
    } else if (paramYear && parseInt(paramYear) !== defaultYear) {
      const targetYear = parseInt(paramYear);
      api.getDrivers(targetYear)
        .then((driversList) => {
          setDrivers(driversList);
          if (paramA) setDriverAId(parseInt(paramA));
          else if (driversList[0]) setDriverAId(driversList[0].id);

          if (paramB) setDriverBId(parseInt(paramB));
          else if (driversList[1]) setDriverBId(driversList[1].id);
        })
        .catch(err => console.error('Failed to load drivers for url year', err));
    } else {
      if (paramA) setDriverAId(parseInt(paramA));
      if (paramB) setDriverBId(parseInt(paramB));
    }
  }, []);

  // Update drivers list if year or mode changes
  useEffect(() => {
    if (isCareer) {
      setDrivers(allDrivers);
      return;
    }

    let active = true;
    if (year === defaultYear) {
      setDrivers(initialDrivers);
      if (initialDrivers.length > 0) {
        if (!initialDrivers.some(d => d.id === driverAId)) setDriverAId(initialDrivers[0].id);
        if (!initialDrivers.some(d => d.id === driverBId)) setDriverBId(initialDrivers[1]?.id || initialDrivers[0].id);
      }
      return;
    }
    api.getDrivers(year)
      .then((data) => {
        if (!active) return;
        setDrivers(data);
        if (data.length > 0) {
          if (!data.some(d => d.id === driverAId)) setDriverAId(data[0].id);
          if (!data.some(d => d.id === driverBId)) setDriverBId(data[1]?.id || data[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load drivers for year', year, err);
      });

    return () => { active = false; };
  }, [isCareer, year, initialDrivers, allDrivers, defaultYear]);

  // Sync state to URL parameters
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('year', year.toString());
    params.set('a', driverAId.toString());
    params.set('b', driverBId.toString());
    if (isCareer) params.set('career', 'true');

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [year, driverAId, driverBId, isCareer]);

  // Fetch detail stats when selected drivers or modes change
  useEffect(() => {
    if (!driverAId || !driverBId) return;

    let active = true;
    setLoading(true);
    setError(null);

    const promises = isCareer
      ? [api.getDriverCareer(driverAId), api.getDriverCareer(driverBId)]
      : [api.getDriverById(driverAId, year), api.getDriverById(driverBId, year)];

    Promise.all(promises)
      .then(([resA, resB]) => {
        if (!active) return;
        if (isCareer) {
          setDriverACareer(resA as DriverYearStats[]);
          setDriverBCareer(resB as DriverYearStats[]);
          setDriverAData(null);
          setDriverBData(null);
        } else {
          setDriverAData(resA as DriverDetailResponse);
          setDriverBData(resB as DriverDetailResponse);
          setDriverACareer(null);
          setDriverBCareer(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch details');
        setLoading(false);
      });

    return () => { active = false; };
  }, [driverAId, driverBId, year, isCareer]);

  const driverA = useMemo(() => drivers.find(d => d.id === driverAId), [drivers, driverAId]);
  const driverB = useMemo(() => drivers.find(d => d.id === driverBId), [drivers, driverBId]);

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

  // Comparison Row builder
  function ComparisonRow({
    label,
    valA,
    valB,
    format,
    lowerBetter = false
  }: {
    label: string;
    valA: number;
    valB: number;
    format?: (v: number) => string;
    lowerBetter?: boolean;
  }) {
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
            className="h-full transition-all duration-300"
            style={{
              width: `${pctA}%`,
              backgroundColor: isWinnerA ? colorA : (isTie ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.15)'),
              opacity: isWinnerA ? 1 : 0.6
            }}
          />
          <div
            className="h-full transition-all duration-300"
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

  return (
    <div className="space-y-6">
      {/* Controls: Autocomplete Selectors and Toggle */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between border-b border-white/[0.06] pb-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-3xl">
          <div className="flex-1 min-w-[200px]">
            <SearchSelect
              items={drivers}
              selectedId={driverAId}
              onSelect={setDriverAId}
              placeholder="Search Driver A..."
            />
          </div>

          <div className="flex justify-center shrink-0">
            <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase px-2 align-middle self-center">vs</span>
          </div>

          <div className="flex-1 min-w-[200px]">
            <SearchSelect
              items={drivers}
              selectedId={driverBId}
              onSelect={setDriverBId}
              placeholder="Search Driver B..."
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
                <span className="text-3xl shrink-0 select-none opacity-80" title={driverA.country}>
                  {getCountryFlag(driverA.country)}
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
                <span className="text-3xl shrink-0 select-none opacity-80" title={driverB.country}>
                  {getCountryFlag(driverB.country)}
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
                  />
                  <ComparisonRow
                    label="Grand Prix Wins"
                    valA={driverAData.seasonStats.wins}
                    valB={driverBData.seasonStats.wins}
                  />
                  <ComparisonRow
                    label="Podium Finishes"
                    valA={driverAData.seasonStats.podiums}
                    valB={driverBData.seasonStats.podiums}
                  />
                  <ComparisonRow
                    label="Poles Secured"
                    valA={driverAData.seasonStats.poles}
                    valB={driverBData.seasonStats.poles}
                  />
                  <ComparisonRow
                    label="Avg Finish Position"
                    valA={parseFloat(driverAData.seasonStats.avgFinishPosition || '20')}
                    valB={parseFloat(driverBData.seasonStats.avgFinishPosition || '20')}
                    format={(v) => `P${v.toFixed(1)}`}
                    lowerBetter={true}
                  />
                  <ComparisonRow
                    label="Races Entered"
                    valA={driverAData.seasonStats.racesEntered}
                    valB={driverBData.seasonStats.racesEntered}
                  />
                  <ComparisonRow
                    label="Total DNFs"
                    valA={driverAData.seasonStats.dnfCount}
                    valB={driverBData.seasonStats.dnfCount}
                    lowerBetter={true}
                  />
                  {/* Sector Times */}
                  {(driverAData.seasonStats.avgSector1Ms || driverBData.seasonStats.avgSector1Ms) && (
                    <ComparisonRow
                      label="Avg Sector 1"
                      valA={driverAData.seasonStats.avgSector1Ms || 99999}
                      valB={driverBData.seasonStats.avgSector1Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                    />
                  )}
                  {(driverAData.seasonStats.avgSector2Ms || driverBData.seasonStats.avgSector2Ms) && (
                    <ComparisonRow
                      label="Avg Sector 2"
                      valA={driverAData.seasonStats.avgSector2Ms || 99999}
                      valB={driverBData.seasonStats.avgSector2Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
                    />
                  )}
                  {(driverAData.seasonStats.avgSector3Ms || driverBData.seasonStats.avgSector3Ms) && (
                    <ComparisonRow
                      label="Avg Sector 3"
                      valA={driverAData.seasonStats.avgSector3Ms || 99999}
                      valB={driverBData.seasonStats.avgSector3Ms || 99999}
                      format={(v) => v === 99999 ? '—' : `${(v / 1000).toFixed(3)}s`}
                      lowerBetter={true}
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
                  />
                  <ComparisonRow
                    label="Total Points"
                    valA={careerA.points}
                    valB={careerB.points}
                    format={(v) => v.toFixed(1)}
                  />
                  <ComparisonRow
                    label="Career Wins"
                    valA={careerA.wins}
                    valB={careerB.wins}
                  />
                  <ComparisonRow
                    label="Career Podiums"
                    valA={careerA.podiums}
                    valB={careerB.podiums}
                  />
                  <ComparisonRow
                    label="Career Poles"
                    valA={careerA.poles}
                    valB={careerB.poles}
                  />
                  <ComparisonRow
                    label="Career Entries"
                    valA={careerA.entries}
                    valB={careerB.entries}
                  />
                  <ComparisonRow
                    label="Total DNFs"
                    valA={careerA.dnfs}
                    valB={careerB.dnfs}
                    lowerBetter={true}
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
