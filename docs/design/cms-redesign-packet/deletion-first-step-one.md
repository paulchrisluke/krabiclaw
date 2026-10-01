# Deletion-first CMS/MCP cleanup: step one

This draft stacks on PR [#1200](https://github.com/paulchrisluke/krabiclaw/pull/1200),
`cms/parity-5-insights` at `30838a7ad70c312acfe4bc6d62ec646760c1bbf9`.
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
- All 227 unit tests passed, including localized reservation summaries, authored
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
- Worker/browser verification blocked during canonical local preparation:
  `Source schema differs from every recorded migration chain; no rows were copied`.
  The read-only production snapshot was fetched, but refused before target
  transfer. No manual fixture or schema bypass was substituted. Full D1 in the
  socket-restricted sandbox was interrupted; relevant D1 checks passed with
  local socket access. No repeated full-suite or review rounds.
