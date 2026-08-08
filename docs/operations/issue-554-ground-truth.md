# Issue 554 ground truth and acceptance ledger

Status: active, release blocked

Evidence cut: 2026-08-08 13:35 ICT

Branch: `codex/issue-554-full-e2e-fixes`

Local implementation cut before this ledger update:
`fe13dd5ee36827b185897a65094a769ee46c3a58`. This is not yet a frozen,
pushed, deployed, or browser-verified candidate.

This ledger keeps **landed**, **deployed**, and **verified** separate. Landed
means only that code and focused local evidence exist on the branch. Every
item without complete direct evidence is marked `❌`.

## Immutable environment state

| Surface | Source SHA | Worker version | Cloudflare build | Migrations | Verification |
| --- | --- | --- | --- | --- | --- |
| Local issue-554 branch | pre-ledger cut `fe13dd5e` | not deployed | one final build not yet run | no schema, migration, or migration-metadata diff from `c03a142d` | Changed-unit focused lane: 292 passed, 0 failed. Typecheck, full lint, production build, and local browser matrix remain `❌`. |
| Staging | `c03a142d71e6416c567240117a8e30f526c954a5` | `e37a2d53-e02e-48fb-b24e-230ce9901c62` at 100% | `21882bd0-78d8-4882-b39d-cdbe0f59aac3` | no pending migration | Required run 31227909896 passed with incomplete path coverage; full run 31228552732 failed. This is not a verified candidate `❌`. |
| Last attributable production release | `4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9` | `6254de48-c029-418b-b82f-a4811fb04814` | `cec35b29-4962-4ec9-940b-f3ea63a07038` | migration state at that run only | Run 31142677520 deployed and smoked it; it is no longer the active Worker. |
| Current production | **unknown `❌`** | `0f4c7155-15df-42f0-8058-9ea531785f90` at 100% | `455d5e33-5755-4c17-b448-6df5a051ddc1` | four pending migrations | No source SHA, workflow run, retained artifact, or route-by-route browser evidence proves this Worker. Production remains quarantined `❌`. |

No staging or production deployment, database write, migration, provider
mutation, live Stripe call, impersonation, quota grant, or quota reset was
performed during this reconstruction.

Production has these pending migrations, in Wrangler's reported order:

1. `0106_canonical_tenant_page_media.sql`
2. `0107_stripe_ga4_purchase_delivery.sql`
3. `0108_reconcile_drizzle_migration_history.sql`
4. `0109_fix_stale_media_scope_trigger.sql`

The Drizzle journal stops at `0098` while later SQL files exist. That
contradiction is unresolved `❌`. Historical migrations and
`migrations/meta/*` remain frozen.

## Reconstructed issue, PR, commit, CI, and deployment history

- The canonical page and Better Auth architectural direction predates issue
  554 and is not reopened here.
- The issue-554 implementation began with billing/page convergence on
  2026-08-05. `40e055e7` removed the automated-translation product surface,
  and `e5298229` reconciled billing and canonical pages on 2026-08-06.
- PR 558, **Finish #554 billing reconciliation and Pages editor**, targeted
  `staging` and merged as `69b648b2` on 2026-08-07. It included migrations
  `0105` through `0108`.
- Shared staging was then changed directly through
  `7f43609c`, `32754467`, `69b4edf3`, `560f49f3`, `3eebfd3f`,
  `f6502751`, `4d8eb93b`, `cef8a0a8`, `69298603`, `3103605c`,
  `4cad5237`, `f14378b0`, `dd2e126f`, `01f65eb9`, `464b2f10`,
  and `c03a142d`. That loop mixed fixtures, application code, CI, and
  temporary diagnostics; it did not produce immutable release evidence.
- Required run 31174984908 passed on `560f49f3`, but it was not the final
  staging SHA. Required run 31227909896 passed on `c03a142d`, but its path
  filters skipped billing, dashboard Pages, and Blawby CMS coverage.
- Full run 31228552732 on `c03a142d` finished with 212 passed, 5 failed,
  6 skipped, and 9 not run. The failures were two canonical content-write
  timeouts, a Blawby `/links` 404 after public API success, an onboarding
  commit timeout, and owner Stripe checkout 500.
- Its five-sample job was a smoke sample, not a full comparative benchmark.
  No final benchmark has run `❌`.

