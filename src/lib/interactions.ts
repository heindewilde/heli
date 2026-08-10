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

export {
  INTERACTION_TYPES,
  isInteractionType,
  type InteractionType
} from './interactionTypes';

// Interaction tones are deliberately quiet. The icon carries the type;
// color is a faint accent, not a banner. Synchronous/realtime modes
// (call, meeting, event) share the warmer info hue; async (email, dm,
// note) sit on the muted-text family so they blend into the timeline.
export const TYPE_META: Record<
  InteractionType,
  { label: string; icon: typeof Phone; tone: string }
> = {
  call: { label: 'Call', icon: Phone, tone: 'text-[var(--color-info)]' },
  email: { label: 'Email', icon: Mail, tone: 'text-[var(--color-muted)]' },
  meeting: { label: 'Meeting', icon: Users, tone: 'text-[var(--color-info)]' },
  dm: { label: 'DM', icon: MessageSquare, tone: 'text-[var(--color-muted)]' },
  event: { label: 'Event', icon: Calendar, tone: 'text-[var(--color-warning)]' },
  note: { label: 'Note', icon: StickyNote, tone: 'text-[var(--color-muted)]' },
  other: { label: 'Other', icon: Sparkle, tone: 'text-[var(--color-subtle)]' }
};

export function dayBucket(ts: number, today = new Date()): { key: string; label: string } {
  const d = new Date(ts);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const todayStart = startOfDay(today);
  const yesterdayStart = todayStart - 86_400_000;
  const dStart = startOfDay(d);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dStart === todayStart) return { key, label: 'Today' };
  if (dStart === yesterdayStart) return { key, label: 'Yesterday' };
  return {
    key,
    label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
  };
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatLastSeen(ts: number | null): string {
  if (ts == null) return '';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function toLocalDatetimeInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDatetimeInput(value: string): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}
