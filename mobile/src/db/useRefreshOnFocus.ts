import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Fetch when a screen is first shown, and again when it is returned to.
 *
 * Screens read from the local mirror, which is what makes them instant and
 * makes offline work — but *something* has to put data there. Without this a
 * fresh install shows an empty list forever, because pull-to-refresh was the
 * only thing that ever fetched, and nobody pulls on a list they have been told
 * is empty.
 *
 * Two rules make it feel right rather than merely correct:
 *
 * **Never blocks a render.** The fetch runs alongside whatever the mirror
 * already has, so returning to a screen shows the old data immediately and
 * updates it in place. A screen that goes blank while it revalidates is worse
 * than one showing data a minute old.
 *
 * **Throttled.** Tab bars invite rapid switching, and refetching a list because
 * someone bounced off the wrong tab and back is a waste of somebody's battery
 * and data. The first focus always fetches; subsequent ones wait out the
 * interval.
 */
const DEFAULT_INTERVAL_MS = 30_000;

export function useRefreshOnFocus(
  refresh: () => Promise<void>,
  { intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number } = {}
): void {
  const lastRun = useRef(0);
  const inFlight = useRef(false);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    if (Date.now() - lastRun.current < intervalMs) return;
    inFlight.current = true;
    lastRun.current = Date.now();
    try {
      await refresh();
    } catch {
      // Deliberately quiet: the screen already has content, and an error banner
      // over readable data is worse than the data being slightly stale. The
      // global offline indicator carries that message once.
    } finally {
      inFlight.current = false;
    }
  }, [refresh, intervalMs]);

  // Mount, so the very first open fetches.
  useEffect(() => {
    void run();
  }, [run]);

  // And every return to the screen.
  useFocusEffect(
    useCallback(() => {
      void run();
    }, [run])
  );
}
