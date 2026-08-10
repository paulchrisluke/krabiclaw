# Issue 554 ground truth and acceptance ledger

Status: implementation code frozen locally; no staging or production candidate
from this branch has been deployed.

Evidence cut: 2026-08-09 ICT

Branch: `codex/issue-554-full-e2e-fixes`

Immutable implementation code cut:
`928d8c02cd3b42c6d56728a027d321605ad8352e`. The commit that contains this
ledger is an evidence-only successor to that code cut.

This ledger keeps four states separate:

- **Committed** means present in the local branch history.
- **Provider-applied** means an explicitly approved Stripe catalog operation
  was executed and independently read back.
- **Deployed** means the exact source/build/Worker candidate is running in the
  named Cloudflare environment.
- **Verified** means the named candidate passed its required browser,
  migration, provider, CI, or benchmark evidence.

Anything without direct evidence is marked `❌`. Local tests and browser checks
are not staging or production proof.

## Immutable environment state

| Surface | Source SHA | Worker/build | Migrations | Direct verification |
| --- | --- | --- | --- | --- |
| Local issue-554 branch | code cut `928d8c02cd3b42c6d56728a027d321605ad8352e` | One `yarn build` passed in 85.66 seconds; its `.output` artifact was reused for local Workerd checks. No Worker version exists because it was not uploaded. | `0110_giant_stick.sql` is in branch history and passes local replay/checks; no migration or metadata file is modified in the final worktree. | Typecheck, full lint, focused tests, build, and the listed local browser checks passed. This is local evidence only. |
| Staging, last observed before this branch | `c03a142d71e6416c567240117a8e30f526c954a5` | Worker `e37a2d53-e02e-48fb-b24e-230ce9901c62`; build `21882bd0-78d8-4882-b39d-cdbe0f59aac3` | No pending migration at that historical observation. | Required run 31227909896 passed with incomplete paths. Full run 31228552732 failed. Current staging state and this branch's deployment are `❌`. |
| Last attributable production release | `4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9` | Worker `6254de48-c029-418b-b82f-a4811fb04814`; build `cec35b29-4962-4ec9-940b-f3ea63a07038` | State proven only by that historical release. | Run 31142677520 deployed and smoked this release; it was not the last observed active Worker. |
| Production, last observation before this branch | source **unknown `❌`** | Worker `0f4c7155-15df-42f0-8058-9ea531785f90`; build `455d5e33-5755-4c17-b448-6df5a051ddc1` | Four pending migrations were reported at the last observation. | No source SHA, workflow run, retained artifact, or route-by-route browser evidence attributes this Worker. Current state is unproven and production remains stopped `❌`. |

No staging or production deploy, database write, migration, impersonation,
subscription reconciliation, quota grant, or quota reset was performed during
this orchestration.

One explicitly approved live Stripe catalog retirement was performed. It is
recorded separately below; it must not be described as a runtime deployment or
a production database change.

At the last production migration observation, these files were pending:

1. `0106_canonical_tenant_page_media.sql`
2. `0107_stripe_ga4_purchase_delivery.sql`
3. `0108_reconcile_drizzle_migration_history.sql`
4. `0109_fix_stale_media_scope_trigger.sql`

The current remote migration state is unproven `❌`. `0110_giant_stick.sql`
has local replay evidence but no staging or production application evidence.

## Migration history contradiction

The history after `0098` remains contradictory `❌` and was deliberately not
rewritten:

- duplicate-numbered SQL files exist from `0092` through `0099`;
- local `d1_migrations` records both `0098` files and every migration through
  `0109`;
- the Drizzle journal records the tenant-page `0098` followed by `0099`
  through `0110`, but omits `0098_light_midnight`;
- `0099_snapshot.json` points to the obsolete/overwritten `0098` snapshot id;
- `0107_snapshot.json` points directly to the current `0098` snapshot and
  bypasses `0099`; and
- `0108` is a custom reconciliation marker and `0109` is a trigger that is not
  represented by the schema snapshot.

`yarn drizzle:check` and `yarn migrate:check` pass, but neither establishes
journal-to-D1 filename parity or repairs detached snapshot ancestry. No
historical migration or migration metadata was edited in this work.

