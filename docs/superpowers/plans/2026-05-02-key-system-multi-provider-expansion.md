# Multi-Provider Key System Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-provider key system with a 12-provider registry that auto-detects provider from the pasted key (including ambiguous-prefix disambiguation), exposes searchable provider + model dropdowns, and routes most new providers through one shared OpenAI-compatible adapter.

**Architecture:** Single `providers.ts` registry holds all provider metadata (id, label, key regex with specificity, base URL, API style, model list). Detection ranks regex matches by specificity so unambiguous prefixes (`sk-ant-`, `sk-or-v1-`, `gsk_`, `xai-`, `fw_`) win over the ambiguous bare `sk-`; ambiguous matches surface a candidate list. Three adapters total: existing Anthropic-native, existing Gemini-native, and one generalized OpenAI-compatible adapter parameterized by `baseURL`. Settings replaces native `<select>` with a `SearchableSelect` (typeahead + filtered list) for both the provider override and the per-task model override.

**Tech Stack:** Vite + React 18 + TS + Tailwind, Vitest, OpenAI SDK 4.x (with custom `baseURL`), Anthropic SDK, `@google/genai`. State in localStorage. No new dependencies.

---

## File Structure

**Create:**
- `src/lib/llm/providers.ts` — provider registry (data + helpers)
- `src/lib/llm/openaiCompat.ts` — OpenAI-compatible adapter with custom `baseURL`
- `src/lib/llm/__tests__/detect.test.ts` — detection unit tests
- `src/lib/llm/__tests__/providers.test.ts` — registry invariants
- `src/lib/llm/__tests__/models.test.ts` — tier ladder coverage
- `src/components/SearchableSelect.tsx` — typeahead dropdown component
- `src/components/__tests__/SearchableSelect.test.tsx` — component tests

**Modify:**
- `src/lib/llm/types.ts` — derive `LLMProvider` + `LLMModelId` from registry
- `src/lib/llm/detect.ts` — regex+specificity ranking
- `src/lib/llm/models.ts` — TIER_LADDER reads from registry; broaden labels
- `src/lib/llm/index.ts` — `adapterFor` dispatches to registry-driven factory
- `src/lib/storage.ts` — widen `LLMProvider` storage type
- `src/routes/Settings.tsx` — searchable provider + model dropdowns
- `src/routes/Help.tsx` — list all 12 providers with key sources
- `src/components/MissingKeyBanner.tsx` — generic copy ("LLM key" not provider-specific)

**Delete:**
- `src/lib/llm/openai.ts` — replaced by `openaiCompat.ts` with OpenAI baseURL

---

## Provider Set (initial)

| id | label | api style | regex (anchored) | base URL |
|---|---|---|---|---|
| `anthropic` | Anthropic (Claude) | anthropic-native | `^sk-ant-api03-[A-Za-z0-9_-]{40,}$` | (SDK default) |
| `openai` | OpenAI | openai-compat | `^sk-(proj-\|svcacct-\|None-)?[A-Za-z0-9_-]{40,}$` | `https://api.openai.com/v1` |
| `gemini` | Google Gemini | gemini-native | `^AIza[A-Za-z0-9_-]{35}$` | (SDK default) |
| `mistral` | Mistral | openai-compat | `^[A-Za-z0-9]{32}$` (heuristic) | `https://api.mistral.ai/v1` |
| `deepseek` | DeepSeek | openai-compat | `^sk-[a-f0-9]{48}$` | `https://api.deepseek.com/v1` |
| `xai` | xAI Grok | openai-compat | `^xai-[A-Za-z0-9]{40,}$` | `https://api.x.ai/v1` |
| `moonshot` | Moonshot Kimi | openai-compat | `^sk-[A-Za-z0-9]{48}$` | `https://api.moonshot.ai/v1` |
| `zai` | Z.ai (GLM) | openai-compat | `^[A-Za-z0-9._-]{32,}$` (heuristic, low specificity) | `https://api.z.ai/api/paas/v4` |
| `openrouter` | OpenRouter | openai-compat | `^sk-or-v1-[a-f0-9]{64}$` | `https://openrouter.ai/api/v1` |
| `groq` | Groq | openai-compat | `^gsk_[A-Za-z0-9]{40,}$` | `https://api.groq.com/openai/v1` |
| `together` | Together AI | openai-compat | `^[a-f0-9]{64}$` (heuristic) | `https://api.together.xyz/v1` |
| `fireworks` | Fireworks AI | openai-compat | `^fw_[A-Za-z0-9]{20,}$` | `https://api.fireworks.ai/inference/v1` |

**Specificity rule:** longer literal prefix = higher specificity score. `sk-ant-api03-` (13) beats `sk-` (3); `sk-or-v1-` (9) beats `sk-` (3); `xai-` (4) beats nothing else. Bare-`sk-` providers (`openai`, `deepseek`, `moonshot`) become ambiguous candidates only when no longer-prefix provider matches. Pure-charset heuristics (`mistral`, `together`, `zai`) only show as ambiguous fallbacks, never as auto-detected.

---

## Task 1: Add provider registry

**Files:**
- Create: `src/lib/llm/providers.ts`

- [ ] **Step 1: Create the registry file**

