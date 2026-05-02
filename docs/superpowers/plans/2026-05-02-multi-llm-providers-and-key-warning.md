# Multi-LLM Providers + Missing-Key Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic-only key field with a single auto-detecting LLM key field that supports Anthropic, OpenAI, and Google Gemini, plus a visible banner warning users when a required key is missing.

**Architecture:** Introduce a provider-abstraction layer (`src/lib/llm/`) with one adapter per provider behind a shared interface. Detect the provider from the key prefix; let the user disambiguate `AIza` (Gemini vs YouTube). Keep the tier ladder concept (Eco / Standard / Max) but map it per-provider. Migrate existing `claude.ts` task functions to call the abstraction layer. Add a `MissingKeyBanner` component shown above routes that need keys.

**Tech Stack:** Vite + React + TS + Tailwind, react-router-dom, zod, vitest. Adds two SDKs: `openai` and `@google/genai`. Existing `@anthropic-ai/sdk` stays.

---

## File Structure

**New files:**
- `src/lib/llm/types.ts` — provider/model/task types, tier→model map type.
- `src/lib/llm/detect.ts` — pure key→provider classifier.
- `src/lib/llm/models.ts` — per-provider tier ladders + display labels.
- `src/lib/llm/adapter.ts` — shared adapter interface and shared content-block type.
- `src/lib/llm/anthropic.ts` — Anthropic adapter (lifted from existing `claude.ts`).
- `src/lib/llm/openai.ts` — OpenAI adapter using function calling for structured output.
- `src/lib/llm/gemini.ts` — Gemini adapter using function declarations for structured output.
- `src/lib/llm/index.ts` — `pickModel`, `getAdapter`, `callLLM` entrypoints.
- `src/lib/llm/tasks.ts` — `analyzeTriage`, `analyzeDeep`, `explainOutlier`, `synthesize` re-implemented on top of `callLLM` (replaces the bodies in `claude.ts`).
- `src/lib/llm/detect.test.ts` — vitest unit tests for prefix detection.
- `src/lib/llm/models.test.ts` — vitest unit tests for tier→model picking.
- `src/components/MissingKeyBanner.tsx` — banner shown when an LLM or YouTube key is missing.

**Modified files:**
- `src/lib/storage.ts` — replace `anthropicKey` with `llmKey` + `llmProvider`; one-time migration from `koko.anthropicKey`. Keep `youtubeKey` as-is. Update model-overrides type to use `LLMTask` + `LLMModelId`.
- `src/lib/claude.ts` — re-export task functions from `src/lib/llm/tasks.ts` for back-compat, or delete this file once callers move. Plan deletes it (callers updated in Task 9).
- `src/types.ts` — rename `ClaudeTask` → `LLMTask`, replace `ClaudeModel` union with `LLMModelId` union covering all three providers; export `LLMProvider`.
- `src/routes/Settings.tsx` — single LLM key field with detected-provider badge; provider override dropdown when ambiguous; tier ladder labels reflect detected provider; advanced override list adapts to provider.
- `src/routes/Channel.tsx`, `src/routes/VideoAnalysis.tsx`, `src/routes/Watchlist.tsx` — render `MissingKeyBanner` at the top, gate "run analysis" buttons on key presence.
- `src/routes/Help.tsx` — add OpenAI and Gemini sections; reframe Anthropic section as "Anthropic (Claude)"; clarify single-key field.
- `package.json` — add `openai`, `@google/genai`, `zod-to-json-schema` deps.

**Deleted files:**
- `src/lib/claude.ts` — superseded by `src/lib/llm/tasks.ts` (after callers updated).

---

## Task 1: Add SDK and schema-conversion dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install openai@^4.79.0 @google/genai@^0.2.0 zod-to-json-schema@^3.23.0
```
Expected: clean install, lockfile updated, no peer-dep errors.

- [ ] **Step 2: Verify versions installed**

Run: `npm ls openai @google/genai zod-to-json-schema`
Expected: all three printed at the requested versions.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add openai, @google/genai, zod-to-json-schema for multi-LLM support"
```

---

## Task 2: Define provider/model/task types

**Files:**
- Create: `src/lib/llm/types.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Create `src/lib/llm/types.ts` with the provider/model unions**

```ts
export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

export type AnthropicModelId =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7';

export type OpenAIModelId =
  | 'gpt-5.4-nano'
  | 'gpt-5.4-mini'
  | 'gpt-5.4';

export type GeminiModelId =
  | 'gemini-flash-lite'
  | 'gemini-flash'
  | 'gemini-pro';

export type LLMModelId = AnthropicModelId | OpenAIModelId | GeminiModelId;

export type LLMTask = 'triage' | 'deep' | 'outlierWhy' | 'synthesis';

export type TierMode = 'eco' | 'standard' | 'max';

export interface ProviderTierLadder {
  eco: LLMModelId;
  standard: LLMModelId;
  max: LLMModelId;
  synthesisMax: LLMModelId;
}
```

- [ ] **Step 2: Update `src/types.ts` to remove the old `ClaudeTask`/`ClaudeModel` unions and re-export from the new file**

Replace the lines `export type ClaudeTask = ...` and `export type ClaudeModel = ...` with:

```ts
export type {
  LLMProvider,
  LLMTask,
  LLMModelId,
  AnthropicModelId,
  OpenAIModelId,
  GeminiModelId,
  TierMode,
} from './lib/llm/types';
```

(`TierMode` was previously defined in `types.ts`; remove the old `export type TierMode = ...` line so the re-export is the only definition.)

- [ ] **Step 3: Run the type checker**

Run: `npx tsc --noEmit`
Expected: a list of errors in files that still reference `ClaudeTask`/`ClaudeModel` — that is fine, we fix those in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/types.ts src/types.ts
git commit -m "feat(llm): add LLMProvider/LLMTask/LLMModelId types"
```

---

