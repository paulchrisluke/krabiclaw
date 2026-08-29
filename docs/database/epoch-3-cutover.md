# Database epoch 3 schema simplification cutover

**Status: Release candidate runbook**  
**Issue:** #692 and the Epoch 3 schema-simplification PR

Epoch 3 provisions new preview, staging, and production D1 resources and begins from `migrations/0000_epoch_3_baseline.sql`. The baseline must never be applied to an Epoch 2 resource. The old production D1 remains untouched rollback state until post-production verification is complete and it is explicitly retired.

Provisioned APAC non-production resources:

- Preview: `krabiclaw-db-preview-epoch3` (`d2f7a4a0-d6b8-493b-b484-8c0ead1ff83b`)
- Staging: `krabiclaw-db-staging-epoch3` (`61af16e5-0873-49b9-90ce-aea2ff1991e4`)

No Epoch 3 production resource or binding is created during preview/staging promotion.

Normal schema work still follows [migrations.md](migrations.md). This document is the exceptional database-epoch procedure authorized for the broad schema cleanup.

## Canonical ownership after cutover

- Better Auth owns subscriptions. Authenticated billing management uses its documented subscription API. `organization_billing` is only the sessionless access/payment reconciliation projection: correlated subscription ID, payment evidence, `access_plan`, and `access_expires_at`.
- `usage_events` and `usage_quota_grants` are the only usage and allowance ledgers. Current quota is computed from indexed period grants and usage; no mutable balance cache remains.
- `products` owns stable sellable identity and shared public content. `experiences` is a one-to-one booking extension with the same ID. Immutable `prices` owns monetary amount, currency, structured unit, tax behavior, compare-at amount, validity, and provenance.
- `organization_events` owns activity. Organization scope is required; site and location scopes are optional.
- `PLATFORM_ORGANIZATION_ID` and `PLATFORM_SITE_ID` identify the reserved platform scope. Platform pageviews, blog posts, and redirects use the ordinary site-scoped models.
- Extensible content, localization, and media registries are application contracts. D1 retains structural/lifecycle checks but does not freeze those registries into enum `CHECK` constraints.

## Deletion census

The transformer refuses to continue if any proven-dead table below is non-empty:

- `client_import_artifacts`
- `customer_claims`
- `google_place_snapshots`
- `platform_analytics`

It migrates and then removes `ai_usage_log`, `ai_credits`, `platform_pageview_events`, `platform_blog_redirects`, and `site_events`. It also removes the superseded billing/entitlement projections (`organization_entitlements`, `site_billing`, `site_entitlements`), `sites.plan`, and `sites.settings` only through the new Epoch 3 resource.

`canary_runs`, `notification_deliveries`, `notification_reads`, Better Auth, guest delivery, localization, review request, contact, and site-link data are retained.

## Repeatable local proof

The frozen Epoch 2 export is authoritative. Operator exports and transformed databases stay outside Git.

```sh
yarn lint:migrations
yarn lint:schema-drift
yarn lint:epoch3-indexes
node scripts/epoch3-data.mjs transform /absolute/path/epoch2.sqlite /absolute/path/epoch3.sqlite
node scripts/epoch3-data.mjs verify /absolute/path/epoch2.sqlite /absolute/path/epoch3.sqlite
```

`transform` refuses to overwrite its output and writes `<epoch3.sqlite>.manifest.json`. It fails on a non-empty deletion target, unsupported registry value, invalid currency precision, unmapped Experience pricing text, Product/Experience ID or slug collision, billing/access mismatch, AI lifetime or balance mismatch, required-scope mismatch, row/hash mismatch, or foreign-key violation.

The verifier proves:

- Better Auth logical rows and columns are unchanged;
- copied tables have equal row counts and common-column logical hashes;
- canary and notification state is exact;
- tenant plus platform pageview totals and duration aggregates are preserved;
- platform blog rows and redirect paths use the reserved scope;
- organization event totals match the old activity ledger;
- every old AI lifetime total and current balance is attributable in the new ledgers;
- billing access plan and expiry match the Epoch 2 evidence;
- converted application timestamps are canonical ISO text;
- `PRAGMA foreign_key_check` is empty.

The planning snapshot produced 210 standard Products, 11 Experience Products, 219 current Prices, and two inquiry-only Experiences. These are evidence, not hard-coded production truth; rerun and review the final frozen export report before binding production.

## Preview

1. Create a new APAC preview D1 and record its name and ID in the release evidence.
2. Apply only the Epoch 3 baseline through `wrangler d1 migrations apply`; never edit `d1_migrations`.
3. Transform the approved Epoch 2 preview/export input locally, import it into the empty candidate, and run the verifier against the imported candidate export.
4. Bind only the preview Worker configuration to the new preview D1.
5. Deploy the PR SHA and run mutation-capable MCP/editor Product, Experience, Price scheduling, media, localization, and blog checks.
6. Run full desktop/mobile public verification for Pottery House, Kikuzuki, and NCLS, plus billing, transfer, platform blog/analytics, dashboard activity, and MCP catalog checks.
7. Record the D1 ID, PR SHA, deployed Worker version, transform report, manifest SHA-256, CI run, and browser/MCP evidence.

## Staging

1. Promote the exact preview-verified SHA to `staging` through the repository PR flow.
2. Create a new APAC staging D1, apply the baseline, and bind only staging. Staging contains replaceable test fixtures, not authoritative customer state: load the canonical demo, Pottery House, Kikuzuki, and NCLS fixtures into the candidate. Do not weaken the transformer or invent reserved platform scope to accept an invalid historical staging export.
3. Deploy once and confirm staging serves the exact SHA.
4. Perform read-only staging verification. Do not repeat mutation tests against staging.
5. Record the D1 ID, staging SHA, Worker version, fixture validation, CI run, and verification evidence.

## Production — requires the owner present

Stop before this section unless the owner explicitly authorizes the production flip while present.

1. Confirm preview mutation gates, staging read-only gates, all required CI, exact-SHA checks, final Epoch 2 export tooling, and rollback access are green.
2. Provision the new APAC production D1 and apply only the Epoch 3 baseline. Do not change the active production binding yet.
3. Deploy the release candidate against Epoch 2 with `DB_WRITE_FROZEN=true`.
4. Confirm the exact release candidate is serving, writes return the documented maintenance response, and queue work retries without consuming messages.
5. Wait at least 60 seconds after the freeze is confirmed.
6. Export the final Epoch 2 production D1 outside Git. Transform it, review the count report and manifest, verify it locally, then import into the empty Epoch 3 candidate and verify the candidate export again.
7. Bind production to Epoch 3 and restore writes in the ordinary `main` deployment of the same release SHA.
8. Run the production read-only verification job and compare analytics, routes, billing access, quota, event, notification, canary, and Better Auth evidence.

If any invariant or exact-SHA check fails before the binding change, keep Epoch 2 bound and remove the write freeze through the ordinary deployment path. If post-binding verification fails, use the retained Epoch 2 database and the documented rollback deployment; do not hand-patch either database.

## Retirement

Retirement is a separate, explicit decision after the production verification window. Record the final Epoch 2 D1 ID, export checksum, Epoch 3 D1 ID, release SHA, manifest checksum, verification evidence, and retirement authorization before deleting any rollback resource.
