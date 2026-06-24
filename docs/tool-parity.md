# ChowBot / MCP / Dashboard Tool Parity

Tracks which tools exist across surfaces and where gaps are. Update this when adding tools to any surface.

**Surfaces:**
- **ChowBot** — conversational assistant embedded in the dashboard and WhatsApp
- **Client MCP** — customer ChatGPT connector (`server/api/mcp.post.ts`)
- **Platform Admin MCP** — internal ChatGPT connector (`server/api/mcp/platform.post.ts`)
- **Dashboard** — CMS pages and direct UI flows

Platform Admin MCP is intentionally excluded from the parity tables below because it is a separate internal-only surface for platform blog/docs operations, not a tenant-management surface. See `docs/mcp-surface-split.md`.

---

## ✅ Exact name match — true parity (74 tools)

| Tool |
|------|
| `add_menu_items_batch` |
| `create_experience` |
| `create_location` |
| `create_location_qa` |
| `create_menu` |
| `create_menu_item` |
| `create_post` |
| `create_work_request` |
| `delete_content_field` |
| `delete_experience` |
| `delete_locale` |
| `delete_location` |
| `delete_location_qa` |
| `delete_media_asset` |
| `delete_menu` |
| `delete_menu_item` |
| `delete_menu_section` |
| `delete_post` |
| `get_contact_inquiries` |
| `get_experience` |
| `get_location` |
| `get_menu` |
| `get_notification_settings` |
| `get_page_fields` |
| `get_post` |
| `get_reservation_inquiries` |
| `get_site_media_assets` |
| `get_site_settings` |
| `get_translation_inventory` |
| `get_translation_job` |
| `get_translation_review_items` |
| `import_from_maps` |
| `import_menu_from_media` |
| `list_experience_bookings` |
| `list_experiences` |
| `list_locales` |
| `list_location_qa` |
| `list_location_reviews` |
| `list_locations` |
| `list_menus` |
| `list_posts` |
| `list_translation_jobs` |
| `list_work_requests` |
| `publish_post` |
| `publish_translations` |
| `rename_menu_section` |
| `reorder_location_qa` |
| `reorder_menu_items` |
| `reply_to_review` |
| `run_translation_job_batch` |
| `save_translation_review_item` |
| `set_about_story_image` |
| `set_experience_image` |
| `set_experience_video` |
| `set_home_hero_image` |
| `set_home_hero_video` |
| `set_home_story_image` |
| `set_location_hero_image` |
| `set_location_hero_video` |
| `set_logo` |
| `set_menu_item_image` |
| `set_post_image` |
| `start_translation_job` |
| `update_experience` |
| `update_experience_booking` |
| `update_home_hero` |
| `update_location` |
| `update_location_qa` |
| `update_media_asset` |
| `update_menu` |
| `update_menu_item` |
| `update_notification_settings` |
| `update_page_content` |
| `update_post` |
| `upsert_locale` |

---

## 🟠 ChowBot-only — no MCP equivalent (9 tools)

| ChowBot tool | Status / Action |
|--------------|----------------|
| `sync_menu_items` | **Gap** — MCP has no reconcile/upsert tool |
| `publish_menu` | **Gap** — MCP has no menu publish step |
| `generate_image` | **Design divergence** — MCP uses 7 targeted `generate_*` tools; ChowBot collapses to one generic — decide whether to split |
| `get_site_stats` | **Different scope** — ChowBot gives content counts; MCP has `get_site_analytics` (traffic/SEO); keep as-is |
| `rename_site` | **Alias** — MCP folds into `update_site_settings`; consider removing |
| `set_default_currency` | **Alias** — MCP folds into `update_site_settings`; consider removing |
| `save_brand_description` | **Alias** — MCP folds into `update_site_settings` / `update_page_content`; consider removing |
| `update_site_social` | **Alias** — MCP folds into `update_site_settings`; consider removing |
| `resolve_pending_media` | **Different flow** — WhatsApp pending-media specific; MCP has `confirm_media_upload` for browser uploads |

---

## ⚪ MCP-only — intentionally surface-specific (35 tools)

| MCP tool | Reason |
|----------|--------|
| `show_site_preview`, `show_generated_images` | MCP-only onboarding/preview tools (plain text response, no widget — MCP/ChatGPT canvas only) |
| `save_generated_image`, `save_generated_image_file`, `upload_user_photo` | MCP native image generation save flow; ChowBot auto-saves inline |
| `request_media_upload`, `confirm_media_upload`, `request_photo_upload` | Browser upload flow; ChowBot uses WhatsApp pending media |
| `create_site`, `list_sites` | Platform-level onboarding; ChowBot is always scoped to one org |
| `get_current_user` | MCP session context tool |
| `create_domain`, `delete_domain`, `set_canonical_domain`, `sync_domain`, `get_site_domains` | Domain management — dashboard only today |
| `publish_to_facebook`, `sync_facebook_page`, `get_facebook_connection` | Requires OAuth; feasible in ChowBot but not yet wired |
| `get_google_business_connection`, `get_google_business_auth_url`, `list_google_business_accounts`, `sync_google_business_locations` | OAuth-gated; dashboard only today |
| `update_site_settings` | All-in-one site config; ChowBot has 4 specific commands (`rename_site`, `set_default_currency`, `save_brand_description`, `update_site_social`) |
| `get_site` | Site metadata; ChowBot's `get_site_settings` covers the same data |
| `get_site_analytics` | Traffic/SEO analytics; ChowBot has `get_site_stats` (content counts, different focus) |
| `generate_experience_image`, `generate_home_hero_image`, `generate_location_hero_image`, `generate_logo`, `generate_menu_item_image`, `generate_post_image`, `generate_story_image` | Targeted image generation; ChowBot uses one generic `generate_image` tool |

---

## Summary

| Category | Count |
|----------|-------|
| True parity (exact name match) | 74 |
| ChowBot-only (gaps or candidates for removal) | 9 |
| MCP-only, intentionally surface-specific | 35 |
| **MCP-only, ChowBot should add** | **0** |
