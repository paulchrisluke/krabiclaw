# ChatGPT App — Onboarding & Welcome Experience

## Problem

When a user connects the KrabiClaw MCP connector to ChatGPT, the session starts cold. ChatGPT
has no site context — it doesn't know which of the user's sites to target. The user either has
to say "my site is X" or hope ChatGPT proactively calls `list_sites` first.

Current mitigation: the `initialize.instructions` field tells ChatGPT to call `list_sites` first.
That works but produces a plain text list. The better experience is a rendered widget that lets
the user click to select their site and have that choice injected into the conversation context.

---

## How ChatGPT App Widgets Actually Work

This is the real architecture — not a separate web app deployment.

### The rendering model

1. A **render tool** returns a response with three parts:
   - `structuredContent` — the data object (e.g., `{ sites: [...] }`)
   - `content` — text fallback for clients that don't support widgets
   - `metadata._meta["openai/outputTemplate"]` — `ui://` URI pointing to the registered widget

2. ChatGPT loads the widget (a compiled React bundle) and runs it in a sandboxed **iframe**.

3. The iframe communicates with ChatGPT via **JSON-RPC 2.0 over `postMessage`** (the MCP Apps bridge).

4. The widget receives data via `ui/notifications/tool-result` and can call back to ChatGPT via:
   - `tools/call` — invoke an MCP tool from a UI interaction
   - `ui/message` — append a follow-up message to the conversation
   - `ui/update-model-context` — inject state into the model's context (how we store site_id)

### Where the widget lives

The widget is a **compiled React bundle** (esbuild → single ESM `.js` file) registered as an **MCP resource**
on our existing server. The `ui://site-picker` URI is resolved by ChatGPT against our server's registered
resources — no separate deployment needed. It's served from the same Cloudflare Worker as `/api/mcp`.

### Build command

```bash
esbuild widgets/site-picker/index.tsx --bundle --format=esm --outfile=widgets/dist/site-picker.js
```

### Tool pattern: data tools vs render tools

The recommended pattern separates concerns so the model can refine data before rendering:

- **Data tool** (`list_sites`) — fetches/processes, returns text + `structuredContent`, no template
- **Render tool** (`show_site_picker`) — receives data (or fetches it), returns `structuredContent` + template URI

This lets ChatGPT optionally call `list_sites` first, then pass filtered results to `show_site_picker`.

### Available pre-built component patterns (from OpenAI Apps SDK plan docs)

OpenAI documents five canonical UI patterns in the apps-sdk-ui component library:

| Component | Purpose |
|-----------|---------|
| **List** | Dynamic collections with empty-state handling — **this is our site picker** |
| **Map** | Geographic data with marker clustering |
| **Album** | Media grids with fullscreen transitions |
| **Carousel** | Featured content with swipe gesture support |
| **Shop** | Product browsing with checkout affordances |

The site picker is a **List** with a selection action and empty state.

---

## Architecture for the Site Picker

### New render tool: `show_site_picker`

Added to `mcp-tools.ts` and `mcp-executor.ts`. Internally calls `listSitesForUser` workflow
(already exists in `mcp-workflows.ts`) and returns the result as structured data with the widget
template reference.

**Tool response shape:**

```json
{
  "structuredContent": {
    "sites": [
      { "id": "site-pottery-house-krabi", "name": "Pottery House Krabi", "subdomain": "pottery-house", "status": "live", "publicUrl": "https://pottery-house.krabiclaw.com" }
    ]
  },
  "content": [{ "type": "text", "text": "You have 1 site: Pottery House Krabi. Working with it now." }],
  "metadata": {
    "_meta": {
      "openai/outputTemplate": "ui://site-picker"
    }
  }
}
```

### MCP resource: the widget bundle

Register the compiled bundle as a resource named `ui://site-picker`. ChatGPT resolves this URI
against our server's resource list. The bundle is served via a dedicated endpoint:

```
GET /api/mcp/widgets/site-picker.js   → returns widgets/dist/site-picker.js (ESM)
```

`resources/list` currently returns `[]`. We update it to advertise:

```json
{
  "resources": [
    { "uri": "ui://site-picker", "name": "Site Picker Widget", "mimeType": "application/javascript" }
  ]
}
```

### Widget behavior

```
structuredContent.sites → render list

No sites        → show "Create your first site" button
                   → calls create_site tool via bridge
                   → shows inline name/subdomain inputs

One site        → auto-confirm, show site name/status badge
                   → immediately calls ui/update-model-context with { site_id }

Multiple sites  → render clickable list
                   → user clicks → calls ui/update-model-context with { site_id }
                   → calls ui/message with "Working with [site name]."
```

### Context injection

After site selection, the widget calls `ui/update-model-context` via the postMessage bridge:

```js
// Standard MCP Apps bridge call
window.parent.postMessage({
  jsonrpc: '2.0',
  method: 'ui/update-model-context',
  params: { context: { site_id: selectedSiteId, site_name: selectedSiteName } }
}, '*')
```

