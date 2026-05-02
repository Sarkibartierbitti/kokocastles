import { describe, it, expect, vi } from 'vitest';
import { runBatch } from '../batch-queue';

describe('runBatch', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runBatch(items, async (n) => n * 10, { concurrency: 2, jitterMs: 0 });
    expect(results).toEqual([
      { ok: true, value: 10 },
      { ok: true, value: 20 },
      { ok: true, value: 30 },
      { ok: true, value: 40 },
      { ok: true, value: 50 },
    ]);
  });

  it('caps concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await runBatch(
      items,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 30));
        inFlight--;
      },
      { concurrency: 2, jitterMs: 0 },
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('captures errors as ok:false entries without aborting batch', async () => {
    const items = [1, 2, 3];
    const results = await runBatch(
      items,
      async (n) => {
        if (n === 2) throw new Error('boom');
        return n * 10;
      },
      { concurrency: 1, jitterMs: 0 },
    );
    expect(results[0]).toEqual({ ok: true, value: 10 });
    expect(results[1]).toEqual({ ok: false, error: 'boom' });
    expect(results[2]).toEqual({ ok: true, value: 30 });
  });

  it('emits progress events as items complete', async () => {
    const items = [1, 2, 3];
    const events: { index: number; total: number }[] = [];
    await runBatch(items, async (n) => n, {
      concurrency: 1,
      jitterMs: 0,
      onProgress: (index, total) => events.push({ index, total }),
    });
    expect(events).toEqual([
      { index: 1, total: 3 },
      { index: 2, total: 3 },
      { index: 3, total: 3 },
    ]);
  });

  it('respects abort signal — pending items skipped, in-flight finish', async () => {
    const items = [1, 2, 3, 4, 5];
    const ctrl = new AbortController();
    const fn = vi.fn(async (n: number) => {
      if (n === 2) ctrl.abort();
      await new Promise((r) => setTimeout(r, 5));
      return n;
    });
    const results = await runBatch(items, fn, { concurrency: 1, jitterMs: 0, signal: ctrl.signal });
    expect(results[0]).toEqual({ ok: true, value: 1 });
    expect(results[1]).toEqual({ ok: true, value: 2 });
    for (let i = 2; i < 5; i++) {
      expect(results[i]).toEqual({ ok: false, error: 'aborted' });
    }
  });
});