## Task 3: Provider detection from key prefix

**Files:**
- Create: `src/lib/llm/detect.ts`
- Test: `src/lib/llm/detect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/llm/detect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectProvider } from './detect';

describe('detectProvider', () => {
  it('empty string → unknown', () => {
    expect(detectProvider('')).toEqual({ kind: 'unknown' });
  });
  it('sk-ant- → anthropic', () => {
    expect(detectProvider('sk-ant-abc123')).toEqual({ kind: 'detected', provider: 'anthropic' });
  });
  it('sk-proj- → openai', () => {
    expect(detectProvider('sk-proj-abc123')).toEqual({ kind: 'detected', provider: 'openai' });
  });
  it('plain sk- → openai', () => {
    expect(detectProvider('sk-abc123')).toEqual({ kind: 'detected', provider: 'openai' });
  });
  it('AIza → ambiguous (gemini or youtube)', () => {
    expect(detectProvider('AIzaSyAbc123')).toEqual({
      kind: 'ambiguous',
      candidates: ['gemini'],
    });
  });
  it('whitespace trimmed', () => {
    expect(detectProvider('  sk-ant-abc  ')).toEqual({ kind: 'detected', provider: 'anthropic' });
  });
  it('unrecognized prefix → unknown', () => {
    expect(detectProvider('foobar123')).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/llm/detect.test.ts`
Expected: FAIL with "Cannot find module './detect'".

- [ ] **Step 3: Write the detector**

Create `src/lib/llm/detect.ts`:

```ts
import type { LLMProvider } from './types';

export type DetectResult =
  | { kind: 'detected'; provider: LLMProvider }
  | { kind: 'ambiguous'; candidates: LLMProvider[] }
  | { kind: 'unknown' };

export function detectProvider(rawKey: string): DetectResult {
  const key = rawKey.trim();
  if (!key) return { kind: 'unknown' };
  if (key.startsWith('sk-ant-')) return { kind: 'detected', provider: 'anthropic' };
  if (key.startsWith('sk-')) return { kind: 'detected', provider: 'openai' };
  if (key.startsWith('AIza')) return { kind: 'ambiguous', candidates: ['gemini'] };
  return { kind: 'unknown' };
}
```

Note: `AIza` keys can be either Gemini or YouTube. Since the YouTube key has its own field, the `LLM key` field treats `AIza` as Gemini by default but we still surface it as `ambiguous` so the UI can render an explicit "Is this a Gemini key?" confirmation. Future-proofs adding more `AIza`-using LLM providers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/llm/detect.test.ts`
Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/detect.ts src/lib/llm/detect.test.ts
git commit -m "feat(llm): add prefix-based provider detector"
```

---

## Task 4: Per-provider tier ladders + model picker

**Files:**
- Create: `src/lib/llm/models.ts`
- Test: `src/lib/llm/models.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/llm/models.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TIER_LADDER, pickModelForProvider, modelLabel } from './models';

describe('TIER_LADDER', () => {
  it('has anthropic, openai, gemini', () => {
    expect(Object.keys(TIER_LADDER).sort()).toEqual(['anthropic', 'gemini', 'openai']);
  });
});

describe('pickModelForProvider', () => {
  it('eco anthropic triage → haiku', () => {
    expect(pickModelForProvider('anthropic', 'eco', 'triage')).toBe('claude-haiku-4-5');
  });
  it('eco anthropic synthesis → sonnet (synthesis floor)', () => {
    expect(pickModelForProvider('anthropic', 'eco', 'synthesis')).toBe('claude-sonnet-4-6');
  });
  it('max anthropic synthesis → opus', () => {
    expect(pickModelForProvider('anthropic', 'max', 'synthesis')).toBe('claude-opus-4-7');
  });
  it('standard openai triage → gpt-5.4-mini', () => {
    expect(pickModelForProvider('openai', 'standard', 'triage')).toBe('gpt-5.4-mini');
  });
  it('eco gemini deep → flash-lite', () => {
    expect(pickModelForProvider('gemini', 'eco', 'deep')).toBe('gemini-flash-lite');
  });
  it('max gemini synthesis → pro', () => {
    expect(pickModelForProvider('gemini', 'max', 'synthesis')).toBe('gemini-pro');
  });
});

describe('modelLabel', () => {
  it('returns a human label for known model', () => {
    expect(modelLabel('claude-haiku-4-5')).toContain('Haiku');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/llm/models.test.ts`
Expected: FAIL with "Cannot find module './models'".

- [ ] **Step 3: Write the model module**

Create `src/lib/llm/models.ts`:

```ts
import type { LLMModelId, LLMProvider, LLMTask, ProviderTierLadder, TierMode } from './types';

export const TIER_LADDER: Record<LLMProvider, ProviderTierLadder> = {
  anthropic: {
    eco: 'claude-haiku-4-5',
    standard: 'claude-sonnet-4-6',
    max: 'claude-sonnet-4-6',
    synthesisMax: 'claude-opus-4-7',
  },
  openai: {
    eco: 'gpt-5.4-nano',
    standard: 'gpt-5.4-mini',
    max: 'gpt-5.4',
    synthesisMax: 'gpt-5.4',
  },
  gemini: {
    eco: 'gemini-flash-lite',
    standard: 'gemini-flash',
    max: 'gemini-flash',
    synthesisMax: 'gemini-pro',
  },
};

export function pickModelForProvider(
  provider: LLMProvider,
  tier: TierMode,
  task: LLMTask
): LLMModelId {
  const ladder = TIER_LADDER[provider];
  if (tier === 'eco') {
    return task === 'synthesis' ? ladder.standard : ladder.eco;
  }
  if (tier === 'max') {
    return task === 'synthesis' ? ladder.synthesisMax : ladder.max;
  }
  switch (task) {
    case 'triage':
    case 'outlierWhy':
      return ladder.eco;
    case 'deep':
    case 'synthesis':
      return ladder.standard;
  }
}

const LABELS: Record<LLMModelId, string> = {
  'claude-haiku-4-5': 'Haiku 4.5 (cheap)',
  'claude-sonnet-4-6': 'Sonnet 4.6 (default)',
  'claude-opus-4-7': 'Opus 4.7 (premium)',
  'gpt-5.4-nano': 'GPT-5.4 nano (cheap)',
  'gpt-5.4-mini': 'GPT-5.4 mini (default)',
  'gpt-5.4': 'GPT-5.4 (premium)',
  'gemini-flash-lite': 'Gemini Flash Lite (cheap)',
  'gemini-flash': 'Gemini Flash (default)',
  'gemini-pro': 'Gemini Pro (premium)',
};

export function modelLabel(id: LLMModelId): string {
  return LABELS[id];
}

export function modelsForProvider(provider: LLMProvider): LLMModelId[] {
  const ladder = TIER_LADDER[provider];
  const set = new Set<LLMModelId>([ladder.eco, ladder.standard, ladder.max, ladder.synthesisMax]);
  return [...set];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/llm/models.test.ts`
