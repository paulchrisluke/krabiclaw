# Merchant handoff contract

The merchant handoff API sends each order to one active destination for its location. KrabiClaw owns the authoritative order snapshot and the guest-facing state. The receiver owns restaurant execution, but KrabiClaw does not provide a kitchen queue, station routing, printer control, polling, or automatic failover.

## Authentication

Register the receiver as a Better Auth OAuth client with the `merchant_handoff` scope. Request an access token for this resource:

```text
https://<krabiclaw-host>/api/integrations/merchant-handoff
```

Send the token in the `Authorization: Bearer <token>` header. KrabiClaw accepts only Better Auth access tokens issued for that exact resource and scope. The token's OAuth client ID must match the location destination, and its subject must have Better Auth organization and location access.

Protected-resource metadata is available at `/.well-known/oauth-protected-resource/merchant-handoff`.

## Configure one destination

Use `PUT /api/editor/sites/{siteId}/locations/{locationId}/merchant-handoff` from an authenticated dashboard session. The body names the Better Auth OAuth client, the receiver endpoint, the provider location mapping, and every supported capability:

```json
{
  "endpoint_url": "https://receiver.example.com/orders",
  "oauth_client_id": "registered-better-auth-client-id",
  "provider": "merchant-system",
  "provider_location_id": "location-42",
  "capabilities": [
    "order_notification",
    "order_fetch",
    "order_accept",
    "order_deny",
    "ready_time_update",
    "order_ready",
    "order_cancel",
    "order_complete"
  ]
}
```

`order_notification` and `order_fetch` are required. Saving a changed destination deactivates the prior destination and creates a new version. The database rejects a second active destination for the same location. `DELETE` on the same route deactivates the current destination. KrabiClaw never selects a secondary receiver.

Transferring a site to another organization revokes the destination and its handoff history. This prevents a receiver registered by the former organization from receiving or reading orders after the transfer. The new organization must configure its own destination.

## Receive and fetch an order

KrabiClaw sends one synchronous `POST` to `endpoint_url`. The notification is intentionally small:

```json
{
  "id": "event-id",
  "version": 1,
  "type": "order.notification",
  "occurred_at": "2026-09-02T12:00:00.000Z",
  "idempotency_key": "order-id:notification:1",
  "resource": { "id": "order-id", "version": 1 },
  "destination": { "id": "destination-id", "version": 1, "location_id": "location-id" },
  "provider_mappings": { "provider": "merchant-system", "location_id": "location-42", "order_id": "merchant-order-91" },
  "snapshot": { "order_id": "order-id", "order_version": 1 },
  "fetch_url": "https://<krabiclaw-host>/api/integrations/merchant-handoff/orders/order-id"
}
```

Fetch `fetch_url` with the Better Auth bearer token. The response contains the immutable order snapshot, stable KrabiClaw IDs, the destination version, provider mappings, delivery state, merchant state, fulfillment state, and state version.

A successful notification response changes only `integration_delivery.status` to `delivered`. It never accepts the order. An HTTP, network, redirect, or interrupted-delivery failure records `failed` with the provider error and leaves the merchant state `pending`. KrabiClaw does not retry through a queue or another destination.

## Send merchant commands

Send commands to `POST /api/integrations/merchant-handoff/orders/{orderId}/commands`. Every command includes a stable command ID, version, order ID and version, expected state version, provider mappings, idempotency key, and immutable command snapshot.

The command types are:

| Type | Required snapshot | Result |
| --- | --- | --- |
| `accept` | `accepted_at` | Merchant `accepted`, fulfillment `preparing` |
| `deny` | `denied_at`, `reason_code`, `reason` | Merchant `denied`, fulfillment `cancelled` |
| `ready_time_update` | `ready_at` | Updates the promised ready time |
| `ready` | `ready_at` | Fulfillment `ready` |
| `cancel` | `cancelled_at`, `reason_code`, `reason` | Merchant and fulfillment `cancelled` |
| `complete` | `completed_at` | Fulfillment `completed` |

Example:

```json
{
  "id": "command-id",
  "version": 1,
  "type": "accept",
  "resource": { "id": "order-id", "version": 1 },
  "expected_state_version": 1,
  "provider_mappings": { "provider": "merchant-system", "location_id": "location-42", "order_id": "merchant-order-91" },
  "idempotency_key": "merchant-order-91:accept",
  "snapshot": { "accepted_at": "2026-09-02T12:01:00.000Z" }
}
```

The API stores the first result for each idempotency key. An exact replay returns that result without applying the command again. Reusing a command ID or idempotency key with different content returns `idempotency_conflict`. A stale `expected_state_version`, mismatched provider mapping, unsupported capability, or invalid transition returns an explicit conflict. A `deny` command remains a denial and never selects replacement items or another receiver.
