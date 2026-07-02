# Media Workflow Contract

This document defines the canonical media workflow that ChowBot, the dashboard, and future MCP tools must share.

## Scope

Media is intentionally **workflow-based**, not CRUD-shaped.

The canonical route family is under:

- `GET /api/editor/sites/[siteId]/media`
- `POST /api/editor/sites/[siteId]/media/request-upload`
- `POST /api/editor/sites/[siteId]/media/upload`
- `POST /api/editor/sites/[siteId]/media/[assetId]/confirm`
- `PATCH /api/editor/sites/[siteId]/media/[assetId]`
- `DELETE /api/editor/sites/[siteId]/media/[assetId]`

Related workflow helpers:

- `POST /api/ai/[siteId]/generate-image`
- `POST /api/ai/[siteId]/menu/extract`
- ChowBot `import_menu_from_pending_media`
- ChowBot `resolve_pending_media`

## Canonical lifecycle

1. `request-upload`
   The editor requests an upload slot and receives the provider-specific upload target plus a pending asset record.

2. direct upload
   The client uploads bytes directly to the storage provider. This step is not proxied through the app server.

3. `confirm`
   The editor confirms the upload after the provider accepts the file. This transitions the asset from pending to active.

4. metadata update
   Optional follow-up edits such as alt text, filename, location assignment, or status changes happen through `PATCH`.

5. downstream workflows
   Confirmed assets may then be used by higher-level flows like menu OCR/import, hero image selection, or AI-assisted generation.

6. delete
   Deletion is a workflow action on the asset record and storage object, not a table-row-only concern.

## Product rules

- Do not invent a separate `create media` MCP tool that bypasses the canonical Cloudflare upload and media-asset manager paths.
- Do not treat pending assets as usable by public-site workflows.
- Menu extraction must only operate on confirmed or explicitly pending-media workflow inputs.
- AI-generated images still end as normal media assets and must be visible through the canonical media listing surface.
- Canonical MCP generated-image contracts are split by source:
  - ChatGPT native image-generation output: `save_generated_image_file({ site_id, attachment_id, prompt })`
  - Raw base64 from a non-native image source: `save_generated_image({ site_id, image_data_base64, prompt })`
- For user-attached ChatGPT images, use `upload_user_photo({ site_id, file, category, description })` and pass the attachment via the `file` argument so ChatGPT can rewrite the local mounted path into an authorized file reference before KrabiClaw receives it.
- In the Client MCP ChatGPT app, this ChatGPT attachment path is the only supported user-photo path. Do not direct users to the KrabiClaw dashboard/media uploader for photos; reserve the dashboard media library handoff for videos.
- Do not bypass the ChatGPT file-argument rewrite by fabricating `download_url` objects or inventing attachment transport.
- Prefer business-level image workflows over generic file handoff when the user intent is domain-specific:
  - Generate into KrabiClaw first, persist to Cloudflare Images immediately, then assign by `assetId`
  - Assignment should happen through the canonical entity mutation tools such as `set_logo`, `set_home_hero_image`, `set_about_story_image`, `set_home_story_image`, `set_location_hero_image`, `set_menu_item_image`, `set_post_image`, and `set_experience_image`
  - `set_about_story_image` and `set_home_story_image` are separate tools because `/about` and `/` each have their own `story.image` content field — they commonly point at the same asset, but the page is never inferred
- MCP tools should be coarse-grained and business-level:
  - `get_site_media_assets`
  - `upload_user_photo`
  - `update_media_asset`
  - `delete_media_asset`
  - `save_generated_image`
  - `save_generated_image_file`
  - `import_menu_from_media`

## Auth boundary

- Editor-facing media routes are site-scoped and require authenticated site membership.
- Destructive actions stay confirm-gated in conversational surfaces.
- Future MCP exposure must preserve the same site scoping and entitlement checks already enforced by the canonical APIs.
