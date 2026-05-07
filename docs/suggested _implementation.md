# Kokocastles — Product Spec

Free alternative to sandcastles.ai. BYO API keys. Multi-platform (YT/IG/TT) via browser extension.

## Pages (sidebar nav)

---

### 1) Analyze

Single page with 3-way sub-page toggle: `[Videos | Hooks | Scripts]`

#### (1) Videos sub-page

Browse and analyze videos/reels/shorts from watched channels (YT, IG, TT — same UI across platforms).

**Toolbar:**
- Add video URL
- Bulk analyze (10–30 max) → retrieves hooks / script / outlier score / format; optionally saves to a databank
- Filter (likes / views / outlier score / date posted)
- Sort by (same fields as filter, orders instead of hides)
- Export → xlsx or csv with field ticks: video link, video name, channel name, date, outlier score, views, likes, format, hooks (all on by default)
- Count badge: "Showing X of Y"

**Feed:** paginated video cards (same style as sandcastles).

**Video card → "View details"** opens detail page:
- Left: thumbnail
- Right: hook, script, tags, channel description (if analyzed); "Analyze this video" button (if not)
- "Add to databank" action available for both analyzed and unanalyzed videos

**Select mode** (triggered by select button on toolbar):
- Options appear: Top X / Bottom X / Custom filter (same filter fields, shown only in select mode)
- When videos selected, actions appear:
  1. Create databank → pop-up "enter databank name" → save
  2. Export to xlsx/csv (field ticks, all on by default)
  3. Remove for this session (hide until next login)
  4. Remove permanently

**Outlier score:** views ÷ channel average views. Threshold for "outlier" is configurable in Settings.

#### (2) Hooks sub-page

Reflects hooks from the analyzed subset of the current feed.

Each hook card (horizontal rectangle):
1. Visual hook — in-video frame (not just thumbnail)
2. Written hook — text
3. Audio hook — transcribed

Footer action: "Analyze [N] more" — analyzes next N videos in feed order and appends their hooks.

Optional (non-essential): category bubbles + "best for" tags using sandcastles hook categories as reference (scraped, no copyright on category names). Claude auto-assigns category per hook.

#### (3) Scripts sub-page

Same as Hooks sub-page — transcriptions instead of hooks, same card layout and features.

---

### 2) Channels

Manage competitor channel watchlist (similar to sandcastles Channels page).

- Add channel by URL or search in-app
- Sort by subscriber count
- Remove from watchlist

---

### 3) Databanks

On-platform video storage. Each databank is a named folder.

**Databanks list page:** create new / remove existing.

**Inside a databank:** same as video feed (thumbnails, views/outlier, scripts/hooks for analyzed videos). Supports select / export / sort / filter.

Databanks can be added as context in Writer and Persona pages.

---

### 4) Ideas

User-triggered. Parse ideas from current feed or selected databank(s). Same behavior as sandcastles Ideas page (Inbox / Shortlist buckets, search, sort, export).

---

### 5) My Channel

Link own channel. Fetches videos when channel updates.

**Analytics view:** sort/filter by views / outlier score / likes / hypothesis.

**Hypotheses:**
- "Add new hypothesis" → pop-up: name, description, tick existing videos that fall under it, option "apply to next [N] videos"
- System auto-marks next N fetched videos from own channel as testing the hypothesis
- Hypotheses visible as filter/sort option in the video feed

---

### 6) Writer

Script writing assistant (same flow as sandcastles Writer).

- Prompt follows sandcastles XML pattern (role / task / instructions / inputs)
- `+` button to add context: databanks / images / files
- Model selector (Haiku / Sonnet / Opus tier ladder)
- Multi-step conversational flow: clarify → personalize → draft → iterate

---

### 7) Persona

Define creator context used by analyzer and Writer.

- Content niche description (used for channel discovery + idea analysis) — Research badge
- Brand/business context (injected into scripts) — Scripting badge
- Writing style sample (emulated by Writer) — Scripting badge
- Option to attach databanks as niche content examples

---

### 8) Settings

- Anthropic API key
- Platform API keys / extension config (YT / IG / TT)
- Own channel link
- Outlier threshold (ratio used to flag a video as outlier)
- Any other keys/config needed to support above features