```ts
// src/lib/llm/providers.ts
export type ApiStyle = 'anthropic-native' | 'openai-compat' | 'gemini-native';

export interface ProviderModel {
  id: string;
  label: string;
  /** Hint for tier slotting. */
  tier: 'eco' | 'standard' | 'max' | 'premium';
}

export interface ProviderDef {
  id: string;
  label: string;
  apiStyle: ApiStyle;
  /** Regex to match a pasted key. Order matters only as a tiebreaker. */
  keyRegex: RegExp;
  /** Higher = more specific. Used to rank detection candidates. */
  specificity: number;
  /** Base URL for openai-compat providers. Anthropic/Gemini use SDK defaults. */
  baseURL?: string;
  /** Curated model list — first 'standard' is the default. */
  models: ProviderModel[];
  /** External link shown in Help. */
  consoleUrl: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    apiStyle: 'anthropic-native',
    keyRegex: /^sk-ant-api03-[A-Za-z0-9_-]{40,}$/,
    specificity: 13,
    consoleUrl: 'https://console.anthropic.com/',
    models: [
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (cheap)', tier: 'eco' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (default)', tier: 'standard' },
      { id: 'claude-opus-4-7', label: 'Opus 4.7 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-(proj-|svcacct-|None-)?[A-Za-z0-9_-]{40,}$/,
    specificity: 3,
    baseURL: 'https://api.openai.com/v1',
    consoleUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (cheap)', tier: 'eco' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (default)', tier: 'standard' },
      { id: 'gpt-5.4', label: 'GPT-5.4 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    apiStyle: 'gemini-native',
    keyRegex: /^AIza[A-Za-z0-9_-]{35}$/,
    specificity: 4,
    consoleUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (cheap)', tier: 'eco' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (default)', tier: 'standard' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    apiStyle: 'openai-compat',
    keyRegex: /^[A-Za-z0-9]{32}$/,
    specificity: 1,
    baseURL: 'https://api.mistral.ai/v1',
    consoleUrl: 'https://console.mistral.ai/',
    models: [
      { id: 'ministral-8b-2512', label: 'Ministral 8B (cheap)', tier: 'eco' },
      { id: 'mistral-small-2503', label: 'Mistral Small (default)', tier: 'standard' },
      { id: 'mistral-large-3', label: 'Mistral Large 3 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-[a-f0-9]{48}$/,
    specificity: 3,
    baseURL: 'https://api.deepseek.com/v1',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (cheap)', tier: 'eco' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (default)', tier: 'standard' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    apiStyle: 'openai-compat',
    keyRegex: /^xai-[A-Za-z0-9]{40,}$/,
    specificity: 4,
    baseURL: 'https://api.x.ai/v1',
    consoleUrl: 'https://console.x.ai/',
    models: [
      { id: 'grok-4.1-fast-reasoning', label: 'Grok 4.1 Fast (cheap)', tier: 'eco' },
      { id: 'grok-4.20-non-reasoning', label: 'Grok 4.20 (default)', tier: 'standard' },
      { id: 'grok-4.3', label: 'Grok 4.3 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'moonshot',
    label: 'Moonshot Kimi',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-[A-Za-z0-9]{48}$/,
    specificity: 3,
    baseURL: 'https://api.moonshot.ai/v1',
    consoleUrl: 'https://platform.moonshot.ai/',
    models: [
      { id: 'moonshot-v1-32k', label: 'Moonshot v1 32k (cheap)', tier: 'eco' },
      { id: 'kimi-k2', label: 'Kimi K2 (default)', tier: 'standard' },
      { id: 'kimi-k2.6', label: 'Kimi K2.6 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    apiStyle: 'openai-compat',
    keyRegex: /^[A-Za-z0-9._-]{32,}$/,
    specificity: 1,
    baseURL: 'https://api.z.ai/api/paas/v4',
    consoleUrl: 'https://z.ai/',
    models: [
      { id: 'glm-4.5-air', label: 'GLM 4.5 Air (cheap)', tier: 'eco' },
      { id: 'glm-4.6', label: 'GLM 4.6 (default)', tier: 'standard' },
      { id: 'glm-5.1', label: 'GLM 5.1 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-or-v1-[a-f0-9]{64}$/,
    specificity: 9,
    baseURL: 'https://openrouter.ai/api/v1',
    consoleUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (cheap)', tier: 'eco' },
      { id: 'openai/gpt-5.4', label: 'GPT-5.4 (default)', tier: 'standard' },
      { id: 'anthropic/claude-opus-4-7', label: 'Claude Opus 4.7 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    apiStyle: 'openai-compat',
    keyRegex: /^gsk_[A-Za-z0-9]{40,}$/,
    specificity: 4,
    baseURL: 'https://api.groq.com/openai/v1',
    consoleUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (cheap)', tier: 'eco' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (default)', tier: 'standard' },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'together',
    label: 'Together AI',
    apiStyle: 'openai-compat',
    keyRegex: /^[a-f0-9]{64}$/,
    specificity: 1,
    baseURL: 'https://api.together.xyz/v1',
    consoleUrl: 'https://api.together.ai/settings/api-keys',
    models: [
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo (cheap)', tier: 'eco' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo (default)', tier: 'standard' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    apiStyle: 'openai-compat',
    keyRegex: /^fw_[A-Za-z0-9]{20,}$/,
    specificity: 3,
    baseURL: 'https://api.fireworks.ai/inference/v1',
    consoleUrl: 'https://fireworks.ai/account/api-keys',
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B (cheap)', tier: 'eco' },
      { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', label: 'Qwen 2.5 72B (default)', tier: 'standard' },
      { id: 'accounts/fireworks/models/deepseek-v3p1', label: 'DeepSeek V3.1 (premium)', tier: 'premium' },
    ],
  },
];

export type ProviderId = (typeof PROVIDERS)[number]['id'];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isValidProviderId(id: string): boolean {
  return PROVIDERS.some((p) => p.id === id);
}

export function allModelIds(): string[] {
  return PROVIDERS.flatMap((p) => p.models.map((m) => m.id));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm/providers.ts
git commit -m "feat(llm): add 12-provider registry with key regex + specificity"
```

---

## Task 2: Registry invariant tests

**Files:**
- Create: `src/lib/llm/__tests__/providers.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/llm/__tests__/providers.test.ts
import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider, isValidProviderId, allModelIds } from '../providers';

describe('providers registry', () => {
  it('has unique ids', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique model ids globally', () => {
    const ids = allModelIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every openai-compat provider has a baseURL', () => {
    for (const p of PROVIDERS) {
      if (p.apiStyle === 'openai-compat') {
        expect(p.baseURL, `${p.id} missing baseURL`).toBeTruthy();
      }
    }
  });

  it('every provider has at least one eco/standard/premium model', () => {
    for (const p of PROVIDERS) {
      const tiers = new Set(p.models.map((m) => m.tier));
      expect(tiers.has('eco'), `${p.id} missing eco`).toBe(true);
      expect(tiers.has('standard'), `${p.id} missing standard`).toBe(true);
      expect(tiers.has('premium'), `${p.id} missing premium`).toBe(true);
    }
  });

  it('keyRegex matches its own example sample', () => {
    const samples: Record<string, string> = {
      anthropic: 'sk-ant-api03-' + 'a'.repeat(95),
      openai: 'sk-proj-' + 'A'.repeat(60),
      gemini: 'AIza' + 'a'.repeat(35),
      mistral: 'a'.repeat(32),
      deepseek: 'sk-' + 'a'.repeat(48),
      xai: 'xai-' + 'A'.repeat(80),
      moonshot: 'sk-' + 'A'.repeat(48),
      zai: 'a'.repeat(40),
      openrouter: 'sk-or-v1-' + 'a'.repeat(64),
      groq: 'gsk_' + 'A'.repeat(52),
      together: 'a'.repeat(64),
      fireworks: 'fw_' + 'A'.repeat(24),
    };
    for (const p of PROVIDERS) {
      const sample = samples[p.id];
      expect(p.keyRegex.test(sample), `${p.id} regex did not match its sample`).toBe(true);
    }
  });

  it('getProvider returns def for known id, undefined for unknown', () => {
    expect(getProvider('anthropic')?.label).toBe('Anthropic (Claude)');
    expect(getProvider('nope')).toBeUndefined();
  });

  it('isValidProviderId rejects empty string', () => {
    expect(isValidProviderId('')).toBe(false);
    expect(isValidProviderId('anthropic')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, expect PASS (registry already created)**

Run: `npm test -- providers`
Expected: 7 passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/__tests__/providers.test.ts
git commit -m "test(llm): registry invariants — unique ids, tier coverage, regex self-match"
```

