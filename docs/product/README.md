# Feature library maintenance

Products overview review (2026-10-01): the platform adds a page document at
`/products` and reuses the `products` recipe for future detail documents.
The template registry and SEO policy evidence were re-reviewed for this change:
customer template provisioning, billing gates, docs and help access are unchanged.
The platform's Products paths now use ordinary document metadata and sitemap
inventory. The page-media projection also carries stored image dimensions to
reserve space during lazy loading; standard/custom page write and entitlement
checks were re-reviewed and are unchanged. This does not promise search rankings or broader plan access.

`feature-library.json` is the canonical feature mapping and evidence inventory.
It is deliberately not a new billing policy, paid marketing catalog or automatic
pricing-page generator. Stripe owns paid `marketing_features`, product wording,
images and recurring prices. Starter presentation remains application-owned.
Actual runtime gates own access. The library connects those sources for review.

## Record structure

Each feature has an immutable semantic ID, a reference label and its approval
status, separate `free`/`growth` availability, a behavior explanation, entitlement
keys, relevant public MCP operations, source/test paths, evidence hashes and an
optional pending owner decision. A shared operation can map to multiple features
when its targets or actions have different gates; `publish_post` is one example.

Availability is `available`, `conditional`, `unavailable` or `unsupported`.
`conditional` requires reading the behavior field: role, configuration, template,
provider connection, consent and completion can all limit access. No quotas,
included provider credits, performance statistics or support commitments should
be inferred from an operation name or an entitlement declaration.

`source-reviewed` means the call path was inspected; it does not mean every
related test passed or every marketing claim is proven. `runtime-tested` requires
an applicable test reference and a human record of what boundary was exercised.
The initial entries reference staging commit
`1fd7f009f4e2057756ddd01d4c6b52b847e4d8d9`. Source hashes are checked against the
current checkout so later changes cannot quietly preserve a stale audit.

## Adding or changing a feature

1. Add or update its stable ID and current behavior. Use existing vocabulary as
   reference labels; owner approval is required before a new label or claim is
   published. Record unresolved policies instead of choosing one implicitly.
2. Trace the actual authenticated read/write/send path. Record every relevant
   entitlement, target-specific condition and exception. Separate creation,
   reads, automatic jobs and provider sends when their gates differ.
3. Map each new public MCP operation to an entry. This is a review obligation,
   not evidence that the operation supplies a marketable benefit.
4. Add relevant boundary coverage and record its limits. Update evidence paths
   and SHA-256 hashes only after reviewing changed behavior. A hash change is a
   request to re-audit, not a reason to refresh hashes blindly. For example,
   `shasum -a 256 server/utils/review-requests.ts` prints a source hash.
5. Run `yarn feature-library:check` and the appropriate tests. The check runs in
   `yarn quality` and rejects duplicate IDs/references, unknown entitlements or
   operations, unmapped public operations, missing evidence and changed hashes.
6. Review Stripe-owned bullets and any comparison claims against the evidence.
   A live catalog read must use already-authorized provider access. If unavailable,
   state the verification gap; do not substitute guessed bullets or write Stripe.

The checker cannot prove code implements prose, certify support obligations, or
validate a live Stripe catalog offline. It creates an explicit review point for
source/tool changes. Broad marketing synchronization needs a separate approved
ownership design. No automatic Stripe writes or public pricing updates exist in
this change.

## Pending policy and presentation

- Review-request creation/sending currently checks `review_requests`; token reads
  and ordinary booking email are different paths. Free policy remains open.
- WhatsApp business sends enforce `messaging` at recipient selection and the
  defensive sender; Free and ineligible subscriptions skip provider calls. The
  runtime D1 evidence covers downgrade, preference and multi-organization cases.
  OTP and inbound replies remain separate. This is branch behavior, not a claim
  that the fix has been deployed to production.
- Saya/Blawby provisioning has no billing check. Blawby copy says Growth inclusion;
  reconcile it with the owner's two-free-theme intention.
- Docs and the platform help form are evidenced. Community/Priority strings in
  billing limits are not evidence of an active community or support SLA.

## Read-only provider audit

[stripe-catalog-verification.json](stripe-catalog-verification.json) records an
authorized read of the active Krabiclaw live Product/Prices and the public billing
projection on 2026-10-01. Growth is USD 49 per month or USD 588 per year; annual is
not a discounted monthly equivalent. Product and price IDs are recorded separately
from `plan_id: growth`. No credentials or private image URLs are stored.

The public projection matched the provider's seven marketing bullets. The
`Auto-sync from Facebook & Instagram` bullet conflicts with the audited
`social.automatic-sync` entry: current explicit provider operations do not prove
automatic imports. Broad Google Places wording must distinguish the free initial
onboarding snapshot from paid manual import and weekly review refresh. Paid
notification claims map to the separately reviewed WhatsApp enforcement fix and
its runtime tests; deployment status must be checked before announcing it.
Community/Priority strings come from application limits, not Stripe bullets, and
remain unsupported service promises. None of these findings authorizes a catalog
write or resolves the open review-request Free policy.

An offline validator cannot assert this snapshot is the current live catalog.
Refresh it only after a new authorized read, preserve its timestamp, and review
changed bullets against feature evidence. Never generate or push Stripe bullets
from reference labels automatically.

## Pricing parity in this page change

Every feature records an explicit `pricingComparison` decision. Reviewed
comparison rows use stable feature IDs; CI rejects unknown IDs, unsupported or
unverified rows, entitlement references absent from the feature mapping, duplicate
labels and missing rows for features marked included. New features require an
explicit pricing decision. This maps evidence to the application comparison;
Stripe still owns paid bullets and prices, and no marketing text is generated
from feature labels or MCP names.

The pricing page's decorative photo fronts are CMS block media, separate from
the Stripe Product image. The existing `billing_plans` block uses `items.0.image`
for Free and `items.1.image` for Growth. Names, billing Product images, descriptions,
bullets and prices retain their original canonical ownership.
