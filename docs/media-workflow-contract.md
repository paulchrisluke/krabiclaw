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

- Do not invent a separate `create media` MCP tool that bypasses `request-upload` and `confirm`.
- Do not treat pending assets as usable by public-site workflows.
- Menu extraction must only operate on confirmed or explicitly pending-media workflow inputs.
- AI-generated images still end as normal media assets and must be visible through the canonical media listing surface.
- MCP tools should be coarse-grained and business-level:
  - `list_media`
  - `request_media_upload`
  - `confirm_media_upload`
  - `update_media_asset`
  - `delete_media_asset`
  - `generate_image`
  - `import_menu_from_media`

## Auth boundary

- Editor-facing media routes are site-scoped and require authenticated site membership.
- Destructive actions stay confirm-gated in conversational surfaces.
- Future MCP exposure must preserve the same site scoping and entitlement checks already enforced by the canonical APIs.