Migration provenance in the issue window:

| Migration | Introducing commit | Evidence state |
| --- | --- | --- |
| `0099_pale_dakota_north.sql` | `3f6c3273` | historical; frozen |
| `0099_repair_canonical_tenant_blocks.sql` | `496612f7` | historical; frozen |
| `0100_remove_translation_automation.sql` | `40e055e7` | historical; frozen |
| `0101_invoice_payment_ledger.sql`–`0103_published_revision_timestamp.sql` | `e5298229` | historical; frozen |
| `0104_repair_ncls_canonical_parity.sql` | `f2a1d45e` | historical; frozen |
| `0105_stripe_ga4_subscription_analytics.sql` | `7b04a736` | previously observed on staging/production; current remote state `❌` |
| `0106_canonical_tenant_page_media.sql` | `a4bc31dd` | previously observed on staging; last observed production pending `❌` |
| `0107_stripe_ga4_purchase_delivery.sql` | `25841fb2` | previously observed on staging; last observed production pending `❌` |
| `0108_reconcile_drizzle_migration_history.sql` | `69b648b2` | previously observed on staging; last observed production pending `❌` |
| `0109_fix_stale_media_scope_trigger.sql` | `cef8a0a8` | previously observed on staging; last observed production pending `❌` |
| `0110_giant_stick.sql` | `0f430a81` | committed and verified on fresh local D1; remote application `❌` |

## Reconstructed issue, PR, commit, CI, and deployment history

- The canonical-page and Better Auth architectural direction predates issue
  554 and is not reopened here.
- Issue-554 implementation began with billing/page convergence on 2026-08-05.
  `40e055e7` removed automated translation product behavior, and `e5298229`
  reconciled billing and canonical pages on 2026-08-06.
- PR 558, **Finish #554 billing reconciliation and Pages editor**, targeted
  `staging` and merged as `69b648b2` on 2026-08-07. It included migrations
  `0105` through `0108`.
- Shared staging was then changed directly through `7f43609c`, `32754467`,
  `69b4edf3`, `560f49f3`, `3eebfd3f`, `f6502751`, `4d8eb93b`,
  `cef8a0a8`, `69298603`, `3103605c`, `4cad5237`, `f14378b0`,
  `dd2e126f`, `01f65eb9`, `464b2f10`, and `c03a142d`. That loop mixed
  fixtures, application code, CI, and temporary diagnostics. It never proved
  one immutable release candidate.
- Required run 31174984908 passed on `560f49f3`, which was not the final
  staging SHA. Required run 31227909896 passed on `c03a142d`, but incomplete
  path filters skipped billing, dashboard Pages, and Blawby CMS coverage.
- Full run 31228552732 on `c03a142d` finished with 212 passed, 5 failed,
  6 skipped, and 9 not run. The failures were Blawby `/links` 404 after API
  success, owner Stripe checkout 500, onboarding commit timeout, and two
  canonical content-write timeouts.
- Its five-sample job was a smoke sample. It was never a full benchmark. No
  final 20–30-sample comparative benchmark has run `❌`.

The frozen implementation work is separated into intentional commits:

| Commit | Scope |
| --- | --- |
| `babe861a` | Pages editor state, public-links contract, locale/browser coverage |
| `25b39bd8` | Starter/Growth runtime model and removal of retired product surfaces |
| `dfa3432c` | Signed Stripe catalog retirement planner and provider-safe ordering |
| `2551fef9` | Bounded read-only organization subscription reconciliation |
| `b82f9253` | Fail-closed quota and usage accounting |
| `a4c41a18` | Organization-owned billing transfer boundaries |
| `928d8c02` | Immutable release, migration, asset, browser, rollback, and benchmark controls |

Earlier focused commits on the branch retain the narrow fixes for request
context capture, canonical write bounds, onboarding batching, Pages dirty
transitions, canonical billing callers, Better Auth authorization, and the
generated `team.memberCount` repair. Temporary diagnostics in
`pages/links.vue` and `server/middleware/tenant-resolution.ts` are absent.

## Development and release process repair

The committed release controls now:

- bind candidate evidence to one source SHA, Nuxt build, Worker upload/version,
  asset hashes, ordered migration filenames and hashes, and route inventory;