Or via `window.openai` if the ChatGPT host provides it (it's optional):

```js
// ChatGPT-specific extension (available in ChatGPT, optional in other hosts)
window.openai?.updateModelContext?.({ site_id: selectedSiteId, site_name: selectedSiteName })
```

From that point in the conversation, ChatGPT has `site_id` in context and passes it to subsequent
tool calls automatically. No server-side session storage needed.

### Widget state (within-session only)

To preserve selection state across tool calls within the same widget session (e.g., which row
is highlighted before the user confirms):

```js
window.openai?.setWidgetState?.({ selectedSiteId })
```

This is local to the iframe — not model-visible. Use `ui/update-model-context` for anything the
model should know about.

---

## Component Spec (React + apps-sdk-ui)

Our main app is Nuxt (Vue). The widget is a **separate React build target** — a small isolated
bundle compiled by esbuild, not part of the Nuxt build.

### File layout

```
widgets/
  site-picker/
    SitePicker.tsx          ← main component
    index.tsx               ← entry point (esbuild target)
    build.ts                ← esbuild build script
  dist/
    site-picker.js          ← compiled output, served as MCP resource
```

### Component states

**No sites**

```
┌─────────────────────────────────────┐
│  Welcome to KrabiClaw               │
│                                     │
│  You don't have any sites yet.      │
│                                     │
│  [  + Create your first site  ]     │
└─────────────────────────────────────┘
```

**One site (auto-confirm)**

```
┌─────────────────────────────────────┐
│  KrabiClaw                  ● Live  │
│  Pottery House Krabi                │
│  pottery-house.krabiclaw.com        │
└─────────────────────────────────────┘
```
*(No button required — auto-calls `ui/update-model-context` on mount)*

**Multiple sites**

```
┌─────────────────────────────────────┐
│  Your Sites                         │
│                                     │
│  ○ Pottery House Krabi      ● Live  │
│    pottery-house.krabiclaw.com      │
│                                     │
│  ○ The Grotto               ● Live  │
│    the-grotto.krabiclaw.com         │
│                                     │
│  [  Select site  ]                  │
└─────────────────────────────────────┘
```

### Props

```ts
interface Site {
  id: string
  name: string
  subdomain: string
  publicUrl?: string
  status: 'live' | 'draft' | 'inactive'
}

interface SitePickerProps {
  sites: Site[]   // from structuredContent
}
```

### apps-sdk-ui components used

- `Badge` — site status (● Live / Draft)
- `Button` — "Select site", "Create your first site"
- `Icon.Globe` or similar — site URL decoration

---

## Implementation Plan

### Phase 1 — MCP instructions (done ✅)

- [x] Rewrite `initialize.instructions` to direct ChatGPT to call `list_sites` first
- [x] Update `server/discover` instructions to the same effect

### Phase 2 — Site picker widget

- [ ] Add `show_site_picker` render tool to `mcp-tools.ts` (minimumRole: editor, no site_id required, global tool)
- [ ] Add `show_site_picker` case to `mcp-executor.ts` — calls `listSitesForUser` workflow, returns `structuredContent` + `_meta` template ref
- [ ] Update `resources/list` handler in `mcp.post.ts` to advertise the widget resource
- [ ] Scaffold `widgets/site-picker/` with esbuild config
- [ ] Build `SitePicker.tsx` using `@openai/apps-sdk-ui` components
- [ ] Wire `ui/update-model-context` call on site selection
- [ ] Serve `widgets/dist/site-picker.js` from a static asset endpoint (e.g. `GET /api/mcp/widgets/site-picker.js`)
- [ ] Update `initialize.instructions` to say "call show_site_picker at the start of every conversation"
- [ ] E2E test: `show_site_picker` returns correct `structuredContent` shape

### Phase 3 — Create site inline (from widget)

- [ ] Wire "Create your first site" button in the widget to call `create_site` via postMessage bridge
- [ ] After creation, re-render widget with the new site selected

---

## What we do NOT need

- A separate Cloudflare Worker or Pages deployment for the widget
- A server-side session store for the selected site_id (handled by `ui/update-model-context`)
- Any changes to the OAuth flow
- Any changes to how existing tools work

---

## Reference

- `server/api/mcp.post.ts` — `initialize` handler, `resources/list` handler (to update)
- `server/utils/mcp-tools.ts` — add `show_site_picker` global tool
- `server/utils/mcp-executor.ts` — add `show_site_picker` case
- `server/utils/mcp-workflows.ts` — `listSitesForUser` already exists, reuse it
- `chatgpt-app-submission.json` — OpenAI app submission metadata
- [`@openai/apps-sdk-ui`](https://github.com/openai/apps-sdk-ui) — React component library
- OpenAI Apps SDK — [build/chatgpt-ui](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
