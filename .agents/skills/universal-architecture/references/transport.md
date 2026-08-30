# Transport and application entry points

## Contents

- Definition
- Entry-point types
- Transport-owned concerns
- Excluded concerns
- Standard flow
- Security and testing

## Definition

Transport is any boundary that delivers a command, query, event, or message into the application. It is not limited to HTTP.

## Entry-point types

### Network

- REST and HTTP endpoints
- RPC procedures
- GraphQL resolvers
- WebSockets and Server-Sent Events
- Streaming and file-upload endpoints
- Incoming webhooks

### Web client

- Typed API or RPC clients
- Link and base URL configuration
- Safe header, cookie, serialization, cancellation, timeout, and retry behavior
- Query-client integration
- Client transport error normalization

### Mobile

- Mobile API clients
- Native-module bridges
- Push-notification receivers
- Deep-link, universal-link, and app-link receivers
- Operating-system intent handlers
- Background fetch and task entry points
- Share extensions and app extensions

### Desktop

- Renderer-to-main-process IPC
- Electron handlers and restricted preload bridges
- Tauri commands
- Native message bridges
- File-open and custom protocol events
- Menu, tray, shortcut, and update handlers
- Local sockets or named pipes

### Backend automation

- Queue consumers and event subscribers
- Scheduled jobs and cron handlers
- Background workers
- Service-to-service handlers

### CLI

- Commands and argument parsing
- Standard-input parsing
- Interactive prompts
- Console formatting and exit-code mapping

### Local-only applications

A local application still needs an entry boundary:

```text
UI
→ controller, IPC handler, or native bridge
→ Domain
→ Capabilities
→ local database, filesystem, device, or OS adapter
```

## Transport-owned concerns

### Protocol parsing

- Routes, query parameters, headers, cookies, bodies, multipart data, and uploads
- IPC, bridge, push, deep-link, queue, webhook, CLI, and OS-event payloads
- Serialization, deserialization, content types, and payload limits

### Boundary validation

- Required fields and primitive types
- Lengths, ranges, enums, identifiers, email addresses, and URLs
- File type and size
- Pagination limits
- Message schemas and protocol versions

### Authentication

- Reading and verifying sessions or tokens
- Resolving the authenticated actor
- Token expiration checks
- Webhook signature verification
- Service identity verification
- IPC sender validation

### Coarse access control

- Requiring authentication
- Requiring a role, tenant membership, or API scope
- Restricting internal endpoints or privileged IPC commands

Entity-specific business authorization remains in Domain.

### Execution context

- Actor and tenant
- Request and correlation IDs
- Locale and time zone
- Platform, device, and app version
- Trace context and approved feature flags

Extract application-owned values. Do not pass raw framework request objects into Domain.

### Middleware and protocol concerns

- CORS and CSRF protection
- Security headers and rate limiting
- Request limits, timeouts, cancellation, and compression
- Idempotency-key extraction
- Trace propagation and request logging
- API version negotiation

### Response translation

- HTTP status codes and RPC errors
- CLI exit codes
- IPC and native bridge responses
- Serialization and streaming
- Safe error shapes and caching headers

### Operational observability

- Request duration and response status
- Endpoint metrics and delivery failures
- Correlation IDs, traces, and error counts

Product analytics decisions belong in Domain and flow through an Analytics Capability.

## Excluded concerns

Transport must not own:

- Pricing, eligibility, refund, subscription, or ownership rules
- Business state transitions or invariants
- Entity-specific business authorization
- Vendor SDK operations
- Arbitrary persistence queries
- Product analytics decisions
- Large business workflows

Use this distinction:

- “Is the delivered message structurally valid?” is Transport.
- “Is this business operation allowed?” is Domain.

## Standard entry-point flow

1. Receive the message.
2. Parse its platform-specific format.
3. Validate its structure.
4. Authenticate when applicable.
5. Apply coarse access control.
6. Build an application-owned command or query.
7. Call one Domain use case.
8. Translate the result into the delivery response.
9. Map known errors safely.
10. Record operational telemetry.

Keep handlers thin enough that their delivery role is obvious. The same Domain use case should be callable from several transports without knowing which one initiated it.

## Security

- Treat browser and mobile clients as untrusted.
- Never embed privileged server secrets in clients.
- Validate remote input on the trusted side.
- Treat a desktop renderer as a UI boundary.
- Expose an allowlisted IPC or native bridge.
- Validate every IPC message.
- Keep privileged OS access outside the renderer.
- Never expose stack traces, database errors, SQL, credentials, or raw vendor responses.

## Tests

Transport tests should cover:

- Parsing and schema validation
- Authentication and coarse permissions
- Middleware and route mounting
- Use-case invocation
- Error and status mapping
- Serialization
- Webhook signatures
- IPC validation
- CLI exit codes

Do not duplicate complete business-workflow tests here; test business behavior in Domain.
