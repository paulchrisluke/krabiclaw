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

Observed native API requirements corrected in the feature: `/v2/contracts/list` with flat contract shape; HTTP 200 JSON-null `/v1/ingest` success; UTC hour-boundary contract starts and ends. Native contract ending at `2026-10-01T11:00:00Z` succeeded, then omitting `ending_before` reopened the same contract, verified through native v2 reads. The domain rounds end requests up to the next UTC hour and preserves the original request instant for identical retries after uncertain responses; a D1 regression advances the retry clock by 70 minutes and verifies the same end boundary. No contract was replaced, archived or voided. Preview Stripe rejects the removed `payment_method_types` parameter; supported dynamic methods work.

## Native operating collection and final credit

One explicitly synthetic operating Stripe customer `cus_VMQMTnshPlzJB1` was created for local tenant `payments-proof-org`, with explicit organization/verification metadata. Its Customer-level default test payment method is `pm_1ULhVORBlJkGOR4xeeLdzluw`; canonical local `organization.stripeCustomerId` now maps to this customer. The unrelated existing customer was not modified.

Native synthetic operating invoice `in_1ULhYrRBlJkGOR4xwRi54HEQ` finalized and collected 1000 USD cents using the Customer default. Paid-invoice credit note `cn_1ULhYwRBlJkGOR4xV6TKEoPm` issued 100 cents of native customer-balance credit; Stripe independently returns customer balance -100. Real `reconcileNativeBillingCredit` ran against real D1 with native Stripe retrieval, linked and delivered the negative event, and accepted replay without another effect. These explicit synthetic inputs qualify the native collection/credit boundary, not actual Stripe costs or Metronome invoice synchronization. [Native collection and credit image](../../artifacts/payments-native-operating-credit.png).

## Exact provider boundary and paused work

Both documented native fee report types, `all_fees.incurred_at.itemized.2` and `all_fees.balance_transaction_created.itemized.2`, return HTTP 404 with: “This report type is only available for live data and requires a live mode key.” Stripe's [Fees report documentation](https://docs.stripe.com/reports/all-fees) also states that live fee itemization becomes available within 96 hours after affecting balance. Actual native fee import cannot be qualified with this sandbox key; no costs were estimated or live key requested.

Metronome Sandbox has no configured billing providers (`listConfiguredBillingProviders.data=[]`). Its supported Stripe wizard reaches the existing Connect Sandbox account's OAuth confirmation with `read_write` scope, permitting account/history reads and payment creation. This new persistent grant was not approved or submitted. Metronome-synchronized usage invoice collection and native Metronome closed-invoice roll-forward remain unfinished at this exact configuration boundary; operating-customer mapping and native paid-invoice negative-credit settlement are completed.

The owner then directed a pause for deletion-first CMS/shared-schema review. No further feature/schema/provider expansion, OAuth grant, merge, deployment or deletion occurred. Temporary forwarding and Worker services remain stopped; the completed Miniflare verification disposed its runtime. Local provider credentials remain only in ignored mode-600 files.

Final focused evidence: 15/15 Payments D1 cases, including final-credit permission/customer/currency/mode/amount/state/replay/single-use checks. Prior unit, migration, Worker/MCP/browser, concurrency, lint, typecheck, production build and feature evidence results remain recorded in the draft. Commercial tier activation is separate.
