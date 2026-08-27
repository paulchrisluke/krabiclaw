# Seeding Strategy for KrabiClaw

## Model

Two sources of truth and one ephemeral execution format:

1. **Typed TS fixtures** (`seed-definitions/`) — curated tenants and synthetic scenarios
2. **Approved import manifests** (`client-imports/<slug>/`) — real client onboarding data
3. **Generated SQL** — ephemeral execution artifact, never a source of truth

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

A maintained SQL seed file is a half-truth: it looks authoritative but isn't. The typed TS definition is. Demo, Pottery House, Kikuzuki, and NCLS all follow the same ephemeral model: generate SQL to `/tmp`, apply it with wrangler, and discard it immediately. `seeds/*.sql` is no longer a source-of-truth path for curated tenants.

No new tenant is introduced via a hand-authored SQL file. Ever.

---

## What belongs in a typed fixture

Demo, Pottery House, and Kikuzuki use `CuratedSiteDefinition`. NCLS uses a
typed `NclsFixtureDefinition` snapshot because its regression fixture mirrors
the approved production public dataset rather than a reduced synthetic legal
site. Both shapes must contain the complete state their deployed tests depend
on. Do not replace the NCLS snapshot with a smaller hand-curated approximation.

Complete fixture state includes:

- site metadata, config, locales, domains
- site logo and favicon media placements when a tenant has them
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
- logos must be rehosted in Cloudflare and assigned through the site `logo` media placement
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

## Tenant inventory

| Tenant        | Typed definition                    | Generator                        | Targets             | CI-reproducible |
| ------------- | ----------------------------------- | -------------------------------- | ------------------- | --------------- |
| Demo          | `seed-definitions/demo.ts`          | `generate-demo-seed.ts`          | local / preview / staging | ✓          |
| Pottery House | `seed-definitions/pottery-house.ts` | `generate-pottery-house-seed.ts` | local / preview / staging | ✓          |
| Kikuzuki      | `seed-definitions/kikuzuki.ts`      | `generate-kikuzuki-seed.ts`      | local / preview / staging | ✓          |
| NCLS          | `seed-definitions/ncls.ts`          | `generate-ncls-seed.ts`          | local / preview / staging | ✓          |

All four tenants are on the typed fixture path. CI generates from source on every run — committed SQL files are never used as-is without regeneration.

### Kikuzuki media

Kikuzuki uses `cloudflare_images` for 77 image assets, including the tenant logo, and `cloudflare_r2` for 1 hero video. CDN URL pattern: `https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/{cloudflareImageId}/public`.

### Demo and Pottery House migration status

As of June 11, 2026, the curated Demo and Pottery House fixtures have been normalized onto Cloudflare-hosted media:

- seeded `media_assets` rows now use `cloudflare_images` for images and `cloudflare_r2` for videos/files
- seeded site logos must resolve through the site `logo` media placement to Cloudflare-hosted media
- seeded tenant-page story/image block URLs are Cloudflare-hosted
- seeded review avatar URLs are Cloudflare-hosted
- live tenant pages may still render `media.krabiclaw.com/...-thumb.webp` for video thumbnails; that is expected as long as the parent asset is a `cloudflare_r2` video row
- repo-served tenant media under `public/` has been removed and must not be reintroduced for tenant content

Completed one-off backfill tooling is deleted. Migration history and Git retain
the record; executable copies do not remain in the active repository.

---

## CI seeding

Fixture provisioning runs only for local and disposable preview write coverage.
The generators run first, so typed definitions remain the source of truth.

| Trigger           | Environment  | What runs                                                                      |
| ----------------- | ------------ | ------------------------------------------------------------------------------ |
| PR opened/updated | `preview`    | generate and apply all four typed fixtures                                    |
| Push to `staging` | `staging`    | migrations only; no sweep or seed                                               |
| `staging` to `main` PR opened/updated | none | reuse checks attached to the exact staging SHA; no deployment or seed |
| Push to `main`    | `production` | migrations only, no seed                                                       |

Staging and production customer data are never reseeded by CI. Their tenant
checks are read-only.

Commands and entry points:

- `yarn seed:local` — apply all four fixtures to local D1
- `yarn seed:pottery-local` — apply only Pottery House locally
- `yarn seed:kikuzuki` — apply only Kikuzuki locally
- `node --experimental-strip-types scripts/generate-ncls-seed.ts` — apply only NCLS locally
- Preview fixture application is CI-owned and uses the four generators in `.github/workflows/ci.yml`.

---

## Real client onboarding

Real client data goes through the approved import pipeline, not typed fixtures:

```text
client:import --organization-id <existing-better-auth-organization-id> --dry-run
                        → reviewable manifests in client-imports/<slug>/
human review
client:import --approve   → signs the manifest hash
client:import --apply     → executes only the approved seed
client:verify             → all checks must pass
```

`approved.json` is the gate. No client site is applied without it.

Approved import replay (`client:replay`) is the standard path for re-seeding any approved import in any environment, gated by hash verification. Reserved for paid clients or support-grade regression cases — exploratory tenants use a curated typed fixture instead.

---

## Guardrails

Demo, Pottery House, Kikuzuki, and NCLS follow the same ephemeral model: typed fixture -> generated SQL in `/tmp` -> `wrangler d1 execute` -> discard.

- `seeds/*.sql` is gitignored and should stay empty for curated tenant seeds
- `lint-seeds.mjs` fails CI if a new `seeds/*.sql` appears that is not a declared generated output
- fixture reviews treat any `external_url`, repo-local `/public/` / `/images/` / `/videos/` tenant asset path, or third-party hosted tenant media URL in curated media fields as a regression
- fixture reviews should reject site branding outside canonical logo/favicon media placements
- template work, seed edits, and onboarding changes must preserve the dashboard storage split:
  images via `/media/request-upload` -> Cloudflare Images
  videos/files via `/media/upload` -> Cloudflare R2
- Demo, Pottery House, Kikuzuki, and NCLS are required fixtures in local,
  preview, and staging browser lanes. Their absence is a provisioning failure,
  not a reason to skip fixture-dependent coverage.

---

## Authoring rules

- `seed-definitions/` — curated TS fixtures and builders only
- `client-intake/` — intake YAML inputs for real clients
- `client-imports/<slug>/` — generated and approved onboarding artifacts
- `migrations/` — schema DDL only, no data
- `seeds/` — ignored generated outputs only, never edited directly
- `public/` — never store tenant-specific source media here
