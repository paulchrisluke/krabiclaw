# Deletion-first CMS/MCP cleanup: step one

This draft stacks on PR [#1200](https://github.com/paulchrisluke/krabiclaw/pull/1200),
`cms/parity-5-insights`, initially audited at `30838a7ad`. Its reconciled base
`4dffeb6d5` normally merges current staging, preserving the deployed FAQ
`query.id` lookup fix and the existing migration chain. No feature commits or
migrations were selectively copied into this cleanup.

Inspected main `5cd985baf` and staging `7430e7bd7`: their only tree difference
is a Wrangler setting. PR1200 already deletes the duplicate reservation editor,
so stacking retains that deletion without copying its 147-file feature diff.

## Keep / remove

| Item | Decision and code evidence |
| --- | --- |
| `ReservationPolicyForm.vue` | Retain PR1200 deletion. Its location editor uses calendar settings links instead. |
| `utils/booking-policy-presets.ts` | Remove: no path imports it or any of its exports; Nuxt has no caller of its auto-importable names. The active picker uses `shared/availability-settings.ts`. |
| Restaurant deposit/reschedule promises | Remove generated items from `server/utils/booking-policy-summary.ts` for reservations, including “change” in cancellation copy. Remove the same change promise from shared picker labels and MCP tier description. Keep experience formatting, stored settings, existing payloads and authored notes. |
| `business_locations.max_capacity` | Keep storage and accepted MCP field. Correct input/output descriptions: it is metadata; slots and atomic claims use `location_reservation_configs.slot_capacity` in `server/utils/reservations.ts`. Removing the field would break callers or discard data. |
| Currency tools | Keep both names and payloads. Direct new integrations to `update_organization_settings.default_currency`. Both already call `updateOrganizationSettingsFields` in `server/utils/mcp-executor/organizations.ts`; removing `set_default_currency` needs an explicit client retirement decision. No new alias or writer. |
| Q&A | Correct listing descriptions. Authored Q&A is CMS-managed; these MCP tools only list it. Imported Google content remains provider-managed: edit/delete SQL in `server/utils/location-qa.ts` requires `source = 'manual'`. No new MCP writes or relaxed protection. |
| Schema and customer rows | Keep. No migration or data mutation in this diff. The handoff now points future changes to the current forward-migration contract. |

Product → Variant → Price → Session → Booking, separate restaurant Reservations,
`content_documents.product_id`, rich service pages, the shared allocator/controller,
BetterAuth billing/customer ownership, seller/catalog mappings and immutable
financial snapshots are unchanged. Paused Payments, Calendar and MCP branches
were not modified. Unused draft payable tags remain a question for their Payments
owner; this PR makes no claim that financial snapshots are redundant.

## Remaining decisions

The guest cancellation route
(`server/api/public/booking-requests/[requestId]/cancel.post.ts`) does not enforce
the stored free-cancellation cutoff. This PR retains those stated cancellation
terms and stored values, and makes the MCP limitation explicit. The smallest
next decision is whether those terms should be enforced or retired; enforcing
penalties or changing accepted cancellation behavior is beyond this bounded step.

CMS/MCP writer parity and scheduling ownership remain subsequent steps. Audit
counts and the proposed target in the handoff are historical evidence, not an
instruction to delete data or migrate now.

## Verification

- Node `24.18.1`; `yarn quality` passed.
- Initial cleanup: all 227 unit tests passed, including localized reservation summaries, authored
  notes, experience terms and the existing cancellation tier mapping.
- Focused real D1 tests: Q&A scoped edit/delete, media metadata, organization
  settings ownership: 3 passed. Migration chain/archived transfer: 2 passed.
- MCP catalog, migration lint and schema drift checks passed. Read-only staging
  MCP discovery and unauthenticated checks passed; authenticated checks skipped
  because no bearer token was configured. Both required
  generators ran; submission artifacts were already current.
- One final diff review: only preset deletion, display/description changes,
  focused tests, generated catalog and documentation. Tool names, required
  fields and executor behavior are unchanged.
- Reconciled Worker/browser proof passed: canonical preparation restored 67
  tables / 71,332 rows into local D1, with no transform changes. Production
  Nuxt/Nitro build and generated Worker checks passed. All 6 focused MCP owner
  tests passed, including guest-browser policy rendering after a real MCP write
  and independent dashboard readback of the retained deposit/reschedule fields.
  The policy is restored after the test. [Screenshot](current/step-one-reservation-policy.png)
  was visually inspected.
- Reconciled focused unit/D1 run: 8 passed, including the deployed Q&A lookup
  regression. Changed-file lint, catalog and submission checks passed. The
  initial full D1 sandbox attempt was interrupted after local socket failures;
  relevant real D1 checks passed with socket access. No new full review loop.

## Snapshot diagnosis and base reconciliation

Expected and source database epoch are both v7 (`krabiclaw-production-v7`,
WNAM). A read-only source query reports zero rows written and a ledger of
`0000_baseline.sql`, `0001_drop_typed_social_profiles.sql`, and
`0002_products_overview.sql`. All 250 source schema objects exactly match this
branch's schema. The original CMS base had only the first two migration files.
`transfer-database-export.mjs` skips candidates when the source ledger is longer
than the recorded chain, then raises its generic schema rejection at line 366.
This was an ancestry/ledger mismatch, not a v7 schema or customer-row defect.

Current main/staging contain the third, content-only forward migration. The
schema, transfer scripts and local setup instructions are identical to the CMS
base. A normal staging merge into that base is clean; rebase required only
regenerating the catalog snapshot. Canonical local preparation on the reconciled
branch passes preflight and the media audit with no transform changes. Source
production data remains read-only; target writes are disposable local D1 only.
The preliminary verification checkout was stopped once normal ancestry
reconciliation was available. No preflight bypass or invented migration.