Migration provenance in the issue window:

| Migration | Introducing commit | State |
| --- | --- | --- |
| `0099_pale_dakota_north.sql` | `3f6c3273` | historical/applied; frozen |
| `0099_repair_canonical_tenant_blocks.sql` | `496612f7` | historical/applied; frozen |
| `0100_remove_translation_automation.sql` | `40e055e7` | historical/applied; frozen |
| `0101_invoice_payment_ledger.sql`–`0103_published_revision_timestamp.sql` | `e5298229` | historical/applied; frozen |
| `0104_repair_ncls_canonical_parity.sql` | `f2a1d45e` | historical/applied; frozen |
| `0105_stripe_ga4_subscription_analytics.sql` | `7b04a736` | staging and production applied |
| `0106_canonical_tenant_page_media.sql` | `a4bc31dd` | staging applied; production pending `❌` |
| `0107_stripe_ga4_purchase_delivery.sql` | `25841fb2` | staging applied; production pending `❌` |
| `0108_reconcile_drizzle_migration_history.sql` | `69b648b2` | staging applied; production pending `❌` |
| `0109_fix_stale_media_scope_trigger.sql` | `cef8a0a8` | staging applied; production pending `❌` |

## Development and release process repair

The local branch now:

- records source SHA, immutable Worker version/tag, one retained
  `.output` artifact, Nuxt build metadata, deployed asset hashes, and
  migration evidence in a candidate manifest;
- prevents required PR checks from mutating shared staging or production;
- gives the full lane one uninterrupted shared-staging lock, one Worker upload,
  candidate override tests, verified rollback, cache purge, and post-promotion
  browser checks;
- runs the representative browser lane unconditionally instead of relying on
  incomplete path filters;
- separates a 3–5 sample smoke from a genuine 25-sample-per-side
  baseline/candidate comparison and suppresses p99 below 100 observations;
- captures a read-only test-mode Stripe catalog plan and Workbench preflight
  before staging mutations;
- requires a separate production preflight and deploy dispatch, and fails the
  deploy closed unless GitHub's `production` Environment exists, has a valid
  required reviewer, and enables `prevent_self_review`; and
- verifies rollback by restoring the baseline to 100%, proving the candidate
  absent, purging HTML cache, and only then recording restoration.

Focused workflow/candidate tests pass locally. The workflows are not yet
pushed or exercised against an exact candidate, so operational proof remains
`❌`.

GitHub's Environment API currently returns 404 for `production`. Until an
authorized repository administrator creates and protects that environment,
production deployment is deliberately impossible `❌`.

## Stripe Workbench and catalog ground truth

Read-only test-mode Workbench inspection found:

| Environment | Destination | Enabled | API version | Delivery history | Contract result |
| --- | --- | --- | --- | --- | --- |
| Production | `/api/billing/webhook`, redacted id `we_1Tg…` | yes | `2025-11-17.clover` | 7 events, 18 deliveries, 0 failed | Application currently uses `2026-04-22.dahlia`; API-version drift `❌`. |
| Staging | `/api/billing/webhook`, redacted id `we_1Ti…` | yes | `2025-11-17.clover` | 6 events, 5 deliveries, 0 failed | Missing `invoice.paid`, includes ignored `invoice.payment_succeeded`, and API-version drift `❌`. |