---

## Task 3: Type derivation from registry

**Files:**
- Modify: `src/lib/llm/types.ts`

- [ ] **Step 1: Replace types.ts with registry-derived types**

```ts
// src/lib/llm/types.ts
import { PROVIDERS, type ProviderId } from './providers';

export type LLMProvider = ProviderId;

/** Union of every model id across all providers. */
export type LLMModelId = (typeof PROVIDERS)[number]['models'][number]['id'];

export type LLMTask = 'triage' | 'deep' | 'outlierWhy' | 'synthesis';

export type TierMode = 'eco' | 'standard' | 'max';

export interface ProviderTierLadder {
  eco: LLMModelId;
  standard: LLMModelId;
  max: LLMModelId;
  synthesisMax: LLMModelId;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run build`
Expected: passes (older imports of `LLMProvider` as 'anthropic' | 'openai' | 'gemini' still satisfied since registry keys are a superset).

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/types.ts
git commit -m "refactor(llm): derive LLMProvider + LLMModelId from registry"
```

---

## Task 4: Detection rewrite (regex + specificity)

**Files:**
- Modify: `src/lib/llm/detect.ts`
- Create: `src/lib/llm/__tests__/detect.test.ts`

- [ ] **Step 1: Write failing detection tests**

```ts
// src/lib/llm/__tests__/detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectProvider } from '../detect';

