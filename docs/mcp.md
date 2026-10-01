# MCP

Krabiclaw ships one MCP surface. Every site, Krabiclaw's own included, is managed
through it with the same tools.

## Surface

- Endpoint: `/api/mcp`
- Protected resource: `/.well-known/oauth-protected-resource`
- Server entrypoint: `server/api/mcp.post.ts`
- Scope: `tenant`
- Exposes: existing-tenant content management, menus, experiences, posts, articles
  (blog and, on Krabiclaw's own site, documentation), media, reviews,
  submissions, notifications, Q&A, analytics
- Site creation and location creation, copying, and deletion are CMS-only. MCP
  retains daily content operations, including media asset and experience deletion.
- Google Places lookup and domain setup are CMS-only. Connecting a Facebook Page or
  Instagram account is a Better Auth sign-in in the dashboard; `get_social_connections`
  returns the `connect_url`. Manual locale management remains available as ordinary content editing.
- Posts: `create_post` makes a draft (pass a new `idempotency_key`); `publish_post` publishes to
  exactly the `targets` named — `{"channel":"organization"}` and the `target_id` and
  `connection_revision` from `get_social_connections` — and returns one outcome per target.
  `processing` is finished by calling `publish_post` again; `unknown` is resolved only by
  `reconcile_post_publication`, never by publishing again. Nothing is scheduled: a client that
  wants a post out later calls `publish_post` then.

Krabiclaw's marketing site is an ordinary organization running the platform
template. Its blog and documentation are article collections on that
organization and are edited with the same tools as any tenant's articles, using
its `organization_id`.

## Auth Model

- AGENTS.md's "Platform and authorization boundaries" is the canonical statement
  of Better Auth authorization scope.
- MCP requires Better Auth Organization permissions and, for scoped editors, the
  matching Better Auth Team membership.
- Org member roles (`owner`, `admin`, `editor`, optional read-only `member`) are
  tenant-scoped only.
- A Better Auth admin (impersonation rights) does not receive MCP access to a
  site from that role alone. Access requires real organization/team membership or
  a Better Auth impersonation session for a member of that organization.
- The real runtime boundary is the token `aud` claim bound to the MCP resource
  URL, plus the server-side membership checks. Never rely on scope presence or
  tool filtering alone.

## User-Facing URL

- MCP app URL: `https://krabiclaw.com/api/mcp`

## Tool catalog

Krabiclaw exposes one canonical tool contract. Every tool name, input schema,
output schema, and executor must agree. Unknown tool names return JSON-RPC
`-32601` over HTTP 200.

### Operation names

- `list_*` discovers a collection; `get_*` reads a selected record or aggregate.
- `preview_*` computes a proposal without saving; `update_*` saves supplied changes.
- `reconcile_products` is one atomic create/update operation for an explicitly selected location, not an ongoing sync. Each row supplies its intended Price or null. `set_missing_unavailable: true` explicitly makes omitted products unavailable.
- `replace_resource_localizations` replaces only the submitted resources’ translations for one resource type and locale; omitted resources are untouched.

MCP names map to shared domain functions. REST uses HTTP methods on the same resources; it does not need duplicate verb-named endpoints. `get_organization`, `list_organizations`, and workspace context expose the canonical public site URL; publishing a post returns its full public URL. DNS setup remains in the CMS.

### Release sequence

1. Update the canonical definition and executor together.
2. Update the owning invariant test.
3. Run `yarn mcp:catalog:write` and review the catalog snapshot diff.
4. Run `yarn mcp:catalog` and the affected MCP integration tests.
5. Run the local Worker and verify `tools/list`, the changed tool call, and
   `_meta["krabiclaw/catalogFingerprint"]` through the real client.
6. Refresh and publish the ChatGPT app action catalog when its schema changed
   (`yarn chatgpt:submission:write`).
7. Verify the deployed staging MCP app before promoting to production.

Do not use `serverInfo.version` as a catalog boundary. The endpoint, live
`tools/list` response, and reviewed snapshot define the contract.

### Catalog enforcement

The public catalog is snapshotted in `server/utils/mcp-catalog-snapshots/`.
`yarn mcp:catalog` requires every public tool to be dispatchable and rejects
snapshot drift.

### Incident queries

Use `mcp_tool_call_events` to find unknown tools and repeated failures:

- group unknown tools by `unknown_tool_name`, `oauth_client_id_hash`, and `catalog_fingerprint`
- group repeated failures by `session_id_hash`, `method`, `tool_name`, and `jsonrpc_error_code`
- verify protocol errors use HTTP 200 unless authentication or authorization requires an HTTP error

Telemetry stores hashed session and client identifiers. Never log raw session
ids, OAuth client ids, bearer tokens, authorization headers, full arguments,
article bodies, or upload URLs.

## Product bookings and restaurant table Reservations

Consultations use Product → Variant → Price → Session → Booking. Product bookings
are managed with `list_product_booking_sessions`, `list_product_bookings`,
`get_product_booking`, `create_product_booking`, `confirm_product_booking`,
`reject_product_booking`, `cancel_product_booking`, and
`request_product_booking_change`. These require tenant admin/owner access. Select a
real Session ID from the canonical session listing; it includes pending capacity
and tenant-scoped cross-Product online calendar exclusion.

Creation uses `server/domain/product-bookings.ts#createProductBooking`, the same
service as the public Product booking route. It derives pending/confirmed status
from Product confirmation policy. A positive Price supports pay-later when online
collection is disabled. Required online collection returns `payment_required`
before allocation until the canonical Payments checkout handoff is integrated;
only a valid explicit zero Price skips required collection. MCP never asserts a
Stripe payment, creates paid records, or performs a provider financial mutation.

Every creation requires a caller `idempotency_key`, `source`, and explicit
`guest_acknowledgement` boolean; `external_reference` and `guest_phone` are optional.
The tenant/key-derived request ID and existing unique constraints protect the
atomic claim/thread batch from concurrent duplicate creation. A durable
normalized fingerprint rejects reuse with different details. Provenance is in
`requests.payload_json.provenance`, including operator, source, external reference,
acknowledgement choice and `creation_kind: ordinary`. Failed follow-up delivery
remains incomplete and may be resumed with the same key using canonical delivery
receipts. Successful replay does not send again. The canonical cancellation-token utility signs a stable per-request capability using the existing email signing secret so a failed guest acknowledgement can retry with the original cancellation link; only its hash is stored. Owner alerts, inbox and audit
remain when guest acknowledgement is false. Guest `user_id` is null for MCP; the
operator is recorded as the member actor, and a matching email never links identity.

These tools create ordinary bookings. They do not offer audited appointment
imports, source-owned calendar reconciliation, or existing-payment conversion.
An existing appointment import must have a separately supported audited contract;
it must never be represented as a new payment or fabricated paid Stripe record.

`operational_booking_id` means `bookings.id`. `request_id` means the guest inbox
thread ID; the legacy public `booking_id` continues to mean that request ID.
Review confirmation/rejection and cancellation invoke the canonical guest-thread
operation service with durable operation keys and guest status messages. Changes
invoke the existing immutable guest proposal flow: they do not mutate the booking
until guest acceptance, and acceptance retains review status and operational ID.

Restaurant table Reservations remain separate. `cancel_table_reservation` takes
`operational_reservation_id` (`reservations.id`);
`request_table_reservation_change` proposes location/date/time/party changes through
the same guest approval flow. Restaurant Reservations have no pending review
confirmation/rejection tools. Existing `get_reservation_inquiries` remains valid.

All writes carry explicit reviewed real-world annotations and `confirmRequired`.
The client must obtain approval for the exact operation; no model-supplied
`confirm: true` field is accepted as authorization.
