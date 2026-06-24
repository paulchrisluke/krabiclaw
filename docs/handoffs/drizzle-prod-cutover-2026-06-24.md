Use this chat handoff when resuming the production Drizzle cutover:

```text
We are resuming the KrabiClaw Drizzle production cutover on June 24, 2026.

Current state already verified:
- `staging` branch is deployed and current on staging
- `yarn drizzle:check` passed
- full local E2E passed: 88/88
- full remote staging E2E against `https://staging.krabiclaw.com` passed: 88/88
- GitHub issue #95 has the latest staging/prod verification comment posted on 2026-06-24

Critical production facts confirmed from prod D1 today:
- `site-kikuzuki` is live and paid
  - `sites.plan = growth`
  - `site_billing.plan = growth`
  - `site_billing.status = active`
  - `current_period_end = 2026-07-23T05:12:51.000Z`
  - `stripe_subscription_id = sub_1TlMdlEm0pkzLQDb6M9oi2Ud`
  - it has its own Better Auth org/account, not the staging fixture org
- `site-pottery-house` is live and active
  - `sites.plan = growth`
  - `site_billing.plan = growth`
  - `site_billing.status = active`
  - `current_period_end = 2026-07-19T00:35:32Z`
  - `stripe_subscription_id = sub_1TjqPAEm0pkzLQDbLbA5oipj`
  - canonical custom domain `www.potteryhousekrabi.com` is active/valid
  - it has its own Better Auth org/account in prod

Important staging gap still to resolve before production cutover:
- staging currently does NOT mirror Kikuzuki's real paid state
- staging has `site-kikuzuki` seeded as free because `seed-definitions/kikuzuki.ts` currently sets `plan: 'free'`
- staging also does not mirror the real separate owner-org/account shape for these transferred live clients

Your task now:
1. Verify the latest issue #95 comment for the exact staging/prod state from 2026-06-24.
2. Make staging a true prod rehearsal for Pottery House and Kikuzuki:
   - Kikuzuki must be staged as paid `growth` with matching `site_billing` + `site_entitlements`
   - if feasible, mirror the distinct owner-org/account shape for both transferred client sites
3. Rerun the staging verification pass after that prod-like data alignment:
   - staging smoke/canaries
   - tenant bootstrap/content checks
   - billing-sensitive checks for both sites
4. Only after staging is a faithful rehearsal, perform the production cutover plan:
   - export full remote backup
   - wipe and reapply migrations fresh
   - restore Better Auth tables only
   - reseed app content
   - re-promote admin users
   - verify Pottery House and Kikuzuki immediately after cutover

Constraints to preserve:
- Better Auth tables must be restored from backup, not reseeded
- Better Auth camelCase must remain exact
- migrations remain the production schema source of truth
- do not switch to drizzle-kit push for migrations
- Pottery House and Kikuzuki are live customer sites, so preserve their current working domains, ownership, and billing state

If anything conflicts between user expectations and current prod D1, trust current prod D1 first and surface the discrepancy explicitly with exact dates.
```
