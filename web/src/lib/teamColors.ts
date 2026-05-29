const TEAM_COLORS: Record<string, string> = {
  // Current teams (2025)
  red_bull:      '#3671C6',
  mercedes:      '#27F4D2',
  ferrari:       '#E8002D',
  mclaren:       '#FF8000',
  aston_martin:  '#229971',
  alpine:        '#FF87BC',
  williams:      '#64C4FF',
  rb:            '#6692FF',
  kick_sauber:   '#52E252',
  haas:          '#B6BABD',

  // Historical teams
  renault:       '#FFD800',
  lotus_f1:      '#FFB800',
  lotus:         '#FFB800',
  force_india:   '#FF80C7',
  racing_point:  '#F596C8',
  toro_rosso:    '#469BFF',
  alpha_tauri:   '#5433FF',
  alfa_romeo:    '#C92D4B',
  sauber:        '#9B0000',
  bmw_sauber:    '#1C84CE',
  manor:         '#FF2C2C',
  marussia:      '#6E0000',
  hrt:           '#BE8300',
  virgin:        '#CC0000',
  brawn:         '#CCFF00',
  honda:         '#CC0000',
  bar:           '#FFFFFF',
  toyota:        '#CC1200',
  jaguar:        '#006400',
  minardi:       '#191919',
  jordan:        '#FFD700',
  benetton:      '#00A651',
  arrows:        '#FF6B00',
  prost:         '#0061A1',
  stewart:       '#FFFFFF',
};

const FALLBACK_COLOR = '#6B7280';

export function getTeamColor(teamKey: string): string {
  return TEAM_COLORS[teamKey.toLowerCase()] ?? FALLBACK_COLOR;
}
