# Onboarding Chat + Preview Experience

## Assumption

This document assumes the subdomain and launch refactor is implemented.

That means:

- onboarding preview does not depend on a live `*.krabiclaw.com` hostname
- sites can exist before launch without consuming a public subdomain
- launch is a distinct final step

## Goal

Make onboarding feel as close as possible to the MCP / ChatGPT experience while still living inside the dashboard.

The owner should feel:

- KrabiClaw is building the site with them, not making them fill out a CMS
- they can see the site becoming real in front of them
- launch is a milestone
- future editing can happen in ChatGPT, dashboard chat, or targeted dashboard editors without changing the mental model

This should replace the current checklist-like onboarding in [pages/dashboard/[orgSlug]/~/onboarding.vue](../pages/dashboard/%5BorgSlug%5D/~/onboarding.vue), which is too small emotionally and too disconnected from the actual editor.

## Core Direction

Use a centered split-screen onboarding workspace:

- left: ChowBot-style guided conversation
- right: live signed preview of the site

This should be the first-run dashboard surface.

It should feel like:

- "describe your business and approve the result"

not:

- "complete setup steps"

## Experience Shape

### Layout

Desktop:

- centered shell
- left pane around 45%
- right pane around 55%
- generous margins, soft framing, strong sense of focus

Mobile:

- conversation first
- sticky button or segmented control to switch between `Chat` and `Preview`
- preview opens full-width when needed

### Left Pane: Guided ChowBot

The left side should behave like a first-run AI operator, not a generic support chat.

It should:

- ask one meaningful question at a time
- show progress in human terms
- confirm major changes as they happen
- suggest best-next actions instead of exposing every possible tool

Example early prompts:

- "What kind of business is this?"
- "What feeling should the homepage have?"
- "Do you want us to lean more premium, casual, or local?"
- "Should we use your Google Maps photos only, or generate a hero image too?"
- "What is the main action you want visitors to take?"

The questions should adapt to vertical:

- restaurant
- experience

The chat should also narrate work:

- "I pulled your address, hours, and reviews."
- "I built your homepage hero."
- "I found 12 usable photos."
- "I think the headline can feel stronger. Want three options?"

### Right Pane: Live Preview

The right side should always show the current site preview.

It should:

- update after meaningful chat-driven edits
- support lightweight page switching
- support location switching when relevant
- visually reinforce progress toward a launch-ready site

This is not the detailed editor. It is the proof surface.

The preview pane should include:

- page tabs or a compact page switcher
- optional location switcher
- a small status area, such as `In progress`, `Needs photo`, `Ready to launch`
- a launch score or readiness indicator

## Product Positioning

This onboarding should intentionally mirror the MCP experience.

The user should learn one mental model:

- "I tell KrabiClaw what I want, it updates the site, and I approve or refine it."

That model should work across:

- dashboard onboarding
- dashboard ChowBot
- ChatGPT MCP

The dashboard onboarding version differs only in having a richer adjacent preview and a more guided first-run script.

## Recommended Flow

### Phase A. Welcome and framing

The first screen should not ask them to fill forms immediately.

It should frame the session:

- we are going to build your site together
- you can see it update live
- nothing is publicly launched yet

Suggested opening structure:

- headline: `Let's build your site`
- short copy: `We’ll shape the homepage, photos, story, and visitor action together. You’ll preview everything before launch.`
- CTA: `Start building`

### Phase B. Import and first build

If Google Maps or existing business data already exists:

- import immediately
- render the first version before asking too many questions

If not:

- ask for the minimum bootstrap inputs first

The product should bias toward:

- show something quickly

not:

- gather everything up front

Chat actions here:

- import place details
- hydrate primary location
- import reviews
- choose photos
- generate hero variants if needed
- write page content

The preview should appear as soon as there is enough to show.

### Phase C. Guided polish

Once initial content exists, the AI should move through high-value decisions in order.

Suggested sequence:

1. Hero
2. Primary CTA
3. Story / about tone
4. Photos
5. Location or experience details
6. Menu or experiences
7. Trust signals: reviews, hours, contact

At each step, the user should be able to:

- accept
- refine
- ask for options
- skip for now

The preview should visibly react.

### Phase D. Readiness review

Once the site is strong enough, the flow should stop feeling like chat setup and start feeling like launch preparation.

The AI should summarize:

- what is complete
- what is still weak
- what it recommends before launch

Example:

- homepage is strong
- contact details are complete
- menu is populated
- photos are usable
- story section is still generic

