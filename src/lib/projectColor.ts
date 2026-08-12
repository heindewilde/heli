// A stable colour per project, drawn from the existing stage palette.
//
// The availability views draw the same project in three places — a week cell, a
// timeline bar, a legend — and a project you cannot recognise at a glance makes
// all three unreadable. This is the same trick `Avatar` plays with names, for
// the same reason: colour here is identity, not decoration.
//
// It reuses `--stage-*` rather than inventing a chart palette because those
// eight hues are already defined for both themes and already tuned to sit
// quietly behind text.

import { STAGE_COLORS, STAGE_COLOR_BOARD, STAGE_COLOR_SWATCH, type StageColor } from './stageColors';

/** FNV-1a, as in Avatar. Four lines, and it spreads short ids well enough. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * `gray` is deliberately excluded: it is what an *unassigned* or neutral row
 * uses, so letting a real project land on it would make the two
 * indistinguishable.
 */
const HUES: StageColor[] = STAGE_COLORS.filter((c) => c !== 'gray');

export function projectColor(projectId: string | null | undefined): StageColor {
  if (!projectId) return 'gray';
  return HUES[hash(projectId) % HUES.length];
}

export function projectSwatch(projectId: string | null | undefined): string {
  return STAGE_COLOR_SWATCH[projectColor(projectId)];
}

export function projectFill(projectId: string | null | undefined): { border: string; bg: string } {
  return STAGE_COLOR_BOARD[projectColor(projectId)];
}
