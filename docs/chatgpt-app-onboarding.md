# ChatGPT App — Onboarding & Welcome Experience

## Problem

When a user connects the KrabiClaw MCP connector to ChatGPT, the session starts cold. ChatGPT
has no site context — it doesn't know which of the user's sites to target. Two things go wrong:

1. Users don't know they need to say "my site is X" or that a site selection step exists.
2. ChatGPT waits for the user to initiate rather than proactively establishing context.

The current mitigation is the `initialize` instructions field, which now tells ChatGPT to call
`list_sites` at the start of every conversation and present sites to the user. That's the floor.

## Two Tracks

### Track 1 — MCP `initialize` instructions (live)

The `initialize` response `instructions` string is injected as a system prompt for the AI.
We updated it to direct ChatGPT to call `list_sites` first and present a clear site-selection
prompt. This is text-only — no rich UI.

**File:** `server/api/mcp.post.ts` → `initialize` handler.

### Track 2 — ChatGPT App with welcome card UI (spec)

A proper ChatGPT App (separate from the MCP connector) can render a React UI inside ChatGPT
using `@openai/apps-sdk-ui`. This enables a branded welcome card, site picker, and persistent
context — the right long-term experience.

---

## Desired Welcome Flow (Track 2 target)

```
User opens KrabiClaw in ChatGPT
         ↓
App renders WelcomeCard (apps-sdk-ui components)
 - Shows user's name / avatar
 - Lists their accessible sites (from list_sites)
 - "Select a site to get started" or "Create your first site"
         ↓
User picks a site → site_id stored in session context
         ↓
ChatGPT conversation starts with site context already set
All subsequent tool calls use the stored site_id automatically
```

---

## WelcomeCard Component Spec

Built with `@openai/apps-sdk-ui` React components (same pattern as the `ReservationCard` example
in the OpenAI SDK docs).

### States

**No sites:** Show `create_site` CTA.

```
┌─────────────────────────────────────┐
│  Welcome to KrabiClaw               │
│                                     │
│  You don't have any sites yet.      │
│                                     │
│  [  + Create your first site  ]     │
└─────────────────────────────────────┘
```

**One site:** Auto-select and confirm.

```
┌─────────────────────────────────────┐
│  KrabiClaw                    ● Live│
│  pottery-house.krabiclaw.com        │
│                                     │
│  [ Open dashboard ]  [ Manage →  ] │
└─────────────────────────────────────┘
```

**Multiple sites:** List picker.

```
┌─────────────────────────────────────┐
│  Your Sites                         │
│                                     │
│  ○ Pottery House Krabi              │
│    pottery-house.krabiclaw.com      │
│                                     │
│  ○ The Grotto                       │
│    the-grotto.krabiclaw.com         │
│                                     │
│  [  Select site  ]                  │
└─────────────────────────────────────┘
```

### Props

```ts
interface WelcomeCardProps {
  sites: Array<{
    id: string
    name: string
    subdomain: string
    status: 'live' | 'draft' | 'inactive'
    publicUrl?: string
  }>
  onSelect: (siteId: string) => void
  onCreate: () => void
}
```

---

## Technical Architecture

### Frontend

- Framework: React 18 (matches apps-sdk-ui requirements)
- Styles: Tailwind 4 + `@openai/apps-sdk-ui/css`
- Components: Badge (status), Button (CTA), Icon (Globe, Maps, etc.)
- Router: React Router v7 (already in the Nuxt project via `AppsSDKUIProvider`)

### Data layer

The welcome card calls the MCP `list_sites` tool via the OAuth-authenticated session to populate
the site list. No separate API needed.

### Session context

Once a site is selected, the `site_id` must be available to subsequent tool calls. Options:

**Option A (simplest):** Store in ChatGPT conversation state — the welcome card emits a text
message like "Working with site-pottery-house-krabi" that stays in context. ChatGPT references it
for all subsequent calls. No server change required.

**Option B (cleaner):** Add a `get_active_site` tool that returns the previously selected site_id
from a server-side session store (e.g., a new `mcp_sessions` D1 table keyed by access token).
ChatGPT calls this at the start of each conversation.

**Option C (proper long-term):** OAuth-time site selection — during the OAuth consent flow,
after login, redirect to a site-picker page. Store the selected `site_id` in the OAuth token
claims or in a `mcp_sessions` table. The server reads it automatically on every tool call.

Recommended path: start with Option A (zero server changes), revisit Option C when we have
multi-site customers who find it annoying to re-select every session.

---

## Implementation Plan

### Phase 1 — MCP instructions (done)
- [x] Rewrite `initialize.instructions` to direct ChatGPT to call `list_sites` first
- [x] Update `server/discover` instructions to the same effect

### Phase 2 — Standalone welcome card (next)
- [ ] Scaffold a React app in `apps/chatgpt-welcome/` using `@openai/apps-sdk-ui`
- [ ] Build `WelcomeCard` component for the three states above
- [ ] Wire to `list_sites` MCP tool call via authenticated fetch
- [ ] Wire `onCreate` to `create_site` tool call
- [ ] Deploy as a separate Cloudflare Worker or static Pages site

### Phase 3 — Session context persistence (later)
- [ ] Evaluate Option A vs C based on real user friction
- [ ] If Option C: add `mcp_sessions` migration, update OAuth consent flow, update executor to
  read default site_id from session when no site_id is provided in tool args

---

## Reference

- `server/api/mcp.post.ts` — `initialize` handler (instructions field)
- `server/utils/mcp-tools.ts` — `list_sites` tool definition
- `chatgpt-app-submission.json` — OpenAI app submission metadata
- `@openai/apps-sdk-ui` — [GitHub](https://github.com/openai/apps-sdk-ui)
- OpenAI Apps SDK docs — https://developers.openai.com/apps-sdk/deploy/submission
