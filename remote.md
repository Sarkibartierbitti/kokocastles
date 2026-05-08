# remote.md — Cloud Agent Directives

Branch: `remote-dev` (origin: `https://github.com/Sarkibartierbitti/kokocastles`).
This file is the contract between the human owner and recurring cloud agents.

## Mission

Keep the kokocastles extension shipping. Every 1.5h, an opus agent wakes up and
performs ONE iteration of work on this branch. Iterations stack — five or six
of them constitute roughly 9h of unattended progress.

## Iteration Decision Tree

For every iteration, in order:

### Step 1 — Triage

Run these checks and write findings to your scratch context:

```bash
# Where are we?
git log --oneline -10
git status
gh pr list --head remote-dev 2>/dev/null || true

# Unfinished plans?
ls docs/superpowers/plans/ 2>/dev/null
grep -lE "^- \[ \]" docs/superpowers/plans/*.md 2>/dev/null

# Open bug reports / TODOs added since last iteration?
git log --since="2 hours ago" --grep="TODO\|FIXME\|bug" --oneline
grep -rn "FIXME\|TODO" extension/src/ 2>/dev/null | head -20
```

### Step 2 — Pick exactly ONE of these tracks

**Track A — Unfinished plan exists.**
Open the plan, locate the first unchecked step, invoke
`superpowers:executing-plans` (or `subagent-driven-development` if subagents
available), execute one task block, commit + push. Stop after one task — leave
remaining tasks for next iteration unless they are tightly coupled.

**Track B — Reported bug exists** (in `remote.md` "Open Bugs" section below, or
as a TODO/FIXME comment, or as a recent commit message tagged "bug").
Use `superpowers:systematic-debugging`, write a failing test first
(`superpowers:test-driven-development`), implement fix, verify, commit, push.

**Track C — No plans, no bugs.**
Use `superpowers:brainstorming` to explore "what is the next user-visible
improvement to this extension?", then `superpowers:writing-plans` to draft a
plan into `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`, commit the plan.
**Do not start implementing it the same iteration** — leave for the next
agent (this caps blast radius per iteration).

**Track D — Five+ plans already drafted, no clear bugs, brainstorm space empty.**
Adapt the extension to Instagram or TikTok. Specifically:
- Pick whichever platform is least covered (`extension/src/lib/platforms/`).
- Add a content script for that platform's channel/profile page that returns
  `ScrapedVideo[]` matching the existing YouTube content-script contract.
- Wire it into the existing background `scrape-active-tab` and `scrape-url`
  handlers (kind: 'channel'/'search' switch already exists; just match URL
  pattern in `manifest.matches`).

### Step 3 — Verify

Before committing anything:

```bash
cd extension
npm run compile          # tsc --noEmit must be clean
npm test                 # all tests pass
npm run build 2>&1 | tail -3   # build clean
```

If anything breaks, do NOT commit. Either fix or roll the iteration back with
`git stash` and write the failure into the "Open Bugs" section of this file
for the next agent to address.

### Step 4 — Commit + push

Conventional Commits format. Keep PRs out of scope — this branch is push-only;
human owner reviews the branch directly. Always:

```bash
git add <specific files, never -A>
git commit -m "<type>(extension): <terse summary>

<body if needed>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

### Step 5 — Update this file

Append a line to "Iteration Log" below: timestamp, track chosen, commit SHA,
one-sentence outcome. Keep the log to last 30 entries — trim from top.

If you discovered a new bug while working, add it to "Open Bugs". If you
finished a plan, move it to "Completed Plans" and remove the file from
`docs/superpowers/plans/`.

---

## Hard Rules

1. **Never default to Opus inside generated code.** Routing is in
   `extension/src/lib/claude.ts → pickModel`. See user memory
   `feedback_model_cost.md`.

2. **Multi-platform discipline.** Don't bake YouTube-only assumptions into new
   code. Use the adapter pattern. See user memory
   `feedback_platform_abstraction.md`.

3. **No auto-implement after planning** (except where this file's iteration
   decision tree explicitly says so). Plans drafted in Track C wait for the
   next iteration. See user memory `feedback_no_auto_implement.md`.

4. **One commit per logical unit.** Don't pile a plan, a bugfix, and a
   refactor into one commit. Cloud agents review by reading commits.

5. **Verify before claim.** `superpowers:verification-before-completion`. Never
   write "fixed X" in a commit unless tests prove it.

6. **Stack:** Vite + React + TS + Tailwind + wxt. State in localStorage.
   Anthropic SDK browser-direct. Theme: `koko-sky` `#BAE6FD`, `koko-pink`
   `#FBCFE8`.

7. **Branch hygiene.** Stay on `remote-dev`. Do not merge to `main` or
   `feat/multi-llm-providers`. Human owner handles integration.

---

## Initial Things to Implement (priority order)

### 1. Manual smoke test of Phase C (just shipped, untested in browser)

Phase C plan: `docs/superpowers/plans/2026-05-02-phase-C-niche-scan-and-cross-channel.md`.
Implementation merged in commits `f51e25a..d06e529` on this branch's parent
(`feat/multi-llm-providers`). Tasks 0–9 done at the code level (tsc clean,
58/58 tests, build clean). Task 9 step 2 manual smoke matrix is **not**
verified in a real browser. Cloud agent should:

- Run `cd extension && npx web-ext run --source-dir=.output/firefox-mv2`
  (headless if possible — `xvfb-run` wrapper acceptable).
- Walk the manual smoke matrix from the plan (lines 980–991).
- For any row that fails, file under "Open Bugs" below with the exact failure.

### 2. Apply post-Phase-C debug findings

Two read-only sonnet investigators flagged the following on 2026-05-02. Apply
in order (each is small + isolated; one commit each):

