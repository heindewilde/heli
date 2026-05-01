import {
  Phone,
  Mail,
  Users,
  MessageSquare,
  Calendar,
  StickyNote,
  Sparkle
} from 'lucide-svelte';
import type { InteractionType } from '$lib/server/saveInteraction';

export const TYPE_META: Record<
  InteractionType,
  { label: string; icon: typeof Phone; tone: string }
> = {
  call: { label: 'Call', icon: Phone, tone: 'text-[var(--color-info)]' },
  email: { label: 'Email', icon: Mail, tone: 'text-[var(--color-info)]' },
  meeting: { label: 'Meeting', icon: Users, tone: 'text-[var(--color-product)]' },
  dm: { label: 'DM', icon: MessageSquare, tone: 'text-[var(--color-product)]' },
  event: { label: 'Event', icon: Calendar, tone: 'text-[var(--color-warning)]' },
  note: { label: 'Note', icon: StickyNote, tone: 'text-[var(--color-success)]' },
  other: { label: 'Other', icon: Sparkle, tone: 'text-[var(--color-muted)]' }
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
