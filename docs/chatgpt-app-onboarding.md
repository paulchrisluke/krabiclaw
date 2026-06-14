# ChatGPT App — Onboarding & Site Creation Experience

**Primary goal:** Make the first-time experience feel like magic.
They paste a Google Maps link. KrabiClaw does the rest.

---

## Context & Problem

When a user connects KrabiClaw to ChatGPT they land in one of two states:

| State | Experience |
|-------|-----------|
| **Has sites** | Site picker list → pick which site to manage |
| **No sites** | Create site flow → Google Maps link → AI builds the whole thing |

**The onboarding flow (no sites) is the primary focus of this spec.** Management tools
come after. A new restaurant owner typically only has:
- A Google Maps listing (full or short URL — we accept both)
- Maybe an Instagram or Facebook page

They want AI to handle everything else: name, photos, description, hours, contact info,
site copy, and generated hero images if photos are sparse. This spec designs that experience.

---

## Widget Architecture (ground truth)

### How widgets render in ChatGPT

1. An MCP render tool returns a response with `metadata._meta["openai/outputTemplate"]` pointing
   to a versioned widget bundle URL.
2. ChatGPT fetches the bundle (versioned HTML + JS + CSS in `assets/`) and renders it in an **iframe**.
3. The iframe communicates with ChatGPT via **JSON-RPC 2.0 over `postMessage`** (MCP Apps bridge):
   - Receive: `ui/notifications/tool-result` — tool data arrives
   - Send: `tools/call` — invoke an MCP tool from a button click
   - Send: `ui/update-model-context` — inject state the model should know (`site_id`, progress)
   - Send: `ui/message` — append a follow-up message to the conversation

### Build pipeline

