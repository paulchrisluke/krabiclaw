# Issue 554 ground truth and acceptance ledger

Status: active, release blocked

Evidence cut: 2026-08-08 09:50 ICT
Local branch: `codex/issue-554-full-e2e-fixes`

This ledger separates code that exists from code that is deployed and behavior
that has actually been verified. A check in the **Landed** column means only
that the implementation is present in the named source revision. It is not a
release claim. Every unresolved item is marked with `❌`.

## Immutable state

| Surface | Source SHA | Worker version | Cloudflare build | Migrations | Verification |
| --- | --- | --- | --- | --- | --- |
| Process-repair baseline | `066509efeb7cf982a30c387f04d44bc3168de1de` plus the pre-existing uncommitted `pages/links.vue` patch | not deployed | not deployed | no migration was changed | Three release-process commits have focused local validation only; this ledger and ADR update are the following decision slice. |
| Staging | `c03a142d71e6416c567240117a8e30f526c954a5` | `e37a2d53-e02e-48fb-b24e-230ce9901c62` at 100% | `21882bd0-78d8-4882-b39d-cdbe0f59aac3` | no pending migration | Required run 31227909896 passed; full run 31228552732 failed. This is not a verified candidate. |
| Last attributable production release | `4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9` | `6254de48-c029-418b-b82f-a4811fb04814` | `cec35b29-4962-4ec9-940b-f3ea63a07038` | migration state at run time only | Run 31142677520 deployed and smoked this candidate. It is no longer the active Worker. |
| Current production | **unknown** | `0f4c7155-15df-42f0-8058-9ea531785f90` at 100% | `455d5e33-5755-4c17-b448-6df5a051ddc1` | four pending migrations | `❌` No source SHA, release tag, workflow run, retained build, or route-by-route browser evidence proves this Worker. Production is quarantined. |

Fresh read-only Wrangler checks on 2026-08-08 confirmed that the current
production deployment still targets Worker version
`0f4c7155-15df-42f0-8058-9ea531785f90`, staging still targets
`e37a2d53-e02e-48fb-b24e-230ce9901c62`, and staging has no pending migration.
No deployment or database write was performed.

Production has these pending migrations, in Wrangler's reported order:

1. `0106_canonical_tenant_page_media.sql`
2. `0107_stripe_ga4_purchase_delivery.sql`
3. `0108_reconcile_drizzle_migration_history.sql`
4. `0109_fix_stale_media_scope_trigger.sql`

The Drizzle journal stops at `0098` while later SQL files exist. That
contradiction remains `❌` unresolved. Historical migrations and
`migrations/meta/*` are frozen during this work.

## History reconstructed

- The already-completed canonical page and Better Auth direction landed before
  issue 554. This work does not reopen those decisions.
- The main issue-554 implementation began with billing and page convergence on
  2026-08-05, then `40e055e7` removed the automated-translation product
  surface and `e5298229` reconciled billing and canonical pages on 2026-08-06.
- PR 558, **Finish #554 billing reconciliation and Pages editor**, targeted
  `staging` and merged as `69b648b201dd73bf9914e028f76e319af01aed1e`
  on 2026-08-07. Its commit set ran from `7b04a736` through `69b648b2` and
  included migration files `0105` through `0108`.
- Staging was then changed directly through the browser-test and debugging
  sequence `7f43609c`, `32754467`, `69b4edf3`, `560f49f3`, `3eebfd3f`,
  `f6502751`, `4d8eb93b`, `cef8a0a8`, `69298603`, `3103605c`, `4cad5237`,
  `f14378b0`, `dd2e126f`, `01f65eb9`, `464b2f10`, and `c03a142d`.
  This shared-staging loop mixed fixture, application, CI, and temporary
  diagnostic changes and did not produce an immutable verified candidate.
- Required run 31174984908 passed on `560f49f3`, but its staging lane took
  13m56s and it was not the final staging SHA.
- Required run 31227909896 passed on final staging SHA `c03a142d`, but path
  filters skipped the representative PR lane and did not prove billing,
  dashboard Pages, or Blawby CMS on that exact candidate.
- Full run 31228552732 on `c03a142d` finished with 212 passed, 5 failed,
  6 skipped, and 9 not run. The failures were two canonical content-write
  timeouts, a Blawby `/links` 404 after its public API returned success, an
  onboarding commit timeout, and an owner Stripe checkout 500. Its five-sample
  job was a smoke sample, not a final comparative benchmark.
- Local commits `119d9ce2`, `12042b90`, and `066509ef` repair provenance,
  immutable candidate validation, comparative benchmark rules, and release
  gating. They are not deployed.

Migration provenance in the issue window is:

| Migration | Introducing commit | State |
| --- | --- | --- |
| `0099_pale_dakota_north.sql` | `3f6c3273` | historical/applied; do not edit |
| `0099_repair_canonical_tenant_blocks.sql` | `496612f7` | historical/applied; do not edit |
| `0100_remove_translation_automation.sql` | `40e055e7` | historical/applied; do not edit |
| `0101_invoice_payment_ledger.sql`–`0103_published_revision_timestamp.sql` | `e5298229` | historical/applied; do not edit |
| `0104_repair_ncls_canonical_parity.sql` | `f2a1d45e` | historical/applied; do not edit |
| `0105_stripe_ga4_subscription_analytics.sql` | `7b04a736` | applied to staging and production |
| `0106_canonical_tenant_page_media.sql` | `a4bc31dd` | staging applied; production pending `❌` |
| `0107_stripe_ga4_purchase_delivery.sql` | `25841fb2` | staging applied; production pending `❌` |
| `0108_reconcile_drizzle_migration_history.sql` | `69b648b2` | staging applied; production pending `❌` |
| `0109_fix_stale_media_scope_trigger.sql` | `cef8a0a8` | staging applied; production pending `❌` |

