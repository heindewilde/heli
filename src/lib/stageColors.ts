export type StageColor = 'gray' | 'sky' | 'green' | 'yellow' | 'orange' | 'red' | 'violet' | 'pink';

export const STAGE_COLORS: StageColor[] = [
  'gray', 'sky', 'green', 'yellow', 'orange', 'red', 'violet', 'pink'
];

export const STAGE_COLOR_SWATCH: Record<StageColor, string> = {
  gray:   'hsl(220 9% 65%)',
  sky:    'hsl(199 89% 60%)',
  green:  'hsl(142 69% 52%)',
  yellow: 'hsl(48 96% 53%)',
  orange: 'hsl(27 96% 58%)',
  red:    'hsl(0 84% 62%)',
  violet: 'hsl(258 90% 66%)',
  pink:   'hsl(330 81% 62%)',
};

export const STAGE_COLOR_BOARD: Record<StageColor, { border: string; bg: string }> = {
  gray:   { border: 'hsl(220 9% 82%)',  bg: 'hsl(220 9% 97%)' },
  sky:    { border: 'hsl(199 89% 78%)', bg: 'hsl(199 100% 97%)' },
  green:  { border: 'hsl(142 69% 75%)', bg: 'hsl(142 76% 97%)' },
  yellow: { border: 'hsl(48 96% 68%)',  bg: 'hsl(48 100% 96%)' },
  orange: { border: 'hsl(27 96% 72%)',  bg: 'hsl(27 100% 97%)' },
  red:    { border: 'hsl(0 84% 78%)',   bg: 'hsl(0 100% 97%)' },
  violet: { border: 'hsl(258 90% 78%)', bg: 'hsl(258 100% 97%)' },
  pink:   { border: 'hsl(330 81% 78%)', bg: 'hsl(330 100% 97%)' },
};

export function colorToKind(color: string | null | undefined): 'open' | 'won' | 'lost' {
  if (color === 'green') return 'won';
  if (color === 'red') return 'lost';
  return 'open';
}
