# Site-scoped owner-entered reviews with provenance

KrabiClaw will support rated reviews about a tenant as a whole without requiring a location, including reviews collected in person, by email, or during an approved migration. Owner-entered reviews require a 1-5 rating, collection provenance, attribution, and an attestation that publication is authorized; they must not receive a verified badge unless KrabiClaw collected them directly.

The deprecated location-scoped manual review create, edit, and delete routes remain removed. The capability returns through an authenticated, site-scoped review contract so tenant isolation, moderation, attribution, and provenance are explicit instead of accepting arbitrary location review payloads.

## Considered Options

- Site-scoped owner entry with provenance preserves the core review model and supports firms or other tenants whose feedback is not location-specific.
- A Blawby-only testimonial collection would duplicate review behavior and drift from dashboard, ChowBot, and MCP review workflows.
- Reusing the removed location route would fabricate location ownership and repeat the ghost-review risk protected by the existing regression test.
