export type BatchResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface BatchOptions {
  concurrency: number;
  /** Random delay between launches, sampled uniformly in [jitterMs/3, jitterMs]. 0 = none. */
  jitterMs: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

export async function runBatch<I, V>(
  items: I[],
  fn: (item: I, index: number) => Promise<V>,
  opts: BatchOptions,
): Promise<BatchResult<V>[]> {
  const results: BatchResult<V>[] = new Array(items.length);
  const total = items.length;
  let completed = 0;
  let aborted = false;
  if (opts.signal?.aborted) aborted = true;
  opts.signal?.addEventListener('abort', () => { aborted = true; });

  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      if (aborted) return;
      const idx = cursor++;
      if (idx >= total) return;
      if (idx > 0 && opts.jitterMs > 0) {
        const min = Math.floor(opts.jitterMs / 3);
        const span = opts.jitterMs - min;
        const delay = min + Math.random() * span;
        await new Promise((r) => setTimeout(r, delay));
        if (aborted) return;
      }
      try {
        const v = await fn(items[idx], idx);
        results[idx] = { ok: true, value: v };
      } catch (e) {
        results[idx] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      completed++;
      opts.onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, () => worker());
  await Promise.all(workers);

  for (let i = 0; i < total; i++) {
    if (results[i] === undefined) {
      results[i] = { ok: false, error: 'aborted' };
    }
  }
  return results;
}
