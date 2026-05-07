# Sandcastles — Page & Layout Reference

Source: reverse-engineered from live HTML snapshots. Use as product reference, not pixel-perfect spec.

---

## Shell / Chrome (every page)

**Left sidebar** (desktop only, fixed, ~240px wide)

- Workspace switcher at top — logo + workspace name + dropdown chevron
- Collapsible: hover reveals a collapse button on the right edge
- Nav divided into three labeled sections:

| Section | Items |
|---------|-------|
| Research | Videos, Ideas, Hooks |
| Create | Scripts, Projects, Exports |
| Setup | Channels, Persona, Automations, Settings |

- Active page gets a subtle inset-shadow highlight (`bg-zinc-300/50` light, `bg-zinc-700/40` dark)

**Mobile header** (hidden on desktop)

- Hamburger button (left) opens drawer nav
- Logo banner (center)
- No page title in header — title lives inside main content

---

## Pages

### Videos (`/videos`)

**Purpose:** Browse and analyze YouTube videos from your watched channels.

**Header:**
- Title: "Videos"
- Subtitle: "Analyze videos from your channels to unlock deep insights and find your next idea"

**Toolbar (sticky, top of content):**
- Customize channels — opens channel picker
- Add video URL — manually add a video by URL
- Bulk Analyze — send up to 100 videos to analysis queue at once
- Filters (blue highlighted when active)
- Sort by
- Export
- Count badge: "Showing 100 of 19171"

**Layout:**
- Sticky left filter panel (~25% width, desktop only) — filter by channel, date, etc.
- Main area: scrollable video list/grid (rest of width)

---

### Ideas (`/ideas`)

**Purpose:** Review video ideas generated from analyzed videos. Saved ideas land here.

**Header:**
- Title: "Ideas"
- Subtitle: "Review ideas that were generated from videos you analyzed"

**Toolbar:**
- Inbox / Shortlist tab toggle (segmented pill control, mobile only — desktop uses another pattern)
- Search bar: "Search ideas"
- Sort by
- Export (disabled when no ideas)

**Empty state:**
- Dashed border box, centered
- Message: "You haven't saved any ideas yet! Pick videos from your feed to analyze."
- CTA button: "Explore feed" → goes to Videos

**Two buckets:** Inbox (default) and Shortlist — ideas move between them.

---

### Hooks (`/hooks`)

**Purpose:** Hook Vault — a library of viral opening lines, pulled from analyzed videos or added manually.

**Header:**
- Title: "Hooks"
- Subtitle: "Manage your vault of viral hooks"

**Toolbar:**
- Search bar: "Search by hook or channel"
- Create from video — add a hook from a video URL
- "Showing format" toggle switch (on/off — likely switches between compact/expanded card view)
- Sort by
- Export

**Two sections on the page:**

1. **Hooks from Your Analyzed Videos** — shows count (e.g. "· 0")
   - Empty state: dashed border, "Find more winning hooks from videos in your feed" + blue "Explore feed" CTA

2. **Sandcastles Default Hooks** — pre-loaded library (26 hooks shown)
   - Each hook is a card with:
     - Thumbnail image from the source video
     - Hook text — written as a template with `[placeholder]` slots, e.g. _"I just got the most [adjective] [noun] ever."_
     - Attribution: "Inspired by @channelhandle"
     - "Copy hook" button — appears on hover
     - Category badge (color-coded), e.g. "Personal Experience" (purple)
     - Performance multiplier badge, e.g. "0.8x" (red = below average, presumably green = above)
     - View count badge, e.g. "298K" (blue, eye icon)

**Hook categories seen:** Personal Experience (purple). Likely more exist.

**Key insight:** Hooks are templatized — not raw quotes, but fill-in-the-blank patterns. Users pick a hook template; the script generator fills in the slots.

---

### Scripts (`/scripts`)

**Purpose:** Generate and manage video scripts using your persona, hooks, and ideas.

**Header:**
- Title: "Scripts"
- Subtitle: "Write high-performing scripts backed by proven storytelling frameworks"

