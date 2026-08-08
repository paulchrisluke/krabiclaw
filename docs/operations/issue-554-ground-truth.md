# Issue 554 ground truth and acceptance ledger

Status: active, release blocked

Evidence cut: 2026-08-08 14:13 ICT

Branch: `codex/issue-554-full-e2e-fixes`

Local implementation cut before this ledger update:
`4e99fe01c3fa77d9e23209a3fa2aa2a9d300043c`. This is not yet a frozen,
pushed, deployed, or browser-verified candidate.

This ledger keeps **landed**, **deployed**, and **verified** separate. Landed
means only that code and focused local evidence exist on the branch. Every
item without complete direct evidence is marked `❌`.

## Immutable environment state

| Surface | Source SHA | Worker version | Cloudflare build | Migrations | Verification |
| --- | --- | --- | --- | --- | --- |
| Local issue-554 branch | pre-ledger cut `4e99fe01` | not deployed | diagnostic production build at `2dcc49bb` passed; current cut still needs its final build | no schema, migration, or migration-metadata diff from `c03a142d` | Changed-unit focused lane: 292 passed, 0 failed; typecheck/full lint/guards passed. Narrow browser runs are recorded below, but the current cut is not a complete browser-verified candidate `❌`. |
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

The required preview job previously invoked an undefined
`test:e2e:links-page` package script. `4e99fe01` defines the command and makes
the release-workflow contract verify that every required named browser command
actually exists. Local production-artifact browser checks also use a
preview-shaped `staging.foo.localhost` origin: the platform host remains one
origin while `x-preview-tenant` selects a tenant, matching deployed preview
routing. A plain `--local-upstream localhost` rewrites tenant hosts to the
platform and is not valid tenant-rendering evidence.

Focused workflow/candidate tests pass locally. The workflows are not yet
pushed or exercised against an exact candidate, so operational proof remains
`❌`.

GitHub's Environment API currently returns 404 for `production`. Until an
authorized repository administrator creates and protects that environment,
production deployment is deliberately impossible `❌`.

## Local narrow reproductions after the failed full lane

All mutations in this section used the local D1 emulator. Delivery modes were
`log_only`, and Stripe was overridden with an intentionally unusable
`sk_test_…` key. No remote provider or environment was called.

| Defect or gate | Narrow local result | Current disposition |
| --- | --- | --- |
| Pages unsaved-change/lifecycle tracer | The browser exercised the dirty guards, typed blocks, preview, publication lifecycle, duplication, and reached the final delete. DELETE then returned 500 and Workerd canceled the request as hung. | Nitro's Cloudflare adapter does not forward DELETE bodies; the route alone called `readBody`. `ef71e5af` moves the concurrency token to the query string and adds a repository-wide guard. Rebuilt browser GREEN is pending `❌`. |
| Saya links lifecycle | Under the valid preview-shaped host, publish rendered `/links` with 200 and returning the page to draft produced the intended 404. | The request-event capture is locally proven for Saya. NCLS/Blawby remains unproven because the sanctioned local fixture is absent `❌`. |
| Hash navigation from `/links` | The product test passed but the browser emitted first-party `/api/analytics/track` 500 because `route.fullPath` included `#featured-links`. | `d3b81b6c` uses pathname-only tracking and makes the E2E synchronously assert that hash-only navigation emits no analytics request. Rebuilt browser GREEN is pending `❌`. |
| Canonical blog write | Exact failed-full-lane test passed in 474 ms against local Workerd. | Local GREEN; deployed exact-candidate proof remains `❌`. |
| Canonical page write | The test failed before its content write because throwaway site creation returned 500. | Blocked by the Better Auth Teams schema drift below `❌`. |
| Manual onboarding commit | Exact browser journey failed after 1.2 minutes with the visible site-creation error. | Same Better Auth Teams schema drift, not the bounded page-batch implementation `❌`. |
| Stripe checkout callers | Provider-free canonical caller suite passed 5/5. | Hosted test-mode canary on an exact candidate remains `❌`. |
| Site creation and ChowBot response | Better Auth unit suite passed 7/7 and ChowBot response suite passed 1/1. | Real Worker site creation still fails at Better Auth `createTeam`; browser proof remains `❌`. |

The local Blawby `/links` test skipped explicitly because `site-ncls-blawby`
is not present in the current sanctioned seed pipeline. No stale fixture was
resurrected and no D1 row was hand-created to manufacture a pass.

## Better Auth 1.7 Teams schema blocker

Commit `389f7ac6` upgraded Better Auth to `1.7.0-beta.10`. With Teams enabled,
that version unconditionally requires an internal persisted
`team.memberCount` counter. Its organization adapter supplies the field on
team creation and increments/decrements it for membership changes. The current
Drizzle `team` model, historical migration `0066_auth_phase_3_teams.sql`, and
local D1 table do not contain the column, so the Drizzle adapter rejects
`ensureSiteTeam()` before issuing SQL.

