# CMS Stripe onboarding verification — 2026-10-02

The actual CMS journey reached hosted Stripe sandbox onboarding and verified
incomplete return/status refresh. Completion to a ready account remains unverified.

CMS route: `/dashboard/{orgSlug}/settings/integrations/stripe`, under
Settings → Integrations → Stripe. The tested local organization is
`payments-proof-org` (`payments-local-proof`). Its single new sandbox seller is
`acct_1ULvggRBlJ8qySB7`; no existing merchant was replaced or deleted.

The owner explicitly authorized sandbox onboarding with documented test details.
Stripe CLI 1.52.0 retrieved the official
[Accounts v2 testing guide](https://docs.stripe.com/connect/testing?accounts-namespace=v2)
and [Account Links input contract](https://docs.stripe.com/api/v2/core/account-links/create?query=use_case).
The owned Mac Chrome window was 1603054608 and the Stripe/CMS tab was 1603054609.
Local Worker/D1 used `.tmp/payments-review-state` and `https://localhost:3207`.

Verified native checkpoints:

1. The existing approved sandbox key identified platform
   `acct_1ULcs2RBlJkGOR4x`; the existing merchant read returned `livemode=false`.
2. Authenticated CMS setup loaded. Native US Country Specs lookup returned 200
   in 2451 ms. The actual chooser offered only United States.
3. Clicking Continue to Stripe created and retained the new sandbox account.
   The first Account Links request exposed an unsupported preview input;
   retry reused this account after correcting the request.
4. CMS displayed Action required, US, Restricted card payments, 15 outstanding
   requirements, Continue Stripe onboarding, Express Dashboard and Refresh status.
5. CMS retry returned 200 in 2241 ms and navigated to `connect.stripe.com`.
   Page title: `[Test] Sandbox | Set up payments with Stripe`. The hosted page
   explicitly said it was using a test account with test data.
6. Stripe's Use test phone number and Use test code controls advanced synthetic
   phone verification. The documented/displayed code was `000000`; no real phone
   or identity data was entered. No agreement was accepted.
7. Stripe's native Return to Sandbox control was used before completion.
   Worker logs record native link refresh GET 303 (1589 ms), CMS account GET 200,
   and status POST 200 (1686 ms). Local durable readback at
   `2026-10-02T02:13:22.291Z` remained action_required/restricted with 15
   requirements and livemode 0. Returning did not falsely mark onboarding ready.
8. Native SDK readback independently confirmed Express dashboard, application
   fees collector, Stripe losses collector, Stripe requirements collector,
   livemode false and restricted card payments.

This exercise fixed the canonical SDK Worker transport to Stripe's Fetch
client, replaced unnecessary all-country pagination with the supported US
lookup, removed the rejected preview `configurations` input, and admitted
Stripe's documented `accounts.stripe.com` onboarding origin while still rejecting
lookalike hosts. No SDK/version upgrade, liability fallback or provider permission
change was made. Connect D1 regression checks passed 8/8.

The existing production Worker browser test also passed CMS empty-account
read/setup and visible unconfigured-provider error handling, plus financial
servicing, actor approval handoff and signed ingress. That test uses synthetic
provider credentials and is separate from the native checkpoints above.

Safe committed screenshots:
`artifacts/payments-cms-onboarding-unconfigured.png` and
`artifacts/payments-cms-hosted-test-code.png`. The requirements screenshot is
available locally at `artifacts/payments-cms-onboarding-requirements.png`; its
browser chrome is excluded from publication. No onboarding URL tokens or real
identity data are committed.

Remaining check: complete the business forms and verify the native return to
ready status. Mac execution transport disconnected intermittently, and another
desktop browser activity interrupted screen capture/focus; further desktop form
interaction was stopped to preserve that activity. The native form was not
declared complete. Resume the specifically identified sandbox tab; do not target
the other task's active tab. Stop if an actual binding agreement, persistent
permission/credential change, or live action is required.

Seller onboarding requires financial integration permission. It does not grant
Payments acceptance: that separate entitlement remains false on current plans.
Existing payment servicing remains available after downgrade. No real financial
action, OAuth grant, remote DDL, merge or deployment occurred in this check.
