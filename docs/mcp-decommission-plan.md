# MCP Coverage & Dashboard Decommission Plan

The goal: ChatGPT MCP app is the primary editing surface. Dashboard is limited to billing,
settings, domains, members, and read-only inbox triage. No feature regressions.

---

## Current State

82 MCP tools cover the vast majority of site editing operations. The audit below tracks
what's left to add before each dashboard page can be removed.

---

## MCP Gaps to Fill (before decommissioning corresponding UI)

### 1. Domain Management — DONE ✓
Added June 2026: `list_domains`, `create_domain`, `set_canonical_domain`, `delete_domain`, `sync_domain`.
All backed by `server/utils/domains.ts` utility functions. Entitlement checked on `create_domain`.
Dashboard page `settings/domains.vue` can now be removed or redirected to ChatGPT.

### 2. Member Management — KEEP IN CMS (intentional)
User decision: member management stays in the CMS dashboard. No MCP tools needed.
Dashboard page: `settings/members.vue` (KEEP permanently)

### 3. Site Analytics — DONE ✓
Added June 2026: `get_site_analytics` reads `site_analytics_daily` and returns summary metrics,
top pages, and daily trends. Users can ask ChatGPT "how many visitors this month?"

### 4. Facebook Pages Integration — SPLIT

OAuth connect flow must stay in the dashboard (browser redirect to Facebook → callback).
That's a one-time setup. Ongoing publishing is now in MCP.

Added: `get_facebook_connection` — checks if a page is connected; if not, directs user to
dashboard integrations page. `publish_to_facebook` — publishes text + optional link to the
connected Facebook Page. Both gated by `managed_service` entitlement.

Dashboard OAuth pages: keep permanently (settings/integrations connect/callback flow).
Dashboard publish button: can be removed — MCP covers it.

### 5. Video/File Upload — dashboard upload surface, MCP for browsing

`POST /api/editor/sites/[siteId]/media/upload` streams large files (video, PDF) to R2.
ChatGPT cannot receive binary file uploads, so video upload must go through the browser.

**The existing `[locationSlug]/media.vue` page is the upload surface** — it already handles
both paths (images → Cloudflare Images up to 10 MB, videos → R2 up to 50 MB) with
drag-and-drop, grid browser, and delete. No new portal or pre-signed URL tool is needed.

MCP tools `list_media_assets`, `update_media_asset`, and `delete_media_asset` already exist.
Workflow: ChatGPT directs the user to their media library URL to upload the video, then calls
`list_media_assets` to get the returned `public_url` and places it on the page.

**Decision**: keep `[locationSlug]/media.vue` permanently for video/bulk upload. It is the
intentional upload surface — not a temporary workaround.

---

## Dashboard Pages — Decommission Status

### Safe to remove now (MCP fully covers, no gap)

These pages have complete MCP tool coverage. Remove once we confirm ChatGPT handles
each workflow end-to-end in staging.

| Page | Route | MCP tools |
|---|---|---|
| Menu editor | `[locationSlug]/menu/` | list/get/create/update/delete_menu, menu items, sections, reorder |
| Posts | `[locationSlug]/posts.vue` | list/get/create/update/delete/publish_post |
| Page content editor | `[locationSlug]/pages.vue` + `content.vue` | get/save/publish/discard/delete_content_draft |
| Photos | `[locationSlug]/photos.vue` | list/update/delete_media_asset |
| Q&A | `[locationSlug]/qa.vue` | list/create/update/delete/reorder_location_qa |
| Experiences | `[locationSlug]/experiences.vue` | list/get/create/update/delete_experience, bookings |
| Order (reorder) | `[locationSlug]/order.vue` | reorder_menu_items |
| Translations | `[orgSlug]/translations.vue` | full translation job + review + publish flow |

### Keep — by design or pending removal