Expected: 8 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/models.ts src/lib/llm/models.test.ts
git commit -m "feat(llm): add per-provider tier ladder and model picker"
```

---

## Task 5: Shared adapter interface + content blocks

**Files:**
- Create: `src/lib/llm/adapter.ts`

- [ ] **Step 1: Write the adapter interface**

Create `src/lib/llm/adapter.ts`:

```ts
import type { z } from 'zod';
import type { LLMModelId, LLMTask } from './types';

export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
      base64: string;
    };

export interface CallOptions<T> {
  task: LLMTask;
  model: LLMModelId;
  systemPrompt: string;
  content: ContentBlock[];
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export interface LLMAdapter {
  call<T>(opts: CallOptions<T>): Promise<T>;
}
```

The adapter interface is provider-neutral: the caller hands over the system prompt, content, the tool name/description that anchors the structured-output call, the Zod schema (used both to derive the JSON schema for the provider and to validate the response), and the model id. Each provider adapter is responsible for converting the content blocks and the JSON schema into its own SDK shape.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: errors are limited to files that still reference `ClaudeTask`/`ClaudeModel` (cleaned up in later tasks). No new errors in `adapter.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/adapter.ts
git commit -m "feat(llm): add shared LLMAdapter interface and ContentBlock type"
```

---

## Task 6: Anthropic adapter (port of existing logic)

**Files:**
- Create: `src/lib/llm/anthropic.ts`

- [ ] **Step 1: Write the Anthropic adapter**

Create `src/lib/llm/anthropic.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';

function toAnthropicContent(blocks: ContentBlock[]): Anthropic.MessageParam['content'] {
  return blocks.map((b) =>
    b.type === 'text'
      ? { type: 'text', text: b.text }
      : {
          type: 'image',
          source: { type: 'base64', media_type: b.mediaType, data: b.base64 },
        }
  ) as unknown as Anthropic.MessageParam['content'];
}

export function makeAnthropicAdapter(apiKey: string): LLMAdapter {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
  });
  return {
    async call<T>(opts: CallOptions<T>): Promise<T> {
      const inputSchema = zodToJsonSchema(opts.schema, { target: 'jsonSchema7' }) as Record<string, unknown>;
      delete (inputSchema as { $schema?: string }).$schema;
      const tool = {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: inputSchema as Anthropic.Tool['input_schema'],
      } satisfies Anthropic.Tool;
      const resp = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        tools: [tool],
        tool_choice: { type: 'tool', name: opts.toolName },
        messages: [{ role: 'user', content: toAnthropicContent(opts.content) }],
      });
      const block = resp.content.find((b) => b.type === 'tool_use');
      if (!block || block.type !== 'tool_use') {
        throw new Error('Anthropic did not return tool_use');
      }
      return opts.schema.parse(block.input);
    },
  };
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/llm/anthropic.ts`. Pre-existing errors in `claude.ts`/`Settings.tsx` remain.

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/anthropic.ts
git commit -m "feat(llm): add Anthropic adapter using zod-derived tool schema"
```

---

## Task 7: OpenAI adapter

**Files:**
- Create: `src/lib/llm/openai.ts`

- [ ] **Step 1: Write the OpenAI adapter**

Create `src/lib/llm/openai.ts`:

```ts
import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';

function toOpenAIContent(blocks: ContentBlock[]): OpenAI.Chat.ChatCompletionContentPart[] {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    return {
      type: 'image_url',
      image_url: { url: `data:${b.mediaType};base64,${b.base64}` },
    };
  });
}

export function makeOpenAIAdapter(apiKey: string): LLMAdapter {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  return {
    async call<T>(opts: CallOptions<T>): Promise<T> {
      const parameters = zodToJsonSchema(opts.schema, { target: 'jsonSchema7' }) as Record<string, unknown>;
      delete (parameters as { $schema?: string }).$schema;
      const resp = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: toOpenAIContent(opts.content) },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: opts.toolName,
              description: opts.toolDescription,
              parameters: parameters as Record<string, unknown>,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: opts.toolName } },
      });
      const call = resp.choices[0]?.message?.tool_calls?.[0];
      if (!call || call.type !== 'function') {
        throw new Error('OpenAI did not return a function call');
      }
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch (e) {
        throw new Error(`OpenAI returned invalid JSON arguments: ${(e as Error).message}`);
      }
      return opts.schema.parse(args);
    },
  };
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/llm/openai.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/openai.ts
git commit -m "feat(llm): add OpenAI adapter using function calling for structured output"
```

---

## Task 8: Gemini adapter

**Files:**
- Create: `src/lib/llm/gemini.ts`

- [ ] **Step 1: Write the Gemini adapter**

Create `src/lib/llm/gemini.ts`:

