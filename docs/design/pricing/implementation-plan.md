# Pricing implementation contract

Scope: [#1192](https://github.com/paulchrisluke/krabiclaw/issues/1192), a pricing-only
slice of #939. No merge, deployment, Stripe write or live CMS mutation.

## Canonical rendering and ownership

The existing platform tenant page maps its `feature_grid` / `billing_plans` block
through `PlatformFeatureCards` to `PlatformPlansSection`. Its `/pricing` branch
can select scoped pricing presentation; the homepage branch must keep its current
behavior. The generic `BillingPricingTable` currently serves both branches.
The dashboard uses `usePlans()` separately. Do not create a parallel `/pricing`
page or inject a second paid catalog.

`usePlans()` reads `getCachedPlans()` on the server and `/api/billing/plans` on the
client. Stripe Product owns paid name, description, image, display metadata and
`marketing_features`; Stripe Price owns actual amount, currency, cadence and
identity. The free plan and CTAs are app-owned. The feature library is evidence
and mapping; it does not replace Stripe marketing copy. The approved headline
remains in the current CMS hero block.

[Read-only billing verification](billing-verification.json) records the current
public projection and live Stripe catalog. Growth currently has one USD 4900-cent
monthly price and one USD 58800-cent annual price. Both lookup keys are null.
Annual is not a discount or a calculation from monthly.

## Implementation scaffold

1. Retain the existing route/block path and scope the new plan rail and grouped
   comparison to `/pricing`. Inventory all shared consumers before changing them.
2. Keep one copy of SSR plan details and actions. Progressively enhance only
   approved, decoded photo art with a sequential positive/rightward Y-axis flip;
   reduced motion, failed/slow assets and early focus expose details immediately.
   No repeated watcher-driven animation, duplicated controls or timer-dependent
   access to pricing. Preserve the same box for both faces.
3. Use an overflow-contained mobile snap rail with the next-card peek and a
   desktop two-column layout. Comparison uses real table semantics, grouped
   headings and conditional explanations instead of unsupported checkmarks.
4. Place the approved benefit illustrations, FAQ and coastal CTA through the
   existing canonical page/block architecture. The approved reference and all six PNG assets were downloaded through the
   authorized Drive flow and verified against their SHA-256 manifest.
5. Add provider/missing-interval, no-JS/reduced-motion/early-focus, mobile overflow,
   replay and shared-homepage regression proof. Run required quality and suites
   on the final draft commit and retain rendered desktop/mobile evidence.

## Precise catalog change proposal for review

Target existing Growth Product `prod_UcH8Sw98ABNwKL`:

- `name`: `Growth` → `Grow`.
- `images[0]` and `metadata.catalog_image_sha256`: replace only after the approved
  portrait asset has a verified provider URL/hash. The supplied local asset is
  verified (see asset-manifest.json), but a provider-hosted URL is still required.
- Replace `Auto-sync from Facebook & Instagram` with `Facebook and Instagram
  publishing`. Retain actual MCP/provider connection conditions in comparison.
- Broaden the existing restaurant/experience-only bullet to cover supported
  professional services; exact final customer wording remains for review.
- Review the generic messaging/import bullets against the verified paid gates,
  one-time free onboarding and weekly paid review refresh before final wording.
- Do not write this proposal automatically or change product ID, plan_id,
  default price, monthly/annual price IDs, amounts, currencies, lookup keys,
  recurring cadence or subscription policy.

Free `STARTER_PLAN.name` becomes `Basic` in its application-owned source. Its
art reference changes only after verified art arrives. Paid Grow naming/art
cannot be forked locally around the canonical provider fields. Catalog approval
is a separate step from visual design approval.

## Verified comparison conditions and dependencies

- Free initial Places snapshot import is different from paid location connection,
  explicit re-import and weekly Sunday review refresh. Sources:
  onboarding draft endpoint, `google-places/sync.post.ts`, `server/scheduled-tasks.ts`.
- English is the source language. Growth can publish up to two secondary locales;
  currently supported catalogs are Japanese and Thai. This is manually authored
  content, not automatic translation or arbitrary language selection.
- Saya (restaurant/experience) and Blawby (service) provisioning has no billing
  gate. Current Blawby promotional Growth wording needs reconciliation.
- Explicit review-request sending is currently paid. Ordinary booking emails and
  token reads are separate; no Free policy change is authorized.
- #1190 and #1191 remain unmerged drafts at verification. Recheck their state and
  rebase explicitly when they land. Do not copy their commits into this branch or
  describe the proposed WhatsApp billing gate as live.
- No WhatsApp content editing, community-support service, guaranteed priority
  response or automatic Facebook sync is supported by this comparison.

## Draft implementation and activation dependencies

The new `feature_grid` source `billing_features` selects canonical application
capability comparison rows. It is semantic source selection, not a rendering flag,
and adds no block type, route or database schema. `billing_plans` still owns the
plan cards and the homepage keeps the original billing table presentation.
Comparison IDs reference the separately reviewed feature library; published
comparison copy is reviewed manually, never generated from MCP tool names.

The supplied free portrait and Basic name are changed only in the app-owned
Starter source. The paid photo front reads `plan.image` from Stripe; this draft
includes the approved Grow file for a subsequent provider upload but does not
substitute a local paid image/name/bullet catalog. The existing paid portrait and
Growth name therefore remain until the exact catalog proposal above is approved.

`cms-proposal.json` preserves the current hero and plan block IDs, then places
three image-with-text blocks, a capability comparison, the existing page Q&A,
and the coastal CTA. Upload bindings are review notation, not fabricated asset
IDs. No CMS write has been made. Q&A corrections are separately listed because
FAQ records own those answers, not block.data.items.

WhatsApp is omitted from the new comparison while #1190 enforcement is unmerged;
the declared policy must not be sold as proven current runtime enforcement.
Review-request emails retain their current paid behavior without deciding the
open Free policy. No community, support SLA, automatic social import, automatic
translation or claimed provider credits are added.

The paid CTA now carries its canonical `/api/post-login?plan=growth` target in
the existing signup `redirect` parameter as well as `plan=growth`. Signup reads
`redirect`, not `plan`, so the former URL silently lost the paid choice for new
accounts. This changes application-owned CTA configuration only; identity, auth
and checkout code are unchanged. Existing signed-in CTA behavior still reads
the same plan query. No annual toggle is introduced: the card offers the actual
monthly price and the existing billing screen owns interval choice.

## Verification limits and approval review

Actual local Chrome screenshots in `evidence/` show the current CMS document,
not an applied full-page proposal. The app-owned Basic portrait was observed
on its photo front and plan back. The test Stripe projection currently supplies
the existing Growth wording and no approved Grow portrait; current live Stripe
art is separately recorded in billing-verification.json.

The production Worker was built with the existing configured v7 test environment
loaded directly into the process; no secrets file was copied. Four read-only
Playwright presentation checks passed against that Worker: desktop/provider
projection and no replay, mobile peek/overflow with reduced motion, keyboard
focus, and JavaScript-disabled SSR access. These checks exercise the current
plan block; they do not prove the un-applied benefits/comparison/CTA packet.

The canonical image uploader explicitly permits image storage only in production
(`server/utils/cloudflare-images.ts`). The benefit/CTA media asset IDs therefore
require a separately approved production upload before the CMS proposal can be
materialized through its canonical media placements. No shadow local assets or
media rows were manufactured to claim the whole-page boundary passed.

Automatic approval review rejected the full E2E setup because its documented
cleanup irreversibly deletes Stripe test customers. No workaround was used.
Approval for that specific test cleanup is needed to run the full suite; the
read-only pricing checks, unit/D1/migration checks and draft preparation proceed.
The shared footer repair remains owned by #1193; do not duplicate it here.
