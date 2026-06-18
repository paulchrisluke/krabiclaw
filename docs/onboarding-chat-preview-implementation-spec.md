# Onboarding Chat + Preview Implementation Spec

## Purpose

This document turns the product direction in [onboarding-chat-preview-experience.md](./onboarding-chat-preview-experience.md) into a build-oriented implementation spec.

It assumes:

- the preview / launch refactor in [subdomain-launch-refactor-plan.md](./subdomain-launch-refactor-plan.md)
- preview is platform-hosted and token-based
- site launch is separate from site creation
- page content continues to save directly, without reintroducing draft/publish for normal site editing

## Product Summary

Replace the current onboarding checklist page with a first-run workspace that feels like the dashboard equivalent of the MCP experience:

- left pane: guided AI conversation
- right pane: live signed site preview
- final state: either keep refining, launch, or continue later in ChatGPT

This is not a generic chat page and not a stripped-down CMS.

It is a guided site-building workspace.

## Current Reusable Building Blocks

### Reuse

Existing pieces we should build on:

- `runChowBot()` streaming/tool model in [server/utils/chowbot-agent.ts](../server/utils/chowbot-agent.ts)
- SSE agent endpoint in [server/api/ai/[siteId]/agent.post.ts](../server/api/ai/%5BsiteId%5D/agent.post.ts)
- conversation persistence in [server/utils/chowbot-conversations.ts](../server/utils/chowbot-conversations.ts)
- frontend chat state and SSE handling in [composables/useChowBot.ts](../composables/useChowBot.ts)
- current embedded chat UI patterns in [components/dashboard/ChowBot.vue](../components/dashboard/ChowBot.vue)
- onboarding data bootstrap endpoints:
  - [server/api/dashboard/onboarding/lookup-place.post.ts](../server/api/dashboard/onboarding/lookup-place.post.ts)
  - [server/api/dashboard/onboarding/setup.post.ts](../server/api/dashboard/onboarding/setup.post.ts)
  - [server/api/dashboard/onboarding/checklist.get.ts](../server/api/dashboard/onboarding/checklist.get.ts)

### Do not reuse blindly

Things that should not be copied as-is:

- the current checklist UX in [pages/dashboard/[orgSlug]/~/onboarding.vue](../pages/dashboard/%5BorgSlug%5D/~/onboarding.vue)
- the current ChowBot side-panel shell
- generic support-chat empty states
- current prompt copy that assumes ongoing site management rather than guided first-run creation

## Proposed Route Structure

### Primary onboarding route

Keep the route family under dashboard onboarding:

- `pages/dashboard/[orgSlug]/~/onboarding.vue`

But replace its implementation with the new split workspace.

### Suggested URL behavior

Use lightweight query state for resumability:

- `/dashboard/{orgSlug}/~/onboarding`
- `?step=build`
- `?step=review`
- `?step=launch`
- `?conversationId=...`

This should not be overused. The main source of truth should be server-side onboarding state.

## Page-Level Layout Spec

### Overall shell

Use `UPage` and `UPageBody`, but the onboarding body should feel custom and immersive.

Recommended structure:

1. compact onboarding top bar
2. split main workspace
3. optional sticky bottom action strip

### Top bar

Contents:

- site / brand name
- progress summary
- `Save for later`
- `Exit`

Optional:

- compact readiness score

Avoid full dashboard chrome competing with the onboarding flow.

### Main workspace

Desktop:

- two-column grid
- left: `minmax(24rem, 44%)`
- right: `minmax(28rem, 56%)`

Mobile:

- segmented switch between `Chat` and `Preview`
- chat default tab

### Left pane: onboarding agent

This is not the existing `ChowBot.vue` dropped in unchanged.

It should be a new component:

- `components/onboarding/OnboardingAgentPanel.vue`

Responsibilities:

- render onboarding conversation
- show guided quick replies
- show tool activity in a simplified form
- anchor user attention to the current decision
- hand off preview actions to the right pane

### Right pane: onboarding preview

New component:

- `components/onboarding/OnboardingPreviewPane.vue`

Responsibilities:

- load the signed preview route in an iframe
- switch pages and location scopes
- show readiness state
- show recent changes summary
- expose launch CTA once ready

## Component Breakdown

### 1. `OnboardingWorkspace.vue`

Parent orchestration component.

Responsibilities:

- fetch onboarding state
- own conversation ID
- own current page/location selection for preview
- coordinate chat and preview panes
- coordinate readiness and launch actions

Props:

- `siteId`
- `orgSlug`