```ts
import { GoogleGenAI, Type } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';

interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
}

function toGeminiSchema(schema: JSONSchema): Record<string, unknown> {
  if (!schema.type) return {};
  const typeMap: Record<string, Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };
  const out: Record<string, unknown> = { type: typeMap[schema.type] ?? Type.STRING };
  if (schema.description) out.description = schema.description;
  if (schema.type === 'object' && schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])
    );
    if (schema.required) out.required = schema.required;
  }
  if (schema.type === 'array' && schema.items) {
    out.items = toGeminiSchema(schema.items);
  }
  return out;
}

function toGeminiContent(blocks: ContentBlock[]): Array<Record<string, unknown>> {
  return blocks.map((b) => {
    if (b.type === 'text') return { text: b.text };
    return {
      inlineData: { mimeType: b.mediaType, data: b.base64 },
    };
  });
}

export function makeGeminiAdapter(apiKey: string): LLMAdapter {
  const client = new GoogleGenAI({ apiKey });
  return {
    async call<T>(opts: CallOptions<T>): Promise<T> {
      const jsonSchema = zodToJsonSchema(opts.schema, { target: 'jsonSchema7' }) as JSONSchema;
      delete (jsonSchema as { $schema?: string }).$schema;
      const resp = await client.models.generateContent({
        model: opts.model,
        contents: [
          { role: 'user', parts: toGeminiContent(opts.content) as never },
        ],
        config: {
          systemInstruction: opts.systemPrompt,
          tools: [
            {
              functionDeclarations: [
                {
                  name: opts.toolName,
                  description: opts.toolDescription,
                  parameters: toGeminiSchema(jsonSchema) as never,
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: 'ANY' as never,
              allowedFunctionNames: [opts.toolName],
            },
          },
          maxOutputTokens: opts.maxTokens,
        },
      });
      const candidate = resp.candidates?.[0];
      const part = candidate?.content?.parts?.find((p) => p.functionCall);
      if (!part?.functionCall?.args) {
        throw new Error('Gemini did not return a function call');
      }
      return opts.schema.parse(part.functionCall.args);
    },
  };
}
```

Note: `zod-to-json-schema` produces a JSON-schema-shaped object; Gemini wants its own enum-typed schema, so we walk the JSON schema recursively. This handles the structures our prompts emit (string, number, array of objects, nested object); it does not need to handle every JSON Schema feature.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/llm/gemini.ts`. If `@google/genai` exports differ in the installed version, adjust the imports to match — the public surface used here is `GoogleGenAI`, `Type`, `client.models.generateContent`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/gemini.ts
git commit -m "feat(llm): add Gemini adapter using function declarations for structured output"
```

---

## Task 9: LLM entrypoint and `callLLM`

**Files:**
- Create: `src/lib/llm/index.ts`

- [ ] **Step 1: Write the entrypoint**

Create `src/lib/llm/index.ts`:

```ts
import type { z } from 'zod';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';
import { makeAnthropicAdapter } from './anthropic';
import { makeOpenAIAdapter } from './openai';
import { makeGeminiAdapter } from './gemini';
import { pickModelForProvider } from './models';
import type { LLMProvider, LLMTask } from './types';
import { storage } from '../storage';

function adapterFor(provider: LLMProvider, apiKey: string): LLMAdapter {
  switch (provider) {
    case 'anthropic':
      return makeAnthropicAdapter(apiKey);
    case 'openai':
      return makeOpenAIAdapter(apiKey);
    case 'gemini':
      return makeGeminiAdapter(apiKey);
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

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: errors come from missing `getLLMKey` / `getLLMProvider` on `storage` (added in Task 10) and remaining `claude.ts` references. No other new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/index.ts
git commit -m "feat(llm): add callLLM entrypoint with provider-aware model picker"
```

---

## Task 10: Storage migration to single LLM key + provider

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Replace the storage exports**

Replace the entire body of `src/lib/storage.ts` with:

```ts
import type { Channel, DeepAnalysis, LLMModelId, LLMProvider, LLMTask, PlatformId, TierMode, TriageResult } from '../types';

const KEY = {
  llmKey: 'koko.llmKey',
  llmProvider: 'koko.llmProvider',
  legacyAnthropicKey: 'koko.anthropicKey',
  youtubeKey: 'koko.youtubeKey',
  tierMode: 'koko.tierMode',
  modelOverrides: 'koko.modelOverrides',
  watchlist: 'koko.watchlist',
  triageCache: (platform: PlatformId, videoId: string) => `koko.triage.${platform}.${videoId}`,
  deepCache: (platform: PlatformId, videoId: string) => `koko.deep.${platform}.${videoId}`,
} as const;

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function write<T>(k: string, v: T) {
  localStorage.setItem(k, JSON.stringify(v));
}

function migrateLegacyAnthropicKey(): void {
  const existing = read<string>(KEY.llmKey, '');
  if (existing) return;
  const legacy = read<string>(KEY.legacyAnthropicKey, '');
  if (!legacy) return;
  write(KEY.llmKey, legacy);
  write(KEY.llmProvider, 'anthropic' satisfies LLMProvider);
}

migrateLegacyAnthropicKey();

export const storage = {
  getLLMKey: () => read<string>(KEY.llmKey, ''),
  setLLMKey: (v: string) => write(KEY.llmKey, v),

  getLLMProvider: () => read<LLMProvider | ''>(KEY.llmProvider, ''),
  setLLMProvider: (v: LLMProvider | '') => write(KEY.llmProvider, v),

  getYoutubeKey: () => read<string>(KEY.youtubeKey, ''),
  setYoutubeKey: (v: string) => write(KEY.youtubeKey, v),

  getTierMode: () => read<TierMode>(KEY.tierMode, 'standard'),
  setTierMode: (v: TierMode) => write(KEY.tierMode, v),

  getModelOverrides: () => read<Partial<Record<LLMTask, LLMModelId>>>(KEY.modelOverrides, {}),
  setModelOverrides: (v: Partial<Record<LLMTask, LLMModelId>>) => write(KEY.modelOverrides, v),

  getWatchlist: () => read<Channel[]>(KEY.watchlist, []),
  setWatchlist: (v: Channel[]) => write(KEY.watchlist, v),
  addToWatchlist: (c: Channel) => {
    const list = storage.getWatchlist();
    if (!list.find((x) => x.platform === c.platform && x.channelId === c.channelId)) {
      list.push(c);
      storage.setWatchlist(list);
    }
  },
  removeFromWatchlist: (platform: PlatformId, channelId: string) => {
    storage.setWatchlist(storage.getWatchlist().filter((c) => !(c.platform === platform && c.channelId === channelId)));
  },

  getTriage: (platform: PlatformId, videoId: string) =>
    read<TriageResult | null>(KEY.triageCache(platform, videoId), null),
  setTriage: (platform: PlatformId, videoId: string, r: TriageResult) =>
    write(KEY.triageCache(platform, videoId), r),

  getDeep: (platform: PlatformId, videoId: string) =>
    read<DeepAnalysis | null>(KEY.deepCache(platform, videoId), null),
  setDeep: (platform: PlatformId, videoId: string, r: DeepAnalysis) =>
    write(KEY.deepCache(platform, videoId), r),
};
```

