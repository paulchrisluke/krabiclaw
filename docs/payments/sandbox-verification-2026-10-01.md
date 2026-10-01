# Payments sandbox provider verification — 2026-10-01

Existing owner-authorized sandbox configuration was used. No live charges, refunds, transfers, production keys or production settings were changed.

Stripe Accounts v2 preview created the test account `acct_1ULddoRBlJCkNTaU` with Express dashboard, application-paid fees and Stripe-managed payment losses. The GA API rejected this configuration; implementation does not fall back to platform-managed losses. Onboarding was exercised with Stripe-native synthetic test identity and bank values. After the owner completed onboarding, native retrieval verifies card payments and payouts active with zero requirements. A Stripe-native synthetic `pm_card_visa` direct charge and full refund passed: PaymentIntent `pi_3ULgORRBlJCkNTaU0E2q5nUV` captured 10000 USD cents with explicit application fee 0; charge `ch_3ULgORRBlJCkNTaU0vzTlEAF` has no application fee object. Connected balance transaction `txn_3ULgORRBlJCkNTaU0QCnzix3` credits amount/net 10000 and fee 0. Refund `re_3ULgORRBlJCkNTaU0HYn9Z6l` succeeded for the full 10000 cents; native refund transaction `txn_3ULgORRBlJCkNTaU0S1F8OkO` debits amount/net -10000 with fee 0. These provider boundary calls are sandbox-only and do not claim hosted Checkout or local webhook conversion proof.

Metronome's existing Test Customer `7a6dd225-e349-4255-bd19-b4712d13be64` and Test Rate Card `5c71f58d-c643-4cde-8640-195cc3f11d84` were configured and verified through the feature's native rate validator. One sandbox contract `3ae4fdca-50a4-4052-98c5-a688e949a08e` uses the UTC start `2026-10-01T08:00:00Z`, provider-default monthly usage schedule and no Stripe collection integration.

Two stable, explicitly synthetic event IDs were ingested. Native draft invoice `815bdd23-f55c-5523-a289-3ee3504b7faa` independently verifies:

| Component | Quantity | Native USD-cent unit price | Native total cents |
| --- | ---: | ---: | ---: |
| Captured volume | 10000 | 0.01337 | 133.7 |
| Attributable Stripe costs | 350 | 1 | 350 |
| Total | | | 483.7 |

These inputs do not represent actual Stripe captures or observed processing costs. This proves native sandbox rating, not operating-customer Stripe collection or final invoice rounding.

Native calls exposed three compatibility requirements, corrected in the feature: contract listing uses `/v2/contracts/list` and its flat contract shape; successful `/v1/ingest` can return HTTP 200 JSON `null`; contract creation requires a UTC hour boundary. Listing v1 and non-hour starts returned explicit provider errors before any contract was created.

Focused integrated verification also passes: 14 Payments D1 tests; four focused unit tests; actual local Worker/MCP paid-review rejection returns a structured actor-bound browser approval link while booking remains pending and principal remains untouched. The same browser proof covers fulfillment, buyer privacy and signed webhook replay. Typecheck, changed-file lint, production build and generated catalog checks are recorded in the PR validation.

Remaining provider proof: hosted Checkout and native-event local conversion, actual delayed attributable Stripe cost reporting, and operating-customer Metronome Stripe collection with a Customer-level default payment method. Sandbox draft rating does not imply those steps have passed.

The preview rejects the removed `payment_method_types` parameter; dynamic methods succeed. The existing inherited configuration enables methods outside the feature’s synchronous allowlist, so it is correctly rejected by checkout acceptance until the exact approved Payments configuration is supplied. Seller balance-transaction fee 0 proves full principal credit; it does not prove platform attributable processing costs are zero.