Widgets are built with **Vite** (see [`openai-apps-sdk-examples`](https://github.com/openai/openai-apps-sdk-examples)):
- Source: `widgets/src/<widget-name>/index.tsx`
- Output: versioned `assets/<widget-name>.<hash>.html` + `.js` + `.css`
- Served from: `GET /api/mcp/assets/<filename>` on the Cloudflare Worker

The `assets/` directory is built on deploy — not committed with hashes.

### Tool response format (render tool)

```json
{
  "structuredContent": { },
  "content": [{ "type": "text", "text": "fallback text for non-widget clients" }],
  "metadata": {
    "_meta": {
      "openai/outputTemplate": "https://krabiclaw.com/api/mcp/assets/welcome-list.<hash>.html"
    }
  }
}
```

### Data tools vs render tools

| Type | Returns | When to use |
|------|---------|-------------|
| **Data tool** | `structuredContent` only, no template | Fetch/process; model may refine before rendering |
| **Render tool** | `structuredContent` + `_meta` template | Data is ready; present UI to user |

Pattern: model calls data tool → refines → calls render tool.
See [pizzaz-list example](https://github.com/openai/openai-apps-sdk-examples/tree/main/src/pizzaz-list).

### Available SDK component patterns ([plan/components](https://developers.openai.com/apps-sdk/plan/components))

| Component | Use in onboarding |
|-----------|------------------|
| **List** | Site picker with welcome header (Screen 1) |
| **Album** | Imported photos from Google Maps (Screen 4) |
| **Carousel** | Generated hero images (Screen 5) |
| **Map** | Imported location pin (optional, inside Album widget) |

---

## Existing Infrastructure (read before building anything)

Before writing new code, confirm what already exists:

### Google Places — already fully wired

`GOOGLE_PLACES_API_KEY` is already a Cloudflare secret. `server/utils/google-places.ts` exports:
- `searchPlaces(apiKey, query)` — text search
- `getPlaceDetails(apiKey, placeId)` — full detail fetch (phone, hours, address, rating, reviews)
- `syncPlaceToLocation(db, apiKey, ...)` — Places API → D1 location row + upserts reviews

The existing `DETAIL_FIELD_MASK` does **not** include `photos` — this needs to be added for the
import flow (see Phase 3 below).

### Maps URL parsing — already implemented in Chowbot

`server/utils/chowbot-agent.ts` has a working `lookup_maps_url` tool handler at line ~2577 that:
1. Accepts both full URLs (`google.com/maps/place/...`) and short share links (`maps.app.goo.gl/...`)
2. Resolves short URLs transparently via `HEAD` + `redirect: manual` + `Location` header
3. Extracts the place_id using `!1s([^!&]+)` regex → gives `ChIJ...` format place_id
4. Calls `getPlaceDetails(apiKey, placeId)` from `google-places.ts`

**The MCP `import_from_maps` tool is a direct port of this logic** — no new parsing algorithm.
Short URLs are resolved server-side; the user never needs to know which format they used.

### Site preview — hero image card

The `show_site_preview` MCP tool queries the primary location's `hero_image_public_url` (via
a `LEFT JOIN media_assets`) and returns it as `ogImageUrl` in `structuredContent`. The widget
renders a static `<img>` tag in a 3:2 card — no iframe, no headless browser, no screenshot service.

If the site has no hero image yet (e.g. immediately after `create_site` before photos are added),
the widget shows a styled link card with the site name and URL instead.

---

## Onboarding Flow — Step by Step

### Entry point

`initialize.instructions` already directs ChatGPT to call `show_welcome` first. After Phase 2
ships, update this to:

> "Call `show_welcome` at the start of every new conversation to greet the user and discover
> their sites. If they have no sites, the welcome widget will start the create flow."

---

### Screen 1 — WelcomeList widget

**Render tool:** `show_welcome`  
**Widget:** `widgets/src/welcome-list/index.tsx`  
**SDK pattern:** List with header ([pizzaz-list example](https://github.com/openai/openai-apps-sdk-examples/tree/main/src/pizzaz-list))

The header is always present — it gives the user context before they see the list.

#### Mockup — no sites (new user)

```
┌─────────────────────────────────────────────┐
│  Welcome to KrabiClaw                       │
│                                             │
│  Your AI-powered business website,          │
│  built from your Google Maps listing        │
│  in minutes.                                │
│                                             │
│  ──────────────────────────────────────     │
│                                             │
│  You don't have any sites yet.              │
│                                             │
│  [  + Create your first site  ]            │
└─────────────────────────────────────────────┘
```

#### Mockup — returning user (has sites)

```
┌─────────────────────────────────────────────┐
│  Welcome back                               │
│  Which site would you like to work with?    │
│                                             │
│  ──────────────────────────────────────     │
│                                             │
│  ○  Pottery House Krabi          ● Live     │
│     pottery-house.krabiclaw.com             │
│                                             │
│  ○  The Grotto                   ● Live     │
│     the-grotto.krabiclaw.com                │
│                                             │
│  [ Select site ]    [ + New site ]          │
└─────────────────────────────────────────────┘
```

#### Behavior

- On mount: receives `structuredContent.sites` from `show_welcome`
- **Single site:** auto-selects, calls `ui/update-model-context({ site_id, site_name })`
- **Multiple sites:** user clicks a row → same
- **"Create" button:** calls `ui/message("Let's create a new site.")` → ChatGPT starts the create flow (Screens 2–7)
- **"What's next?"** (returning user after selection): `ui/message("What would you like to do with [name]?")` → management mode

#### `structuredContent` shape

```ts
{
  sites: Array<{
    id: string
    name: string
    subdomain: string
    publicUrl: string
    status: 'live' | 'draft' | 'inactive'
  }>
}
```

---

### Screen 2 — Create site: business type

**Render tool:** `show_vertical_picker`  
**Widget:** `widgets/src/vertical-picker/index.tsx`  
**SDK pattern:** List

Instead of asking in plain text, the model calls `show_vertical_picker` to present the verticals as a sleek, clickable list widget.

#### Mockup

```
┌─────────────────────────────────────────────┐
│  What type of business is this?             │
│                                             │
│  [ Restaurant / Café / Bar ]                │
│  [ Experience / Activity   ]                │
│  [ Retail / Shop           ]                │
│  [ Wellness / Spa          ]                │
│  [ Service business        ]                │
└─────────────────────────────────────────────┘
```

User clicks an option → Widget calls `ui/update-model-context({ vertical: 'restaurant' })` and moves to Screen 3.

---

### Screen 3 — Google Maps URL (conversation)

**No widget.** The model asks:

> "Paste your Google Maps link and I'll import your business details automatically.
> Works with the full URL or a share link — either is fine."

Both URL formats are accepted server-side. The model does not need to instruct the user
on which format to use — `import_from_maps` resolves short URLs transparently.

Optionally:
> "Got an Instagram or Facebook page? Paste those too and I'll pull in extra context."

---

### Screen 4 — Import in progress (Album widget)

**Render tool:** `import_from_maps`  
**Widget:** `widgets/src/photo-album/index.tsx`  
**SDK pattern:** Album ([plan/components](https://developers.openai.com/apps-sdk/plan/components))

The model calls `import_from_maps` with the Maps URL (+ optional social URLs).
The tool resolves, fetches, uploads photos to Cloudflare Images, and returns the Album widget.

#### What `import_from_maps` fetches

| Field | Source | Notes |
|-------|--------|-------|
| Name | Places API | `displayName.text` |
| Address | Places API | `formattedAddress` |
| City | Places API | extracted from `addressComponents` |
| Phone | Places API | `nationalPhoneNumber` |
| Website | Places API | `websiteUri` |
| Opening hours | Places API | `regularOpeningHours.weekdayDescriptions` |
| Rating + review count | Places API | `rating`, `userRatingCount` |
| Reviews (up to 5) | Places API | passed to `syncPlaceToLocation` |
| Photos (up to 10) | Places API `photos` field | **requires extending `DETAIL_FIELD_MASK`** |

Photos are fetched from Places API, downloaded by the Worker, and uploaded to Cloudflare
Images via `requestImageUpload` / `createMediaAsset` (same flow as `request_media_upload` MCP tool).

#### `structuredContent` shape

```ts
{
  business: {
    name: string
    address: string
    phone: string | null
    hours: string[]          // ["Monday: 9:00 AM – 6:00 PM", ...]
    rating: number | null
    reviewCount: number | null
    placeId: string
    mapsUrl: string
  }
  photos: Array<{
    assetId: string          // media_assets.id in D1
    publicUrl: string        // Cloudflare Images URL
  }>
  missingPhotos: boolean     // true if fewer than 3 photos found
}
```

#### Mockup — Album widget

```
┌─────────────────────────────────────────────┐
│  Pottery House Krabi                        │
│  ★ 4.8 · 243 reviews                       │
│                                             │
│  ┌──────┐ ┌──────┐ ┌──────┐               │
│  │      │ │      │ │      │               │
│  └──────┘ └──────┘ └──────┘               │
│  ┌──────┐ ┌──────┐                         │
│  │      │ │      │                         │
│  └──────┘ └──────┘                         │
│                                             │
│  123 Moo 5, Ao Nang, Krabi 81000           │
│  Mon–Sat 9:00 AM – 6:00 PM                 │
│                                             │
│  [ Looks good, build the site ]             │
└─────────────────────────────────────────────┘
```

If `missingPhotos: true`, the widget adds below the grid:

```
  ⚠ Only 2 photos found on Google Maps.
    [ Generate hero images with AI ]  [ Skip, use what we have ]
```

---

### Screen 5 — Image generation (Carousel widget)

**Triggered when:** `missingPhotos: true` and user clicks "Generate hero images".

**How it works:** ChatGPT calls the native `image_generation` tool (built into ChatGPT via the
[Responses API](https://developers.openai.com/api/docs/guides/image-generation)) — no MCP tool
needed for generation. The model generates 2–3 images, then calls our existing MCP tools to
persist them (`request_media_upload` → upload → `confirm_media_upload`).

The model uses a prompt it constructs from the imported business data:
```
Professional photograph of [name], a [vertical] in [city], [country].
[description or address context]. Warm natural lighting, high quality.
Style: editorial lifestyle photography. Aspect ratio 3:2.
```

**Render tool:** `show_generated_images`  
**Widget:** `widgets/src/image-carousel/index.tsx`  
**SDK pattern:** Carousel

#### `structuredContent` shape

```ts
{
  images: Array<{
    assetId: string
    publicUrl: string
  }>
}
```

#### Mockup

```
┌─────────────────────────────────────────────┐
│  ← AI-Generated Hero Images        2 / 3 → │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │   [generated landscape image]       │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [ ✓ Use this one ]  [ Try again ]         │
└─────────────────────────────────────────────┘
```

"Use this one" calls `ui/update-model-context({ heroAssetId })` and closes the carousel.
"Try again" calls `tools/call("show_generated_images", { regenerate: true })`.

---

### Screen 6 — Site creation summary (conversation)

**No widget.** The model summarises what it's about to build:

```
Here's what I'll create:

Site name: Pottery House Krabi
URL: pottery-house.krabiclaw.com
Type: Experience

Importing from Google Maps:
✓ 5 photos
✓ Business hours (Mon–Sat 9:00 AM – 6:00 PM)
✓ Phone: +66 81 234 5678
✓ 243 reviews (★ 4.8)
✓ Address: 123 Moo 5, Ao Nang, Krabi

Ready to build?
```

User confirms → model calls `create_site` then `create_location` with all collected data
(including `maps_url`, `google_place_id`, `hero_image_asset_id` if generated).

---

### Screen 7 — Site preview (static image card)

**Render tool:** `show_site_preview`  
**Widget:** `widgets/src/site-preview/index.tsx`  
**SDK pattern:** Carousel

After `create_site` + `create_location` succeed, the model calls `show_site_preview`. The
`show_site_preview` tool queries the primary location's hero image and returns it as `ogImageUrl`.
The widget renders it as a static `<img>` card (aspect ratio 3:2). If no hero image exists yet,
a styled link card shows the site name and URL instead.

The page navigation controls are still present — each page's `path` is appended to `publicUrl`
when the user clicks "Open site".

#### `structuredContent` shape

```ts
{
  site: {
    id: string
    name: string
    subdomain: string
    publicUrl: string   // https://{subdomain}.krabiclaw.com
  }
  pages: Array<{
    label: string   // "Home", "Location", etc.
    path: string    // "/", "/{locationSlug}"
  }>
  ogImageUrl: string | null   // primary location hero_image_public_url, or null
}
```

#### Mockup — with hero image

```
┌─────────────────────────────────────────────┐
│  ✓ Your site is live!         Home  1 / 2 →│
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │   [hero image, 3:2 aspect ratio]    │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  pottery-house.krabiclaw.com               │
│                                             │
│  [ ↗ Open site ]   [ What's next? ]        │
└─────────────────────────────────────────────┘
```

#### Mockup — no hero image (link card fallback)

```
┌─────────────────────────────────────────────┐
│  ✓ Your site is live!         Home  1 / 2 →│
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │         Pottery House Krabi         │   │
│  │   pottery-house.krabiclaw.com       │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  pottery-house.krabiclaw.com               │
│                                             │
│  [ ↗ Open site ]   [ What's next? ]        │
└─────────────────────────────────────────────┘
```

"Open site" opens `publicUrl + currentPage.path` in a new tab.  
"What's next?" sends `ui/message("What else would you like to set up?")` → management mode.

---

## New MCP Tools Required

| Tool | Type | Reuses existing code |
|------|------|---------------------|
| `show_welcome` | render | Wraps `listSitesForUser` from `mcp-workflows.ts` |
| `import_from_maps` | data + render | Ports `lookup_maps_url` from `chowbot-agent.ts` + adds photo download + Cloudflare Images upload |
| `show_generated_images` | render | New widget only; image generation done by ChatGPT natively |
| `show_site_preview` | render | New widget; iframe pattern from `templates.vue` |

`create_site`, `create_location`, `request_media_upload`, `confirm_media_upload` already exist
and are called directly by the model (not as render tools).

---

## Implementation Plan

### Phase 1 — MCP instructions (done ✅)
- [x] Rewrite `initialize.instructions` to direct ChatGPT to call list_sites / show_welcome
- [x] Update `server/discover` instructions

### Phase 2 — WelcomeList widget
- [ ] Add `show_welcome` render tool to `mcp-tools.ts` + `mcp-executor.ts`
- [ ] Build `widgets/src/welcome-list/index.tsx` — List pattern, header copy, empty state CTA
- [ ] Vite build config → `assets/welcome-list.<hash>.html|js|css`
- [ ] `GET /api/mcp/assets/:filename` endpoint on the Worker (static passthrough)
- [ ] Update `resources/list` to advertise widget resources
- [ ] Update `initialize.instructions`: "call show_welcome at the start of every conversation"
- [ ] E2E: `show_welcome` returns correct `structuredContent` shape for 0, 1, and N sites

### Phase 3 — Maps import + Album widget
- [ ] Extend `DETAIL_FIELD_MASK` in `server/utils/google-places.ts` to include `photos`
- [ ] Add photo download + Cloudflare Images upload to `google-places.ts` (reuse `requestImageUpload`)
- [ ] Add `import_from_maps` tool — port URL parsing + redirect resolution from `chowbot-agent.ts`
  line ~2577, call updated `google-places.ts`, return Album `structuredContent` + widget template
- [ ] Build `widgets/src/photo-album/index.tsx` — Album pattern, business summary header, `missingPhotos` prompt
- [ ] E2E: import from a known Maps URL (Pottery House Krabi) returns correct data + uploaded photos

### Phase 4 — Image generation Carousel
- [ ] Build `widgets/src/image-carousel/index.tsx` — Carousel pattern, "Use this one" / "Try again"
- [ ] Add `show_generated_images` render tool (input: `images[]`, output: Carousel widget)
- [ ] Update `initialize.instructions` to guide the model to generate images when `missingPhotos: true`

### Phase 5 — Site preview static image card
- [ ] Build `widgets/src/site-preview/index.tsx` — static `<img>` card (or link-card fallback) with page nav
- [ ] Add `show_site_preview` render tool (input: `site_id`, output: widget with `ogImageUrl`)
- [ ] E2E: `show_site_preview` for a live site returns `ogImageUrl` and correct pages array

---

## What we do NOT need

- A separate Cloudflare Worker or Pages deployment for widgets (served from existing Worker)
- Server-side session storage (handled by `ui/update-model-context`)
- A headless browser, screenshot service, or iframe (site preview uses the hero image from D1)
- Any new Google Places API key (already configured as `GOOGLE_PLACES_API_KEY` secret)
- New URL parsing code (already in `chowbot-agent.ts`, port it)

---

## Remaining Open Questions

1. **Google Places photos** — the Places API v1 `photos` field returns `name` references,
   not direct URLs. Fetching the actual image requires a separate request to
   `/v1/{name}/media?key=...&maxHeightPx=800`. Need to confirm billing tier and per-photo cost.
   Reference: [Places API photos](https://developers.google.com/maps/documentation/places/web-service/photos)

2. **Site preview mechanism** — [Resolved] The widget displays the primary location's `hero_image_public_url` as a static `<img>` card. No iframe, no headless browser needed.
3. **Widget asset versioning** — should we commit `assets/` to the repo or build on deploy? (Recommend: build on deploy via `wrangler deploy` pre-step, not commit the hashes.)
4. **Image generation cost** — `gpt-image-2` at `1536x1024` medium quality costs ~$0.04 per image. Budget per onboarding: 2–3 images = ~$0.12. Acceptable?
5. **Short URL resolution** — [Resolved] We will accept both and transparently resolve `maps.app.goo.gl` on the server by following the redirect.

---

## Reference

| Resource | Link |
|----------|------|
| OpenAI Apps SDK | https://developers.openai.com/apps-sdk |
| Apps SDK — component patterns | https://developers.openai.com/apps-sdk/plan/components |
| Apps SDK — ChatGPT UI / widget bridge | https://developers.openai.com/apps-sdk/build/chatgpt-ui |
| Apps SDK — submission | https://developers.openai.com/apps-sdk/deploy/submission |
| apps-sdk-ui component library | https://github.com/openai/apps-sdk-ui |
| SDK examples repo | https://github.com/openai/openai-apps-sdk-examples |
| Pizzaz list example (List pattern) | https://github.com/openai/openai-apps-sdk-examples/tree/main/src/pizzaz-list |
| Image generation API | https://developers.openai.com/api/docs/guides/image-generation |
| Google Places API (New) | https://developers.google.com/maps/documentation/places/web-service |
| Places API — photos | https://developers.google.com/maps/documentation/places/web-service/photos |
| `server/utils/google-places.ts` | Existing Places API client (`getPlaceDetails`, `syncPlaceToLocation`) |
| `server/utils/chowbot-agent.ts` line ~2577 | `lookup_maps_url` handler — port this for `import_from_maps` |
| `server/utils/mcp-executor.ts` | `show_site_preview` case — joins media_assets for `ogImageUrl` |
| `chatgpt-app-submission.json` | OpenAI submission metadata |