## Issue 554 acceptance ledger

| Acceptance item | Landed | Deployed | Verified | Verdict |
| --- | --- | --- | --- | --- |
| Stripe endpoint, event set, environment, signing secret, delivery, and retry history | Better Auth endpoint and durable retry code exist in `c03a142d`. | Staging only | A test-mode provider replay reached staging, but Stripe Workbench history and the exact final candidate were not verified. | `❌` |
| Organization-level Stripe/Better Auth reconciliation | Projection and webhook reconciliation code exist. | Partial production projections exist. | Read-only production census found 14 organizations, 3 Better Auth subscriptions, 5 billing projections, 216 entitlement rows, and 8 credit rows. No approved provider-backed per-organization report exists. | `❌` |
| Approved quota reset/grant for existing organizations | Immediate-apply platform billing route exists, but has no preview/approval handshake. | Not safely deployed as an operator procedure | No production grant or reset was authorized or executed. | `❌` |
| Preserve historical usage and auditable grants | Ledgers exist. | Production has 3 applied quota grants. | Production has zero `usage_events` despite legacy lifetime usage, so history is not reconciled into the canonical ledger. | `❌` |
| Attach Stripe and reconciliation evidence | Two issue comments contain partial staging evidence. | n/a | They explicitly leave provider UI, production reconciliation, grants, full lane, and benchmark unresolved. | `❌` |
| Decide one recurring subscription/quota model | ADR 0023 establishes the direction; the explicit semantics are being added in the current local decision slice. | Not deployed | Existing runtime still mixes weekly refill, invoice-period grant, and wallet-style UI. | `❌` until implementation tests pass |
| Retire one-time credits, add-ons, and auto-top-up | Customer writers and UI are mostly removed; the product guard passes. | Present on staging | A historical fulfillment writer/UI and an unsafe mutating catalog script remain. | `❌` |
| Keep prices and charge amounts intentional | No price change is proposed. | Existing Stripe catalog unchanged | Catalog has not been verified through a dry-run-first operator report. | `❌` operationally |
| Better Auth authority plus append-only usage/grants | Core tables and event processor exist. | Partial | Runtime quota semantics, projection drift handling, flat-cost events, reset behavior, and trial expiry are inconsistent. | `❌` |
| Billing regression coverage | Focused mock suites exist. | n/a | No real D1 invariant test or complete test-mode checkout/subscription/invoice proof exists for the final model. | `❌` |
| Typed Pages block field editors | Present in the canonical manager and block editor. | Staging | Earlier staging smoke covered a subset, but no exact-current-candidate proof exists. | `❌` release verification |
| Insert/select/duplicate/delete/reorder/drag/inline validation | Code is present. | Staging | Browser coverage exercises only selection, image insertion, and deletion; duplicate, move, drag/drop, save, errors, and lifecycle actions are unproved. | `❌` |
| Faithful draft preview and unsaved-change protection | Canonical preview service exists. | Staging | Starting a new page and lifecycle/delete actions can discard dirty edits; preview can show stale persisted content. | `❌` |
| Registry, canonical service, revision lifecycle, and both renderers remain sole truth | Present and covered by focused service tests. | Staging | Full exact-candidate Saya/Blawby editor-to-renderer verification is absent. | `❌` release verification |
| Real browser verification on Saya and Blawby with blocks/media | Partial earlier staging smoke only | Not production | No full UI lifecycle, faithful preview, or Pages-manager 390x844 pass exists on one exact candidate. | `❌` |
| Audit active automated-translation and legacy naming | Active automation was removed; seed contracts/compiler/fixtures now use tenant-page locale terminology. | Not deployed | Focused tests and the product-model guard pass locally; staging/browser evidence is still absent. | `❌` |
| Preserve manual locale variants while removing automation | Runtime direction and migration 0100 are landed; seed renderer now requires an explicit source locale and emits only published localized fields for non-source locales. | Not deployed | Focused tests cover source fallback suppression, missing locale content, draft fields, and disabled locales; staging/browser evidence is still absent. | `❌` |
| Rename/clarify stale fixture and seed names | Local seed contracts/compiler/renderer/fixtures/tests are renamed. | Not deployed | The exact candidate still needs staging deployment and browser verification. | `❌` |
| Guard against retired writers/tools returning | Product-model guard now also rejects retired seed locale names in active seed definitions. | Not deployed | `yarn lint:product-model` passes locally; CI/staging evidence is still absent. | `❌` |

## Additional release blockers discovered by the failed full lane

- `❌` Prove or reject the uncommitted setup-level request-event capture in
  `pages/links.vue`; do not accept it from plausibility alone.
- `❌` Remove `links_ssr_context` and
  `tenant_resolution_missing_cloudflare_context` temporary diagnostics.
- `❌` Reproduce and fix the owner checkout 500.
- `❌` Reproduce and fix the onboarding commit timeout.
- `❌` Reproduce and fix both canonical content-write timeouts at the owning
  service/concurrency layer.
- `❌` Run one production build, local desktop/mobile browsers, one immutable
  staging candidate, deployed Saya and Blawby desktop/mobile browsers, the
  required full lane, and a genuine 20–30 sample base/head comparative
  benchmark.
- `❌` GitHub currently returns 404 for the `production` Environment. A workflow
  job named `environment: production` therefore cannot be treated as proof of
  required-reviewer protection.

## Production read-only census

The 2026-08-08 read-only query reported 253 rows read, 0 rows written, and:

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

The zero historical top-up/add-on census permits removal of the remaining
fulfillment mutation after its focused code/test slice. Historical schema and
immutable migrations remain for auditability.