describe('detectProvider', () => {
  it('returns unknown for empty input', () => {
    expect(detectProvider('')).toEqual({ kind: 'unknown' });
    expect(detectProvider('   ')).toEqual({ kind: 'unknown' });
  });

  it('detects anthropic from sk-ant- prefix even though sk- collides', () => {
    const key = 'sk-ant-api03-' + 'a'.repeat(95);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('anthropic');
  });

  it('detects openrouter from sk-or-v1- prefix unambiguously', () => {
    const key = 'sk-or-v1-' + 'a'.repeat(64);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('openrouter');
  });

  it('detects gemini from AIza prefix', () => {
    const key = 'AIza' + 'a'.repeat(35);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('gemini');
  });

  it('detects xai from xai- prefix', () => {
    const key = 'xai-' + 'A'.repeat(80);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('xai');
  });

  it('detects groq from gsk_ prefix', () => {
    const key = 'gsk_' + 'A'.repeat(52);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('groq');
  });

  it('detects fireworks from fw_ prefix', () => {
    const key = 'fw_' + 'A'.repeat(24);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('fireworks');
  });

  it('returns ambiguous for hex-only sk- key (openai/deepseek/moonshot collision)', () => {
    const key = 'sk-' + 'a'.repeat(48); // hex only — matches deepseek AND openai AND moonshot regex
    const r = detectProvider(key);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.candidates).toContain('deepseek');
      expect(r.candidates).toContain('openai');
      expect(r.candidates).toContain('moonshot');
      expect(r.candidates).not.toContain('anthropic');
    }
  });

  it('returns unknown for clearly junk input', () => {
    expect(detectProvider('hello world')).toEqual({ kind: 'unknown' });
  });

  it('trims whitespace before matching', () => {
    const key = '  sk-or-v1-' + 'a'.repeat(64) + '  ';
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
  });

  it('low-specificity heuristic providers do not auto-win on a 32-hex string', () => {
    // mistral matches ^[A-Za-z0-9]{32}$ but specificity 1 — should be ambiguous, never auto-detected
    const key = 'a'.repeat(32);
    const r = detectProvider(key);
    // Should be ambiguous (mistral + zai both match) — never auto-detected because specificity ≤ 1
    expect(r.kind).toBe('ambiguous');
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npm test -- detect`
Expected: most tests fail — current `detect.ts` only handles `sk-ant-`, bare `sk-`, `AIza`.

- [ ] **Step 3: Rewrite `detect.ts`**

```ts
// src/lib/llm/detect.ts
import { PROVIDERS } from './providers';
import type { LLMProvider } from './types';

export type DetectResult =
  | { kind: 'detected'; provider: LLMProvider }
  | { kind: 'ambiguous'; candidates: LLMProvider[] }
  | { kind: 'unknown' };

/**
 * Detection rules:
 * 1. Trim. Empty → unknown.
 * 2. Find every provider whose regex matches.
 * 3. Group by specificity (highest first).
 * 4. If the top-specificity group has exactly one provider AND its specificity ≥ 2 → detected.
 * 5. Else if multiple providers match → ambiguous (return all matches, sorted by specificity desc).
 * 6. Else → unknown.
 *
 * The specificity ≥ 2 floor prevents pure-charset heuristics (mistral 32-alnum,
 * together 64-hex, zai 32+ alnum) from ever auto-winning — they only surface as
 * ambiguous candidates the user must confirm.
 */
export function detectProvider(rawKey: string): DetectResult {
  const key = rawKey.trim();
  if (!key) return { kind: 'unknown' };

  const matches = PROVIDERS.filter((p) => p.keyRegex.test(key))
    .sort((a, b) => b.specificity - a.specificity);

  if (matches.length === 0) return { kind: 'unknown' };

  const top = matches[0];
  const topGroup = matches.filter((m) => m.specificity === top.specificity);

  if (topGroup.length === 1 && top.specificity >= 2) {
    return { kind: 'detected', provider: top.id as LLMProvider };
  }

  return {
    kind: 'ambiguous',
    candidates: matches.map((m) => m.id as LLMProvider),
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm test -- detect`
Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/detect.ts src/lib/llm/__tests__/detect.test.ts
git commit -m "feat(llm): regex+specificity detection across 12 providers"
```

---

## Task 5: Generalize OpenAI-compatible adapter

**Files:**
- Create: `src/lib/llm/openaiCompat.ts`
- Delete: `src/lib/llm/openai.ts`

- [ ] **Step 1: Create generalized adapter**

```ts
// src/lib/llm/openaiCompat.ts
import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';

function toContent(blocks: ContentBlock[]): OpenAI.Chat.ChatCompletionContentPart[] {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    return {
      type: 'image_url',
      image_url: { url: `data:${b.mediaType};base64,${b.base64}` },
    };
  });
}

/**
 * Adapter for any OpenAI-compatible chat-completions endpoint.
 * Used for OpenAI itself plus Mistral, DeepSeek, xAI, Moonshot, Z.ai,
 * OpenRouter, Groq, Together, Fireworks.
 */
export function makeOpenAICompatAdapter(apiKey: string, baseURL: string): LLMAdapter {
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  return {
    async call<T>(opts: CallOptions<T>): Promise<T> {
      const parameters = zodToJsonSchema(opts.schema, { target: 'jsonSchema7' }) as Record<string, unknown>;
      delete (parameters as { $schema?: string }).$schema;
      const resp = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: toContent(opts.content) },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: opts.toolName,
              description: opts.toolDescription,
              parameters,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: opts.toolName } },
      });
      const call = resp.choices[0]?.message?.tool_calls?.[0];
      if (!call || call.type !== 'function') {
        throw new Error('Provider did not return a function call');
      }
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch (e) {
        throw new Error(`Provider returned invalid JSON arguments: ${(e as Error).message}`);
      }
      return opts.schema.parse(args);
    },
  };
}
```

- [ ] **Step 2: Delete old `openai.ts`**

Run: `rm src/lib/llm/openai.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/openaiCompat.ts src/lib/llm/openai.ts
git commit -m "refactor(llm): generalize OpenAI adapter to OpenAI-compatible with custom baseURL"
```

---

## Task 6: Wire registry into adapter dispatch

**Files:**
- Modify: `src/lib/llm/index.ts`

- [ ] **Step 1: Replace `adapterFor`**

```ts
// src/lib/llm/index.ts
import type { z } from 'zod';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';
import { makeAnthropicAdapter } from './anthropic';
import { makeOpenAICompatAdapter } from './openaiCompat';
import { makeGeminiAdapter } from './gemini';
import { pickModelForProvider } from './models';
import { getProvider } from './providers';
import type { LLMProvider, LLMTask } from './types';
import { storage } from '../storage';

function adapterFor(provider: LLMProvider, apiKey: string): LLMAdapter {
  const def = getProvider(provider);
  if (!def) throw new Error(`Unknown provider: ${provider}`);
  switch (def.apiStyle) {
    case 'anthropic-native':
      return makeAnthropicAdapter(apiKey);
    case 'gemini-native':
      return makeGeminiAdapter(apiKey);
    case 'openai-compat':
      if (!def.baseURL) throw new Error(`Provider ${provider} missing baseURL`);
      return makeOpenAICompatAdapter(apiKey, def.baseURL);
  }
}

export interface CallLLMArgs<T> {
  task: LLMTask;
  systemPrompt: string;
  content: ContentBlock[];
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export async function callLLM<T>(args: CallLLMArgs<T>): Promise<T> {
  const apiKey = storage.getLLMKey();
  const provider = storage.getLLMProvider();
  if (!apiKey || !provider) {
    throw new Error('LLM API key missing — set in Settings');
  }
  const tier = storage.getTierMode();
  const override = storage.getModelOverrides()[args.task];
  const model = override ?? pickModelForProvider(provider, tier, args.task);
  const adapter = adapterFor(provider, apiKey);
  const opts: CallOptions<T> = {
    task: args.task,
    model,
    systemPrompt: args.systemPrompt,
    content: args.content,
    toolName: args.toolName,
    toolDescription: args.toolDescription,
    schema: args.schema,
    maxTokens: args.maxTokens,
  };
  return adapter.call<T>(opts);
}

export { pickModelForProvider } from './models';
export type { ContentBlock } from './adapter';
```

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run build && npm test`
Expected: build passes; all existing tests still green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/index.ts
git commit -m "refactor(llm): adapterFor dispatches via registry apiStyle"
```

---

## Task 7: TIER_LADDER from registry

**Files:**
- Modify: `src/lib/llm/models.ts`
- Create: `src/lib/llm/__tests__/models.test.ts`

- [ ] **Step 1: Write tier coverage test**

```ts
// src/lib/llm/__tests__/models.test.ts
import { describe, it, expect } from 'vitest';
import { TIER_LADDER, pickModelForProvider, modelLabel, modelsForProvider } from '../models';
import { PROVIDERS } from '../providers';

describe('TIER_LADDER', () => {
  it('has an entry for every registered provider', () => {
    for (const p of PROVIDERS) {
      expect(TIER_LADDER[p.id], `missing ladder for ${p.id}`).toBeDefined();
      expect(TIER_LADDER[p.id].eco).toBeTruthy();
      expect(TIER_LADDER[p.id].standard).toBeTruthy();
      expect(TIER_LADDER[p.id].max).toBeTruthy();
      expect(TIER_LADDER[p.id].synthesisMax).toBeTruthy();
    }
  });

  it('every ladder model id exists in its providerʼs registered models', () => {
    for (const p of PROVIDERS) {
      const ladder = TIER_LADDER[p.id];
      const ids = new Set(p.models.map((m) => m.id));
      for (const slot of ['eco', 'standard', 'max', 'synthesisMax'] as const) {
        expect(ids.has(ladder[slot]), `${p.id}.${slot}=${ladder[slot]} not in registry`).toBe(true);
      }
    }
  });
});

describe('pickModelForProvider', () => {
  it('eco tier picks eco model for triage', () => {
    expect(pickModelForProvider('anthropic', 'eco', 'triage')).toBe('claude-haiku-4-5');
  });

  it('max tier with synthesis picks synthesisMax', () => {
    expect(pickModelForProvider('anthropic', 'max', 'synthesis')).toBe('claude-opus-4-7');
  });
});

describe('modelLabel + modelsForProvider', () => {
  it('returns label for known model', () => {
    expect(modelLabel('claude-haiku-4-5')).toContain('Haiku');
  });

  it('returns at least 3 models per provider', () => {
    for (const p of PROVIDERS) {
      expect(modelsForProvider(p.id).length).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Rewrite `models.ts` to derive from registry**

```ts
// src/lib/llm/models.ts
import { PROVIDERS, getProvider } from './providers';
import type { LLMModelId, LLMProvider, LLMTask, ProviderTierLadder, TierMode } from './types';

function buildLadder(): Record<LLMProvider, ProviderTierLadder> {
  const out: Partial<Record<LLMProvider, ProviderTierLadder>> = {};
  for (const p of PROVIDERS) {
    const eco = p.models.find((m) => m.tier === 'eco') ?? p.models[0];
    const standard = p.models.find((m) => m.tier === 'standard') ?? p.models[0];
    const premium = p.models.find((m) => m.tier === 'premium') ?? standard;
    out[p.id as LLMProvider] = {
      eco: eco.id as LLMModelId,
      standard: standard.id as LLMModelId,
      max: standard.id as LLMModelId, // 'max' tier mode reuses standard for non-synthesis tasks
      synthesisMax: premium.id as LLMModelId,
    };
  }
  return out as Record<LLMProvider, ProviderTierLadder>;
}

export const TIER_LADDER: Record<LLMProvider, ProviderTierLadder> = buildLadder();

export function pickModelForProvider(
  provider: LLMProvider,
  tier: TierMode,
  task: LLMTask
): LLMModelId {
  const ladder = TIER_LADDER[provider];
  if (tier === 'eco') return task === 'synthesis' ? ladder.standard : ladder.eco;
  if (tier === 'max') return task === 'synthesis' ? ladder.synthesisMax : ladder.standard;
  return ladder.standard;
}

export function modelLabel(id: LLMModelId): string {
  for (const p of PROVIDERS) {
    const m = p.models.find((mm) => mm.id === id);
    if (m) return m.label;
  }
  return id;
}

export function modelsForProvider(provider: LLMProvider): LLMModelId[] {
  const def = getProvider(provider);
  if (!def) return [];
  return def.models.map((m) => m.id as LLMModelId);
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- models`
Expected: 6 passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/models.ts src/lib/llm/__tests__/models.test.ts
git commit -m "refactor(llm): TIER_LADDER + model helpers derived from registry"
```

---

## Task 8: Storage type widening

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Update `storage.ts` provider type**

The `LLMProvider` type is now derived from `PROVIDERS`. The storage signature `getLLMProvider: () => read<LLMProvider | ''>` is unchanged in shape but now accepts any registered provider id.

Add a one-line guard so corrupted localStorage cannot return a stale id we no longer recognize:

Replace lines 43-44:

```ts
  getLLMProvider: () => {
    const raw = read<string>(KEY.llmProvider, '');
    return (raw && isValidProviderId(raw) ? raw : '') as LLMProvider | '';
  },
  setLLMProvider: (v: LLMProvider | '') => write(KEY.llmProvider, v),
```

Add import at top:

```ts
import { isValidProviderId } from './llm/providers';
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "refactor(storage): validate llmProvider against registry on read"
```

---

## Task 9: SearchableSelect component

**Files:**
- Create: `src/components/SearchableSelect.tsx`
- Create: `src/components/__tests__/SearchableSelect.test.tsx`

- [ ] **Step 1: Write component test**

```tsx
// src/components/__tests__/SearchableSelect.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchableSelect from '../SearchableSelect';

const options = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry pie' },
];

describe('SearchableSelect', () => {
  it('shows the current selectionʼs label in the trigger', () => {
    render(<SearchableSelect value="b" options={options} onChange={() => {}} placeholder="pick" />);
    expect(screen.getByRole('button')).toHaveTextContent('Banana');
  });

  it('opens menu and filters by query', () => {
    render(<SearchableSelect value="" options={options} onChange={() => {}} placeholder="pick" />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pie' } });
    expect(screen.queryByText('Apple')).toBeNull();
    expect(screen.getByText('Cherry pie')).toBeInTheDocument();
  });

  it('calls onChange with selected value', () => {
    let picked = '';
    render(
      <SearchableSelect value="" options={options} onChange={(v) => (picked = v)} placeholder="pick" />
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Banana'));
    expect(picked).toBe('b');
  });
});
```

Note: tests need `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` env. If absent in `vite.config.ts`, add:

```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

And in `vitest` config (likely `vite.config.ts` `test:` block) set `environment: 'jsdom'`. If config has no test block, append:

```ts
// vite.config.ts
test: { environment: 'jsdom' },
```

- [ ] **Step 2: Run tests, expect FAIL (component missing)**

Run: `npm test -- SearchableSelect`

- [ ] **Step 3: Implement `SearchableSelect`**

```tsx
// src/components/SearchableSelect.tsx
import { useEffect, useMemo, useRef, useState } from 'react';

export interface Option {
  value: string;
  label: string;
  /** Optional secondary line shown beneath label. */
  hint?: string;
}

export interface SearchableSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional empty-state label, e.g. '— tier default —'. Selecting it sends ''. */
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'select…',
  emptyLabel,
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="koko-input w-full text-left flex items-center justify-between"
      >
        <span className={selected ? '' : 'text-slate-400'}>
          {selected ? selected.label : emptyLabel ?? placeholder}
        </span>
        <span className="text-slate-400 ml-2">▾</span>
      </button>
      {open ? (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-sky-200">
          <div className="p-2 sticky top-0 bg-white">
            <input
              ref={inputRef}
              role="searchbox"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search…"
              className="koko-input w-full"
            />
          </div>
          <ul role="listbox" className="py-1">
            {emptyLabel ? (
              <li>
                <button
                  type="button"
                  onClick={() => pick('')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-koko-pink/30"
                >
                  {emptyLabel}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">no matches</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => pick(o.value)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-koko-pink/30 ${
                      o.value === value ? 'bg-koko-sky/40' : ''
                    }`}
                  >
                    <div>{o.label}</div>
                    {o.hint ? <div className="text-xs text-slate-500">{o.hint}</div> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm test -- SearchableSelect`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/SearchableSelect.tsx src/components/__tests__/SearchableSelect.test.tsx vite.config.ts package.json package-lock.json
git commit -m "feat(ui): SearchableSelect typeahead dropdown component"
```

---

## Task 10: Settings — searchable provider override

**Files:**
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Replace the provider-pick block (current lines 88-128) with searchable dropdown**

Add imports:

```tsx
import SearchableSelect, { type Option as SelectOption } from '../components/SearchableSelect';
import { PROVIDERS, getProvider } from '../lib/llm/providers';
```

Remove the hardcoded `PROVIDER_LABELS` constant (lines 21-25). Replace with helper:

```tsx
function providerLabel(id: string): string {
  return getProvider(id)?.label ?? id;
}
```

Build provider options once:

```tsx
const providerOptions: SelectOption[] = PROVIDERS.map((p) => ({
  value: p.id,
  label: p.label,
  hint: p.apiStyle === 'anthropic-native'
    ? 'Anthropic API'
    : p.apiStyle === 'gemini-native'
    ? 'Google Gemini API'
    : `OpenAI-compatible · ${p.baseURL}`,
}));
```

Replace the JSX block (current lines 88-128, the `{llmKey.trim() ? (...)`...`) : null}` chunk) with:

```tsx
{llmKey.trim() ? (
  <div className="space-y-2 text-xs">
    {detected.kind === 'detected' ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-1 rounded-full bg-koko-pink/40 text-slate-700">
          Detected: <strong>{providerLabel(detected.provider)}</strong>
        </span>
        <span className="text-slate-500">— override below if wrong:</span>
      </div>
    ) : detected.kind === 'ambiguous' ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-900">
          Ambiguous prefix — pick provider:
        </span>
        <span className="text-slate-500">
          candidates: {detected.candidates.map(providerLabel).join(', ')}
        </span>
      </div>
    ) : (
      <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-900 inline-block">
        Unrecognized key prefix. Pick provider manually:
      </span>
    )}
    <SearchableSelect
      value={llmProvider}
      options={providerOptions}
      onChange={(v) => setLlmProvider(v as LLMProvider | '')}
      placeholder="select provider…"
      emptyLabel="— none —"
      className="max-w-md"
    />
  </div>
) : null}
```

- [ ] **Step 2: Manually verify in dev**

Run: `npm run dev`
Open Settings. Paste `sk-ant-api03-` + 95 chars. Expected: "Detected: Anthropic (Claude)" pill + provider dropdown showing all 12 providers searchable.
Paste `sk-` + 48 hex chars. Expected: "Ambiguous prefix" warning, candidates list shows openai/deepseek/moonshot, dropdown is open for user choice.
Type "groq" in dropdown search. Expected: list narrows to Groq.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Settings.tsx
git commit -m "feat(settings): searchable provider override dropdown for all 12 providers"
```

---

## Task 11: Settings — searchable model override

**Files:**
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Replace the per-task `<select>` (current lines 177-194) with `SearchableSelect`**

Add helper to derive options:

```tsx
const modelOptions: SelectOption[] = useMemo(() => {
  if (!llmProvider) return [];
  const def = getProvider(llmProvider);
  if (!def) return [];
  return def.models.map((m) => ({
    value: m.id,
    label: m.label,
    hint: m.tier,
  }));
}, [llmProvider]);
```

Replace the inner `TASKS.map((t) => (... <select>...</select>...))` block with:

```tsx
{TASKS.map((t) => (
  <div key={t.id} className="flex items-center justify-between gap-3">
    <div>
      <div className="text-sm font-medium">{t.label}</div>
      <div className="text-xs text-slate-500">{t.help}</div>
    </div>
    <SearchableSelect
      value={overrides[t.id] ?? ''}
      options={modelOptions}
      onChange={(v) => {
        setOverrides((prev) => {
          const next = { ...prev };
          if (!v) delete next[t.id];
          else next[t.id] = v as LLMModelId;
          return next;
        });
      }}
      emptyLabel="— tier default —"
      className="max-w-xs"
    />
  </div>
))}
```

- [ ] **Step 2: Verify in dev**

Run: `npm run dev`
Paste an OpenRouter key, expand "Per-task model overrides", type "claude" in the synthesis dropdown. Expected: filter narrows to `anthropic/claude-opus-4-7`. Pick it. Save. Reload page. Expected: override persists.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Settings.tsx
git commit -m "feat(settings): searchable per-task model override dropdown"
```

---

## Task 12: Help docs + MissingKeyBanner copy

**Files:**
- Modify: `src/routes/Help.tsx`
- Modify: `src/components/MissingKeyBanner.tsx`

- [ ] **Step 1: Replace Help LLM section with registry-driven list**

Add at top of `Help.tsx`:

```tsx
import { PROVIDERS } from '../lib/llm/providers';
```

Replace the three hardcoded provider blocks (the Anthropic, OpenAI, Gemini sections) with a single mapped list:

```tsx
<section className="koko-card p-6 space-y-4">
  <h2 className="text-lg font-display font-semibold">LLM API key — pick one provider</h2>
  <p className="text-sm text-slate-600">
    Paste any of these keys into the LLM key field. The provider is auto-detected
    from the key prefix where unambiguous; otherwise pick from the dropdown.
  </p>
  <ul className="space-y-3">
    {PROVIDERS.map((p) => (
      <li key={p.id} className="border-t border-sky-100 pt-3 first:border-t-0 first:pt-0">
        <div className="font-semibold">{p.label}</div>
        <div className="text-xs text-slate-500">
          {p.apiStyle === 'anthropic-native'
            ? 'Anthropic Messages API'
            : p.apiStyle === 'gemini-native'
            ? 'Google Gemini API'
            : `OpenAI-compatible · ${p.baseURL}`}
        </div>
        <a className="text-sm text-sky-700 underline" href={p.consoleUrl} target="_blank" rel="noreferrer">
          {p.consoleUrl}
        </a>
      </li>
    ))}
  </ul>
</section>
```

(Keep the YouTube section intact — that's separate.)

- [ ] **Step 2: Update `MissingKeyBanner` copy**

Open `src/components/MissingKeyBanner.tsx`. Wherever it lists Anthropic/OpenAI/Gemini explicitly (likely in the `'llm'` need branch), change copy to: `"LLM API key (any of: Anthropic, OpenAI, Gemini, Mistral, DeepSeek, Grok, Kimi, GLM, OpenRouter, Groq, Together, Fireworks)"`. Keep YouTube branch unchanged.

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Visit `/help`. Expected: 12 provider entries with console links.
Visit `/watchlist` with no LLM key set. Expected: banner mentions multi-provider list.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Help.tsx src/components/MissingKeyBanner.tsx
git commit -m "docs(help): list 12 providers from registry; banner copy generalized"
```

---

## Task 13: Full verification + final commit

- [ ] **Step 1: Type + lint + tests**

Run: `npm run build && npm test`
Expected: typecheck clean, all suites pass (providers, detect, models, SearchableSelect — minimum 26 tests).

- [ ] **Step 2: Manual smoke test (dev server)**

Run: `npm run dev`
Walk through each scenario in the table. Expected: all behaviors match.

| Scenario | Action | Expect |
|---|---|---|
| Existing Anthropic key | open Settings, key already saved | "Detected: Anthropic (Claude)" pill, no migration prompt |
| New OpenRouter key | paste `sk-or-v1-` + 64 hex | auto-detected, models dropdown shows 3 OpenRouter models |
| Bare `sk-` 48-hex | paste `sk-` + 48 hex | "Ambiguous" warning, candidates shown, dropdown editable |
| Junk text | paste "hello" | "Unrecognized key prefix" warning, dropdown shows all 12 |
| Provider override | typed-detect, then pick a different provider in dropdown | dropdown wins; save persists |
| Search in provider dropdown | type "groq" | filters to Groq |
| Search in model dropdown | provider=OpenRouter, type "claude" | filters to claude entry |
| Tier override invalidation | save with override `claude-opus-4-7` for OpenAI provider | override dropped silently on save |
| Make a real triage call | with valid key (any provider) | request succeeds, response renders |

- [ ] **Step 3: Final reconciliation commit (if any drift)**

```bash
git status
# if anything outstanding:
git add -A
git commit -m "chore(llm): finalize multi-provider key system"
```

---

## Notes

- **No dynamic `/v1/models` fetch.** Static curated lists per provider keep the dropdowns instant; a "refresh from provider" button is a future enhancement, not in scope.
- **Together / Mistral / Z.ai key regexes are heuristic.** They have specificity 1, so they only ever surface as ambiguous candidates — never auto-detect — preventing false positives on similar-shaped keys from other providers. Users see them in the dropdown and pick manually.
- **OpenAI npm SDK with `baseURL` covers all 9 OpenAI-compatible providers.** Anthropic-native (`@anthropic-ai/sdk`) and Gemini-native (`@google/genai`) keep their own adapters.
- **No new runtime deps.** `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` are dev-only and only needed if `SearchableSelect.test.tsx` is kept; if test infra setup feels heavy, the test in Task 9 can be skipped and the component verified manually in dev — but the `detect`/`providers`/`models` test suites remain mandatory since they protect data correctness.
- **No migration needed.** `LLMProvider` is a superset of the prior 3-id union; existing localStorage values (`anthropic` / `openai` / `gemini`) remain valid registry ids.

---

## REVISION 2026-05-02 (mid-execution)

User directive: drop the eco/standard/max tier system and per-task overrides. User picks ONE model per provider directly. Expand model lists to all models the research subagent surfaced.

### Tasks 1–6 already shipped (commits b11970e..f9b2768) — KEEP

Deltas vs. these:
- `providers.ts`: drop `tier` field on `ProviderModel`. Expand each provider's `models[]` to the full researched set.
- `types.ts`: drop `TierMode` and `ProviderTierLadder` exports.
- `src/types.ts`: drop `TierMode` re-export.
- `providers.test.ts`: drop the eco/standard/premium tier-coverage assertion. Replace with "every provider has ≥1 model".

### Tasks 7–13 superseded — replaced by:

#### Task R1: Drop tier system from data + types + storage + adapter wiring (one commit)

**Files modified:**
- `src/lib/llm/providers.ts` — drop `tier` field; expand `models[]` per provider (full lists below)
- `src/lib/llm/__tests__/providers.test.ts` — drop tier-coverage test
- `src/lib/llm/types.ts` — remove `TierMode`, `ProviderTierLadder`
- `src/types.ts` — drop `TierMode` re-export
- `src/lib/llm/models.ts` — remove `TIER_LADDER`, `pickModelForProvider`, `modelsForProvider` (now trivially `getProvider(id)?.models`); keep `modelLabel`
- `src/lib/storage.ts` — drop `getTierMode`/`setTierMode`/`getModelOverrides`/`setModelOverrides`; add `getLLMModel`/`setLLMModel` (key `koko.llmModel`)
- `src/lib/llm/index.ts` — `callLLM` reads `storage.getLLMModel()`; if empty/invalid, falls back to `getProvider(provider).models[0].id`

**Expanded model lists per provider:**

```ts
// anthropic
{ id: 'claude-haiku-4-5',   label: 'Claude Haiku 4.5' },
{ id: 'claude-sonnet-4-6',  label: 'Claude Sonnet 4.6' },
{ id: 'claude-opus-4-6',    label: 'Claude Opus 4.6' },
{ id: 'claude-opus-4-7',    label: 'Claude Opus 4.7' },

// openai
{ id: 'gpt-4.1-mini',  label: 'GPT-4.1 mini' },
{ id: 'gpt-4.1',       label: 'GPT-4.1' },
{ id: 'gpt-5.4-nano',  label: 'GPT-5.4 nano' },
{ id: 'gpt-5.4-mini',  label: 'GPT-5.4 mini' },
{ id: 'gpt-5.4',       label: 'GPT-5.4' },
{ id: 'gpt-5.5',       label: 'GPT-5.5' },

// gemini
{ id: 'gemini-2.5-flash-lite',    label: 'Gemini 2.5 Flash Lite' },
{ id: 'gemini-2.5-flash',         label: 'Gemini 2.5 Flash' },
{ id: 'gemini-2.5-pro',           label: 'Gemini 2.5 Pro' },
{ id: 'gemini-3-pro',             label: 'Gemini 3 Pro' },
{ id: 'gemini-3.1-pro-preview',   label: 'Gemini 3.1 Pro (preview)' },

// mistral
{ id: 'ministral-8b-2512',     label: 'Ministral 8B' },
{ id: 'mistral-small-2503',    label: 'Mistral Small' },
{ id: 'codestral-2501',        label: 'Codestral' },
{ id: 'devstral-2512',         label: 'Devstral' },
{ id: 'magistral-small-2509',  label: 'Magistral Small' },
{ id: 'magistral-medium-2509', label: 'Magistral Medium' },
{ id: 'mistral-large-3',       label: 'Mistral Large 3' },

// deepseek
{ id: 'deepseek-chat',      label: 'DeepSeek Chat' },
{ id: 'deepseek-reasoner',  label: 'DeepSeek Reasoner' },
{ id: 'deepseek-v4-flash',  label: 'DeepSeek V4 Flash' },
{ id: 'deepseek-v4-pro',    label: 'DeepSeek V4 Pro' },

// xai
{ id: 'grok-code-fast-1',          label: 'Grok Code Fast 1' },
{ id: 'grok-4.1-fast-reasoning',   label: 'Grok 4.1 Fast (reasoning)' },
{ id: 'grok-4.20-non-reasoning',   label: 'Grok 4.20' },
{ id: 'grok-4.20-reasoning',       label: 'Grok 4.20 (reasoning)' },
{ id: 'grok-4.3',                  label: 'Grok 4.3' },

// moonshot
{ id: 'moonshot-v1-8k',    label: 'Moonshot v1 8k' },
{ id: 'moonshot-v1-32k',   label: 'Moonshot v1 32k' },
{ id: 'moonshot-v1-128k',  label: 'Moonshot v1 128k' },
{ id: 'kimi-k2',           label: 'Kimi K2' },
{ id: 'kimi-k2.5',         label: 'Kimi K2.5' },
{ id: 'kimi-k2.6',         label: 'Kimi K2.6' },

// zai
{ id: 'glm-4.5-air',  label: 'GLM 4.5 Air' },
{ id: 'glm-4.5',      label: 'GLM 4.5' },
{ id: 'glm-4.6',      label: 'GLM 4.6' },
{ id: 'glm-4.7',      label: 'GLM 4.7' },
{ id: 'glm-5-turbo',  label: 'GLM 5 Turbo' },
{ id: 'glm-5.1',      label: 'GLM 5.1' },

// openrouter
{ id: 'meta-llama/llama-3.3-70b-instruct',  label: 'Llama 3.3 70B' },
{ id: 'deepseek/deepseek-v4-pro',           label: 'DeepSeek V4 Pro' },
{ id: 'z-ai/glm-4.6',                       label: 'GLM 4.6' },
{ id: 'openai/gpt-5.4',                     label: 'GPT-5.4' },
{ id: 'google/gemini-3-pro',                label: 'Gemini 3 Pro' },
{ id: 'anthropic/claude-opus-4-7',          label: 'Claude Opus 4.7' },

// groq
{ id: 'llama-3.1-8b-instant',          label: 'Llama 3.1 8B Instant' },
{ id: 'gemma2-9b-it',                  label: 'Gemma 2 9B' },
{ id: 'qwen-2.5-32b',                  label: 'Qwen 2.5 32B' },
{ id: 'mixtral-8x7b-32768',            label: 'Mixtral 8x7B' },
{ id: 'llama-3.3-70b-versatile',       label: 'Llama 3.3 70B' },
{ id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B' },

// together
{ id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo' },
{ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',      label: 'Llama 3.3 70B Turbo' },
{ id: 'deepseek-ai/DeepSeek-V3',                      label: 'DeepSeek V3' },
{ id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',              label: 'Qwen 2.5 72B Turbo' },
{ id: 'mistralai/Mixtral-8x22B-Instruct-v0.1',        label: 'Mixtral 8x22B' },

// fireworks
{ id: 'accounts/fireworks/models/llama-v3p3-70b-instruct',  label: 'Llama 3.3 70B' },
{ id: 'accounts/fireworks/models/qwen2p5-72b-instruct',     label: 'Qwen 2.5 72B' },
{ id: 'accounts/fireworks/models/mixtral-8x22b-instruct',   label: 'Mixtral 8x22B' },
{ id: 'accounts/fireworks/routers/kimi-k2p5-turbo',         label: 'Kimi K2.5 Turbo' },
{ id: 'accounts/fireworks/models/deepseek-v3p1',            label: 'DeepSeek V3.1' },
```

`modelsForProvider(p)` becomes a thin wrapper: `getProvider(p)?.models.map(m => m.id) ?? []` — keep it for back-compat but Settings will read `getProvider(p)?.models` directly for label+id.

`pickModelForProvider` is removed entirely. `callLLM` reads `storage.getLLMModel()`; if empty or no longer in `getProvider(provider).models`, falls back to `getProvider(provider).models[0].id` (first model in registry order). No hidden tier mapping.

**Migration:** stale `koko.tierMode` / `koko.modelOverrides` localStorage keys are left orphaned (harmless). No active read path references them after this change.

Commit subject: `refactor(llm): drop tier system, single direct model selection per provider`.

#### Task R2: SearchableSelect component (unchanged from old Task 9)

Same as Task 9 from original plan. No change needed.

#### Task R3: Settings UI rewrite — provider + model dropdowns only

**Files modified:** `src/routes/Settings.tsx`

Replace entire route. Final UI:
- LLM key input + detection badge + searchable provider dropdown (override)
- Searchable model dropdown (scoped to selected provider; shows full model list)
- YouTube key input
- Save button

Drop entirely:
- `TIERS` const
- `TASKS` const
- `tier` state
- `overrides` state
- `advanced` toggle
- `availableModels` derivation via `modelsForProvider`
- Tier section JSX
- Per-task override JSX

New state shape:
```tsx
const [llmKey, setLlmKey] = useState('');
const [llmProvider, setLlmProvider] = useState<LLMProvider | ''>('');
const [llmModel, setLlmModel] = useState<string>('');
const [youtubeKey, setYoutubeKey] = useState('');
```

When provider changes: if current `llmModel` is not in new provider's model list, reset `llmModel` to first model in that provider's list.

Save persists: `setLLMKey`, `setLLMProvider`, `setLLMModel`, `setYoutubeKey`.

Model dropdown options:
```tsx
const modelOptions: SelectOption[] = useMemo(() => {
  const def = llmProvider ? getProvider(llmProvider) : undefined;
  return def?.models.map((m) => ({ value: m.id, label: m.label, hint: m.id })) ?? [];
}, [llmProvider]);
```

Commit subject: `feat(settings): direct provider + model picker, drop tier UI`.

#### Task R4: Help docs simplification

**Files modified:** `src/routes/Help.tsx`, `src/components/MissingKeyBanner.tsx`

- Drop tier explanation entirely from Help.
- Replace per-provider hardcoded sections with a registry-driven loop showing label, API style, console URL.
- `MissingKeyBanner` copy generalized as in original plan Task 12.

Commit subject: `docs(help): list 12 providers from registry; drop tier explanation`.

#### Task R5: Final verification (smoke + tests + commit)

Same as old Task 13 minus the tier-related smoke scenarios. New smoke matrix:

| Scenario | Action | Expect |
|---|---|---|
| Anthropic key | paste valid key | "Detected: Anthropic"; model dropdown shows 4 Claude models |
| OpenRouter key | paste `sk-or-v1-` + 64 hex | "Detected: OpenRouter"; model dropdown shows 6 routed models |
| Provider switch | switch from OpenRouter to Anthropic | model auto-resets to first Anthropic model |
| Search models | type "opus" in model dropdown | filters to opus entries |
| Save persists | save, reload | provider + model + keys all restored |
| Real call | trigger triage analysis with valid key | succeeds with selected model |