The migration runs once at module load time: if no `llmKey` is stored but `anthropicKey` is, it copies the value over and sets the provider to `anthropic`. Old key is left in place — clearing it is the user's call.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: errors are limited to `claude.ts`, `Settings.tsx` (uses old `getAnthropicKey`), and any other call site we have not yet updated. No new errors in `storage.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat(storage): replace anthropicKey with llmKey+llmProvider, migrate legacy"
```

---

## Task 11: Port task functions onto `callLLM`

**Files:**
- Create: `src/lib/llm/tasks.ts`
- Modify: `src/lib/prompts.ts`

- [ ] **Step 1: Add tool descriptions to prompts (if not already there)**

Open `src/lib/prompts.ts` and check that `taskTools` provides `name` + `description` for each task. If `description` is missing, add a one-liner per task. This step makes a no-op edit if descriptions already exist; if they don't, supply them now (read the file first, then add a `description` field to each entry under `taskTools`).

- [ ] **Step 2: Create the task wrapper**

Create `src/lib/llm/tasks.ts`:

```ts
import { callLLM, type ContentBlock } from './index';
import { storage } from '../storage';
import { systemPrompts, taskTools, triageSchema, deepSchema, outlierWhySchema, synthesisSchema } from '../prompts';
import { fullText, sliceByTime } from '../transcript';
import type { DeepAnalysis, TranscriptSegment, TriageResult, Video } from '../../types';

export async function imageUrlToBase64(url: string): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`thumbnail fetch failed: ${res.status}`);
  const blob = await res.blob();
  const mediaType = (blob.type === 'image/png' || blob.type === 'image/webp' || blob.type === 'image/jpeg')
    ? (blob.type as 'image/jpeg' | 'image/png' | 'image/webp')
    : 'image/jpeg';
  const buf = await blob.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return { data: btoa(bin), mediaType };
}

export async function analyzeTriage(
  video: Video,
  thumb: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' },
  hookTranscript: string
): Promise<TriageResult> {
  const cached = storage.getTriage(video.platform, video.videoId);
  if (cached) return cached;
  const tool = taskTools.triage;
  const content: ContentBlock[] = [
    { type: 'image', mediaType: thumb.mediaType, base64: thumb.data },
    {
      type: 'text',
      text: `Title: ${video.title}\nChannel: ${video.channelTitle}\nViews: ${video.viewCount}\nDuration: ${video.durationSec ?? '?'} s\n\nHook transcript (0–3s): ${hookTranscript || '(none)'}`,
    },
  ];
  const result = await callLLM<TriageResult>({
    task: 'triage',
    systemPrompt: systemPrompts.triage,
    content,
    toolName: tool.name,
    toolDescription: tool.description ?? 'record triage analysis',
    schema: triageSchema,
    maxTokens: 400,
  });
  storage.setTriage(video.platform, video.videoId, result);
  return result;
}

export async function analyzeDeep(
  video: Video,
  thumb: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' },
  transcript: TranscriptSegment[]
): Promise<DeepAnalysis> {
  const cached = storage.getDeep(video.platform, video.videoId);
  if (cached) return cached;
  const tool = taskTools.deep;
  const content: ContentBlock[] = [
    { type: 'image', mediaType: thumb.mediaType, base64: thumb.data },
    {
      type: 'text',
      text: `Title: ${video.title}\nChannel: ${video.channelTitle}\nViews: ${video.viewCount}\nDuration: ${video.durationSec ?? '?'} s`,
    },
    { type: 'text', text: `Hook (0–3s): ${sliceByTime(transcript, 0, 3) || '(no captions in window)'}` },
    { type: 'text', text: `Full transcript:\n${fullText(transcript) || '(no captions)'}` },
  ];
  const result = await callLLM<DeepAnalysis>({
    task: 'deep',
    systemPrompt: systemPrompts.deep,
    content,
    toolName: tool.name,
    toolDescription: tool.description ?? 'record deep analysis',
    schema: deepSchema,
    maxTokens: 1500,
  });
  storage.setDeep(video.platform, video.videoId, result);
  return result;
}

export async function explainOutlier(video: Video, ratio: number): Promise<{ reason: string }> {
  const tool = taskTools.outlierWhy;
  return callLLM<{ reason: string }>({
    task: 'outlierWhy',
    systemPrompt: systemPrompts.outlierWhy,
    content: [
      {
        type: 'text',
        text: `Video "${video.title}" by ${video.channelTitle} got ${video.viewCount.toLocaleString()} views, which is ${ratio.toFixed(1)}x the channel's median for recent uploads. Why might it have over-performed? One sentence.`,
      },
    ],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record outlier explanation',
    schema: outlierWhySchema,
    maxTokens: 150,
  });
}

