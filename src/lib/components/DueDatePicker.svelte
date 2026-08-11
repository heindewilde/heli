<script lang="ts">
  import Popover from '$lib/ui/Popover.svelte';
  import { Calendar, X, ChevronDown } from 'lucide-svelte';

  type Props = {
    value: number | null;
    onChange: (next: number | null) => void;
    /** 'chip' = pill-shaped, with text or "When?" placeholder.
     *  'icon' = small calendar icon button (used on row hover for empty due dates). */
    variant?: 'chip' | 'icon';
    placeholder?: string;
  };

  let { value, onChange, variant = 'chip', placeholder = 'When?' }: Props = $props();

  let open = $state(false);

  // Magic value: time === 23:59 means "date only" (no explicit time).
  function isDateOnly(ts: number): boolean {
    const d = new Date(ts);
    return d.getHours() === 23 && d.getMinutes() === 59;
  }

  function endOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
  }

  function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function today(): Date {
    return startOfDay(new Date());
  }

  function tomorrow(): Date {
    const d = today();
    d.setDate(d.getDate() + 1);
    return d;
  }

  function nextWeekday(target: number): Date {
    // target: 0=Sun, 1=Mon, ... 6=Sat
    const d = today();
    const diff = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function fmtChip(ts: number): string {
    const d = new Date(ts);
    const t0 = today();
    const tom = tomorrow();
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    let label: string;
    if (sameDay(d, t0)) label = 'Today';
    else if (sameDay(d, tom)) label = 'Tomorrow';
    else {
      const sameYear = d.getFullYear() === t0.getFullYear();
      label = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: sameYear ? undefined : 'numeric'
      });
    }
    if (!isDateOnly(ts)) {
      const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      label += ` · ${time}`;
    }
    return label;
  }

  // --- Picker state (only used while popover is open) ---
  let customDate = $state('');
  let customTime = $state('');
  let timeEnabled = $state(false);

  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  function dateToInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function syncDraftFromValue() {
    if (value == null) {
      customDate = dateToInput(today());
      customTime = '';
      timeEnabled = false;
    } else {
      const d = new Date(value);
      customDate = dateToInput(d);
      if (isDateOnly(value)) {
        customTime = '';
        timeEnabled = false;
      } else {
        customTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        timeEnabled = true;
      }
    }
  }

  function openPicker() {
    syncDraftFromValue();
    open = true;
  }

  function commitQuick(d: Date) {
    onChange(endOfDay(d));
    open = false;
  }

  function commitClear() {
    onChange(null);
    open = false;
  }

  function commitCustom() {
    if (!customDate) return;
    const [y, m, day] = customDate.split('-').map((n) => Number(n));
    if (!y || !m || !day) return;
    if (timeEnabled && customTime) {
      const [hh, mm] = customTime.split(':').map((n) => Number(n));
      onChange(new Date(y, m - 1, day, hh ?? 9, mm ?? 0, 0, 0).getTime());
    } else {
      onChange(new Date(y, m - 1, day, 23, 59, 0, 0).getTime());
    }
    open = false;
  }

  function enableTime() {
    timeEnabled = true;
    if (!customTime) customTime = '09:00';
  }

  function disableTime() {
    timeEnabled = false;
    customTime = '';
  }

  const overdue = $derived(value != null && value < Date.now());
</script>

<Popover bind:open label="Due date" panelRole="dialog" autoFocus={false}>
  {#snippet trigger(attrs)}
  {#if variant === 'icon' && value == null}
    <button
      type="button"
      {...attrs}
      aria-label="Set due date"
      class="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-subtle)] opacity-60 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <Calendar size={12} strokeWidth={2} />
    </button>
  {:else if value == null}
    <button
      type="button"
      {...attrs}
      class="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
    >
      <Calendar size={10} strokeWidth={2} />
      {placeholder}
    </button>
  {:else}
    <button
      type="button"
      {...attrs}
      class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] {overdue
        ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
        : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
    >
      <Calendar size={10} strokeWidth={2} />
      <span>{fmtChip(value)}</span>
    </button>
  {/if}
  {/snippet}

  {#snippet content()}
    <div class="w-60 p-1">

      <button
        type="button"
        onclick={() => commitQuick(today())}
        class="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-[var(--color-bg)]"
      >
        <span>Today</span>
        <span class="text-[10px] text-[var(--color-subtle)]">{new Date().toLocaleDateString(undefined, { weekday: 'short' })}</span>
      </button>
      <button
        type="button"
        onclick={() => commitQuick(tomorrow())}
        class="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-[var(--color-bg)]"
      >
        <span>Tomorrow</span>
        <span class="text-[10px] text-[var(--color-subtle)]">{tomorrow().toLocaleDateString(undefined, { weekday: 'short' })}</span>
      </button>
      <button
        type="button"
        onclick={() => commitQuick(nextWeekday(6))}
        class="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-[var(--color-bg)]"
      >
        <span>This weekend</span>
        <span class="text-[10px] text-[var(--color-subtle)]">Sat</span>
      </button>
      <button
        type="button"
        onclick={() => commitQuick(nextWeekday(1))}
        class="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-[var(--color-bg)]"
      >
        <span>Next week</span>
        <span class="text-[10px] text-[var(--color-subtle)]">Mon</span>
      </button>
      {#if value != null}
        <button
          type="button"
          onclick={commitClear}
          class="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
        >
          <X size={11} strokeWidth={2} />
          <span>Clear due date</span>
        </button>
      {/if}

      <div class="my-1 border-t border-[var(--color-border)]"></div>

      <div class="flex flex-col gap-1 p-1">
        <div class="flex items-center gap-1">
          <input
            type="date"
            bind:value={customDate}
            class="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-xs"
          />
          {#if timeEnabled}
            <input
              type="time"
              bind:value={customTime}
              class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-xs"
            />
            <button
              type="button"
              onclick={disableTime}
              aria-label="Remove time"
              class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            >
              <X size={11} strokeWidth={2} />
            </button>
          {:else}
            <button
              type="button"
              onclick={enableTime}
              class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1.5 py-1 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            >
              <span>Add time</span>
              <ChevronDown size={9} strokeWidth={2.5} />
            </button>
          {/if}
        </div>
        <button
          type="button"
          onclick={commitCustom}
          disabled={!customDate}
          class="w-full rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >Set</button>
      </div>
    
    </div>
  {/snippet}
</Popover>
