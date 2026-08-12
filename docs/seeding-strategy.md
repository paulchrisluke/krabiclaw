# Seeding Strategy for KrabiClaw

## Model

Two sources of truth, one ephemeral execution format:

1. **Typed TS fixtures** (`seed-definitions/`) — curated tenants and synthetic scenarios
2. **Approved import manifests** (`client-imports/<slug>/`) — real client onboarding data
3. **Generated SQL** — ephemeral apply artifact, never hand-maintained

Schema DDL lives in `migrations/` and is applied by the environment's locked
preview workflow before browser coverage. Seed data is entirely separate
and never belongs in migration files.

---

## Execution model

Wrangler D1's only interface is `wrangler d1 execute --file <sql>`, so SQL is always the apply format. But that doesn't mean SQL files should be checked in and maintained. The correct flow is:

```text
seed-definitions/kikuzuki.ts      ← source of truth
↓ yarn seed:kikuzuki               generate → /tmp/kikuzuki.sql → wrangler d1 execute → discard
```

A maintained SQL seed file is a half-truth: it looks authoritative but isn't. The typed TS definition is. Demo, Pottery House, and Kikuzuki now all follow the same ephemeral model: generate SQL to `/tmp`, apply it with wrangler, and discard it immediately. `seeds/*.sql` is no longer a source-of-truth path for curated tenants.

No new tenant is introduced via a hand-authored SQL file. Ever.

---

## What belongs in a typed fixture

Every `CuratedSiteDefinition` is the complete initial state for a tenant. This includes:

- site metadata, config, locales, domains
- site logo asset linkage via `logo_asset_id` when a tenant has a logo
- business locations with opening hours, coordinates, contact details
- media assets — for curated tenants, only `cloudflare_images` (images) and `cloudflare_r2` (videos/files)
- experiences, reviews, menus, Q&A, posts
- site content (page hero fields, copy blocks)
- `ai_credits` initial balance and lifetime used
- `organization_billing` initial plan and status

Nothing tenant-specific should live outside the typed definition. `ai_credits` and `organization_billing` are per-org initial state, not platform infrastructure — they belong in the fixture like any other tenant row.

### Curated tenant media policy

Curated tenants must use the same media storage contract as production CMS uploads:

- images use `cloudflare_images`
- videos and other files use `cloudflare_r2`
- `external_url` must not appear in approved curated fixtures, approved client imports, or template-generated site content
- tenant media must not be committed under `public/` and served as Worker static assets
- any demo or reference media discovered from third-party sources during authoring must be downloaded, uploaded, and re-served from Cloudflare before the seed or template is considered complete

In practice this means:

- no `/images/<tenant>/...` or `/videos/<tenant>/...` paths in `media_assets` rows for curated tenants
- no dependency on third-party delivery URLs such as Unsplash in seeded D1 state
- no third-party or local URLs in tenant-page media blocks, review avatars, post thumbnails, or any other tenant-facing seeded content
- no legacy `sites.logo_url` dependency for curated tenants; logos must be rehosted in Cloudflare and linked through `sites.logo_asset_id`
- fixture media should mirror the dashboard upload split exactly:
  images -> Cloudflare Images direct upload flow
  videos/files -> R2 upload flow
- R2-backed video thumbnails are acceptable when they are derived from a `cloudflare_r2` video asset; they are part of the video pipeline, not a bypass of the image policy
- new-site templates must seed Cloudflare-hosted media only; they may not introduce repo-local placeholders or external CDN dependencies
- approved import manifests must normalize media the same way before `client:import --approve`

---

## What belongs in migrations

Schema DDL only: `CREATE TABLE`, `ALTER TABLE`, index definitions. Applied automatically on every deploy to every environment including production. Never contains tenant data.

---

## What belongs in the platform seed

`seeds/seed-krabiclaw.sql` covers platform-level setup that is not tenant-specific: Stripe product data, platform blog content, admin user bootstrap. Applied once to a fresh environment, not regenerated from typed definitions.

---

## Tenant inventory

| Tenant        | Typed definition                    | Generator                        | Flags                                              | CI-reproducible |
| ------------- | ----------------------------------- | -------------------------------- | -------------------------------------------------- | --------------- |
| Demo          | `seed-definitions/demo.ts`          | `generate-demo-seed.ts`          | `--local` / `--preview` / `--remote` / `--staging` | ✓               |
| Pottery House | `seed-definitions/pottery-house.ts` | `generate-pottery-house-seed.ts` | `--local` / `--preview` / `--remote` / `--staging` | ✓               |
| Kikuzuki      | `seed-definitions/kikuzuki.ts`      | `generate-kikuzuki-seed.ts`      | `--local` / `--preview` / `--staging` / `--remote` | ✓               |

All three tenants are on the typed fixture path. CI generates from source on every run — committed SQL files are never used as-is without regeneration.

### Kikuzuki media

Kikuzuki uses `cloudflare_images` for 77 image assets, including the tenant logo, and `cloudflare_r2` for 1 hero video. CDN URL pattern: `https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/{cloudflareImageId}/public`.

### Demo and Pottery House migration status

As of June 11, 2026, the curated Demo and Pottery House fixtures have been normalized onto Cloudflare-hosted media:

