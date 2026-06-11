# Seeding Strategy for KrabiClaw

## Model

Two sources of truth, one ephemeral execution format:

1. **Typed TS fixtures** (`seed-definitions/`) — curated tenants and synthetic scenarios
2. **Approved import manifests** (`client-imports/<slug>/`) — real client onboarding data
3. **Generated SQL** — ephemeral apply artifact, never hand-maintained

Schema DDL lives in `migrations/` and is applied by wrangler on every deploy. Seed data is entirely separate and never belongs in migration files.

---

## Execution model

Wrangler D1's only interface is `wrangler d1 execute --file <sql>`, so SQL is always the apply format. But that doesn't mean SQL files should be checked in and maintained. The correct flow is:

```
seed-definitions/kikuzuki.ts      ← source of truth
↓ yarn seed:kikuzuki               generate → /tmp/kikuzuki.sql → wrangler d1 execute → discard
```

A maintained SQL seed file is a half-truth: it looks authoritative but isn't. The typed TS definition is. `seeds/*.sql` for demo and pottery house are committed only because they still contain handwritten rows (Thai translations, etc.) that haven't been moved into the typed fixture yet. Once those rows are migrated, the SQL files will be gitignored and every tenant will follow the fully ephemeral model.

No new tenant is introduced via a hand-authored SQL file. Ever.

---

## What belongs in a typed fixture

Every `CuratedSiteDefinition` is the complete initial state for a tenant. This includes:

- site metadata, config, locales, domains
- business locations with opening hours, coordinates, contact details
- media assets — provider `external_url`, `cloudflare_r2`, or `cloudflare_images`
- experiences, reviews, menus, Q&A, posts
- site content (page hero fields, copy blocks)
- `ai_credits` initial balance and lifetime used
- `organization_billing` initial plan and status

Nothing tenant-specific should live outside the typed definition. `ai_credits` and `organization_billing` are per-org initial state, not platform infrastructure — they belong in the fixture like any other tenant row.

---

## What belongs in migrations

Schema DDL only: `CREATE TABLE`, `ALTER TABLE`, index definitions. Applied automatically on every deploy to every environment including production. Never contains tenant data.

---

## What belongs in the platform seed

`seeds/seed-krabiclaw.sql` covers platform-level setup that is not tenant-specific: Stripe product data, platform blog content, admin user bootstrap. Applied once to a fresh environment, not regenerated from typed definitions.

---

## Tenant inventory

| Tenant | Typed definition | Generator | Flags | CI-reproducible |
|---|---|---|---|---|
| Demo | `seed-definitions/demo.ts` | `generate-demo-seed.ts` | `--local` / `--remote` / `--staging` | ✓ |
| Pottery House | `seed-definitions/pottery-house.ts` | `generate-pottery-house-seed.ts` | `--local` / `--remote` / `--staging` | ✓ |
| Kikuzuki | `seed-definitions/kikuzuki.ts` | `generate-kikuzuki-seed.ts` | `--local` / `--preview` / `--staging` / `--remote` | ✓ |

All three tenants are on the typed fixture path. CI generates from source on every run — committed SQL files are never used as-is without regeneration.

### Kikuzuki media

Kikuzuki uses `cloudflare_images` as the provider for all food/interior photos (78 assets). The hero is a Cloudflare R2 video. CDN URL pattern: `https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/{cloudflareImageId}/public`.

---

## CI seeding

Seeds run on every PR (preview) and every push to `staging`. They are not conditional on file changes. The generate scripts run first, so the `.ts` fixture is the actual source of truth in CI — not the committed SQL.

| Trigger | Environment | What runs |
|---|---|---|
| PR opened/updated | `preview` | generate demo + pottery house → apply SQL; generate kikuzuki → apply ephemeral |
| Push to `staging` | `staging` | same as above against staging D1 |
| Push to `main` | `production` | migrations only, no seed |

Scripts:
- `yarn seed:kikuzuki` — local D1
- `yarn seed:kikuzuki:preview` — preview D1 (CI)
- `yarn seed:kikuzuki:staging` — staging D1
- `yarn seed:kikuzuki:remote` — production D1

---

## Real client onboarding

Real client data goes through the approved import pipeline, not typed fixtures:

```
client:import --dry-run   → reviewable manifests in client-imports/<slug>/
human review
client:import --approve   → signs the manifest hash
client:import --apply     → executes only the approved seed
client:verify             → all checks must pass
```

`approved.json` is the gate. No client site is applied without it.

Approved import replay (`client:replay`) is the standard path for re-seeding any approved import in any environment, gated by hash verification. Reserved for paid clients or support-grade regression cases — exploratory tenants use a curated typed fixture instead.

---

## Remaining work

### Finish removing handwritten SQL from demo and pottery house

`seeds/demo.sql` and `seeds/pottery-house-krabi.sql` still contain handwritten rows for Thai translations, `ai_credits`, and `organization_billing`. Once moved into the typed fixture, the SQL files can be gitignored and those tenants follow the fully ephemeral model like kikuzuki.

### Guardrails

- `lint-seeds.mjs` checks for missing contract fields on `INSERT INTO sites` but does not block a new hand-authored `seeds/*.sql` from being introduced
- CI should fail if a new `seeds/*.sql` appears that is not a declared generated output
- `seeds/*.sql` should be gitignored once all handwritten content is removed

### CMS and ChowBot parity

- Anything created by typed fixture generation or client import must remain editable through the CMS
- Anything editable through the CMS must be representable in onboarding/import manifests
- ChowBot must support the same CRUD surface as the CMS for supported content domains
- Parity must be verified by targeted E2E tests, not treated as a loose expectation

This is a separate implementation track but required before chat-first onboarding can be considered a complete replacement for manual CMS-driven setup.

---

## Authoring rules

- `seed-definitions/` — curated TS fixtures and builders only
- `client-intake/` — intake YAML inputs for real clients
- `client-imports/<slug>/` — generated and approved onboarding artifacts
- `migrations/` — schema DDL only, no data
- `seeds/` — build outputs only, never edited directly; will be gitignored once clean
