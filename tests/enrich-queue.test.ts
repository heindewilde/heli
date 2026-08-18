import { expect, test } from 'vitest';

/**
 * The queue exists so that one bulk paste cannot fire five hundred outbound
 * fetches at once. Three things about it are worth pinning, and all three are
 * failure modes that would be silent in production: the ceiling actually
 * holding, a throwing job retiring a worker for good, and the urgent lane
 * being overtaken by a long bulk drain.
 */

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

test('never runs more than MAX jobs at once, and drains every one', async () => {
  const { enqueueEnrichment, activeCount, queueDepth, maxConcurrency } = await import(
    '../src/lib/server/enrichQueue'
  );
  const MAX = maxConcurrency();

  const gates = Array.from({ length: MAX * 3 }, () => deferred());
  let peak = 0;
  let finished = 0;

  for (const g of gates) {
    enqueueEnrichment(async () => {
      peak = Math.max(peak, activeCount());
      await g.promise;
      finished += 1;
    });
  }

  // Release in waves so the pool has to refill rather than emptying once.
  for (const g of gates) {
    g.resolve();
    await Promise.resolve();
  }
  // Let the microtask chain settle.
  for (let i = 0; i < 50; i++) await Promise.resolve();

  expect(peak).toBeLessThanOrEqual(MAX);
  expect(peak).toBeGreaterThan(0);
  expect(finished).toBe(gates.length);
  expect(queueDepth()).toBe(0);
  expect(activeCount()).toBe(0);
});

test('a throwing job does not retire its worker', async () => {
  const { enqueueEnrichment, queueDepth, activeCount } = await import(
    '../src/lib/server/enrichQueue'
  );

  let ran = 0;
  for (let i = 0; i < 12; i++) {
    enqueueEnrichment(async () => {
      ran += 1;
      // Every other job fails, the way a timed-out fetch would.
      if (i % 2 === 0) throw new Error('boom');
    });
  }
  for (let i = 0; i < 50; i++) await Promise.resolve();

  expect(ran).toBe(12);
  expect(queueDepth()).toBe(0);
  expect(activeCount()).toBe(0);
});

test('the urgent lane is not stuck behind a bulk drain', async () => {
  const { enqueueEnrichment, maxConcurrency } = await import('../src/lib/server/enrichQueue');
  const MAX = maxConcurrency();

  const order: string[] = [];
  const gates: ReturnType<typeof deferred>[] = [];

  // Fill every worker slot, then queue a long bulk batch behind them.
  for (let i = 0; i < MAX; i++) {
    const g = deferred();
    gates.push(g);
    enqueueEnrichment(async () => {
      await g.promise;
    });
  }
  for (let i = 0; i < 20; i++) {
    enqueueEnrichment(async () => {
      order.push('bulk');
    }, 'bulk');
  }
  // An ordinary save arriving mid-drain: it must not wait for the twenty.
  enqueueEnrichment(async () => {
    order.push('now');
  });

  for (const g of gates) g.resolve();
  for (let i = 0; i < 100; i++) await Promise.resolve();

  expect(order[0]).toBe('now');
  expect(order.filter((x) => x === 'bulk')).toHaveLength(20);
});
