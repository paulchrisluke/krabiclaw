# ChatGPT App — Onboarding & Site Creation Experience

**Primary goal:** Make the first-time experience for a new restaurant owner feel like magic.
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
- A Google Maps listing (full URL)
- Maybe an Instagram or Facebook page

They want AI to handle everything else: name, photos, description, hours, contact info,
menu extraction, hero images, site copy. This spec designs that experience.

---

## Widget Architecture (ground truth)

### How widgets render in ChatGPT

1. An MCP tool returns a response with `_meta["openai/outputTemplate"]` pointing to a bundled widget.
2. ChatGPT fetches the bundle (versioned HTML + JS + CSS in `assets/`) and renders it in an **iframe**.
3. The iframe communicates with ChatGPT via **JSON-RPC 2.0 over `postMessage`** (MCP Apps bridge):
   - Receive: `ui/notifications/tool-result` — tool data arrives here
   - Send: `tools/call` — invoke a tool from a UI button click
   - Send: `ui/update-model-context` — inject state the model should know (site_id, progress)
   - Send: `ui/message` — append a follow-up message to the conversation

### Build pipeline

Widgets are built with **Vite** (see [`openai-apps-sdk-examples`](https://github.com/openai/openai-apps-sdk-examples)):
- Source: `widgets/src/<widget-name>/index.tsx`
- Output: versioned `assets/<widget-name>.<hash>.html` + `.js` + `.css`
- Served from: our MCP Worker at `GET /api/mcp/assets/<filename>`

The `assets/` folder contents are committed and served as static files — no dynamic build on request.

### Tool response format (render tool)

```json
{
  "structuredContent": { /* data the widget renders */ },
  "content": [{ "type": "text", "text": "/* text fallback */" }],
  "metadata": {
    "_meta": {
      "openai/outputTemplate": "https://krabiclaw.com/api/mcp/assets/welcome.<hash>.html"
    }
  }
}
```

### Data tools vs render tools

| Type | Returns | When to use |
|------|---------|-------------|
| **Data tool** | `structuredContent` only, no template | Fetching/processing; model may refine before rendering |
| **Render tool** | `structuredContent` + `_meta` template | Present UI to user; data is ready |

Pattern: model calls data tool → refines results → calls render tool. See [pizzaz-list example](https://github.com/openai/openai-apps-sdk-examples/tree/main/src/pizzaz-list).

### Available SDK component patterns (from [plan/components](https://developers.openai.com/apps-sdk/plan/components))

| Component | Use in onboarding |
|-----------|------------------|
| **List** | Site picker, feature checklist |
| **Album** | Imported photos from Google Maps / Instagram |
| **Carousel** | Site preview / generated hero images |
| **Map** | Show the imported location pin |
| **Shop** | Plan selection (upgrade prompt) |

---

## Onboarding Flow — Step by Step

### Entry point

ChatGPT initializes the connection. The `initialize.instructions` tell the model:

> "Call `show_welcome` at the start of every new conversation."

`show_welcome` checks if the user has any sites:
- **Has sites** → returns site list → renders **WelcomeList widget** (existing user path)
- **No sites** → returns empty state → renders **WelcomeList widget** with create CTA

---

### Screen 1 — WelcomeList widget

**Render tool:** `show_welcome`  
**Widget:** `widgets/src/welcome-list/index.tsx`  
**SDK pattern:** List (see [pizzaz-list example](https://github.com/openai/openai-apps-sdk-examples/tree/main/src/pizzaz-list))

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
│  Welcome back to KrabiClaw                  │
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

- On mount: receives `structuredContent.sites` from the `show_welcome` tool
- Single site: auto-selects and calls `ui/update-model-context({ site_id, site_name })`
- Multiple sites: user clicks → same
- "Create" button: calls `ui/message("Let's create a new site. What type of business?")` to start the creation flow

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
  user: { name: string }
}
```

---

### Screen 2 — Create site: business type

**No widget.** The model asks in conversation:

> "What type of business is this?
> - Restaurant / Café / Bar
> - Experience / Activity
> - Retail / Shop
> - Wellness / Spa
> - Service business"

User replies → model stores the vertical and moves to Screen 3.

---

### Screen 3 — Google Maps URL input

**No widget.** The model asks in conversation, with precise instructions to the user:

```
To auto-import your business info and photos, paste your full Google Maps link.

Open Google Maps → find your business → tap the name to open its page → copy the URL
from the address bar.

✅ Correct:
https://www.google.com/maps/place/Pottery+House+Krabi/@8.0553488,98.751876,13z/data=!4m7...

❌ Not this (share shortlink — can't be imported):
https://maps.app.goo.gl/pN6EN49m4YrjK2Pg6

Optionally add your Instagram or Facebook page URL too.
```

**Why this matters:** the full Maps URL contains the `place_id` embedded in the `data=` segment
(e.g., `0x3051bf32a3c383ef:0xbea604beda84b3d1`). The short share URL does not expose the place_id
and cannot be resolved to structured data. We must ask for the full URL and validate it.

**Model validates:** the URL must start with `https://www.google.com/maps/place/` and contain
`data=` with a parseable place_id. If the user pastes the short URL, the model explains the
difference and asks again.

---

### Screen 4 — Import in progress (Album widget)

**Render tool:** `import_from_maps` (new tool)  
**Widget:** `widgets/src/photo-album/index.tsx`  
**SDK pattern:** Album (see [plan/components](https://developers.openai.com/apps-sdk/plan/components))

The model calls `import_from_maps` with the validated Maps URL (and optional social URLs).
While importing, the tool returns what it found — name, address, photos, hours, description —
and the Album widget renders the imported photos.

#### What the import tool fetches

| Field | Source | Notes |
|-------|--------|-------|
| Business name | Google Maps API (Places) | |
| Address | Places API | |
| Phone | Places API | |
| Website | Places API | |
| Hours | Places API | |
| Rating + review count | Places API | |
| Description | Places API editorial summary | |
| Photos | Places API (up to 10) | Downloaded, uploaded to Cloudflare Images |
| Price level | Places API | |
| Categories | Places API types | Mapped to our vertical |

#### `structuredContent` shape

```ts
{
  business: {
    name: string
    address: string
    phone: string
    hours: Record<string, string>   // "Monday": "9:00 AM – 6:00 PM"
    rating: number
    reviewCount: number
    description: string
    categories: string[]
    priceLevel: 1 | 2 | 3 | 4
  }
  photos: Array<{
    url: string              // Cloudflare Images URL (already uploaded)
    cloudflareImageId: string
    caption: string
  }>
  missingPhotos: boolean     // true if fewer than 3 photos found
  socialImport?: {
    instagramPosts: number
    facebookPosts: number
  }
}
```

#### Mockup — Album widget

```
┌─────────────────────────────────────────────┐
│  Pottery House Krabi                        │
│  ★ 4.8 · 243 reviews                       │
│                                             │
│  ┌──────┐ ┌──────┐ ┌──────┐               │
│  │photo1│ │photo2│ │photo3│               │
│  └──────┘ └──────┘ └──────┘               │
│  ┌──────┐ ┌──────┐                         │
│  │photo4│ │photo5│                         │
│  └──────┘ └──────┘                         │
│                                             │
│  123 Moo 5, Ao Nang, Krabi 81000           │
│  Mon–Sat 9:00 AM – 6:00 PM                 │
│                                             │
│  [ Looks good, build the site ]             │
└─────────────────────────────────────────────┘
```

If `missingPhotos: true` — the widget shows a note:

```
  ⚠ Only 2 photos found on Google Maps.
    [ Generate hero images with AI ]  [ Skip ]
```

---

### Screen 5 — Image generation (if needed)

**Triggered when:** fewer than 3 photos from Maps, or user clicks "Generate hero images."

**How it works:** The model uses the `image_generation` tool (built into ChatGPT via the
[Responses API](https://developers.openai.com/api/docs/guides/image-generation)). No MCP tool
needed — ChatGPT calls it directly.

**Prompt template the model uses:**

```
Professional photograph of [business name], a [vertical] business in [city].
[description from Maps]. Warm natural lighting, high quality.
Style: editorial food/lifestyle photography. Aspect ratio 3:2.
```

**What happens to the generated images:**

1. ChatGPT generates 2–3 images using `gpt-image-2` at `1536x1024` (landscape)
2. Model calls our `request_media_upload` tool to get a Cloudflare upload URL
3. Image bytes uploaded to Cloudflare Images
4. Model calls `confirm_media_upload` to activate
5. Carousel widget renders the approved images

**Render tool:** `show_generated_images`  
**Widget:** `widgets/src/image-carousel/index.tsx`  
**SDK pattern:** Carousel

#### Mockup — Carousel widget

```
┌─────────────────────────────────────────────┐
│  ← Generated Hero Images           2 / 3 → │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │   [generated landscape photo]       │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [ ✓ Use this one ]  [ Try again ]         │
└─────────────────────────────────────────────┘
```

User picks the image. Widget calls `ui/update-model-context({ heroImageId: 'cf-image-id' })`.

---

### Screen 6 — Site creation summary

**No widget.** The model shows a text summary in the conversation before creating:

```
Here's what I'll build for you:

Site name: Pottery House Krabi
URL: pottery-house.krabiclaw.com
Type: Experience
Location: 123 Moo 5, Ao Nang, Krabi

I'll add:
✓ 5 photos from Google Maps
✓ Business hours (Mon–Sat 9:00 AM – 6:00 PM)
✓ Contact info (+66 81 234 5678)
✓ Star rating & review count

Shall I build it now?
```

User says yes → model calls `create_site` then `create_location` with all collected data.

---

### Screen 7 — Site created confirmation (Carousel)

**Render tool:** `show_site_preview`  
**Widget:** `widgets/src/site-preview/index.tsx`  
**SDK pattern:** Carousel (pages of the new site)

After `create_site` + `create_location` succeed, the model calls `show_site_preview` which
renders a carousel of what the new site looks like — using the actual hosted site pages as
iframe screenshots or a simplified HTML preview.

#### Mockup

```
┌─────────────────────────────────────────────┐
│  ✓ Your site is live!              1 / 3 → │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  [Home page preview screenshot]     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  pottery-house.krabiclaw.com               │
│                                             │
│  [ Open site ]  [ What's next? ]           │
└─────────────────────────────────────────────┘
```

"Open site" calls `window.openai?.requestDisplayMode({ mode: 'fullscreen' })` and shows the
live URL. "What's next?" sends `ui/message("What else can I help you set up?")` to move into
the management flow.

---

## Google Maps URL — Validation Rules

The model must validate the Maps URL before calling `import_from_maps`. Rules:

| Check | Valid | Invalid |
|-------|-------|---------|
| Domain | `google.com/maps/place/` | `maps.app.goo.gl` |
| Has `data=` segment | yes | no |
| Place ID format | `0x[hex]:0x[hex]` in data | missing |

If user pastes the short share URL (`maps.app.goo.gl`):

> "That's a share shortlink — I can't read the full business details from it. To get your
> place info, open Google Maps in a browser, find your business, and copy the URL from the
> address bar. It will be long and start with `google.com/maps/place/`."

---

## New MCP Tools Required

| Tool | Type | What it does |
|------|------|-------------|
| `show_welcome` | render | Lists user's sites or empty state. Already implemented as `list_sites`; wrap into render tool that returns widget template. |
| `import_from_maps` | data + render | Fetches Google Places API data + photos, uploads to Cloudflare Images, returns Album widget |
| `show_generated_images` | render | Takes a list of asset_ids, returns Carousel widget |
| `show_site_preview` | render | Takes site_id, returns Carousel of live site screenshots |

`create_site`, `create_location`, `request_media_upload`, `confirm_media_upload` already exist.

---

## Implementation Plan

### Phase 1 — MCP instructions (done ✅)
- [x] Rewrite `initialize.instructions` to call `show_welcome` first
- [x] Update `server/discover` instructions

### Phase 2 — WelcomeList widget (site picker)
- [ ] Add `show_welcome` render tool to `mcp-tools.ts` + `mcp-executor.ts`
- [ ] Build `widgets/src/welcome-list/index.tsx` with List pattern + welcome header text
- [ ] Vite build config for widget bundle → `assets/`
- [ ] Serve `assets/` from `GET /api/mcp/assets/:filename` on the Worker
- [ ] Update `resources/list` to advertise widget resources
- [ ] Update `initialize.instructions` to say "call show_welcome first"
- [ ] E2E: `show_welcome` returns correct `structuredContent` shape

### Phase 3 — Google Maps import + Album widget
- [ ] Add `import_from_maps` tool (calls Google Places API → uploads photos → returns Album widget)
- [ ] Build `widgets/src/photo-album/index.tsx` with Album pattern
- [ ] Validation logic in executor: reject short URLs, extract place_id from full URLs
- [ ] E2E: import from a known Maps URL returns correct business data + photos

### Phase 4 — Image generation + Carousel widget
- [ ] Build `widgets/src/image-carousel/index.tsx` with Carousel pattern
- [ ] Add `show_generated_images` render tool (input: asset_ids array, output: Carousel widget)
- [ ] Update `initialize.instructions` to prompt the model to generate images when `missingPhotos: true`

### Phase 5 — Site preview Carousel
- [ ] Add `show_site_preview` render tool (input: site_id, output: Carousel of site pages)
- [ ] Decide implementation: actual screenshots via browser API or HTML-rendered preview
- [ ] E2E: `show_site_preview` returns Carousel with at least 1 slide for a live site

---

## What we do NOT need

- A separate Cloudflare Worker or Pages deployment for widgets
- Server-side session storage for site_id (handled by `ui/update-model-context`)
- Changes to OAuth flow
- Any changes to existing management tools

---

## Reference Docs

| Resource | Link |
|----------|------|
| OpenAI Apps SDK — build overview | https://developers.openai.com/apps-sdk |
| Apps SDK plan — component patterns | https://developers.openai.com/apps-sdk/plan/components |
| Apps SDK build — ChatGPT UI | https://developers.openai.com/apps-sdk/build/chatgpt-ui |
| Apps SDK deploy — submission | https://developers.openai.com/apps-sdk/deploy/submission |
| apps-sdk-ui component library | https://github.com/openai/apps-sdk-ui |
| SDK examples (pizzaz-list, carousel, album) | https://github.com/openai/openai-apps-sdk-examples |
| Pizzaz list example (List pattern) | https://github.com/openai/openai-apps-sdk-examples/tree/main/src/pizzaz-list |
| Image generation API | https://developers.openai.com/api/docs/guides/image-generation |
| Google Places API | https://developers.google.com/maps/documentation/places/web-service |
| `chatgpt-app-submission.json` | Project root — OpenAI submission metadata |

---

## Open Questions Before Implementation

1. **Google Places API key** — do we have one? The `import_from_maps` tool needs it. Add to `wrangler.toml` secrets.
2. **Screenshot mechanism for site preview** — use a headless browser service (Browserless, Cloudflare Browser Rendering) or render a simplified HTML preview in-widget?
3. **Widget asset versioning** — should we commit `assets/` to the repo or build on deploy? (Recommend: build on deploy via `wrangler deploy` pre-step, not commit the hashes.)
4. **Image generation cost** — `gpt-image-2` at `1536x1024` high quality costs ~$0.07 per image. Budget per onboarding: 2–3 images = ~$0.15. Acceptable?
5. **Short URL resolution** — can we resolve `maps.app.goo.gl` to the full URL by following the redirect? If yes, we can accept both and transparently resolve. (HTTP redirect → extract Location header → validate the full URL.)
