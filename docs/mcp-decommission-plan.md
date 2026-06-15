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
Added June 2026: `get_site_domains`, `create_domain`, `set_canonical_domain`, `delete_domain`, `sync_domain`.
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

MCP tools `get_site_media_assets`, `update_media_asset`, and `delete_media_asset` already exist.
The intention is that for heavy assets (videos/PDFs), the user uploads through the native dashboard library (`/dashboard/.../media`). The agent can poll/query `get_site_media_assets` to get the returned `public_url` and places it on the page.

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
| `[locationSlug]/media.vue` | Keep permanently — intentional upload surface for video/bulk (MCP handles browsing via `get_site_media_assets`) |

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

---

## Draft/Publish Audit (June 15, 2026)

### Summary

The current split is not "MCP vs dashboard". The real split is:

- **Direct-write domain models**: menus, menu items, locations, Q&A, experiences, media metadata, work requests, site settings
- **Draft-backed content models**: `site_content` via `site_content_drafts`
- **Hybrid post model**: posts write directly to `posts` with `status = 'draft'`, then explicitly publish through `publish_post`

That means `update_menu_item` succeeding does **not** validate the page-content draft pipeline. It bypasses it entirely.

### Strong Likely Cause of the Current MCP 502s

The MCP content-draft tool contracts do not match their actual return payloads.

Examples:

- `get_page_content` schema says `{ page, content, draft, hasDraft }`, but executor returns merged content plus `hasDrafts`, `editableSchema`, `siteId`, `locationId`
- `save_content_draft` schema says `{ saved, page, fields_updated }`, but executor returns `{ success, page, changes_count }`
- `get_content_draft_status` schema says `{ hasDraft, count, pages }`, but executor returns `{ hasDrafts, count }`
- `publish_content_drafts` schema says `{ published }`, but executor returns `{ success, scope }` or `{ success, page, location_id }`
- `discard_content_drafts` schema says `{ discarded }`, but executor returns `{ success, scope }` or `{ success, page, location_id }`

The server does not validate output schemas before returning, but ChatGPT MCP clients may still depend on those contracts. Even if the write path is also broken, these mismatches need to be fixed or removed.

### Endpoint Matrix

| Surface | Current backing path | Current behavior | Recommendation |
|---|---|---|---|
| `get_page_content` | `server/utils/mcp-workflows.ts#getMergedEditorContent` + `site_content` + `site_content_drafts` | Returns published content merged with drafts | **Keep**, but change semantics to read canonical live content only, or expose explicit `pending_changes` only if we keep any transient edit layer |
| `save_content_draft` | `server/utils/mcp-workflows.ts#saveContentDraft` -> `server/utils/content-management.ts#upsertDraftContent` -> `site_content_drafts` | Writes page-field drafts | **Remove** for ChatGPT-native MCP; replace with direct atomic update tools |
| `update_home_hero` | `server/utils/mcp-workflows.ts#updateHomeHero` -> `saveContentDraft` -> optional `publishContentDrafts` | Drafts hero, optionally publishes | **Keep name or replace**, but rewrite to direct canonical write to `site_content` |
| `get_content_draft_status` | `server/utils/content-management.ts#getDraftStatus` -> `site_content_drafts` | Counts unpublished content drafts | **Remove** |
| `publish_content_drafts` | `server/utils/mcp-workflows.ts#publishContentDrafts` -> `publishDrafts` / `publishAllDrafts` | Copies drafts into `site_content` then deletes drafts | **Remove** |
| `discard_content_drafts` | `server/utils/mcp-workflows.ts#discardContentDrafts` -> `discardDrafts` / `discardAllDrafts` | Deletes draft rows | **Remove** |
| `delete_content_field` | `deleteSiteAndDraftContentField` | Deletes live plus draft copies | **Keep**, but simplify to delete canonical live content only |
| `create_post` | `server/utils/post-management.ts#createPost` -> `posts` | Direct insert into normalized posts table with `status = 'draft'` | **Keep** |
| `update_post` | `server/utils/post-management.ts#updatePost` -> `posts` | Direct update | **Keep** |
| `publish_post` | `server/utils/post-management.ts#publishPost` + channel jobs | Explicit publish step for site/social | **Keep**; posts are a legitimate publishable channel model |
| `update_menu_item` | `server/utils/menu-management.ts#updateMenuItem` | Direct update to normalized menu tables | **Keep** |
| `update_location` | `server/utils/location-management.ts#updateLocation` | Direct update to canonical location records | **Keep** |
| `update_site_settings` | `server/utils/site-settings.ts#updateSiteSettingsFields` | Direct update | **Keep** |

### Recommended MCP Shape After Draft Removal

For renderer-bound site content, prefer direct tools that validate, write canonical data, and return the public URL affected.

Suggested MCP set:

- `update_home_hero`
- `update_story_section`
- `update_cta`
- `update_business_info`
- `update_contact_page`
- `update_reservations_page`
- `update_order_page`
- `update_site_logo`
- `update_location`
- `update_menu_item`

Rules:

