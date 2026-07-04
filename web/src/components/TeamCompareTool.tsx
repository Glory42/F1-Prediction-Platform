import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import type { Team, TeamDetailResponse, TeamYearStats, SeasonSummary } from '@/types';
import { getTeamColor } from '@/lib/teamColors';
import { getTeamLogo } from '@/lib/teamLogos';
import { Shield, Trophy, Activity, Zap } from 'lucide-react';

interface Props {
  allSeasons: SeasonSummary[];
  initialTeams: Team[];
  allTeams: Team[];
}

function SearchSelect({
  items,
  selectedId,
  onSelect,
  placeholder = "Search constructor..."
}: {
  items: Team[];
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
    return items.filter(item => item.name.toLowerCase().includes(q));
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
          value={isOpen ? query : (selectedItem ? selectedItem.name : '')}
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
                  {item.name}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 font-mono text-[9px] text-muted-foreground uppercase tracking-widest text-center">
              No constructors found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamCompareTool({ allSeasons, initialTeams, allTeams }: Props) {
  const years = useMemo(() => allSeasons.map((s) => s.year).sort((a, b) => b - a), [allSeasons]);
  const defaultYear = years[0] || 2026;

  // State
  const [year, setYear] = useState<number>(defaultYear);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [teamAId, setTeamAId] = useState<number>(initialTeams[0]?.id || 0);
  const [teamBId, setTeamBId] = useState<number>(initialTeams[1]?.id || initialTeams[0]?.id || 0);
  const [isCareer, setIsCareer] = useState<boolean>(false);

  // Detail data
  const [teamAData, setTeamAData] = useState<TeamDetailResponse | null>(null);
  const [teamBData, setTeamBData] = useState<TeamDetailResponse | null>(null);
  const [teamACareer, setTeamACareer] = useState<TeamYearStats[] | null>(null);
  const [teamBCareer, setTeamBCareer] = useState<TeamYearStats[] | null>(null);

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
      setTeams(allTeams);
      if (paramA) setTeamAId(parseInt(paramA));
      if (paramB) setTeamBId(parseInt(paramB));
    } else if (paramYear && parseInt(paramYear) !== defaultYear) {
      const targetYear = parseInt(paramYear);
      api.getTeams(targetYear)
        .then((teamsList) => {
          setTeams(teamsList);
          if (paramA) setTeamAId(parseInt(paramA));
          else if (teamsList[0]) setTeamAId(teamsList[0].id);

          if (paramB) setTeamBId(parseInt(paramB));
          else if (teamsList[1]) setTeamBId(teamsList[1].id);
        })
        .catch(err => console.error('Failed to load teams for URL year', err));
    } else {
      if (paramA) setTeamAId(parseInt(paramA));
      if (paramB) setTeamBId(parseInt(paramB));
    }
  }, []);

  // Update teams list if year or mode changes
  useEffect(() => {
    if (isCareer) {
      setTeams(allTeams);
      return;
    }

    let active = true;
    if (year === defaultYear) {
      setTeams(initialTeams);
      if (initialTeams.length > 0) {
        if (!initialTeams.some(t => t.id === teamAId)) setTeamAId(initialTeams[0].id);
        if (!initialTeams.some(t => t.id === teamBId)) setTeamBId(initialTeams[1]?.id || initialTeams[0].id);
      }
      return;
    }
    api.getTeams(year)
      .then((data) => {
        if (!active) return;
        setTeams(data);
        if (data.length > 0) {
          if (!data.some(t => t.id === teamAId)) setTeamAId(data[0].id);
          if (!data.some(t => t.id === teamBId)) setTeamBId(data[1]?.id || data[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load teams for year', year, err);
      });

    return () => { active = false; };
  }, [isCareer, year, initialTeams, allTeams, defaultYear]);

  // Sync state to URL parameters
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('year', year.toString());
    params.set('a', teamAId.toString());
    params.set('b', teamBId.toString());
    if (isCareer) params.set('career', 'true');

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [year, teamAId, teamBId, isCareer]);

  // Fetch detail stats when selected teams or modes change
  useEffect(() => {
    if (!teamAId || !teamBId) return;

    let active = true;
    setLoading(true);
    setError(null);

    const promises = isCareer
      ? [api.getTeamCareer(teamAId), api.getTeamCareer(teamBId)]
      : [api.getTeamById(teamAId, year), api.getTeamById(teamBId, year)];

    Promise.all(promises)
      .then(([resA, resB]) => {
        if (!active) return;
        if (isCareer) {
          setTeamACareer(resA as TeamYearStats[]);
          setTeamBCareer(resB as TeamYearStats[]);
          setTeamAData(null);
          setTeamBData(null);
        } else {
          setTeamAData(resA as TeamDetailResponse);
          setTeamBData(resB as TeamDetailResponse);
          setTeamACareer(null);
          setTeamBCareer(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch details');
        setLoading(false);
      });

    return () => { active = false; };
  }, [teamAId, teamBId, year, isCareer]);

  const teamA = useMemo(() => teams.find(t => t.id === teamAId), [teams, teamAId]);
  const teamB = useMemo(() => teams.find(t => t.id === teamBId), [teams, teamBId]);

  const logoA = useMemo(() => getTeamLogo(teamA?.teamKey || ''), [teamA]);
  const logoB = useMemo(() => getTeamLogo(teamB?.teamKey || ''), [teamB]);

  const colorA = useMemo(() => getTeamColor(teamA?.teamKey || ''), [teamA]);
  const colorB = useMemo(() => getTeamColor(teamB?.teamKey || ''), [teamB]);

  // Compute Career summaries
  const careerA = useMemo(() => {
    if (!teamACareer) return null;
    return teamACareer.reduce((acc, curr) => {
      if (!curr.stats) return acc;
      acc.entries += curr.stats.racesCompleted;
      acc.wins += curr.stats.wins;
      acc.podiums += curr.stats.podiums;
      acc.points += parseFloat(curr.stats.totalPoints);
      acc.dnfs += curr.stats.dnfCount;
      if (curr.stats.championshipPosition) {
        acc.bestFin = acc.bestFin ? Math.min(acc.bestFin, curr.stats.championshipPosition) : curr.stats.championshipPosition;
      }
      return acc;
    }, { entries: 0, wins: 0, podiums: 0, points: 0, dnfs: 0, bestFin: null as number | null });
  }, [teamACareer]);

  const careerB = useMemo(() => {
    if (!teamBCareer) return null;
    return teamBCareer.reduce((acc, curr) => {
      if (!curr.stats) return acc;
      acc.entries += curr.stats.racesCompleted;
      acc.wins += curr.stats.wins;
      acc.podiums += curr.stats.podiums;
      acc.points += parseFloat(curr.stats.totalPoints);
      acc.dnfs += curr.stats.dnfCount;
      if (curr.stats.championshipPosition) {
        acc.bestFin = acc.bestFin ? Math.min(acc.bestFin, curr.stats.championshipPosition) : curr.stats.championshipPosition;
      }
      return acc;
    }, { entries: 0, wins: 0, podiums: 0, points: 0, dnfs: 0, bestFin: null as number | null });
  }, [teamBCareer]);

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
      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between border-b border-white/[0.06] pb-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-3xl">
          <div className="flex-1 min-w-[200px]">
            <SearchSelect
              items={teams}
              selectedId={teamAId}
              onSelect={setTeamAId}
              placeholder="Search Constructor A..."
            />
          </div>

          <div className="flex justify-center shrink-0">
            <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase px-2 align-middle self-center">vs</span>
          </div>

          <div className="flex-1 min-w-[200px]">
            <SearchSelect
              items={teams}
              selectedId={teamBId}
              onSelect={setTeamBId}
              placeholder="Search Constructor B..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
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
          <p className="font-mono text-[10px] text-destructive tracking-widest uppercase">Error comparing teams</p>
          <p className="mt-2 font-mono text-[9px] text-muted-foreground">{error}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Team Profile Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team A Card */}
            {teamA && (
              <a
                href={`/teams/${teamA.id}${isCareer ? '' : `?year=${year}`}`}
                className="group border border-white/[0.06] bg-black hover:border-white/[0.12] hover:shadow-[0_0_15px_rgba(255,255,255,0.015)] p-5 flex items-center justify-between transition-all duration-300 transform hover:-translate-y-0.5"
                style={{ borderLeft: `3px solid ${colorA}` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 border border-white/[0.08] bg-white/[0.02] flex items-center justify-center shrink-0 p-1">
                    {logoA ? (
                      <img src={logoA} alt={teamA.name} className="max-w-full max-h-full object-contain" />
                    ) : (
                      <Shield size={28} className="text-white/20" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight group-hover:text-[#a855f7] transition-colors">{teamA.name}</h3>
                    <span className="font-mono text-[8px] text-muted-foreground tracking-widest uppercase block mt-1">Constructor</span>
                  </div>
                </div>
              </a>
            )}

            {/* Team B Card */}
            {teamB && (
              <a
                href={`/teams/${teamB.id}${isCareer ? '' : `?year=${year}`}`}
                className="group border border-white/[0.06] bg-black hover:border-white/[0.12] hover:shadow-[0_0_15px_rgba(255,255,255,0.015)] p-5 flex items-center justify-between transition-all duration-300 transform hover:-translate-y-0.5"
                style={{ borderLeft: `3px solid ${colorB}` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 border border-white/[0.08] bg-white/[0.02] flex items-center justify-center shrink-0 p-1">
                    {logoB ? (
                      <img src={logoB} alt={teamB.name} className="max-w-full max-h-full object-contain" />
                    ) : (
                      <Shield size={28} className="text-white/20" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight group-hover:text-[#a855f7] transition-colors">{teamB.name}</h3>
                    <span className="font-mono text-[8px] text-muted-foreground tracking-widest uppercase block mt-1">Constructor</span>
                  </div>
                </div>
              </a>
            )}
          </div>

          {/* Stats metrics */}
          <div className="border border-white/[0.06] bg-black p-6 space-y-6">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              <Zap size={11} /> head-to-head comparison
            </div>

            <div className="space-y-4">
              {!isCareer && teamAData?.seasonStats && teamBData?.seasonStats ? (
                <>
                  <ComparisonRow
                    label="Championship Points"
                    valA={parseFloat(teamAData.seasonStats.totalPoints)}
                    valB={parseFloat(teamBData.seasonStats.totalPoints)}
                    format={(v) => v.toString()}
                  />
                  <ComparisonRow
                    label="Grand Prix Wins"
                    valA={teamAData.seasonStats.wins}
                    valB={teamBData.seasonStats.wins}
                  />
                  <ComparisonRow
                    label="Podiums Secured"
                    valA={teamAData.seasonStats.podiums}
                    valB={teamBData.seasonStats.podiums}
                  />
                  <ComparisonRow
                    label="Car Performance Score"
                    valA={parseFloat(teamAData.seasonStats.carPerformanceScore || '0')}
                    valB={parseFloat(teamBData.seasonStats.carPerformanceScore || '0')}
                    format={(v) => v.toFixed(1)}
                  />
                  <ComparisonRow
                    label="Reliability Score"
                    valA={parseFloat(teamAData.seasonStats.reliabilityScore || '0') * 100}
                    valB={parseFloat(teamBData.seasonStats.reliabilityScore || '0') * 100}
                    format={(v) => `${Math.round(v)}%`}
                  />
                  <ComparisonRow
                    label="Constructor DNFs"
                    valA={teamAData.seasonStats.dnfCount}
                    valB={teamBData.seasonStats.dnfCount}
                    lowerBetter={true}
                  />
                  <ComparisonRow
                    label="Avg Finish Position"
                    valA={parseFloat(teamAData.seasonStats.avgFinishPosition || '20')}
                    valB={parseFloat(teamBData.seasonStats.avgFinishPosition || '20')}
                    format={(v) => `P${v.toFixed(1)}`}
                    lowerBetter={true}
                  />
                </>
              ) : isCareer && careerA && careerB ? (
                <>
                  <ComparisonRow
                    label="Best Championship Finish"
                    valA={careerA.bestFin || 10}
                    valB={careerB.bestFin || 10}
                    format={(v) => v === 10 ? '—' : `P${v}`}
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
                    label="Races Completed"
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
                  No stats available for these teams
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
