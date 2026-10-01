# Feature library maintenance

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
- Baseline WhatsApp business sends lack the `messaging` check. The separately
  reviewed fix must land before changing this entry to paid-only. OTP and inbound
  replies must not be silently included in that policy change.
- Saya/Blawby provisioning has no billing check. Blawby copy says Growth inclusion;
  reconcile it with the owner's two-free-theme intention.
- Docs and the platform help form are evidenced. Community/Priority strings in
  billing limits are not evidence of an active community or support SLA.