export async function synthesize(deepAnalyses: DeepAnalysis[], niche?: string) {
  const tool = taskTools.synthesis;
  const text = deepAnalyses.map((a, i) => `--- Video ${i + 1} ---\n${JSON.stringify(a, null, 2)}`).join('\n\n');
  return callLLM<ReturnType<typeof synthesisSchema.parse>>({
    task: 'synthesis',
    systemPrompt: systemPrompts.synthesis,
    content: [
      { type: 'text', text: niche ? `Niche: ${niche}` : 'Niche: (general)' },
      { type: 'text', text: `Analyses:\n${text}` },
    ],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record synthesis',
    schema: synthesisSchema,
    maxTokens: 2000,
  });
}
```

- [ ] **Step 3: Run the type checker**

Run: `npx tsc --noEmit`
Expected: only the original errors in `claude.ts`, `Settings.tsx`, `Channel.tsx`, `VideoAnalysis.tsx` remain.

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/tasks.ts src/lib/prompts.ts
git commit -m "feat(llm): port task functions to provider-agnostic callLLM"
```

---

## Task 12: Replace `src/lib/claude.ts` with re-exports, then delete

**Files:**
- Modify: `src/routes/Channel.tsx`
- Modify: `src/routes/VideoAnalysis.tsx`
- Delete: `src/lib/claude.ts`

- [ ] **Step 1: Update import in `src/routes/Channel.tsx`**

Change line 4 from:
```ts
import { analyzeTriage, explainOutlier, imageUrlToBase64 } from '../lib/claude';
```
to:
```ts
import { analyzeTriage, explainOutlier, imageUrlToBase64 } from '../lib/llm/tasks';
```

- [ ] **Step 2: Update import in `src/routes/VideoAnalysis.tsx`**

Change line 5 from:
```ts
import { analyzeDeep, imageUrlToBase64 } from '../lib/claude';
```
to:
```ts
import { analyzeDeep, imageUrlToBase64 } from '../lib/llm/tasks';
```

- [ ] **Step 3: Delete the old file**

Run: `git rm src/lib/claude.ts`
Expected: file deleted from worktree and stage.

- [ ] **Step 4: Run the type checker**

Run: `npx tsc --noEmit`
Expected: errors only in `Settings.tsx` (still uses old `ClaudeModel`/`ClaudeTask` and `getAnthropicKey`).

- [ ] **Step 5: Commit**

```bash
git add src/routes/Channel.tsx src/routes/VideoAnalysis.tsx
git commit -m "refactor: route LLM task callers to src/lib/llm/tasks.ts; remove src/lib/claude.ts"
```

---

## Task 13: Settings UI — single LLM key field with provider badge

**Files:**
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Replace `Settings.tsx` with the new shape**

Read the current file, then replace its contents with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import KeyInput from '../components/KeyInput';
import { storage } from '../lib/storage';
import { detectProvider } from '../lib/llm/detect';
import { modelLabel, modelsForProvider } from '../lib/llm/models';
import type { LLMModelId, LLMProvider, LLMTask, TierMode } from '../types';

const TASKS: { id: LLMTask; label: string; help: string }[] = [
  { id: 'triage', label: 'Triage scan', help: 'fast hook classifier across recent videos' },
  { id: 'deep', label: 'Deep analysis', help: 'full structural breakdown of a single video' },
  { id: 'outlierWhy', label: 'Outlier explanation', help: 'one-line reason a video over-performed' },
  { id: 'synthesis', label: 'Pattern synthesis', help: 'multi-video pattern + script template (v2)' },
];

const TIERS: { id: TierMode; label: string; desc: string }[] = [
  { id: 'eco', label: 'Eco', desc: 'Cheapest model from your provider for triage + deep.' },
  { id: 'standard', label: 'Standard', desc: 'Cheap for triage, default for deep + synthesis.' },
  { id: 'max', label: 'Max', desc: 'Default for triage, premium for synthesis. Spendy.' },
];

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