State:

- `conversationId`
- `siteStatus`
- `previewUrl`
- `readiness`
- `activePreviewPage`
- `activeLocationId`
- `launchState`

### 2. `OnboardingAgentPanel.vue`

Chat-focused left pane.

Responsibilities:

- render messages
- render quick reply chips
- submit user messages
- show high-level tool progress
- show structured prompts for major onboarding questions

Unlike current `ChowBot.vue`, this should:

- be visually calmer
- hide ongoing credit/admin chrome unless needed
- foreground onboarding intent

### 3. `OnboardingPreviewPane.vue`

Preview-focused right pane.

Responsibilities:

- display preview iframe
- switch between preview pages
- show readiness breakdown
- show current stage label such as `Building`, `Reviewing`, `Ready to launch`

### 4. `OnboardingReadinessCard.vue`

Compact readiness module.

Responsibilities:

- render readiness categories
- show missing/weak areas
- expose next recommended action

### 5. `OnboardingLaunchBar.vue`

Bottom action area appearing once the site is sufficiently complete.

Actions:

- `Keep refining`
- `Review launch setup`
- `Launch site`
- `Continue later in ChatGPT`

## Server-Side State Model

We should stop treating onboarding as only a page route and treat it as a workflow state.

### Recommended onboarding states

Site-level onboarding stage values:

- `setup`
- `building`
- `refining`
- `review`
- `launch_ready`
- `launched`

This can live either:

- on `sites.onboarding_status` if the field is being broadened intentionally
- or preferably in a more explicit onboarding metadata structure

Recommended for this branch:

- keep `sites.onboarding_status` for public gating semantics
- add separate onboarding workflow metadata instead of overloading it further

Suggested storage options:

1. new `site_onboarding_state` table
2. or `sites.settings` JSON if already standardized enough

Preferred:

- `site_onboarding_state`

Because:

- it avoids overloading site core fields
- it is easier to evolve
- it supports timestamps and resumability cleanly

### Suggested `site_onboarding_state` fields

- `site_id`
- `organization_id`
- `conversation_id`
- `stage`
- `status`
- `readiness_json`
- `last_preview_page`
- `last_location_id`
- `started_at`
- `completed_at`
- `updated_at`

## Agent Architecture

## Recommendation

Do not build a completely separate onboarding agent stack.

Instead:

- reuse `runChowBot()`
- add an explicit onboarding mode

### Why

The current stack already handles:

- tool calling
- SSE streaming
- stored conversations
- site and location context

Forking a second agent path would create prompt drift and duplicated orchestration.

### Proposed endpoint shape

For clarity, add a dedicated onboarding endpoint even if it reuses the same core runner.

Suggested:

- `POST /api/dashboard/onboarding/[siteId]/agent`

This endpoint can internally call the same `runChowBot()` core with:

- `mode: 'onboarding'`
- `currentPage: 'onboarding'`
- onboarding context

Why a dedicated endpoint is still useful:

- onboarding may have different response shaping
- onboarding may want tighter allowed tool subsets
- onboarding may want different starter prompts and state transitions

### Required `runChowBot()` extension

Add an option such as:

- `mode?: 'dashboard' | 'onboarding'`

Then branch system prompt additions and tool guidance accordingly.

### Onboarding mode behavioral rules

The onboarding agent should:

- ask one high-value question at a time
- prioritize visible site improvements over data collection
- narrate meaningful changes
- recommend next steps based on readiness
- avoid generic support/help responses unless asked

It should not:

- dump a large menu of capabilities
- assume the user wants admin or operations help
- push them into posts/social too early

## Tool Scope During Onboarding

We should not expose every possible tool equally during first-run.

### Prioritized tool categories

- site creation/bootstrap
- business/location enrichment
- page content updates
- media selection and generation
- menu or experiences setup
- logo / hero / story updates
- readiness inspection
- launch preparation

### Deprioritized during onboarding

- long-tail operations tasks
- inbox/support/admin tasks
- analytics queries
- work-request flows

This does not require a separate tool system. It can be achieved through onboarding-mode prompt instructions and response shaping.

## Readiness System

The current onboarding checklist endpoint is a useful seed, but not enough.

### Replace checklist semantics with readiness semantics

Current checklist fields:

- business info
- hero image
- menu or experiences
- story
- post

Recommended readiness categories:

- Brand clarity
- Hero quality
- Core business details
- Offer completeness
- Trust signals
- Visitor action clarity
- Launch setup

Each category should return:

- `status: complete | needs_attention | missing`
- `summary`
- `recommended_action`

### Suggested endpoint

- `GET /api/dashboard/onboarding/[siteId]/readiness`

This can evolve from logic in:

- [server/api/dashboard/onboarding/checklist.get.ts](../server/api/dashboard/onboarding/checklist.get.ts)

## Preview Integration

This spec assumes the preview route has already been decoupled from live subdomains.

### Preview pane inputs

The page should load preview by:

- `siteId`
- signed preview token
- selected page path
- selected location slug or ID

The preview pane should not derive from `sites.subdomain`.

### Suggested preview URL contract

Something like:

- `/preview/site/{siteId}/?token=...`
- `/preview/site/{siteId}/locations/{slug}?token=...`

The exact preview route shape should follow the preview refactor decision, but the onboarding UI should treat it as an opaque resolved URL from the server.

## Recommended API Surface

### Keep

- `POST /api/dashboard/onboarding/lookup-place`
- `POST /api/dashboard/onboarding/setup`

### Add

- `GET /api/dashboard/onboarding/[siteId]/state`
- `POST /api/dashboard/onboarding/[siteId]/agent`
- `GET /api/dashboard/onboarding/[siteId]/readiness`
- `POST /api/dashboard/onboarding/[siteId]/launch`
- `POST /api/dashboard/onboarding/[siteId]/save-for-later`

### `GET /state` should return

- site summary
- onboarding stage
- conversation ID
- preview URL
- readiness summary
- current recommended prompt
- available quick actions

## Suggested First-Run Flow

### Step 1. Entry

When the owner lands on onboarding:

- if no site exists, bootstrap via existing setup flow
- if a site exists but onboarding is incomplete, resume

### Step 2. First build

The system should aim to produce a first visible site quickly.

That means:

- ingest business data
- hydrate location
- select photos
- write hero and story
- render preview fast

### Step 3. Guided refinement

The agent then guides through the most important missing pieces.

The next prompt should always come from readiness, not a fixed wizard.

### Step 4. Review

Once readiness crosses a threshold, switch the framing from `building` to `review`.

The UI should visibly change:

- more emphasis on preview
- more emphasis on readiness
- clearer launch actions

### Step 5. Launch handoff

Present:

- free subdomain launch
- custom domain setup
- continue editing later in ChatGPT

## Conversation UX Rules

### Message style

Assistant copy should be:

- short
- confident
- visual
- decision-oriented

Bad:

- "Here are several things I can help you with."

Good:

- "Your homepage already feels strong. The weakest part is the story section. Want me to write three stronger options?"

### Quick replies

Quick replies should appear often during onboarding.

Examples:

- `Show options`
- `Use this version`
- `Make it more premium`
- `More local`
- `Skip for now`
- `Use generated photo`

### Tool visibility

Surface tools as progress, not raw internal complexity.

Examples:

- `Imported Google business details`
- `Drafted homepage hero`
- `Prepared experience cards`

Avoid showing noisy low-level operations unless debugging is needed.

## Handoff To Structured Editing And ChatGPT

At completion, the system should explicitly teach the next-step editing model.

Suggested actions:

- `Open structured editor`
- `Keep editing with dashboard chat`
- `Edit later in ChatGPT`

This should be treated as onboarding completion, not a buried tip.

## Analytics And Success Signals

Track:

- onboarding start
- first preview rendered
- first meaningful AI-applied site update
- readiness threshold reached
- launch CTA shown
- launch completed
- onboarding abandoned
- onboarding resumed
- "continue in ChatGPT" click

These events will tell us whether the new experience is actually better than the checklist.

## Suggested Build Order

### Milestone 1

- new onboarding page shell
- split layout
- onboarding state endpoint
- preview pane wired to new preview route

### Milestone 2

- onboarding agent endpoint
- onboarding-mode prompt
- reuse conversation persistence
- starter quick replies

### Milestone 3

- readiness endpoint
- recommended next action logic
- review state UI

### Milestone 4

- launch flow integration
- ChatGPT handoff UI
- save/resume behavior

## Final Recommendation

Implement onboarding as a dedicated orchestration layer over the existing ChowBot and preview infrastructure.

Concretely:

- new onboarding workspace page
- new onboarding-specific chat component
- new onboarding state/readiness endpoints
- dedicated onboarding agent endpoint that reuses `runChowBot()` with `mode: 'onboarding'`

That gives us:

- one core AI system
- one shared editing mental model
- a much more memorable first-run experience
- a clean bridge into launch and future ChatGPT editing