The canonical application event set is:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.voided`
- `invoice.marked_uncollectible`

`invoice.payment_succeeded` is intentionally excluded. The full lane now
fails on this exact drift; it does not silently rewrite Workbench. Correcting
the external test-mode endpoint is a staging mutation and requires explicit
approval `❌`.

The catalog planner is test-mode-only, uses zero retries and an explicit
timeout, fixes the reviewed recurring amounts at 49/149/349, preserves seat
and annual prices, rejects ambiguity, and produces a signed deterministic
plan before apply. No provider apply or live-mode call has run `❌`.

## Adopted billing model

ADR 0023 is the coherent model:

- one Better Auth organization subscription covers all organization sites;
- Starter receives 500 and Growth 2,000 shared organization AI credits per
  UTC week;
- Managed and SEO are hidden/retired from new offers; already-entitled
  organizations retain unlimited access;
- weekly plan baselines and explicit resets establish the allowance, manual
  grants add only after the latest baseline, and unused allowance does not
  carry;
- `usage_events` is the append-only canonical usage ledger;
- `ai_credits` is a derived enforcement projection, not a wallet;
- legacy null-period balances are quarantined until an approved
  reconciliation;
- one-time credits, add-ons, and auto-top-up are retired from active product
  paths while historical tables remain read-only for audit; and
- operators use a direct, non-impersonated platform billing principal with
  signed preview/apply and compare-and-swap protection.

The runtime implementation, customer copy, product guard, operator
adjustments, historical reconciliation, catalog plan, and tests now align
locally. No production reconciliation, grant, or reset was authorized or
performed.

## Issue 554 acceptance ledger

| Acceptance item | Landed locally | Deployed | Direct verification | Verdict |
| --- | --- | --- | --- | --- |
| Stripe endpoint, event set, signing/delivery/retry evidence | Workbench preflight, canonical route/version contract, durable retry/dead-letter operator boundary, and post-promotion canary exist. | Older code on staging only. | Read-only Workbench inspection found event/API drift. Exact candidate canary not run. | `❌` |
| Organization Stripe/Better Auth reconciliation | Better Auth projection plus fail-closed historical reconciliation preview/apply and CAS are landed. | Not this branch. | Production census is read-only only; no provider-backed per-org report or apply. | `❌` |
| Approved quota grant/reset tooling | Direct non-impersonated operator, signed approval, idempotency, stale-state detection, and D1 batch tests are landed. | Not this branch. | No production grant/reset authorized or run. | `❌` |
| Preserve historical usage and auditable grants | Residual reconstruction, strict cutoffs, exact replay validation, audit marker, and append-only usage tests are landed. | Production still has zero `usage_events`. | Changed-unit lane passes; production reconciliation not applied. | `❌` |
| One recurring subscription/quota model | ADR 0023, runtime semantics, UI/copy, and product-model guard align locally. | Not this branch. | Period/grant/reset/transition/unlimited/legacy tests pass locally. | `❌` until deployed/browser verified |
| Retire credits, add-ons, auto-top-up, and active fulfillment | Active aliases/writers/UI are removed; historical add-on view is audit-only; guard blocks return. | Not this branch. | Local retirement/guard tests pass; exact candidate not verified. | `❌` release verification |
| Intentional Stripe prices/catalog | Deterministic test-mode dry-run/apply boundary is landed. | No provider change. | Local tests pass; no approved test-mode provider apply. | `❌` |
| Better Auth authority plus append-only usage/grants | Billing permission, projection, usage, site/team provisioning, and revocation paths are aligned locally. | Not this branch. | Local invariant tests and boundary guard pass. Three separate legacy writers are documented below. | `❌` |
| Billing regression coverage | D1 period, reconciliation, operator, webhook, catalog, canary, and projection tests are landed. | n/a | Changed-unit lane passes; hosted checkout/subscription/invoice canary not run. | `❌` |
| Typed Pages editors and block lifecycle | Typed fields plus insert/select/duplicate/delete/move/drag/reorder/inline validation are landed. | Older subset on staging. | Unit safety tests pass; exact browser tracer not yet run. | `❌` |
| Faithful preview and unsaved-change protection | New/select/locale/route/status/delete transitions share the dirty guard; stale responses cannot replace current editor state; Preview uses Nuxt UI's documented `to` prop. | Not this branch. | Local unit tests pass; desktop/mobile browser proof absent. | `❌` |
| Registry/canonical revision service and both renderers remain sole truth | Shared service and publication-history deletion guard are landed. | Older subset on staging. | Exact Saya/Blawby editor-to-renderer candidate proof absent. | `❌` |
| Real browser verification on Saya and Blawby with blocks/media | Browser projects and route matrix are landed. | No new candidate. | Local and deployed desktop/mobile matrix not yet run. | `❌` |
| Remove active translation automation while preserving manual locale variants | Explicit source locale prevents source-language fallback from becoming a published non-source variant; localized draft/published behavior remains. | Not this branch. | Focused seed tests pass; staging/browser proof absent. | `❌` |
| Rename/guard stale fixture, seed, billing, and product names | Active seed naming and recurring-quota copy are corrected; guard owns retired names/signup-wallet phrases. | Not this branch. | Product-model guard passes locally. | `❌` release verification |
| Attach complete acceptance evidence | This ledger now records known local/environment/provider evidence separately. | n/a | Full lane, benchmark, exact staging, and production evidence remain absent. | `❌` |

## Failed-full-lane defect disposition

| Defect | Narrow reproduction and local disposition | Remaining proof |
| --- | --- | --- |
| Blawby `/links` returned 404 after API 200 | `97278c15` captures the request event before the async loader boundary; the shared data-loading guard owns the SSR invariant. Temporary `links_ssr_context` and tenant-resolution diagnostics are removed. | Local real browser and exact deployed candidate `❌`. |
| Owner checkout returned 500 | `d3a9da0f` removes the dead checkout alias and caller tests require the canonical Better Auth subscription path. | Test-mode hosted canary on exact candidate `❌`. |
| Onboarding commit timed out | `a74d56bd` replaces page writes with constant-count validation/batching; query-count tests cover growth and malformed/empty input. | Local real browser and exact deployed candidate `❌`. |
| Two canonical content writes timed out | `30153826` bounds canonical blog writes at the owning service/concurrency layer; content contract tests pass. | Local real browser and exact deployed candidate `❌`. |
| Pages unsaved edits could be discarded | `625891e9`, `b6d54062`, and `eb2550ca` own dirty transitions, request ownership, lifecycle/delete safety, and Preview navigation. | Desktop/mobile browser tracer `❌`. |
| ChowBot site creation reported failure after a successful route response | `d502c8b8` proves and fixes the response mismatch: UI expected nested `site.id`, route returns `siteId`. | Local browser fixture isolation and exact candidate `❌`. |

## Adjacent Better Auth debt fully assessed

These are not described as vaguely “pre-existing”; their exact semantics and
blockers were inspected:

- `server/api/admin/invite/client.post.ts` directly creates Better Auth
  organization/invitation rows for an intentionally ownerless organization.
  The public Organization APIs require a tenant actor and
  `createOrganization` creates that actor as owner. A platform admin must not
  silently become tenant owner. Preserving the current flow therefore needs an
  explicit platform system-organization/provisioning design plus race and
  rollback tests; it is not a safe mechanical migration `❌`.
- `server/utils/dev-test-members.ts` atomically writes Better Auth user,
  member, team, and team-member fixtures. Public API replacement is
  non-transactional, the request owner cannot call Admin user creation, and
  partial failure needs compensation. This needs a dedicated dev-fixture
  authority/cleanup seam before migration `❌`.
- `server/utils/platform-media.ts` creates a deterministic ownerless platform
  organization. Public `createOrganization` would incorrectly grant a tenant
  owner. It needs the same approved system-organization design; direct adapter
  replacement alone would not satisfy the documented-public-API rule `❌`.

These three items block claiming repository-wide Better Auth legacy cleanup,
but their redesign is kept out of the isolated issue-554 runtime fixes rather
than smuggled into another mixed change.

## Production read-only census

The 2026-08-08 read-only query reported 253 rows read, 0 rows written:

| Metric | Count |
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

The zero top-up/add-on census supported removing the remaining active
fulfillment mutation while preserving historical schema. It does not authorize
production reconciliation, grant, reset, migration, or cleanup.

## Remaining release gates

- Run typecheck, full lint, migration/product/auth guards, and exactly one
  production build `❌`.
- Run the required local real-browser desktop/mobile Pages, billing, links,
  onboarding/content, Saya, Blawby, and ChowBot fixture checks `❌`.
- Confirm the persistent Pottery House fixture still has exactly one site
  after ChowBot/site-creation tests `❌`.
- Freeze and push one source SHA and obtain ordinary PR/CI evidence without
  mutating shared staging `❌`.
- After an explicit dry-run report and user approval, correct the test-mode
  Workbench contract and dispatch the one locked full staging candidate
  (migrations/reset/seed/deploy/cache/browser/provider mutations) `❌`.
- Run the required full lane and genuine 25-sample-per-side comparative
  benchmark against that exact candidate `❌`.
- Verify the promoted staging candidate in deployed desktop/mobile browsers
  for Saya and Blawby `❌`.
- Production remains stopped: source provenance is unknown, four migrations
  are pending, the migration journal is contradictory, and the protected
  GitHub Environment is absent `❌`.