- seeded `media_assets` rows now use `cloudflare_images` for images and `cloudflare_r2` for videos/files
- seeded site logos must resolve through `logo_asset_id` to Cloudflare-hosted media, not raw `logo_url` fallbacks
- seeded tenant-page story/image block URLs are Cloudflare-hosted
- seeded review avatar URLs are Cloudflare-hosted
- live tenant pages may still render `media.krabiclaw.com/...-thumb.webp` for video thumbnails; that is expected as long as the parent asset is a `cloudflare_r2` video row
- repo-served tenant media under `public/` has been removed and must not be reintroduced for tenant content

Historical backfill tooling:

- one-off normalization scripts used for the June 11, 2026 backfill now live under `scripts/archive/`
- they are archived reference tooling, not part of the normal seed or onboarding workflow

---

## CI seeding

Seeds run on every PR (preview) and once inside an explicitly dispatched,
preview workflow. They are not conditional on file changes.
The generate scripts run first, so the `.ts` fixture is the actual source of
truth in CI — not committed SQL or a push-triggered shared-staging loop.

| Trigger           | Environment  | What runs                                                                      |
| ----------------- | ------------ | ------------------------------------------------------------------------------ |
| PR opened/updated | `preview`    | generate demo + pottery house → apply SQL; generate kikuzuki → apply ephemeral |
| Push to `staging` | `staging` | migrations and E2E artifact sweep; persistent fixtures are not reseeded |
| Push to `main`    | `production` | migrations only, no seed                                                       |

Scripts:

- `yarn seed:kikuzuki` — local D1
- `yarn seed:kikuzuki:preview` — preview D1 (CI)
- `yarn seed:kikuzuki:staging` — blocked; staging releases do not reseed fixtures
- `yarn seed:kikuzuki:remote` — blocked; production seeding is not a release operation

---

## Real client onboarding

Real client data goes through the approved import pipeline, not typed fixtures:

```text
client:import --dry-run   → reviewable manifests in client-imports/<slug>/
human review
client:import --approve   → signs the manifest hash
client:import --apply     → executes only the approved seed
client:verify             → all checks must pass
```

`approved.json` is the gate. No client site is applied without it.

Approved import replay (`client:replay`) is the standard path for re-seeding any approved import in any environment, gated by hash verification. Reserved for paid clients or support-grade regression cases — exploratory tenants use a curated typed fixture instead.

---

## Tenant transfer: curated fixture → real client

Kikuzuki and Pottery House currently live on the curated-fixture path (typed `seed-definitions/*.ts` + ephemeral generator + CI reseed), but both are real businesses and the eventual goal is to hand them off as independent client-owned sites. This is the runbook for that handoff — it does not exist yet for either tenant, so do this when the actual transfer happens, not before.

### Why this matters

Remote tenant seed aliases are blocked. Production and staging deployment jobs
never seed curated client data. `business_locations`, `media_assets`, `menus`,
`sites`, and `site_domains` use `INSERT OR REPLACE` in the generated SQL, so a
manual rerun would silently clobber client edits; the command guard prevents
that accidental production path.

Preview seeding targets `krabiclaw-db-preview`, which is separate from production. Staging fixtures persist across deploys; only throwaway `e2e-` artifacts are swept before the staging suite.

### Steps to take at transfer time

1. **Stop using `--remote` for this tenant.** Remove or guard the `--remote` branch in `scripts/generate-<tenant>-seed.ts` so it can't be run again by accident.
2. **Pull the tenant out of CI seeding.** Delete its preview seed line from `.github/workflows/ci.yml`. Continuing to reseed preview with a fixture that no longer reflects the live site's real state is misleading, not just unnecessary.
3. **Replace its E2E coverage.** Either retire the assertions that depended on the seeded fixture, point them at the pinned read-only production telemetry lane, or stand up a fresh synthetic tenant to cover the feature being tested (e.g. the second-location flow) without depending on a tenant that now has real client edits.
4. **Archive, don't delete, the fixture.** Move `seed-definitions/<tenant>.ts` and `scripts/generate-<tenant>-seed.ts` under `scripts/archive/`-style historical reference (same treatment as the June 11, 2026 media backfill tooling) so the original recipe is preserved but nothing in the active workflow can re-run it.
5. **Treat the tenant like any other client from this point on.** Future changes flow only through the dashboard/MCP/API. If you ever need to bulk-restore or clone its state, build a `client:import` manifest from the live site and use `client:replay` — never resurrect the old typed fixture.

---

## Guardrails

Demo, Pottery House, and Kikuzuki now all follow the same ephemeral model: typed fixture -> generated SQL in `/tmp` -> `wrangler d1 execute` -> discard.

- `seeds/*.sql` is gitignored and should stay empty for curated tenant seeds
- `lint-seeds.mjs` fails CI if a new `seeds/*.sql` appears that is not a declared generated output
- fixture reviews treat any `external_url`, repo-local `/public/` / `/images/` / `/videos/` tenant asset path, or third-party hosted tenant media URL in curated media fields as a regression
- fixture reviews should also reject direct use of `sites.logo_url` for curated tenant branding when a Cloudflare-hosted logo asset is expected
- template work, seed edits, and onboarding changes must preserve the dashboard storage split:
  images via `/media/request-upload` -> Cloudflare Images
  videos/files via `/media/upload` -> Cloudflare R2

---

## Authoring rules

- `seed-definitions/` — curated TS fixtures and builders only
- `client-intake/` — intake YAML inputs for real clients
- `client-imports/<slug>/` — generated and approved onboarding artifacts
- `migrations/` — schema DDL only, no data
- `seeds/` — build outputs only, never edited directly; will be gitignored once clean
- `public/` — never store tenant-specific source media here
- `scripts/archive/` — historical migration/backfill tooling only, not active workflow entrypoints