This is not a virtual result field and cannot be corrected by changing the
site-creation response or bypassing Better Auth. The canonical repair is an
additive `memberCount` column with a safe generated migration/backfill. That
cannot be produced while the post-0098 Drizzle journal contradiction is
unresolved and migration metadata is explicitly frozen for this work. Site
creation, onboarding, the canonical page test's setup, and ChowBot browser
proof therefore remain blocked `❌`. No schema, migration, migration metadata,
or dependency version was changed.

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
| Better Auth authority plus append-only usage/grants | Billing permission, projection, usage, site/team provisioning, and revocation paths are aligned in code. | Not this branch. | Local invariant tests pass, but real Worker site/team provisioning fails because Better Auth 1.7 requires missing persisted `team.memberCount`. Three separate legacy writers are documented below. | `❌` |
| Billing regression coverage | D1 period, reconciliation, operator, webhook, catalog, canary, and projection tests are landed. | n/a | Changed-unit lane passes; hosted checkout/subscription/invoice canary not run. | `❌` |
| Typed Pages editors and block lifecycle | Typed fields plus insert/select/duplicate/delete/move/drag/reorder/inline validation are landed; DELETE now carries its concurrency token outside the unsupported body. | Older subset on staging. | Local browser tracer exercised the lifecycle through delete and exposed the DELETE-body hang; the fix and guard are unit/lint green but await rebuilt browser proof. | `❌` |
| Faithful preview and unsaved-change protection | New/select/locale/route/status/delete transitions share the dirty guard; stale responses cannot replace current editor state; Preview uses Nuxt UI's documented `to` prop. | Not this branch. | The local tracer directly exercised and preserved dirty state across leave paths before reaching the separate delete transport failure. Rebuilt desktop/mobile proof remains absent. | `❌` |
| Registry/canonical revision service and both renderers remain sole truth | Shared service and publication-history deletion guard are landed. | Older subset on staging. | Exact Saya/Blawby editor-to-renderer candidate proof absent. | `❌` |
| Real browser verification on Saya and Blawby with blocks/media | Browser projects and route matrix are landed. | No new candidate. | Saya `/links` is locally proven under preview-shaped routing. The local NCLS test skipped because the fixture is absent; complete local and deployed desktop/mobile matrices remain `❌`. | `❌` |
| Remove active translation automation while preserving manual locale variants | Explicit source locale prevents source-language fallback from becoming a published non-source variant; localized draft/published behavior remains. | Not this branch. | Focused seed tests pass; staging/browser proof absent. | `❌` |
| Rename/guard stale fixture, seed, billing, and product names | Active seed naming and recurring-quota copy are corrected; guard owns retired names/signup-wallet phrases. | Not this branch. | Product-model guard passes locally. | `❌` release verification |
| Attach complete acceptance evidence | This ledger now records known local/environment/provider evidence separately. | n/a | Full lane, benchmark, exact staging, and production evidence remain absent. | `❌` |

## Failed-full-lane defect disposition

| Defect | Narrow reproduction and local disposition | Remaining proof |
| --- | --- | --- |
| Blawby `/links` returned 404 after API 200 | `97278c15` captures the request event before the async loader boundary; temporary diagnostics are removed. The Saya publish/200/draft/404 lifecycle passes locally under valid preview-shaped routing. | Local NCLS test skipped because the fixture is absent; exact deployed Blawby candidate proof `❌`. |
| Owner checkout returned 500 | `d3a9da0f` removes the dead checkout alias and caller tests require the canonical Better Auth subscription path. | Test-mode hosted canary on exact candidate `❌`. |
| Onboarding commit timed out | `a74d56bd` replaces page writes with constant-count validation/batching; query-count tests pass 3/3. The exact browser journey now fails earlier at Better Auth team creation because `team.memberCount` is absent. | Safe additive Better Auth schema migration is blocked by the frozen post-0098 metadata contradiction; exact candidate `❌`. |
| Two canonical content writes timed out | `30153826` bounds canonical writes. The exact blog test passes locally in 474 ms; the page test fails during throwaway site creation before reaching the content write. | Better Auth schema blocker must be resolved before the page test can prove the owning write path; exact candidate `❌`. |
| Pages unsaved edits could be discarded | `625891e9`, `b6d54062`, and `eb2550ca` own dirty transitions and Preview navigation. The browser tracer exercised them, then exposed the independent Nitro DELETE-body hang. `ef71e5af` moves the concurrency token to the query and guards every DELETE route against `readBody`. | Rebuilt desktop/mobile browser tracer `❌`. |
| ChowBot site creation reported failure after a successful route response | `d502c8b8` fixes the response mismatch: UI expected nested `site.id`, route returns `siteId`; unit contract passes 1/1. | Real Worker site creation is blocked at Better Auth team creation; exact-candidate ChowBot browser proof `❌`. |
| Adjacent hash-only navigation emitted analytics 500 | `d3b81b6c` tracks `route.path`, dedupes hash/query-only transitions, and makes the links E2E assert that no analytics POST occurs. | Rebuilt browser proof `❌`. |

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

- Resolve the Better Auth 1.7 `team.memberCount` schema requirement through a
  safe additive generated migration only after the post-0098 Drizzle journal
  contradiction is handled under separately authorized migration work `❌`.
- Run the final production build for the current source cut; the earlier
  `2dcc49bb` build was diagnostic and predates the DELETE/analytics fixes `❌`.
- Re-run the rebuilt Pages and links browser cases, then run the remaining
  local desktop/mobile Pages, billing, onboarding/content, Saya, Blawby, and
  ChowBot fixture checks. Site-creation-dependent cases and local NCLS proof
  are currently blocked `❌`.
- Confirm the persistent Pottery House fixture still has exactly one site
  after ChowBot/site-creation tests `❌`.
- Freeze and push one source SHA only after the local blockers clear, then
  obtain ordinary PR/CI evidence without mutating shared staging `❌`.
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
