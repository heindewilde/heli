export type StageColor = 'gray' | 'sky' | 'green' | 'yellow' | 'orange' | 'red' | 'violet' | 'pink';

export const STAGE_COLORS: StageColor[] = [
  'gray', 'sky', 'green', 'yellow', 'orange', 'red', 'violet', 'pink'
];

export const STAGE_COLOR_SWATCH: Record<StageColor, string> = {
  gray:   'hsl(220 8% 60%)',
  sky:    'hsl(200 35% 58%)',
  green:  'hsl(145 30% 50%)',
  yellow: 'hsl(42 45% 55%)',
  orange: 'hsl(24 40% 55%)',
  red:    'hsl(2 35% 55%)',
  violet: 'hsl(255 30% 58%)',
  pink:   'hsl(330 30% 58%)',
};

export const STAGE_COLOR_BOARD: Record<StageColor, { border: string; bg: string }> = {
  gray:   { border: 'hsl(220 8% 82%)',  bg: 'hsl(220 8% 97%)' },
  sky:    { border: 'hsl(200 35% 78%)', bg: 'hsl(200 40% 97%)' },
  green:  { border: 'hsl(145 30% 72%)', bg: 'hsl(145 35% 97%)' },
  yellow: { border: 'hsl(42 45% 72%)',  bg: 'hsl(42 50% 97%)' },
  orange: { border: 'hsl(24 40% 72%)',  bg: 'hsl(24 45% 97%)' },
  red:    { border: 'hsl(2 35% 72%)',   bg: 'hsl(2 40% 97%)' },
  violet: { border: 'hsl(255 30% 75%)', bg: 'hsl(255 35% 97%)' },
  pink:   { border: 'hsl(330 30% 75%)', bg: 'hsl(330 35% 97%)' },
};

export function colorToKind(color: string | null | undefined): 'open' | 'won' | 'lost' {
  if (color === 'green') return 'won';
  if (color === 'red') return 'lost';
  return 'open';
}