- keep required PR checks from mutating shared staging;
- give the full lane one locked staging candidate instead of an iterative
  shared-staging debugging loop;
- verify exact origin, path, query, hash, redirects, first-party asset status
  and MIME, and desktop/mobile route rendering;
- derive a reviewed 300-route inventory, producing 600 desktop/mobile browser
  checks for the current checked-in fixtures;
- run migration prefix/order/hash proof before apply and exact state proof
  after apply, including Wrangler's real root-array JSON shape;
- separate a 3–5-sample smoke from one genuine 25-sample-per-side final
  comparison and prohibit p99 claims below 100 observations;
- separate production preflight from deployment and require exact retained
  preflight artifacts before mutation; and
- provide exact-candidate rollback verification rather than a generic
  fallback.

These controls pass local contract tests. They have not yet proven a deployed
candidate `❌`. Dynamic platform blog detail routes also lack a checked-in,
reviewed production manifest, so the claim of a complete production route
matrix remains `❌`.

## Adopted billing and business model

The coherent model is:

- Starter/free and Growth are the only runtime plan identities;
- one organization subscription covers all sites in that organization;
- Starter receives 500 and Growth receives 2,000 shared organization credits
  each UTC week;
- allowances are finite, do not carry, and are established by the weekly plan
  baseline; manual grants add auditable quantity after the latest baseline;
- `usage_events` is the append-only canonical usage ledger and `ai_credits` is
  a derived enforcement projection, not a one-time wallet;
- Growth priority support and eligible Facebook capability use the internal
  `managed_service` entitlement; this is not a Managed product or plan;
- Managed and SEO are not runtime plans and had no subscribers;
- one-time credits, add-ons, auto-top-up, and new fulfillment are retired;
- historical schema and raw provider/app audit evidence remain read-only; and
- locale variants are owner-authored manual content. Source-language fallback
  is a read-time behavior, not a generated explicit translation row.

The runtime implementation and customer copy are committed locally. No
subscription reconciliation, historical fulfillment, allowance grant, or
reset has been run against production `❌`.

## Stripe provider ground truth

### Subscription and usage census

The approved read-only live Stripe census for account
`acct_1SXZfREm0pkzLQDb` found:

- 3 active subscriptions and 1 canceled subscription, all Growth monthly;
- 6 invoices, all Growth;
- 625 Checkout Sessions, all Growth;
- 0 Payment Links; and
- no credit, add-on, auto-top-up, Managed, or SEO subscription usage.

This provider evidence supports retirement. It is not organization-level
Better Auth reconciliation and does not authorize grants or resets.

### Catalog retirement — provider-applied and verified

The user explicitly approved the signed live retirement-only plan. The
provider snapshot was
`2096010256755b625f554f8f998480b8ba1bfba49c6cd91fde106bbff68fbef4` and
the reviewed plan SHA was
`06421a6a7c5da3e0aed9e56bee9fdedb8db52861b090011825665435ba7f93c6`.

Exactly eight operations ran: clear the Managed and SEO default prices,
deactivate both monthly and annual prices for each product, then archive each
product. Growth had no operation. A fresh independent read produced snapshot
`0948523a08552b7c5c3250ae0def262e204cd7af75c6d8cbb85dd26c4dcea83d` and a
zero-operation plan SHA
`70c5c30098f4ecefd5111f6e67c24be1f5e69e2eaa359eb8e5257ec891fa7f3a`.

Result: Managed and SEO are inactive with null default prices and inactive
monthly/annual prices; Growth remains active with its monthly default price.
Catalog retirement is provider-applied and independently verified `✅`.

### Webhook endpoints

- Staging test-mode endpoint: exact canonical 10-event set, pinned webhook API
  version `2025-11-17.clover`.
- Production live endpoint: 7 events at the last read-only inspection and
  deliberately unmodified `❌`.
- Outbound Stripe client API version `2026-04-22.dahlia` is intentionally
  independent from the inbound webhook endpoint version.

No exact-candidate hosted checkout/subscription/invoice canary has run `❌`.
No production webhook mutation has been performed.

## Narrow reproduction and local verification

The failed-full-lane defects were reduced to local or PR-capable layers before
another staging candidate:

