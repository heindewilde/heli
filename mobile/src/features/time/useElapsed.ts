import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Seconds elapsed since `startedAt`, ticking once a second.
 *
 * Computed from the timestamp on every tick rather than incremented. That
 * distinction is the whole point: a counter that adds one per interval drifts
 * whenever the JS thread is busy, and — far worse on a phone — stops entirely
 * while the app is backgrounded, so a timer left running over lunch comes back
 * an hour short. Deriving from the start time means the number is simply always
 * right, including on the first frame after resuming.
 *
 * The interval is also cleared while backgrounded. iOS suspends timers anyway,
 * but Android will happily keep one alive burning battery to update a view
 * nobody is looking at.
 */
export function useElapsed(startedAt: number | null): number {
  const [seconds, setSeconds] = useState(() =>
    startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
  );

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }

    const recompute = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      recompute();
      id ??= setInterval(recompute, 1000);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };

    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [startedAt]);

  return seconds;
}

/** `1:04:09` — hours only once there are any. */
export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
