/**
 * One registry for commands and one dispatcher for keyboard shortcuts.
 *
 * Before this, shortcut handling lived in four places: `bindKeys` in the
 * layout, `bindKeys` again on each list page, and two ad-hoc `keydown`
 * listeners in the layout for the cases `bindKeys` could not express. It could
 * not express them because it returns early on *any* modifier — which is why
 * ⌘K needed its own listener. Modifiers are first-class here.
 *
 * The registry doubles as the source for the shortcut sheet, so the help
 * overlay cannot drift from what the keyboard actually does.
 */
import { isTypingTarget } from '$lib/keyboard.svelte';

export type CommandSection = 'Navigate' | 'Create' | 'This page' | 'Workspace';

export type Command = {
  id: string;
  title: string;
  /** Extra words the fuzzy matcher should consider. */
  keywords?: string[];
  section: CommandSection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  /**
   * Key spec. Either a single chord — `'?'`, `'mod+k'`, `'g'` — or a sequence
   * like `'g p'`, typed within SEQUENCE_TIMEOUT_MS.
   */
  shortcut?: string;
  /** Hidden from the palette when this returns false. */
  when?: () => boolean;
  /** Shown in the shortcut sheet but not offered as a palette action. */
  hidden?: boolean;
  run: () => void;
};

const SEQUENCE_TIMEOUT_MS = 900;

let commands = $state<Command[]>([]);

export function registerCommands(next: Command[]): () => void {
  const ids = new Set(next.map((c) => c.id));
  // Re-registering an id replaces it: a page that re-runs its registration on
  // navigation should not end up with two copies.
  commands = [...commands.filter((c) => !ids.has(c.id)), ...next];
  return () => {
    commands = commands.filter((c) => !ids.has(c.id));
  };
}

export function allCommands(): Command[] {
  return commands;
}

/** Commands offerable in the palette right now. */
export function availableCommands(): Command[] {
  return commands.filter((c) => !c.hidden && (c.when ? c.when() : true));
}

/* ── key matching ────────────────────────────────────────────────────────── */

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function chordFor(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  // Shift is not recorded for printable keys: `?` is already shift+/, and
  // spelling it 'shift+?' at every call site is noise.
  if (e.shiftKey && e.key.length > 1) parts.push('shift');
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  return parts.join('+');
}

/** Human-readable form for the shortcut sheet. */
export function prettyShortcut(spec: string): string[] {
  return spec.split(' ').flatMap((chord) =>
    chord.split('+').map((part) => {
      if (part === 'mod') return IS_MAC ? '⌘' : 'ctrl';
      if (part === 'alt') return IS_MAC ? '⌥' : 'alt';
      if (part === 'shift') return '⇧';
      if (part === 'Escape') return 'esc';
      if (part === 'Enter') return '↵';
      if (part === 'ArrowUp') return '↑';
      if (part === 'ArrowDown') return '↓';
      return part;
    })
  );
}

/**
 * Start the global dispatcher. Returns a teardown.
 *
 * Text entry wins: a shortcut with no modifier never fires inside an input.
 * Modified chords still do, because ⌘K should work while the user is typing.
 */
export function startShortcuts(): () => void {
  let pending: string | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPending() {
    pending = null;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  function candidates(): Command[] {
    return commands.filter((c) => c.shortcut && (c.when ? c.when() : true));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return;

    const chord = chordFor(e);
    const modified = e.metaKey || e.ctrlKey || e.altKey;
    const typing = isTypingTarget(e.target);
    if (typing && !modified) {
      clearPending();
      return;
    }

    // Mid-sequence: only sequence continuations are eligible.
    if (pending) {
      const seq = `${pending} ${chord}`;
      const match = candidates().find((c) => c.shortcut === seq);
      clearPending();
      if (match) {
        e.preventDefault();
        match.run();
      }
      return;
    }

    const exact = candidates().find((c) => c.shortcut === chord);
    if (exact) {
      e.preventDefault();
      exact.run();
      return;
    }

    // A prefix of some sequence — arm it and wait.
    if (candidates().some((c) => c.shortcut!.startsWith(`${chord} `))) {
      e.preventDefault();
      pending = chord;
      pendingTimer = setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  return () => {
    clearPending();
    window.removeEventListener('keydown', onKeyDown);
  };
}

/* ── recents ─────────────────────────────────────────────────────────────── */

export type Recent = { kind: string; id: string; title: string; href: string };

const RECENTS_KEY = 'heli:recents';
const RECENTS_MAX = 12;

export function recents(): Recent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as Recent[]) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(entry: Recent): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const next = [entry, ...recents().filter((r) => r.href !== entry.href)].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Private mode, quota — recents are a convenience, never a requirement.
  }
}

export function clearRecents(): void {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch {
    // ignore
  }
}
