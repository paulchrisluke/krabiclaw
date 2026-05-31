Image Assets Audit — Pottery House

Summary: locate all literal `/images/` references and HTML that must be migrated to `media_assets` rows and referenced by `asset_id` instead of inline paths.

Findings (grep results):

- `data/menu.ts` — placeholder menu images at `image: '/images/menu/...` (UI placeholders; prefer media_asset ids)
- `scripts/client-import.mjs` — constructs `public_url: `/images/${SLUG}/${normalName}`; change to build R2 key and create `media_assets` rows instead
- `seeds/pottery-house-krabi.sql` — numerous literal `/images/pottery-house/...` entries (seed data using local paths). These should instead insert `media_assets` with `r2_key`/`public_url` and reference asset ids.
- `seeds/*` other seed files may include literal paths — review before applying in production.

Action items:

1. Convert all literal `/images/...` entries in `seeds/*.sql` into `INSERT INTO media_assets (...) VALUES (...)` rows and update dependent `site_content` / `business_locations` to reference the new `media_assets.id`.
2. Run discovery SQL to find `site_content` rows that contain literal `/images/` HTML and produce a targeted `UPDATE` per id using `REPLACE(...)` (use `instr()` to locate rows safely).
3. Update `scripts/client-import.mjs` to create and upsert `media_assets` when importing images instead of emitting `/images/` public paths.
4. Add an automated migration seed template (see `seeds/convert-images-to-assets-template.sql`) to help convert specific rows by id.

Notes:

- Use `instr(content, '705001439_1023555783578064') > 0` instead of `LIKE` to avoid underscore wildcard issues in SQLite.
- Always stage and review DB changes in `seeds/` and run `wrangler d1 execute --remote` only after review and signoff.

Status: complete.

All action items resolved:
- `seeds/pottery-house-krabi.sql` — all image `media_assets` rows now use `provider = 'cloudflare_r2'`, `source = 'uploaded'`, proper `r2_key`, and CDN `public_url` (`https://media.krabiclaw.com/...`). `sites.logo_url` literal removed; `logo_asset_id = 'media-ph-hero'` set via UPDATE after asset insert. `sc-ph-story-image` content field cleared and `hero_image_asset_id = 'media-ph-team'` set instead.
- `scripts/client-import.mjs` — `scanImages` now emits `r2_key` and CDN `public_url` in manifests (no more `/images/` paths).
- `agents.md` — Image Asset Policy appended (enforced rule for all future imports).
- `seeds/convert-images-to-assets-template.sql` — migration template available for any ad-hoc remediation.