- No silent draft creation
- No separate publish step for `site_content`
- No orphan fields outside the content registry
- Tool returns should include the updated canonical record and affected public path
- Keep explicit publish flows only where the domain actually has publish semantics: posts, translations, social channel jobs

### What Still Uses the Draft System Today

#### MCP tools

- `get_page_content`
- `save_content_draft`
- `update_home_hero`
- `get_content_draft_status`
- `publish_content_drafts`
- `discard_content_drafts`
- `delete_content_field`

#### Shared server utilities

- `server/utils/content-management.ts`
  - `getDraftContent`
  - `buildUpsertDraftStmt`
  - `upsertDraftContent`
  - `publishDrafts`
  - `publishAllDrafts`
  - `discardDrafts`
  - `discardAllDrafts`
  - `getDraftStatus`
  - `deleteDraftContentField`
  - `deleteSiteAndDraftContentField`
- `server/utils/mcp-workflows.ts`
  - `saveContentDraft`
  - `getMergedEditorContent`
  - `getContentDraftStatus`
  - `publishContentDrafts`
  - `updateHomeHero`
  - `discardContentDrafts`
  - `deleteContentField`

#### Dashboard/editor API routes

- `server/api/editor/sites/[siteId]/content/[page].get.ts`
- `server/api/editor/sites/[siteId]/content/draft.post.ts`
- `server/api/editor/sites/[siteId]/content/publish.post.ts`
- `server/api/editor/sites/[siteId]/content/discard.post.ts`
- `server/api/editor/sites/[siteId]/content/status.get.ts`
- `server/api/editor/sites/[siteId]/content/delete-field.post.ts`

#### Public preview path

- `server/api/public/sites/[siteId]/content/[page].get.ts`
  - In preview mode, source-locale previews merge from `site_content_drafts`

#### Dashboard UI

- `pages/dashboard/[orgSlug]/[locationSlug]/content.vue`
- `pages/dashboard/[orgSlug]/[locationSlug]/pages.vue`

#### Tests / scripts / canaries / transfer

- `tests/e2e/mcp.spec.ts`
- `scripts/check-mcp-edit-flow.mjs`
- `scripts/canary-prod.mjs`
- `server/utils/site-transfer.ts`

#### Schema

- `migrations/0001_initial.sql`
  - `site_content_drafts`
  - `idx_site_content_drafts_site_level_unique`
- `migrations/0004_add_component_field_to_site_content.sql`
  - Adds `component` to `site_content_drafts`

### Code Removal Plan If We Delete Draft/Publish for Site Content

#### Remove entirely

- MCP tools:
  - `save_content_draft`
  - `get_content_draft_status`
  - `publish_content_drafts`
  - `discard_content_drafts`
- Utility functions tied only to `site_content_drafts`
- Dashboard content editor routes that only exist for draft lifecycle
- Draft-count UI in `pages/dashboard/[orgSlug]/[locationSlug]/pages.vue`
- Preview-token draft overlay behavior for source-locale page previews
- Tests/scripts that assert draft-save, publish, and discard behavior

#### Rewrite, not remove

- `get_page_content`
  - Stop merging drafts; return canonical content only
- `update_home_hero`
  - Write directly to canonical content rows
- `delete_content_field`
  - Delete only canonical content rows
- `server/api/editor/sites/[siteId]/content/[page].get.ts`
  - Read canonical content only if the editor remains temporarily
- `server/api/public/sites/[siteId]/content/[page].get.ts`
  - Keep translation preview behavior if translations still use draft review; remove site-content draft merging

#### Keep as-is

- Post draft/publish flow in `posts`
  - This is a real domain state machine, not an editor workaround
- Menu status publish/unpublish
  - Backed by normalized menu tables, separate from page content drafts
- Translation review/publish flow
  - Separate workflow and entitlement surface

### Files Most Likely to Be Deleted in a Draft-System Removal PR

- `server/api/editor/sites/[siteId]/content/draft.post.ts`
- `server/api/editor/sites/[siteId]/content/publish.post.ts`
- `server/api/editor/sites/[siteId]/content/discard.post.ts`
- `server/api/editor/sites/[siteId]/content/status.get.ts`
- `pages/dashboard/[orgSlug]/[locationSlug]/content.vue`

### Files That Would Need Significant Surgery

- `server/utils/content-management.ts`
- `server/utils/mcp-workflows.ts`
- `server/utils/mcp-executor.ts`
- `server/utils/mcp-tools.ts`
- `server/api/public/sites/[siteId]/content/[page].get.ts`
- `server/api/editor/sites/[siteId]/content/[page].get.ts`
- `tests/e2e/mcp.spec.ts`
- `scripts/check-mcp-edit-flow.mjs`
- `scripts/canary-prod.mjs`
- `migrations/0001_initial.sql`
- `migrations/0004_add_component_field_to_site_content.sql`

### Recommendation

Remove draft/publish for `site_content`, but **do not** collapse every domain into direct-write:

- Collapse page-content drafts into direct canonical writes
- Keep explicit publish where the domain genuinely needs staged or multi-channel release:
  - posts
  - translations
  - social publishing jobs

This is the cleanest fit for the ChatGPT-native editing model and removes the most fragile surface now causing production MCP failures.
