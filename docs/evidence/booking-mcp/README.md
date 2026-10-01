# Booking MCP runtime evidence

Captured 2026-10-01 from the production-built Worker in isolated local D1, using existing E2E fixtures and log-only email/WhatsApp delivery. The guest email deliberately matches the authenticated operator fixture: readback still has `guest_user_id: null`. No provider financial writes, real guest delivery, or new OAuth grants are involved.

- [Creation and canonical readback](created-mcp-booking.json) distinguish legacy request IDs from operational Booking IDs and record ordinary creation provenance.
- [Dashboard awaiting review](pending-mcp-booking.png) shows the same request through the dashboard boundary.

`tests/e2e/mcp-bookings.spec.ts` passed against the rebuilt Worker. It checks concurrent creation/replay with one capacity claim, conflicting retries, correct guest identity, acknowledgement suppression and exactly one acknowledgement on replay when enabled, successful public/MCP creation parity with distinct authenticated guest identity, canonical guest-accepted change retaining operational ID and review state, confirmation/rejection/cancellation replay, tenant isolation, and matching public/MCP payment-required gates. It cleans up created bookings through canonical cancellation.

Validation also passed: quality, 238 unit tests, 75 local D1 tests, 3 migration tests, catalog snapshot check, migration lint/schema drift, production Worker build, and read-only MCP discovery/unauthenticated checks. Authenticated remote MCP checks were skipped because no bearer token was provided; the local Worker scenario exercised authenticated tool calls.

Foundation base: `7f284fe4e` (completed #1201 contract, draft PR #1211). No booking MCP migration is added. Required online collection currently returns the explicit payment-required gate; checkout/capture and paid-rejection financial approval belong to the coordinated Payments integration.