**Empty state:**
- Dashed border box, centered
- Message: "Use data-backed elements to write winning scripts"
- CTA button: "Write your first script" (blue, pencil icon)

---

### Projects (`/projects`)

**Purpose:** Plan and organize content with a dedicated workspace for each project.

**Header:**
- Title: "Projects"
- Subtitle: "Plan and organize your content with a dedicated workspace for each project"

**Empty state:**
- Dashed border box, centered, `mt-8 py-8`
- Message: "Use projects to organize your content"
- CTA button: "Create your first project" (blue, folder-plus icon)

---

### Exports (`/exports`)

**Purpose:** Download or email historical exports.

**Header:**
- Title: "Exports"
- Subtitle: "Download or email any historical export you've created"

**Empty state:**
- Dashed border box, centered
- Message: "Use exports to work with your data off-platform"
- Two CTAs side by side with "or" between them:
  1. Blue button: "Find videos to export" (video icon) → goes to Videos
  2. Ghost button: "Export your scripts" (document icon) → goes to Scripts

---

### Channels (`/channels`)

**Purpose:** Manage which YouTube channels are in your watchlist / feed.

**Header:**
- Title: "Channels"
- Subtitle: "Pick which channels to include in your videos feed"

**Layout (desktop):** Two-column grid (`col-span-full md:col-span-2` left main area + right watchlist panel)

**Mobile:** Tab toggle at top — "Channels" | "Watchlist" (segmented pill)

**Discovery tabs (desktop, 4-tab segmented control):**

| Tab | Purpose |
|-----|---------|
| Suggested | Browse channels by niche category |
| Describe | Describe your content; get recommendations |
| Search | Search for a specific channel |
| Add URL | Paste a channel URL directly |

**Suggested tab layout:**
- Channels grouped by niche category (e.g. "AI Content Creation Strategies")
- Each group has a header row with category name + "Load more" + "Add all" buttons (hover-revealed)
- Channel grid: `grid-cols-1 lg:grid-cols-2`

**Channel card:**
- Avatar image (GCS URL) with platform icon badge overlaid at `-bottom-1 -right-1`
- Channel name as external link
- Follower count (e.g. "142K")
- On hover: + add button + refresh button appear on right side (absolute positioned, `backdrop-blur`)

**Sample channels seen:** kentcultivate (142K Instagram), sahelmahdi (258K Instagram)

**Watchlist panel (right column / mobile tab):**
- Shows channels already added
- Layout: card grid similar to discovery side

---

### Persona (`/persona`)

**Purpose:** Define your creator persona — voice, style, niche — used to personalize script generation.

**Header:**
- Title: "Persona"
- Subtitle: "Share information about your brand to personalize your experience"

**Layout:** Single centered column (`max-w-4xl`), stack of three card sections (`ring-1 ring-zinc-200`, `rounded-xl`).

**Section 1 — Content description** · badge: `Research` (blue)
- Help text: "Describe your content niche. This is used to personalize your channel discovery and idea analysis."
- Textarea, placeholder: `e.g. 'Generative AI product releases'`
- Limit: 5000 chars — counter shown bottom-right (`N / 5000`)

**Section 2 — Context** · badge: `Scripting` (purple)
- Help text: "Describe your business or brand. Include any preferences or expertise you want the system to be aware of. It'll use this context in all future scripts."
- Textarea, placeholder: `e.g. 'I'm a content creator for a startup called Sandcastles'`
- Limit: 5000 chars

**Section 3 — Writing style** · badge: `Scripting` (purple)
- Help text: "Provide a writing sample for the system to emulate and learn from. Tip: don't add instructions here, only include a script that you want to sound like."
- Textarea, no placeholder
- Limit: 3000 chars

**Badge semantics:**
- `Research` (blue) = used for channel discovery / idea analysis
- `Scripting` (purple) = injected into script generation prompts

Each card: header row with title + badge, then help text + textarea + char counter below.

---

### Automations (`/automations`)

**Purpose:** Auto-analyze videos from your watchlist based on rules you define.