| Page | Status |
|---|---|
| `settings/domains.vue` | MCP tools exist — can remove or replace with ChatGPT prompt |
| `settings/members.vue` | Intentionally kept in CMS (user decision) |
| `settings/billing.vue` | Stripe billing is dashboard-only by design — no MCP |
| `settings/general.vue` | Keep as settings fallback; MCP covers `update_site_settings` already |
| `[locationSlug]/media.vue` | Keep permanently — intentional upload surface for video/bulk (MCP handles browsing via `list_media_assets`) |

### Keep permanently (correct scope for dashboard)

| Page | Reason |
|---|---|
| `[locationSlug]/inbox.vue` | Triage UI — better as dashboard than chat |
| `[locationSlug]/reviews.vue` | Review inbox — better as dashboard |
| `[locationSlug]/reservations.vue` | Reservation management — better as dashboard |
| `settings/billing.vue` | Stripe billing, plan management — always dashboard |
| `account/settings/` | Personal account settings — not MCP scope |

---

## Files Already Removed (ChowBot decommission — June 2026)

- `server/utils/chowbot-agent.ts`
- `server/utils/chowbot-conversations.ts`
- `composables/useChowBot.ts`
- `composables/useChowBotHistory.ts`
- `components/dashboard/ChowBot.vue`
- `server/api/ai/[siteId]/agent.post.ts`
- `server/api/ai/[siteId]/conversations/*` (4 files)
- `server/api/ai/[siteId]/generate-image.post.ts`
- `server/api/ai/[siteId]/enhance-prompt.post.ts`
- `server/api/ai/[siteId]/posts/generate.post.ts`
- `server/api/ai/[siteId]/menu/extract.post.ts`
- `server/api/ai/[siteId]/credits.get.ts`
- `server/api/admin/ai/generate-image.post.ts`
- `server/api/admin/ai/generate.post.ts`
- `server/api/dev/chowbot-tool.post.ts`
- `server/api/whatsapp/webhook.{get,post}.ts`
- `pages/dashboard/[orgSlug]/conversations.vue`

### Remaining ChowBot-adjacent code to watch

- `server/utils/chowbot-media.ts` — kept because `import_menu_from_media` MCP tool uses
  `extractMenuFromMediaAsset`. Rename to `server/utils/media-extraction.ts` when refactoring.
- `server/utils/whatsapp.ts` — kept for notifications (OTP, reservation alerts, domain alerts).
  The ChowBot-via-WhatsApp path was in `webhook.post.ts` which is gone.
- `server/api/ai/[siteId]/menu/extract.post.ts` — already removed; MCP tool covers this.
- Marketing copy on `pages/features.vue`, `pages/about.vue`, `pages/help.vue`,
  `pages/templates.vue` still mentions ChowBot — update copy when doing a marketing pass.
- `components/dashboard/TranslationOpportunity.vue` — mentions ChowBot in user-facing copy.

---

## Recommended Order of Work

1. **Now**: Validate that ChatGPT can run the "safe to remove" workflows end-to-end on staging
   (menus, posts, content, Q&A, experiences, translations, domains, analytics).

2. **Next**: Remove or simplify `settings/domains.vue` — domain management is now fully in MCP.
   Replace page with a prompt pointing users to ChatGPT for domain changes.

3. **Ongoing**: Each time a dashboard page is removed, delete its `.vue` file and any
   API routes exclusively called by that page (routes called by the Saya public theme or
   other non-dashboard consumers must stay).

4. **Defer**: Video upload gap — R2 pre-signed URL tool is the right fix but not blocking.
   Dashboard media upload UI covers this for now.

5. **Keep permanently**: Members page, Facebook integration, billing — intentional CMS scope.

---

## Non-Negotiable: MCP Tool Parity Check Before Any Removal

Before removing any dashboard page:
- Confirm the MCP tools cover every operation the page exposes
- Confirm the corresponding `server/api/editor/` routes are still present (MCP executor calls them)
- Run `yarn e2e:staging` and verify no regressions in MCP spec
- The editor API routes are NOT deleted when the dashboard UI is removed —
  they remain as the backend the MCP tools call into
