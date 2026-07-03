import React, { useState } from 'react';
import type { DriverProgression, TeamProgression } from '@/types';
import { getTeamColor } from '@/lib/teamColors';

type Props = {
  data: (DriverProgression | TeamProgression)[];
  type: 'drivers' | 'teams';
};

export default function ChampionshipChart({ data, type }: Props) {
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    name: string;
    raceName: string;
    pointsGained: number;
    cumulativePoints: number;
    color: string;
  } | null>(null);

  if (!data || !Array.isArray(data) || data.length === 0) {
    return <div className="text-red-500">Error: No data available.</div>;
  }

  try {

  // Find max rounds and max points to scale the SVG
  let maxRounds = 0;
  let maxPoints = 0;
  
  data.forEach(d => {
    if (d.progression.length > maxRounds) {
      maxRounds = d.progression.length;
    }
    const lastPoint = d.progression[d.progression.length - 1];
    if (lastPoint && lastPoint.cumulativePoints > maxPoints) {
      maxPoints = lastPoint.cumulativePoints;
    }
  });

  if (maxRounds === 0 || maxPoints === 0) {
    return <div className="text-red-500">Error: maxRounds ({maxRounds}) or maxPoints ({maxPoints}) is 0. Data preview: {JSON.stringify(data.map(d => d.progression?.length))}</div>;
  }

  const width = 800;
  const height = 300;
  const paddingX = 40;
  const paddingY = 40;
  
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const getX = (roundIdx: number) => paddingX + (roundIdx / Math.max(1, maxRounds - 1)) * chartWidth;
  const getY = (points: number) => paddingY + chartHeight - (points / maxPoints) * chartHeight;

  return (
    <div className="relative w-full overflow-x-auto border border-white/[0.06] bg-black/20 my-8">
      <div className="min-w-[600px]">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-auto block overflow-visible"
          style={{ aspectRatio: `${width}/${height}` }}
        >
          {/* Grid lines (Y axis) */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = paddingY + chartHeight - ratio * chartHeight;
            return (
              <g key={ratio}>
                <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                <text x={paddingX - 10} y={y + 4} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace" textAnchor="end">
                  {Math.round(ratio * maxPoints)}
                </text>
              </g>
            );
          })}

          {/* Grid lines (X axis) */}
          {Array.from({ length: maxRounds }).map((_, i) => {
            const x = getX(i);
            return (
              <text key={i} x={x} y={height - paddingY + 20} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace" textAnchor="middle">
                R{i + 1}
              </text>
            );
          })}

          {/* Lines */}
          {data.map((item) => {
            const isDriver = type === 'drivers';
            const entity = isDriver ? (item as DriverProgression).driver : (item as TeamProgression).team;
            const name = isDriver ? (entity as any).code || (entity as any).lastName : entity.name;
            const teamKey = isDriver ? (entity as any).team.teamKey : (entity as any).teamKey;
            const color = getTeamColor(teamKey);
            
            const isHovered = hoveredEntity === name;
            const isDimmed = hoveredEntity !== null && !isHovered;

            // Start all from 0 points at a virtual round 0 (before race 1)
            let pointsStr = `${paddingX},${paddingY + chartHeight} `;
            item.progression.forEach((p, i) => {
              pointsStr += `${getX(i)},${getY(p.cumulativePoints)} `;
            });

            return (
              <g 
                key={name} 
                opacity={isDimmed ? 0.2 : 1}
                style={{ transition: 'opacity 0.2s ease' }}
              >
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered ? 4 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                
                {/* Data points for hover interactions */}
                {item.progression.map((p, i) => (
                  <circle
                    key={i}
                    cx={getX(i)}
                    cy={getY(p.cumulativePoints)}
                    r={6}
                    fill="transparent"
                    stroke="transparent"
                    onMouseEnter={() => {
                      setHoveredEntity(name);
                      setHoveredPoint({
                        x: getX(i),
                        y: getY(p.cumulativePoints),
                        name: isDriver ? (entity as any).fullName : entity.name,
                        raceName: p.raceName,
                        pointsGained: p.pointsGained,
                        cumulativePoints: p.cumulativePoints,
                        color,
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredEntity(null);
                      setHoveredPoint(null);
                    }}
                    className="cursor-pointer"
                  />
                ))}
                
                {/* Visible small dots */}
                {item.progression.map((p, i) => (
                  <circle
                    key={`dot-${i}`}
                    cx={getX(i)}
                    cy={getY(p.cumulativePoints)}
                    r={isHovered ? 3 : 2}
                    fill={color}
                    className="pointer-events-none"
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {hoveredPoint && (
          <div 
            className="absolute bg-black/90 border border-white/10 rounded p-3 text-xs shadow-xl pointer-events-none z-10 w-48"
            style={{ 
              left: Math.min(hoveredPoint.x + 15, width - 200), // prevent going off right edge 
              top: Math.max(10, hoveredPoint.y - 40) // prevent going off top edge
            }}
          >
            <div className="font-bold mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredPoint.color }} />
              {hoveredPoint.name}
            </div>
            <div className="text-white/60 mb-2 font-mono tracking-widest uppercase text-[9px]">{hoveredPoint.raceName}</div>
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div>
                <div className="text-white/40 text-[9px] uppercase tracking-widest">Total</div>
                <div className="font-bold">{Math.round(hoveredPoint.cumulativePoints)}</div>
              </div>
              <div>
                <div className="text-white/40 text-[9px] uppercase tracking-widest">Round</div>
                <div className="font-bold text-[#a855f7]">+{Math.round(hoveredPoint.pointsGained)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  } catch (e: any) {
    return <div className="text-red-500">Error rendering chart: {e.message}</div>;
  }
}