export default function Settings() {
  const [llmKey, setLlmKey] = useState('');
  const [llmProvider, setLlmProvider] = useState<LLMProvider | ''>('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [tier, setTier] = useState<TierMode>('standard');
  const [overrides, setOverrides] = useState<Partial<Record<LLMTask, LLMModelId>>>({});
  const [advanced, setAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLlmKey(storage.getLLMKey());
    setLlmProvider(storage.getLLMProvider());
    setYoutubeKey(storage.getYoutubeKey());
    setTier(storage.getTierMode());
    setOverrides(storage.getModelOverrides());
  }, []);

  const detected = useMemo(() => detectProvider(llmKey), [llmKey]);

  // Auto-set provider when detection is unambiguous; clear when key empty.
  useEffect(() => {
    if (!llmKey.trim()) {
      setLlmProvider('');
      return;
    }
    if (detected.kind === 'detected') {
      setLlmProvider(detected.provider);
    }
  }, [llmKey, detected]);

  const availableModels: LLMModelId[] = llmProvider ? modelsForProvider(llmProvider) : [];

  function save() {
    storage.setLLMKey(llmKey.trim());
    storage.setLLMProvider(llmProvider);
    storage.setYoutubeKey(youtubeKey.trim());
    storage.setTierMode(tier);
    // Drop overrides whose model is no longer compatible with the chosen provider.
    const compatible: Partial<Record<LLMTask, LLMModelId>> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (v && availableModels.includes(v)) compatible[k as LLMTask] = v;
    }
    storage.setModelOverrides(compatible);
    setOverrides(compatible);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">API keys</h2>

        <div className="space-y-2">
          <KeyInput
            label="LLM API key"
            value={llmKey}
            onChange={setLlmKey}
            placeholder="sk-ant-... · sk-... · AIza..."
            hint="Single field. Anthropic, OpenAI, and Gemini keys are auto-detected by prefix. Stored locally only."
          />
          {llmKey.trim() ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {detected.kind === 'detected' ? (
                <span className="px-2 py-1 rounded-full bg-koko-pink/40 text-slate-700">
                  Detected: <strong>{PROVIDER_LABELS[detected.provider]}</strong>
                </span>
              ) : detected.kind === 'ambiguous' ? (
                <>
                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-900">
                    Ambiguous prefix — please confirm:
                  </span>
                  <select
                    className="koko-input max-w-xs"
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value as LLMProvider | '')}
                  >
                    <option value="">— select provider —</option>
                    {detected.candidates.map((p) => (
                      <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-900">
                  Unrecognized key prefix. Pick provider manually below.
                </span>
              )}
              {detected.kind !== 'detected' && (
                <select
                  className="koko-input max-w-xs"
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value as LLMProvider | '')}
                >
                  <option value="">— select provider —</option>
                  <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
                  <option value="openai">{PROVIDER_LABELS.openai}</option>
                  <option value="gemini">{PROVIDER_LABELS.gemini}</option>
                </select>
              )}
            </div>
          ) : null}
        </div>

        <KeyInput
          label="Google YouTube Data API key"
          value={youtubeKey}
          onChange={setYoutubeKey}
          placeholder="AIza..."
          hint="Free 10k units/day per Google Cloud project. Used for channel + video metadata."
        />
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Model tier</h2>
        <p className="text-sm text-slate-600">
          Routes tasks to cheaper models by default. Premium tier per provider only used in Max.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              className={`text-left p-4 rounded-xl ring-1 transition ${
                tier === t.id ? 'ring-koko-pink-deep bg-koko-pink/40' : 'ring-sky-200 bg-white/60 hover:bg-white'
              }`}
            >
              <div className="font-semibold">{t.label}</div>
              <div className="text-xs text-slate-600 mt-1">{t.desc}</div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setAdvanced((a) => !a)}
          className="koko-btn-ghost text-sm"
        >
          {advanced ? '▾' : '▸'} Per-task model overrides
        </button>
        {advanced ? (
          <div className="space-y-3 border-t border-sky-100 pt-4">
            {!llmProvider ? (
              <p className="text-xs text-slate-500">Set an LLM key first to see overrides.</p>
            ) : (
              TASKS.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-slate-500">{t.help}</div>
                  </div>
                  <select
                    className="koko-input max-w-xs"
                    value={overrides[t.id] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as LLMModelId | '';
                      setOverrides((prev) => {
                        const next = { ...prev };
                        if (v === '') delete next[t.id];
                        else next[t.id] = v;
                        return next;
                      });
                    }}
                  >
                    <option value="">— tier default —</option>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{modelLabel(m)}</option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} className="koko-btn">Save</button>
        {saved ? <span className="text-sm text-koko-pink-deep font-medium">saved ✓</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`
Open the app, go to Settings, and verify:
- One "LLM API key" field is present.
- Pasting `sk-ant-test` shows "Detected: Anthropic (Claude)".
- Pasting `sk-test` shows "Detected: OpenAI".
- Pasting `AIzaTest` shows "Ambiguous prefix" + dropdown.
- Save persists, reload retains values.

Stop the dev server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Settings.tsx
git commit -m "feat(settings): single auto-detecting LLM key field with provider badge"
```

---

## Task 14: `MissingKeyBanner` component

**Files:**
- Create: `src/components/MissingKeyBanner.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/MissingKeyBanner.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { storage } from '../lib/storage';

export type RequiredKey = 'llm' | 'youtube';

interface Props {
  needs: RequiredKey[];
}

export default function MissingKeyBanner({ needs }: Props) {
  const missing: RequiredKey[] = [];
  if (needs.includes('llm') && (!storage.getLLMKey() || !storage.getLLMProvider())) {
    missing.push('llm');
  }
  if (needs.includes('youtube') && !storage.getYoutubeKey()) {
    missing.push('youtube');
  }
  if (missing.length === 0) return null;

  const labels = missing.map((k) => (k === 'llm' ? 'LLM API' : 'YouTube Data API'));
  const summary =
    labels.length === 1
      ? `${labels[0]} key is missing.`
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} keys are missing.`;

  return (
    <div className="mb-6 rounded-xl ring-1 ring-rose-200 bg-rose-50 p-4 flex items-start gap-3">
      <span aria-hidden className="text-rose-600 font-bold">!</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-rose-900">{summary}</p>
        <p className="text-xs text-rose-800 mt-1">
          Analysis and data fetches won't work until keys are saved.{' '}
          <Link to="/settings" className="underline font-medium">Open Settings</Link>
          {' · '}
          <Link to="/help" className="underline font-medium">How to get keys</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/MissingKeyBanner.tsx
git commit -m "feat(ui): MissingKeyBanner shows when LLM or YouTube key is unset"
```

---

## Task 15: Render `MissingKeyBanner` on routes that need keys

**Files:**
- Modify: `src/routes/Watchlist.tsx`
- Modify: `src/routes/Channel.tsx`
- Modify: `src/routes/VideoAnalysis.tsx`

- [ ] **Step 1: Add the banner to Watchlist**

Open `src/routes/Watchlist.tsx`. Add this import near the other imports:

```ts
import MissingKeyBanner from '../components/MissingKeyBanner';
```

Then in the returned JSX, render `<MissingKeyBanner needs={['youtube']} />` as the first child of the outermost wrapper.

- [ ] **Step 2: Add the banner to Channel**

Open `src/routes/Channel.tsx`. Add the same import. In the returned JSX, render `<MissingKeyBanner needs={['llm', 'youtube']} />` as the first child.

- [ ] **Step 3: Add the banner to VideoAnalysis**

Open `src/routes/VideoAnalysis.tsx`. Add the same import. In the returned JSX, render `<MissingKeyBanner needs={['llm', 'youtube']} />` as the first child.

- [ ] **Step 4: Run the type checker**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`
Verify:
- With both keys cleared, all three routes show the banner.
- After saving keys in Settings, banners disappear on reload.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Watchlist.tsx src/routes/Channel.tsx src/routes/VideoAnalysis.tsx
git commit -m "feat(ui): show MissingKeyBanner on watchlist/channel/video routes"
```

---

## Task 16: Update Help page for multi-provider keys

**Files:**
- Modify: `src/routes/Help.tsx`

- [ ] **Step 1: Replace the Anthropic section and add OpenAI + Gemini sections**

Read the current `src/routes/Help.tsx`, then replace its contents with:

```tsx
import { Link } from 'react-router-dom';

export default function Help() {
  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-4">
        <h1 className="text-2xl font-display font-semibold">How to use kokocastles</h1>
        <p className="text-sm text-slate-600">
          kokocastles is a bring-your-own-keys app. Your API keys live exclusively in your
          browser's localStorage and are never sent to our server. The Settings page has a single
          <em> LLM API key</em> field — paste a key from Anthropic, OpenAI, or Google Gemini and the
          app auto-detects the provider from the key's prefix.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Anthropic (Claude) API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            console.anthropic.com
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Sign up or log in.</li>
          <li>Open <strong>API Keys</strong> in the sidebar.</li>
          <li>Click <strong>Create Key</strong>, name it anything.</li>
          <li>Copy the key (starts with <code>sk-ant-</code>) and paste it into Settings.</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Cost:</strong> pay-per-token. Eco tier uses Haiku — the cheapest model. Max tier
          uses Opus for synthesis only.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">OpenAI API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            platform.openai.com/api-keys
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Sign up or log in.</li>
          <li>Add a payment method (OpenAI requires prepaid credits).</li>
          <li>Click <strong>Create new secret key</strong>.</li>
          <li>Copy the key (starts with <code>sk-</code> or <code>sk-proj-</code>) and paste it into Settings.</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Cost:</strong> pay-per-token. Eco tier uses GPT-5.4 nano (cheapest); Max tier uses
          full GPT-5.4 for synthesis.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Google Gemini API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            aistudio.google.com/apikey
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Sign in with a Google account.</li>
          <li>Click <strong>Create API key</strong>.</li>
          <li>Copy the key (starts with <code>AIza</code>) and paste it into Settings.</li>
          <li>Settings will ask you to confirm "Gemini" — Gemini and YouTube keys share the same prefix.</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Cost:</strong> generous free tier on Flash; Pro is paid. Eco tier uses Flash Lite.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">YouTube Data API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            console.cloud.google.com/apis/credentials
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Create a Google Cloud project (or pick an existing one).</li>
          <li>Enable <strong>YouTube Data API v3</strong> in the API library.</li>
          <li>Go to <strong>Credentials → Create Credentials → API key</strong>.</li>
          <li>Paste it into the dedicated YouTube field in Settings (separate from the LLM key).</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Quota:</strong> free 10,000 units/day per Google Cloud project.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Privacy</h2>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
          <li>Keys are stored only in your browser's localStorage on this device.</li>
          <li>No backend account, no sync, no telemetry.</li>
          <li>API calls go directly from your browser to the provider.</li>
          <li>Clearing your browser data removes the keys.</li>
        </ul>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Tips</h2>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
          <li>Start in Eco tier to keep spend low while exploring.</li>
          <li>YouTube quota resets daily at midnight Pacific time.</li>
          <li>Switch providers any time by pasting a different key — the model tier maps automatically.</li>
        </ul>
      </section>

      <div>
        <Link to="/settings" className="koko-btn">Go to Settings</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Help.tsx
git commit -m "docs(help): document OpenAI and Gemini keys; reframe LLM key as auto-detect"
```

---

## Task 17: Final verification — build, run all tests, manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: all tests pass — both pre-existing (`outlier.test.ts`, `youtube.test.ts`) and new (`detect.test.ts`, `models.test.ts`).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: tsc + vite build complete with no type errors and produce `dist/`.

- [ ] **Step 3: Manual end-to-end smoke**

Run: `npm run dev`. With a real Anthropic key, run a triage on a known channel and confirm a result. Repeat with an OpenAI key and a Gemini key. Verify the missing-key banner appears when keys are cleared.

- [ ] **Step 4: Commit any incidental fixes**

If steps 1–3 surfaced trivial issues, fix them and commit:

```bash
git add -p
git commit -m "fix: post-verification adjustments"
```

If no fixes were needed, skip this step.

---

## Self-Review Notes

**Spec coverage** — checked against the three brainstorm decisions:
- Single LLM key field with auto-detect: Tasks 3, 13.
- Per-provider tier ladder with the user's chosen defaults (Anthropic Haiku/Sonnet/Opus, OpenAI nano/mini/full, Gemini flash-lite/flash/pro): Task 4.
- Visual missing-key warning: Tasks 14, 15.
- Help page updates: Task 16.
- AIza ambiguity (Gemini vs YouTube): Task 13 surfaces an explicit confirmation dropdown.
- Migration so existing users keep their saved Anthropic key: Task 10.

**Type consistency** — `LLMTask`, `LLMModelId`, `LLMProvider`, `TierMode` defined in Task 2 and used consistently from Task 4 onward. `pickModelForProvider` signature matches its callers in Task 9 and Task 13.

**Placeholder scan** — every task has concrete code or commands; no "TBD"/"similar to" left in.

**Risk note** — model IDs (`gpt-5.4-nano` etc.) are taken verbatim from the user's brainstorm answers. If those IDs are not yet released, the Task 17 smoke test will surface a 404 from the provider; in that case adjust `TIER_LADDER` in `src/lib/llm/models.ts` to the actual current IDs. The architecture does not change.