| Area | Local disposition | Remaining proof |
| --- | --- | --- |
| Blawby `/links` 404 after API 200 | `pages/links.vue` captures the request event before the async boundary, uses the canonical direct SSR service, and validates client DTOs with one retry-free timed request. Temporary diagnostics are removed. | Curated local NCLS fixture is absent, so the Blawby check was honestly skipped. Exact deployed Blawby desktop/mobile proof `❌`. |
| Saya `/links` and conversion tracking | Current production artifact passed the page-owned conversion request check against local Workerd. | Exact staging candidate proof `❌`. |
| Pages unsaved-edit loss and races | Dirty transitions share one gate; stale A→B responses cannot replace the latest selection; load and save errors are separate. Current production artifact passed the real-browser newest-selection test. | Exact deployed Saya and Blawby editor proof `❌`. |
| Source-locale fallback rows | Seed compilation rejects explicit source-locale business, menu, item, and page translation rows. Current artifact rendered the explicit Thai variant and excluded English source content in the focused browser check. | Exact deployed localized route proof `❌`. |
| Owner checkout 500 | Dead checkout aliases are removed; canonical Better Auth caller and catalog/provider contracts pass focused tests. | Exact-candidate test-mode hosted canary `❌`. |
| Onboarding and canonical writes | Canonical writes are bounded and onboarding import is batched; prior local real-HTTP journeys passed after the committed Better Auth `team.memberCount` migration. | Required PR/full-lane and exact deployed candidate proof `❌`. |
| Quota corruption paths | Invalid projections, periods, timestamps, token values, unsafe aggregates, manual/lifetime overflow, and partial writes fail closed in focused D1 tests. | No deployed runtime or production reconciliation/grant/reset proof `❌`. |

No sanctioned NCLS/Blawby fixture was forged and no D1 row was hand-created to
manufacture browser evidence.

## Validation inventory

Tests added or strengthened at the lowest owning layer include:

- public links DTO/runtime contracts and page-owned conversion tracking;
- Pages newest-selection ownership, dirty transitions, duplicate/delete, and
  visible Blawby CMS mutation/restore paths;
- source-locale seed rejection and explicit Thai rendering;
- organization reconciliation provenance, pagination, provider/local bounds,
  ownership conflicts, and no-store behavior;
- finite quota arithmetic, overflow, malformed projection, idempotent mark,
  and zero-partial-write behavior;
- Starter/Growth product-model, price, transfer, and retired-surface guards;
- signed catalog snapshot/precondition/default-price retirement behavior; and
- immutable candidate, migration, baseline, route, browser, rollback, and
  workflow contracts.

Existing catalog, AI credits, billing usage, quota adjustment, Pages safety,
seed fixture, migration, and release-contract suites were reused. Redundant
legacy fulfillment, retired upgrade modal, legacy billing portal, and obsolete
site-transfer reset/compatibility coverage were removed with their dead
surfaces.

Focused validation at the frozen code cut:

- release/migration/provenance controls: 45 passed, 0 failed;
- focused billing, quota, reconciliation, Pages, seed, and product batches:
  at least 265 passed, 0 failed;
- catalog planner: 37 passed, 0 failed;
- organization reconciliation: 33 passed, 0 failed;
- product-model guard unit suite: 3 passed, 0 failed;
- `yarn typecheck`: passed;
- full `yarn lint`: passed in 46.25 seconds;
- product-model, Better Auth boundary, data-loading, migration, and diff
  guards: passed; and
- one `yarn build`: passed in 85.66 seconds.

Local real-browser checks against that reused production artifact:

- Pages newest-selection race: passed;
- Saya `/links` page-owned conversion: passed;
- explicit Thai localized render: passed; and
- Blawby CMS: skipped because the sanctioned local NCLS fixture is absent.

The full lane and final comparative benchmark were not run. No full-validation
claim is made `❌`.

## Issue 554 acceptance ledger

