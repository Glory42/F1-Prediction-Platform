import { useState, useMemo } from 'react';
import type { Circuit } from '@/types';
import { getCountryFlag } from '@/lib/countryFlags';
import { MapPin, Gauge, CornerDownRight, Wind, Zap } from 'lucide-react';

interface Props {
  initialCircuits: Circuit[];
}

function getRegion(country: string): string {
  const c = country.toLowerCase();
  if (['uk', 'united kingdom', 'monaco', 'italy', 'belgium', 'spain', 'germany', 'france', 'austria', 'netherlands', 'hungary', 'portugal', 'switzerland', 'sweden', 'finland', 'azerbaijan', 'turkey', 'san marino', 'europe'].some(x => c.includes(x))) return 'Europe';
  if (['usa', 'united states', 'canada', 'brazil', 'mexico', 'argentina'].some(x => c.includes(x))) return 'Americas';
  if (['japan', 'australia', 'china', 'singapore', 'korea', 'india', 'malaysia'].some(x => c.includes(x))) return 'Asia-Pacific';
  if (['bahrain', 'saudi arabia', 'uae', 'qatar', 'abu dhabi'].some(x => c.includes(x))) return 'Middle East';
  return 'Other';
}

export function CircuitsGrid({ initialCircuits }: Props) {
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'length' | 'overtake'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const filteredAndSortedCircuits = useMemo(() => {
    let result = [...initialCircuits];

    // Region filter
    if (selectedRegion !== 'All') {
      result = result.filter((c) => getRegion(c.country) === selectedRegion);
    }

    // Sort
    result.sort((a, b) => {
      let compareVal = 0;
      if (sortBy === 'name') {
        compareVal = a.name.localeCompare(b.name);
      } else if (sortBy === 'length') {
        compareVal = parseFloat(a.trackLengthKm) - parseFloat(b.trackLengthKm);
      } else if (sortBy === 'overtake') {
        compareVal = parseFloat(a.overtakeRate ?? '0') - parseFloat(b.overtakeRate ?? '0');
      }
      return sortOrder === 'asc' ? compareVal : -compareVal;
    });

    return result;
  }, [initialCircuits, selectedRegion, sortBy, sortOrder]);

  const regions = ['All', 'Europe', 'Asia-Pacific', 'Americas', 'Middle East'];

  return (
    <div className="space-y-6">
      {/* Filters and Sorting Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Region Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {regions.map((region) => {
            const active = selectedRegion === region;
            return (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`font-mono text-[9px] tracking-[0.12em] uppercase px-3 py-1.5 border border-white/[0.08] transition-all duration-150 ${
                  active
                    ? 'bg-[rgba(168,85,247,0.12)] text-[#a855f7] border-[#a855f7]/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {region}
              </button>
            );
          })}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          {/* Sort dimension options */}
          <div className="flex items-center border border-white/[0.08] overflow-hidden">
            {([
              { id: 'name', label: 'Name' },
              { id: 'length', label: 'Length' },
              { id: 'overtake', label: 'Overtakes' }
            ] as const).map((opt) => {
              const active = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  className={`font-mono text-[8px] tracking-[0.15em] uppercase px-3 py-1.5 transition-colors duration-150 ${
                    active
                      ? 'bg-[rgba(168,85,247,0.12)] text-[#a855f7]'
                      : 'text-muted-foreground hover:text-foreground'
                  } border-r border-white/[0.08] last:border-r-0`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Sort Direction Toggle */}
          <button
            onClick={() => setSortOrder(order => order === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1.5 font-mono text-[8px] tracking-[0.15em] uppercase px-3 py-1.5 border border-white/[0.08] text-muted-foreground hover:text-foreground transition-colors duration-150"
            title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
          >
            {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
          </button>
        </div>
      </div>

      {/* Grid of Circuit Cards */}
      {filteredAndSortedCircuits.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedCircuits.map((circuit) => {
            const overtakePct = circuit.overtakeRate ? Math.round(parseFloat(circuit.overtakeRate) * 100) : null;
            return (
              <a
                key={circuit.id}
                href={`/circuits/${circuit.circuitKey}`}
                className="group border border-white/[0.06] bg-black hover:border-[#a855f7]/40 hover:shadow-[0_0_15px_rgba(168,85,247,0.03)] flex flex-col justify-between overflow-hidden transition-all duration-300 transform hover:-translate-y-0.5"
                style={{ borderLeft: '3px solid rgba(168, 85, 247, 0.4)' }}
              >
                {/* Card Header */}
                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-bold text-base group-hover:text-[#a855f7] transition-colors duration-150 truncate max-w-[80%]">
                      {circuit.name}
                    </h3>
                    <span className="text-xl shrink-0 select-none" title={circuit.country}>
                      {getCountryFlag(circuit.country)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase">
                    <MapPin size={10} className="shrink-0" />
                    <span className="truncate">{circuit.city}, {circuit.country}</span>
                  </div>
                </div>

                {/* Card Footer / Stats */}
                <div className="border-t border-white/[0.04] p-5 space-y-4 bg-white/[0.01]">
                  {/* Miniature Stats Row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="flex items-center gap-1 font-mono text-[7px] text-muted-foreground tracking-widest uppercase mb-0.5">
                        <Gauge size={8} /> Length
                      </div>
                      <div className="font-mono text-xs font-semibold">{circuit.trackLengthKm} km</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 font-mono text-[7px] text-muted-foreground tracking-widest uppercase mb-0.5">
                        <CornerDownRight size={8} /> Corners
                      </div>
                      <div className="font-mono text-xs font-semibold">{circuit.numberOfCorners ?? '—'}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 font-mono text-[7px] text-muted-foreground tracking-widest uppercase mb-0.5">
                        <Wind size={8} /> DRS Zones
                      </div>
                      <div className="font-mono text-xs font-semibold">{circuit.drsZones ?? '—'}</div>
                    </div>
                  </div>

                  {/* Overtake Progress Bar */}
                  {overtakePct !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[7px] font-mono text-muted-foreground tracking-widest uppercase">
                        <span className="flex items-center gap-1"><Zap size={8} /> Overtake Rate</span>
                        <span className="font-bold text-[#a855f7]">{overtakePct}%</span>
                      </div>
                      <div className="w-full h-1 bg-white/[0.04] overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-[#a855f7]/60 to-[#a855f7]"
                          style={{ width: `${overtakePct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="border border-white/[0.06] p-12 text-center">
          <MapPin size={24} className="text-muted-foreground opacity-20 mx-auto mb-3" />
          <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase">No circuits match your criteria</p>
        </div>
      )}
    </div>
  );
}
