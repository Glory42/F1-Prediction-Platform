import { useMemo } from 'react';
import { api } from '@/lib/api';
import type { Team, TeamDetailResponse, TeamYearStats, SeasonSummary } from '@/types';
import { getTeamColor } from '@/lib/teamColors';
import { getTeamLogo } from '@/lib/teamLogos';
import { aggregateCareerStats } from '../compareStats';
import { Shield, Zap } from 'lucide-react';
import { useCompareController } from '../useCompareController';
import { SearchSelect } from '@/components/ui/search-select';
import { ComparisonRow } from './ComparisonRow';
import { CompareModeToggle } from './CompareModeToggle';
import { CompareYearSelect } from './CompareYearSelect';
import { CompareStatus } from './CompareStatus';

interface Props {
  allSeasons: SeasonSummary[];
  initialTeams: Team[];
  allTeams: Team[];
}

export function TeamCompareTool({ allSeasons, initialTeams, allTeams }: Props) {
  const years = useMemo(() => allSeasons.map((s) => s.year).sort((a, b) => b - a), [allSeasons]);
  const defaultYear = years[0] || 2026;

  const {
    year,
    items: teams,
    aId: teamAId,
    bId: teamBId,
    itemA: teamA, itemB: teamB,
    isCareer,
    comparison,
    loading, error,
    actions: { setYear, setAId: setTeamAId, setBId: setTeamBId, setIsCareer },
  } = useCompareController<Team, TeamDetailResponse, TeamYearStats>({
    years,
    defaultYear,
    initialItems: initialTeams,
    allItems: allTeams,
    entityLabel: 'teams',
    fetchItemsForYear: (y) => api.getTeams(y),
    fetchDetail: (id, y) => api.getTeamById(id, y),
    fetchCareer: (id) => api.getTeamCareer(id),
  });

  const teamACareer = comparison?.mode === 'career' ? comparison.a : null;
  const teamBCareer = comparison?.mode === 'career' ? comparison.b : null;

  const logoA = useMemo(() => getTeamLogo(teamA?.teamKey || ''), [teamA]);
  const logoB = useMemo(() => getTeamLogo(teamB?.teamKey || ''), [teamB]);

  const colorA = useMemo(() => getTeamColor(teamA?.teamKey || ''), [teamA]);
  const colorB = useMemo(() => getTeamColor(teamB?.teamKey || ''), [teamB]);

  // Compute Career summaries
  const careerA = useMemo(() => aggregateCareerStats(teamACareer, (s) => s.racesCompleted), [teamACareer]);
  const careerB = useMemo(() => aggregateCareerStats(teamBCareer, (s) => s.racesCompleted), [teamBCareer]);

  const teamMatches = (t: Team, q: string) => t.name.toLowerCase().includes(q);
  const teamInputLabel = (t: Team) => t.name;
  const teamOption = (t: Team) => t.name;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between border-b border-white/[0.06] pb-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-3xl">
          <div className="flex-1 min-w-[200px]">
            <SearchSelect<Team>
              items={teams}
              selectedId={teamAId}
              onSelect={setTeamAId}
              placeholder="Search Constructor A..."
              getInputLabel={teamInputLabel}
              renderOption={teamOption}
              matches={teamMatches}
              noResultsLabel="No constructors found"
            />
          </div>

          <div className="flex justify-center shrink-0">
            <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase px-2 align-middle self-center">vs</span>
          </div>

          <div className="flex-1 min-w-[200px]">
            <SearchSelect<Team>
              items={teams}
              selectedId={teamBId}
              onSelect={setTeamBId}
              placeholder="Search Constructor B..."
              getInputLabel={teamInputLabel}
              renderOption={teamOption}
              matches={teamMatches}
              noResultsLabel="No constructors found"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
          {!isCareer && <CompareYearSelect years={years} year={year} setYear={setYear} />}

          <CompareModeToggle isCareer={isCareer} setIsCareer={setIsCareer} />
        </div>
      </div>

      {loading || error ? (
        <CompareStatus loading={loading} error={error} entityLabel="teams" />
      ) : (
        <div key="content" className="fade-swap space-y-8">
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
                    label="Podiums Secured"
                    valA={comparison.a.seasonStats.podiums}
                    valB={comparison.b.seasonStats.podiums}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Car Performance Score"
                    valA={parseFloat(comparison.a.seasonStats.carPerformanceScore || '0')}
                    valB={parseFloat(comparison.b.seasonStats.carPerformanceScore || '0')}
                    format={(v) => v.toFixed(1)}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Reliability Score"
                    valA={parseFloat(comparison.a.seasonStats.reliabilityScore || '0') * 100}
                    valB={parseFloat(comparison.b.seasonStats.reliabilityScore || '0') * 100}
                    format={(v) => `${Math.round(v)}%`}
                    colorA={colorA} colorB={colorB}
                  />
                  <ComparisonRow
                    label="Constructor DNFs"
                    valA={comparison.a.seasonStats.dnfCount}
                    valB={comparison.b.seasonStats.dnfCount}
                    lowerBetter={true}
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
                </>
              ) : comparison?.mode === 'career' && careerA && careerB ? (
                <>
                  <ComparisonRow
                    label="Best Championship Finish"
                    valA={careerA.bestFin || 10}
                    valB={careerB.bestFin || 10}
                    format={(v) => v === 10 ? '—' : `P${v}`}
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
                    label="Races Completed"
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
