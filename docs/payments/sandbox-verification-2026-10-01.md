# Payments sandbox provider verification — 2026-10-01

The owner authorized this isolated sandbox qualification. Existing accounts, keys, catalog and Metronome contract were reused. No live funds, real card data, new connected account, persistent webhook destination, production configuration, merge or deployment was involved.

## Stripe account and financial boundary

SDK reads identify platform `acct_1ULcs2RBlJkGOR4x` and merchant `acct_1ULddoRBlJCkNTaU`, livemode false. After owner-completed onboarding, card payments and payouts are active with zero requirements. Express Accounts v2 preview confirms application-paid fees, Stripe-managed payment losses and Stripe-collected requirements; no liability fallback was selected.

The original direct-charge boundary proof captured 10000 USD cents through native `pm_card_visa`: `pi_3ULgORRBlJCkNTaU0E2q5nUV`, charge `ch_3ULgORRBlJCkNTaU0vzTlEAF`, explicit application fee 0 and no application fee object. Connected transaction `txn_3ULgORRBlJCkNTaU0QCnzix3` credits amount/net 10000, fee 0. Full refund `re_3ULgORRBlJCkNTaU0HYn9Z6l` succeeded; transaction `txn_3ULgORRBlJCkNTaU0S1F8OkO` debits amount/net -10000, fee 0. Seller fee 0 does not establish that platform attributable processing costs are zero.

Dedicated merchant configuration `pmc_1ULgSPRBlJCkNTaUFlp8BMHt` is active/test-only and enables card, Link, Apple Pay and Google Pay. Existing unrelated defaults were not changed. The feature accepts this dedicated seller configuration as well as an inherited parent/child configuration.

## Native hosted Checkout → Worker/D1 → approved rejection

A canonical local Product/Variant/Price/Session/request fixture represents a pre-existing authorized checkout. Its durable hold was allocated before Stripe Checkout. This isolates financial conversion; current plan acceptance entitlements were not changed and new acceptance through the entitlement-gated front door is not claimed.

Native Checkout `cs_test_a17jlcaQszLWJZVUhfjGuR7cYoEXngP0gySDcKAq5vCjHfrpwE5uQi7XJJ` reused native price `price_1ULgSqRBlJCkNTaU6hAuSnvV`, configured zero application fee, and was completed through hosted sandbox UI using Stripe's synthetic 4242 card, synthetic buyer details and truthful agent disclosure. SDK retrieval confirms complete/paid/livemode false, intent `pi_3ULgusRBlJCkNTaU1OrcKEV2`.

Approved ephemeral CLI forwarding used localhost-only filtering before the Worker. Other merchants' events were discarded without logging or storage. Native `payment_intent.succeeded` (`evt_3ULgusRBlJCkNTaU1z3L8H2M`) and `checkout.session.completed` (`evt_1ULguuRBlJCkNTaUWX2FzoGQ`) both returned HTTP 200 and reached durable `tenant_payments` processing, attempt 1/error null. D1 independently verifies:

- Before capture: active hold, captured principal 0, no Booking.
- After capture: payment `payments-native-booking-1169` captured 10000; hold converted; exactly one operational Booking `c45cc227-3bdd-46cb-af0e-d17a8b948cc7`, pending review, request `payments-native-request-1169`; exactly one positive captured-volume usage event of 10000.
- MCP rejection required the actor-bound financial approval handoff. Authenticated origin-checked approval then invoked the real domain/native refund: `re_3ULgusRBlJCkNTaU1nnSSvY8`, succeeded 10000.
- Final state: captured 10000/refunded 10000, one cancelled Booking, resolved request; `booking.created` and `booking.reject` activity entries carry operational IDs. Canonical allocator returns available capacity 1 again. Captured-volume usage remains unchanged.
- Real `refund.created` and `refund.updated` notifications processed successfully. Immediate signed refund replay returned HTTP 200 and retained attempt 1 with no duplicate refund or usage.

Dashboard proof: [native refund image](../../artifacts/payments-native-refund.png).

Earlier native expired-checkout ingress and replay also passed; an unrelated-account filter check persisted zero event rows.

## Native thin Connect refresh

Accounts v2 events for this merchant have platform context, so exact Connect event types were listened to in platform context and filtered by `related_object.id`. Native `evt_test_65VV531ts87VnxhVDQi16VV0pOPVSQ01JvCLaXBvEWGWEC` (`v2.core.account.updated`) returned HTTP 200, parsed its real signature, performed SDK account retrieval and reached `connect_marketplace` processed/attempt 1/error null. Local readiness remains ready/card active/requirements empty. Replay retained attempt 1.

All listener, filter and Worker processes were stopped. Ephemeral Worker bindings were restored. The existing sandbox key was obtained through authenticated API-key UI, written directly to ignored mode-600 local `.env` and verified through SDK reads. No key was displayed, committed, created, rotated or extracted from cookies/private credential stores. `.env.example` remains placeholder-only.

## Metronome native rating

Existing Test Customer `7a6dd225-e349-4255-bd19-b4712d13be64`, Test Rate Card `5c71f58d-c643-4cde-8640-195cc3f11d84` and contract `3ae4fdca-50a4-4052-98c5-a688e949a08e` use native USD-cent units and provider-default monthly scheduling, starting `2026-10-01T08:00:00Z`. The feature's native rate validator passes.

Stable verification event IDs rate on draft invoice `815bdd23-f55c-5523-a289-3ee3504b7faa`:

| Component | Quantity | Native USD-cent unit price | Native total cents |
| --- | ---: | ---: | ---: |
| Captured volume: 10000 synthetic + 10000 native direct + 10000 native hosted | 30000 | 0.01337 | 401.1 |
| Explicitly synthetic cost verification input | 350 | 1 | 350 |
| Total | | | 751.1 |

Both native captures were fully refunded; captured-volume usage was not reversed. No actual Stripe processing cost was invented or ingested. Native rating is verified, not final rounding or Stripe collection.

Observed native API requirements corrected in the feature: `/v2/contracts/list` with flat contract shape; HTTP 200 JSON-null `/v1/ingest` success; UTC hour-boundary contract starts. Preview Stripe rejects the removed `payment_method_types` parameter; supported dynamic methods work.

## Remaining limits

Actual delayed platform fee itemization, operating-customer collection and closed-invoice/end/reopen provider servicing proof remain outstanding. The local tenant's canonical `organization.stripeCustomerId` is null. Selected-platform customer `cus_VMLbERp4LVpp64` has no ownership metadata and no Customer-level default payment method; it was not assigned or modified. The Metronome Test Customer has no billing-provider configurations. Collection needs a canonical tenant operating customer, its synthetic Customer-level default payment method, and the correct Metronome Stripe integration/customer configuration; it must not use an unrelated customer or replace Better Auth subscription billing.

Local test and production-build evidence remains in the PR: 14 Payments D1 cases; focused units and controller retry/timezone regression; real Worker/MCP/browser servicing/privacy/signature tests; typecheck, changed-file lint and feature evidence checks. Native qualification adds provider evidence without claiming commercial entitlement activation or production readiness.
