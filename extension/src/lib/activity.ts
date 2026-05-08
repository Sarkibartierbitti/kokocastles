import type { LLMTask } from '~/types';

export type ActivityStatus = 'in-flight' | 'done' | 'error';

// `task` is widened to string so non-LLM jobs (scrape, yt-api) can share
// the same activity panel without polluting the LLMTask union.
export interface ActivityEntry {
  id: string;
  task: LLMTask | string;
  provider: string;
  model: string;
  status: ActivityStatus;
  startedAt: number;
  finishedAt?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number | null;
  error?: string;
  // Optional free-form details — used by scrape jobs to surface the URL.
  detail?: string;
}

export type ActivityEvent =
  | { kind: 'start'; entry: ActivityEntry }
  | { kind: 'done'; entry: ActivityEntry }
  | { kind: 'error'; entry: ActivityEntry };

type Listener = (e: ActivityEvent) => void;

declare const browser: {
  storage: { local: { get: (k?: string | string[] | null) => Promise<Record<string, unknown>>; set: (i: Record<string, unknown>) => Promise<void> } };
};

const PRICING_USD_PER_1M: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
  'claude-opus-4-7': { in: 15.0, out: 75.0 },
  'gpt-5.4-mini': { in: 0.15, out: 0.6 },
  'gpt-5.4': { in: 2.5, out: 10.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-pro': { in: 1.25, out: 10.0 },
  'gemini-3-pro': { in: 2.0, out: 12.0 },
  'deepseek-v4-pro': { in: 0.435, out: 0.87 },
  'kimi-k2': { in: 0.6, out: 2.5 },
  'glm-4.6': { in: 0.6, out: 2.2 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number | null {
  const p = PRICING_USD_PER_1M[model];
  if (!p) return null;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

const KEY = 'koko.activity';
const MAX = 50;

const entries = new Map<string, ActivityEntry>();
const order: string[] = [];
const listeners = new Set<Listener>();

function emit(e: ActivityEvent) {
  for (const l of listeners) l(e);
}

function persist(): void {
  const arr = order.map((id) => entries.get(id)).filter(Boolean);
  void browser.storage.local.set({ [KEY]: arr });
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const activity = {
  async hydrate(): Promise<void> {
    const r = await browser.storage.local.get(KEY);
    const arr = (r[KEY] as ActivityEntry[] | undefined) ?? [];
    for (const e of arr.slice(-MAX)) {
      entries.set(e.id, e);
      order.push(e.id);
    }
  },

  start(args: { task: LLMTask | string; provider: string; model: string; detail?: string }): string {
    const id = newId();
    const entry: ActivityEntry = {
      id,
      task: args.task,
      provider: args.provider,
      model: args.model,
      status: 'in-flight',
      startedAt: Date.now(),
      detail: args.detail,
    };
    entries.set(id, entry);
    order.push(id);
    while (order.length > MAX) {
      const old = order.shift();
      if (old) entries.delete(old);
    }
    emit({ kind: 'start', entry });
    persist();
    return id;
  },

  done(id: string, args: { tokensIn?: number; tokensOut?: number }): void {
    const entry = entries.get(id);
    if (!entry) return;
    entry.status = 'done';
    entry.finishedAt = Date.now();
    entry.tokensIn = args.tokensIn;
    entry.tokensOut = args.tokensOut;
    if (args.tokensIn != null && args.tokensOut != null) {
      entry.costUsd = estimateCost(entry.model, args.tokensIn, args.tokensOut);
    }
    emit({ kind: 'done', entry });
    persist();
  },

  error(id: string, message: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    entry.status = 'error';
    entry.finishedAt = Date.now();
    entry.error = message;
    emit({ kind: 'error', entry });
    persist();
  },

  list(): ActivityEntry[] {
    return order.map((id) => entries.get(id)!).filter(Boolean);
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  clear(): void {
    entries.clear();
    order.length = 0;
    persist();
  },
};
