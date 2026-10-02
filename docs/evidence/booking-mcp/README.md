# Booking MCP runtime evidence

Captured 2026-10-01 from the production-built Worker against isolated local D1 with canonical fixtures and log-only email/WhatsApp delivery. The guest email matches the operator fixture; persisted `guest_user_id` remains null. No real guest messages, provider financial mutations, or new OAuth grants occurred.

- [Creation and canonical readback](created-mcp-booking.json) show distinct request/operational Booking IDs, ordinary creation provenance, and parsed list output.
- [Dashboard awaiting review](pending-mcp-booking.png) shows the same request through the dashboard.

Verified Foundation base: `a7fd549e5ba996b3b39db0c4b3a9d9c3b9230cb9`, following cleanup `9ea1749988`. This Worker requires inherited migration `0004_native_consultation_foundation.sql`; it is not cleanup's old-schema deployment artifact. Migrations 0000–0003 remain intact. Booking MCP adds no migration. Cleanup's later metadata commit `a15f5b066cbeecbbe87497ee1e9f4fc148c38cdb` is not included in this base; Foundation still publishes a7fd549e.

Current integration validation passed: quality, production Worker build, 20 focused D1 tests, two authenticated Worker/browser scenarios, migration lint, schema drift, catalog checks, feature mapping (109 MCP operations), and submission generation. Earlier full-suite counts are historical and are not claimed for this integration.

The MCP scenario exercises durable concurrent replay, conflict detection, exact capacity decrement, tenant isolation, operator/guest identity separation, explicit acknowledgement choice and replay deduplication, public/MCP creation parity, canonical guest-accepted changes retaining Booking ID/review state, confirmation/rejection/cancellation replay, positive-priced pay-later, and matching payment-required gates. A partial MCP policy write is read back through HTTP and preserves omitted duration/capacity. The native consultation scenario covers source Product binding, consultation mode, null-location scheduling, online calendar exclusion and guest review transitions. Fixtures are restored through canonical operations.

The shared creation service preserves Foundation's online timezone label. Foundation owns allocation, configuration writers, CMS binding, and guest transitions; this integration does not duplicate or override them. No provider assignment or commercial gating is added. Required positive online collection remains an explicit payment-required result until the coordinated Payments handoff is integrated.

One completed local CodeRabbit pass against the earlier 829a38c03 base is recorded in [historical review evidence](local-coderabbit-review.json); all three findings were resolved. No unchanged review was repeated. The recorded Payments-owned paid-rejection browser approval URL handoff gap remains for the coordinated Payments integration.
