import {
  Phone,
  Mail,
  Users,
  MessageSquare,
  Calendar,
  StickyNote,
  Sparkle
} from 'lucide-svelte';

// The vocabulary itself lives in a dependency-free module so server code can
// import it without pulling in the icons above. Re-exported here so every
// existing `$lib/interactions` call site keeps working.
import type { InteractionType } from './interactionTypes';
import { TYPE_LABELS } from './interactionMeta';

export {
  INTERACTION_TYPES,
  isInteractionType,
  type InteractionType
} from './interactionTypes';

// Likewise the timeline formatting and the tone token names: dependency-free in
// `interactionMeta.ts` so the server, the tests and the mobile app can import
// them, re-exported here so nothing had to change call site.
export {
  TYPE_LABELS,
  TYPE_TONE_TOKEN,
  dayBucket,
  formatTime,
  formatLastSeen,
  toLocalDatetimeInput,
  fromLocalDatetimeInput
} from './interactionMeta';

// Interaction tones are deliberately quiet. The icon carries the type;
// color is a faint accent, not a banner. Synchronous/realtime modes
// (call, meeting, event) share the warmer info hue; async (email, dm,
// note) sit on the muted-text family so they blend into the timeline.
//
// These stay written out as literal class strings, mirroring `TYPE_TONE_TOKEN`
// in interactionMeta.ts. Tailwind v4 extracts classes by scanning source text,
// so building `text-[var(${token})]` from that map would type-check, pass the
// tests, and ship every icon with no colour at all.
export const TYPE_META: Record<
  InteractionType,
  { label: string; icon: typeof Phone; tone: string }
> = {
  call: { label: TYPE_LABELS.call, icon: Phone, tone: 'text-[var(--color-info)]' },
  email: { label: TYPE_LABELS.email, icon: Mail, tone: 'text-[var(--color-muted)]' },
  meeting: { label: TYPE_LABELS.meeting, icon: Users, tone: 'text-[var(--color-info)]' },
  dm: { label: TYPE_LABELS.dm, icon: MessageSquare, tone: 'text-[var(--color-muted)]' },
  event: { label: TYPE_LABELS.event, icon: Calendar, tone: 'text-[var(--color-warning)]' },
  note: { label: TYPE_LABELS.note, icon: StickyNote, tone: 'text-[var(--color-muted)]' },
  other: { label: TYPE_LABELS.other, icon: Sparkle, tone: 'text-[var(--color-subtle)]' }
};