- **`extension/src/app/routes/Channel.tsx:34-38` — `matchesChannel` mismatch.**
  `info.identifier` from `classifyUrl` is `@handle`; route param `channelId`
  is `UCxxx`. Never matches → "Refresh from active tab" button never renders.
  Fix: relax to also accept `info.url.includes(channelId)` OR additionally
  match `kind === 'channel'` when URL is on youtube.com.

- **`extension/src/entrypoints/youtube*.content.ts` — `ytInitialData` 3s race.**
  Injected script fires CustomEvent to read `window.ytInitialData`. If timeout
  fires first, `detail` resolves null → "ytInitialData missing" → UI empty
  despite scrape "succeeding". Fix: bump timeout to 5–8s, OR (cleaner) read
  `ytInitialData` inside the injected script and stringify into
  `event.detail`. Either fix should be covered by a unit test that mocks the
  injected-script timing.

- **`extension/src/entrypoints/background.ts:114` — wrong rejection-handler
  type.** `(err: string)` but `handleScrapeActiveTab` rejects with `Error`.
  Result: user sees `[object Error]`. Fix: `(err: unknown) => sendResponse({
  type: 'scrape-error', message: err instanceof Error ? err.message : String(err) })`.

- **`extension/src/app/routes/Channel.tsx:99` `refreshFromActiveTab`** — sets
  `publishedAt: ''`, which downstream code passes to `new Date('')` →
  `NaN` → silently breaks date sort. Fix: leave the field undefined and rely
  on `publishedAtRelative`, OR set `new Date().toISOString()` as a placeholder.

### 3. Once 1+2 are clear, ramp Phase C jitter to be more conservative

Currently `concurrency: 2, jitterMs: 2500`. If user reports CAPTCHA in the
manual smoke test, drop to `concurrency: 1, jitterMs: 4000` and surface a
"YouTube challenged us; solve in the open tab" banner via a content-script
detection of the captcha page.

### 4. Open ideas backlog (not plans yet — brainstorm them in Track C)

- Activity panel scope expansion (currently LLM-only; should swallow scrape
  jobs uniformly — noted in plan's Notes section).
- `koko.scrape.<channelId>` cache with TTL so re-runs in same session don't
  re-open tabs.
- Video-page CrossChannel: pick K channels, find videos from same time
  window, see whose got most views — needs a date filter on the merged grid.
- TikTok / Instagram adapter (Track D fallback).
- Settings: throttle defaults exposed to user (concurrency, jitterMs).

---

## Open Bugs (cloud agents add here as they discover them)

_(empty — first iteration)_

---

## Completed Plans

- `docs/superpowers/plans/2026-05-02-phase-C-niche-scan-and-cross-channel.md` —
  shipped 2026-05-02, commits `f51e25a..d06e529`. Manual smoke test pending.

---

## Schedule (claude.ai routines)

Three routines on `https://claude.ai/code/routines`:

| Routine | ID | Cron / Time | State |
|---|---|---|---|
| Kickoff (one-shot) | `trig_01HgmW7dtFGK1RfefusUm9ra` | 2026-05-02T22:39:00Z (one-shot, +4h from arming) | **enabled** |
| Recurring A (every 3h on hour) | `trig_01XmKAkjgTmbB4TZDa5CDNNP` | `0 0,3,6,9,12,15,18,21 * * *` UTC | **disabled** |
| Recurring B (every 3h, +1h30m offset) | `trig_013VH3jGZKF3sF8zb2sG79R8` | `30 1,4,7,10,13,16,19,22 * * *` UTC | **disabled** |

Combined recurring cadence (when both enabled): 90 min between fires —
00:00, 01:30, 03:00, 04:30, 06:00, 07:30, 09:00, 10:30, 12:00, 13:30, 15:00,
16:30, 18:00, 19:30, 21:00, 22:30 UTC. Daily.

### Human owner: post-kickoff enable

The kickoff fires once at 22:39 UTC (2026-05-02). After reviewing its commit
on `remote-dev`, ENABLE both recurring routines on the dashboard. The first
recurring fire after that will land on the 90-min grid (next slot ≥ enable
time). Iterations from kickoff onward, if recurring is enabled at 22:40 UTC:
22:39 (kickoff), 23:00 — wait, no — A is `0,3,6,9,12,15,18,21` and B is
`1,4,7,10,13,16,19,22` minute 30. After 22:39, next fire = 0:00 UTC (A) =
+1h21m. Then 1:30, 3:00, 4:30 ... clean 90-min grid.

Iteration count over 9h post-kickoff with recurring enabled: 6 iterations
(22:39, 0:00, 1:30, 3:00, 4:30, 6:00, 7:30) — matches user's "5–6 in ~9h"
target.

If the human owner is asleep when the kickoff fires and can't enable: the
kickoff iteration will be the only run until they enable. Acceptable.

---

## Iteration Log

_(cloud agents append entries here)_

| Timestamp (UTC) | Track | Commit | Outcome |
|---|---|---|---|
| 2026-05-02 19:08Z | bootstrap | `eb2d213` | remote.md written, branch created, 3 routines armed (1 enabled, 2 disabled) |
| 2026-05-08 1043Z | local | `5ccbeb3` | Phase 1 — foundation/nav/persona/settings shipped end-to-end (13/13 tasks, 85 tests green) |
| 2026-05-08 1053Z | local | `88e471c` | Phase 2 — databanks subsystem (CRUD + UI + grid reuse) shipped end-to-end (7/7 tasks, 112 tests green) |
| 2026-05-08 1128Z | local | `c60d973` | Phase 3a — Hooks + Scripts aggregator sub-pages shipped (8/8 tasks, 126 tests green); Phase 3b (Videos toolbar power features) deferred |
