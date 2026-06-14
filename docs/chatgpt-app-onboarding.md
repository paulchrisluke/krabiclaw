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

1. A tool returns a response with three parts:
   - `structuredContent` — the data (e.g., `{ sites: [...] }`)
   - `content` — text fallback for clients that don't support widgets
   - `_meta["openai/outputTemplate"]` — URI pointing to the widget

2. ChatGPT fetches the widget bundle from that URI and runs it in a sandboxed **iframe**.

3. The iframe communicates with ChatGPT via **JSON-RPC 2.0 over `postMessage`** (the MCP Apps bridge).

4. The widget can call tools back (`tools/call` via bridge) and, critically, inject data into
   the conversation context via `ui/update-model-context`.

### Where the widget lives

The widget is a **compiled React bundle** (esbuild → single `.js` file) registered as an **MCP resource**
on our existing server. ChatGPT requests it the same way it requests any MCP resource. No separate
deployment needed — it's served from the same Cloudflare Worker that hosts `/api/mcp`.

### Tool pattern: data tools vs render tools

Separate the concerns:
- **Data tool** — fetches and processes (e.g., `list_sites`) — text only, no widget
- **Render tool** — fetches data, wraps it in `structuredContent`, returns template reference

---

## Architecture for the Site Picker

### New render tool: `show_site_picker`

Added to `mcp-tools.ts` and `mcp-executor.ts`. Internally calls `list_sites` workflow and
returns the result as structured data with the widget template reference.

**Tool response shape:**

```json
{
  "structuredContent": {
    "sites": [
      { "id": "site-pottery-house-krabi", "name": "Pottery House Krabi", "subdomain": "pottery-house", "status": "live" }
    ]
  },
  "content": [{ "type": "text", "text": "You have 1 site: Pottery House Krabi. Select it to continue." }],
  "_meta": {
    "openai/outputTemplate": "mcp://resources/ui/site-picker"
  }
}
```

### MCP resource: the widget bundle

Register a resource at `mcp://resources/ui/site-picker` (or served via a `/api/mcp/widgets/site-picker.js`
endpoint) that returns the compiled React bundle.

`resources/list` currently returns `[]`. We update it to advertise the widget resources.

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

After site selection, the widget calls `ui/update-model-context`:

```js
window.openai.updateModelContext({ site_id: selectedSiteId, site_name: selectedSiteName })
```

From that point in the conversation, ChatGPT has `site_id` in context and passes it to subsequent
tool calls automatically. No server-side session storage needed.

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
