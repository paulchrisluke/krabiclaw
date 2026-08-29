# Fixtures and Imports

## Model

Two sources of truth and one ephemeral execution format:

1. **Typed TS fixtures** (`seed-definitions/`) — curated tenants and synthetic scenarios for disposable/local testing
2. **Approved import manifests** (`client-imports/<slug>/`) — real client onboarding data
3. **Generated SQL** — ephemeral execution artifact, never a source of truth

Schema DDL lives in `migrations/` and is applied by the environment's migration workflow. Seed data is entirely separate and never belongs in migration files.

## Execution model

Wrangler D1's only interface is `wrangler d1 execute --file <sql>`, so SQL is always the apply format. The correct flow is:

```text
seed-definitions/kikuzuki.ts      ← source of truth
↓ yarn seed:kikuzuki               generate → /tmp/kikuzuki.sql → wrangler d1 execute → discard
```

A maintained SQL seed file is a half-truth: it looks authoritative but isn't. The typed TS definition is. No new tenant is introduced via a hand-authored SQL file.

## Typed fixtures

Typed fixtures (`seed-definitions/`) contain complete state for curated tenants including site metadata, locations, media assets, experiences, reviews, menus, Q&A, posts, content, and billing state. Do not replace approved snapshots with smaller hand-curated approximations.

### Media policy

Typed fixtures must use the same media storage contract as production CMS uploads:

- images use `cloudflare_images`
- videos and other files use `cloudflare_r2`
- `external_url` must not appear in approved fixtures or imports
- tenant media must not be committed under `public/` and served as Worker static assets
- third-party media must be downloaded, uploaded, and re-served from Cloudflare before the fixture is complete

## Real client onboarding

Real client data goes through the approved import pipeline:

```text
client:import --organization-id <existing-better-auth-organization-id> --dry-run
                        → reviewable manifests in client-imports/<slug>/
human review
client:import --approve   → signs the manifest hash
client:import --apply     → executes only the approved seed
client:verify             → all checks must pass
```

`approved.json` is the gate. No client site is applied without it.

## Environment seeding

Fixture provisioning runs only for local and disposable preview write coverage:

| Trigger           | Environment  | What runs                           |
| ----------------- | ------------ | ----------------------------------- |
| PR opened/updated | `preview`    | generate and apply typed fixtures   |
| Push to `staging` | `staging`    | migrations only; no sweep or seed   |
| Push to `main`    | `production` | migrations only, no seed           |

Staging and production customer data are never reseeded by CI. Their tenant checks are read-only.

## Guardrails

- `seeds/*.sql` is gitignored and should stay empty for curated tenant seeds
- `lint-seeds.mjs` fails CI if a new `seeds/*.sql` appears that is not a declared generated output
- fixture reviews treat any `external_url`, repo-local asset paths, or third-party hosted URLs as a regression
- template work, seed edits, and onboarding changes must preserve the dashboard storage split: images via Cloudflare Images, videos/files via Cloudflare R2
- required fixtures must be present in local, preview, and staging browser lanes

## Authoring rules

- `seed-definitions/` — curated TS fixtures and builders only
- `client-intake/` — intake YAML inputs for real clients
- `client-imports/<slug>/` — generated and approved onboarding artifacts
- `migrations/` — schema DDL only, no data
- `seeds/` — ignored generated outputs only, never edited directly
- `public/` — never store tenant-specific source media here