This is where a structured readiness panel can appear next to or above the preview.

### Phase E. Launch choice

Once ready, the user should be invited into a small set of next actions:

- `Launch with free KrabiClaw subdomain`
- `Connect custom domain`
- `Keep refining`
- `Edit later in ChatGPT`

This is the right moment to introduce the long-term editing model.

Suggested copy:

- `Your site is ready to launch. In the future, you can keep editing here or just open ChatGPT and tell KrabiClaw what to change.`

## Why This Is Better Than A Standard Editor

The current content editor in [pages/dashboard/[orgSlug]/[locationSlug]/content.vue](../pages/dashboard/%5BorgSlug%5D/%5BlocationSlug%5D/content.vue) is useful, but it is still an editor.

Onboarding should not begin with:

- page trees
- fields
- sections
- save buttons

It should begin with:

- intent
- preview
- refinement

The structured editor still matters, but it should come after onboarding as a secondary power surface.

## Role Of The Existing Editor

This onboarding flow should not replace `content.vue`.

Instead:

- onboarding is the guided first-run creation mode
- `content.vue` is the targeted visual editor for later, more deliberate changes

The handoff should be explicit.

After launch or after onboarding completion, the user can:

- keep editing through chat
- open the structured editor
- use ChatGPT MCP for remote editing

## How Much Of ChowBot To Reuse

Reuse the interaction model, not necessarily the exact current component tree.

What to reuse:

- conversational pacing
- server-side tool calling model
- progress narration
- confirmation behavior for meaningful operations

What not to reuse blindly:

- legacy chat chrome if it reads like support
- generic assistant phrasing
- decommissioned managed-service patterns

This needs a more focused onboarding persona:

- proactive
- design-aware
- concise
- visually oriented

## Suggested UI Components

### Top bar

Small, calm top bar with:

- brand / site name
- progress label
- `Exit`
- optional `Save for later`

Avoid dashboard-heavy nav during onboarding.

### Chat pane

Contains:

- welcome state
- assistant messages
- user replies
- recommended quick actions
- compact progress rail

Quick reply chips should be used often early on:

- `More premium`
- `More local`
- `Show options`
- `Use these photos`
- `Skip for now`

### Preview pane

Contains:

- signed preview iframe or preview page embed
- page switcher
- readiness status
- maybe a small "recent changes" list

### Bottom action strip

Once progress is real, show persistent actions:

- `Keep building`
- `Review site`
- `Launch`

## Readiness Model

This flow needs a first-class readiness model, not just a hidden checklist endpoint.

The existing logic in [server/api/dashboard/onboarding/checklist.get.ts](../server/api/dashboard/onboarding/checklist.get.ts) is a good starting point but too shallow for this experience.

We should evolve it into readiness categories:

- Brand clarity
- Hero media quality
- Core business details
- Offer completeness
- Trust signals
- Launch setup

Each category should be:

- `complete`
- `needs attention`
- `missing`

The AI can then use that structure to decide what to ask next.

## Handoff To Future Editing

One of the goals of onboarding is teaching the future editing model.

At the end, we should explicitly tell the user:

- they can return to dashboard chat
- they can use the structured editor for precise edits
- they can use ChatGPT for natural-language updates

Suggested handoff copy:

- `Your site is ready. Next time, you can just ask KrabiClaw in ChatGPT to update your story, change a photo, add a new location, or rewrite your homepage.`

That line matters because it turns onboarding into product education.

## Scope Recommendation

### In scope

- new onboarding shell
- split chat + preview layout
- AI-guided question flow
- signed preview integration
- readiness summary
- launch invitation
- explicit ChatGPT handoff

### Not in scope for the first pass

- full replacement of `content.vue`
- complete unification of every edit surface
- advanced multi-user collaboration
- fully generalized agent orchestration for every onboarding branch

## Suggested Implementation Order

1. Finish the preview / launch refactor foundation
2. Replace checklist onboarding with a new chat + preview page shell
3. Wire a minimal guided conversation script to real site update actions
4. Add readiness scoring and next-best-action prompts
5. Add launch and ChatGPT handoff states
6. Refine visuals, pacing, and mobile behavior

## Final Product Call

Yes, the right direction is a centered half-screen ChowBot-style onboarding experience with chat on the left and preview on the right.

That is the best bridge between:

- the MCP product promise
- the dashboard product surface
- the new launch model where preview exists before public publication

If we do this well, onboarding stops feeling like setup and starts feeling like the first successful collaboration between the owner and KrabiClaw.