| Acceptance item | Committed/provider state | Deployed state | Direct verification | Verdict |
| --- | --- | --- | --- | --- |
| One immutable release candidate and repaired release process | Controls committed at code cut `928d8c02`. | No staging/production candidate. | Local contracts only; no workflow artifact. | `❌` |
| Exact migration, asset, Worker, and browser evidence | Verifiers committed. | No candidate. | Current remote state unproven. | `❌` |
| Stripe webhook endpoint/event/signing evidence | Exact staging test contract committed; production preflight is read-only. | Current runtime not deployed. | Staging has 10 events; production live endpoint remains 7 and unmodified. | `❌` |
| Intentional Stripe prices/catalog | Signed retirement planner committed; approved live retirement applied. | Provider catalog only; not application runtime. | Fresh readback is zero-op and Growth is untouched. | `✅` catalog retirement only |
| Organization Stripe/Better Auth reconciliation | Bounded per-organization read-only report committed. | Not deployed. | No paid-organization reports or apply. | `❌` |
| One recurring organization subscription/quota model | Starter/Growth runtime, docs, UI, and guards committed. | Not deployed. | Local focused tests and provider census only. | `❌` |
| Safe grant/reset and historical usage semantics | Fail-closed accounting and operator contracts committed. | Not deployed. | Local D1 tests; no production grant/reset/reconciliation. | `❌` |
| Retire credits, add-ons, auto-top-up, Managed, SEO, and active fulfillment | Runtime surfaces removed; live Managed/SEO catalog archived. | Runtime cleanup not deployed. | Provider catalog verified; application candidate unverified. | `❌` overall release |
| Pages editor lifecycle and unsaved-edit protection | Committed. | Not deployed. | Focused local browser passed selection/conversion paths. | `❌` |
| Canonical renderer truth for Saya and Blawby | Shared server/data contracts committed. | Not deployed. | Saya local checks passed; Blawby deployed proof absent. | `❌` |
| Manual locale variants without published source fallback rows | Compiler/runtime fixes committed. | Not deployed. | Focused tests and local Thai browser check passed. | `❌` |
| Remove stale fixture, billing, product, and compatibility names | Runtime/copy/fixtures/guards committed; historical schema/catalog evidence retained intentionally. | Not deployed. | Local product guard passes. | `❌` |
| Full required lane and genuine comparative benchmark | Workflow committed. | Not run. | No full-lane or 25-sample-per-side artifact. | `❌` |
| Deployed desktop/mobile verification for Saya and Blawby | Browser inventory committed. | No exact candidate. | No deployed matrix. | `❌` |
| Complete landed/deployed/verified acceptance evidence | This ledger records the current split. | n/a | Deployment and full-lane rows remain unresolved. | `❌` |

## Prior application-D1 census

The 2026-08-08 read-only application census is historical evidence, not a
current production-state claim. It reported 253 rows read and 0 written:

| Metric | Prior count |
| --- | ---: |
| Organizations | 14 |
| Better Auth subscriptions | 3 |
| Organization billing projections | 5 |
| Organization + site entitlement rows | 216 |
| AI credit projections | 8 |
| Usage events | 0 |
| Quota grants | 3 applied, 0 unapplied |
| Historical credit top-ups | 0 |
| Historical service add-ons | 0 total, 0 unfulfilled |

The zero top-up/add-on history supports retirement. It does not prove current
remote state or authorize reconciliation, grants, resets, migrations, or data
cleanup.

## Remaining release gates

- Push the frozen branch and obtain ordinary required PR CI without shared
  staging mutation `❌`.
- Produce and attest one exact staging manifest, deploy one locked candidate,
  and stop if its source/build/Worker/migration/assets cannot be proven `❌`.
- Run the required full lane and one genuine 25-sample-per-side comparative
  benchmark against that exact candidate `❌`.
- Verify the exact deployed candidate route by route on desktop/mobile,
  including Saya and the existing curated Blawby/NCLS fixture `❌`.
- Add a reviewed dynamic platform-blog detail manifest before claiming a
  complete production public-route matrix `❌`.
- Run paid-organization reconciliation reports and the test-mode hosted billing
  canary on the exact staging candidate `❌`.
- Treat the approved catalog retirement as complete; do not perform another
  catalog mutation. Production live webhook remains 7 events and unmodified
  pending a separate exact dry-run and authorization `❌`.
- Keep production stopped. Its active source, Worker provenance, migration
  state, protected-environment controls, and browser health are not currently
  proven `❌`.