**Header:**
- Title: "Automations"
- Subtitle: "Automatically analyze videos based on rules you define"

**Toolbar:**
- "Add Rule" button — ghost style, `+` circle icon, right-aligned (`ml-auto`)

**Rule list:**
- Stack of rule cards (`flex flex-col gap-3`)
- Each card: `rounded-xl p-5 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800`

**Rule card structure:**
- Left col (flex-1):
  - Rule name — bold, truncated (`font-semibold truncate`)
  - Conditions line — e.g. `"Outlier ≥ 1, Views ≥ 25,000, Engagement ≥ 2%"`
  - Daily limit line — e.g. `"Daily limit: 3"`
- Right col (flex-shrink-0): toggle switch + edit (pencil) button + delete (trash, `text-red-500`) button

**Default rule seen:**
- Name: "Top Daily Performers (Sandcastles Default)"
- Conditions: Outlier ≥ 1, Views ≥ 25,000, Engagement ≥ 2%
- Daily limit: 3
- Toggle: off (unchecked), card `opacity-50`

**Key insight:** Sandcastles ships a pre-configured default rule. User-created rules won't have the "(Sandcastles Default)" suffix. Toggle enables/disables a rule without deleting it. Conditions use threshold comparisons (outlier score, view count, engagement rate).

---

### Settings (`/settings`)

**Purpose:** Account settings, API keys, preferences.

*Full page layout not yet captured.*

---

## Onboarding Flow

Triggered for new users. Two stacked modals appear:

1. **"Your feed is ready!"** — shown after niche scan completes
   - Green checkmark icon
   - Row of channel avatar images (channels auto-added based on niche)
   - **Two variants depending on account state:**
     - Paid/active trial: CTA = "Explore feed" → goes to Videos
     - Pre-trial (not yet subscribed): text "Start your free trial to begin analyzing videos from these channels." + CTA = "Start free trial"

2. **Changelog modal** — "Sandcastles has some new features!"
   - Bullet list of new features
   - "Got it" dismiss button

Both modals blur the background. Content behind is non-interactive while they're open.

---

## AI Prompts (extracted from JS bundle)

### Script Development Prompt (partial — `<inputs>` section cut off in capture)

```xml
<role>
You are a world-class assistant for creating short-form social media videos.
Your job is to help create the highest quality content
</role>

<task>
Assist me in developing an idea into a fully-fledged, ready-to-publish short-form social media video.
</task>

<instructions>
1. Read all of the content I provide, so that you can understand the context of the video.
2. Design an implementation strategy for the video. It may not end up being exactly what I've provided, but use this as a starting point.
3. Offer me a choice of what to do next:
   a. You can ask follow up questions to help you understand the video better.
   b. If <personalization_options> are provided, you can ask me which twist I want to put on the video to make it my own.
   c. Write a draft of the script for me. In this case, if multiple <personalization_options> are provided, pick the best option.
   d. Allow me to pick a different next step.
</instructions>

<inputs>
<topic>
[...truncated — inputs section not captured]
```

**Notes:**
- XML-tag structured prompt (role/task/instructions/inputs pattern)
- Supports `<personalization_options>` injection — user picks a "twist"
- Multi-step conversational flow: clarify → personalize → draft → iterate
- Only 2 prompts found client-side — rest likely server-side (Worker/backend)

---

## Design System Notes

- **Colors:** zinc scale throughout (zinc-50 → zinc-950). Blue for primary actions. No custom brand colors visible in chrome.
- **Dark mode:** Full support via `dark:` classes on everything.
- **Component library:** Headless UI for dropdowns, dialogs, popovers. Custom button/input styles on top.
- **Font:** Inter (rsms.me CDN).
- **Responsive breakpoints:** `sm` (mobile tweaks), `lg` (sidebar appears, layout shifts to side-by-side).
- **Analytics:** FullStory session recording on all pages.
- **Assets:** Channel/video thumbnails from Google Cloud Storage (`storage.googleapis.com/prod-sandcastles-thumbnails/`).
