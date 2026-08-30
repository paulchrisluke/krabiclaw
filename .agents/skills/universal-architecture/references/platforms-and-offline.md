# Platforms, cross-cutting ownership, and offline behavior

## Contents

- Representative flows
- Cross-platform sharing
- Cross-cutting ownership
- Offline and synchronization

## Representative flows

### Web

```text
Web UI
→ typed browser client
→ HTTP/RPC Transport
→ Domain
→ Capability port
→ server adapter
```

### Mobile with remote backend

```text
Mobile UI
→ mobile client
→ remote server Transport
→ Domain
→ Capability port
→ server adapter
```

Treat the installed mobile application as an untrusted client. Store user credentials through secure platform storage, but never embed privileged server secrets.

### Desktop with remote backend

```text
Desktop renderer
→ typed client
→ remote server Transport
→ Domain
→ Capability port
→ server adapter
```

### Desktop with local capabilities

```text
Desktop renderer
→ allowlisted preload/IPC bridge
→ main-process handler
→ Domain
→ Capability port
→ filesystem, credential, database, or OS adapter
```

Treat the renderer as UI. Do not give it unrestricted shell, filesystem, credential, or process access.

### Worker or scheduled job

```text
Queue, schedule, or OS event
→ worker Transport
→ Domain
→ Capabilities
```

### CLI

```text
CLI parser
→ application command
→ Domain
→ Capabilities
→ formatted output and exit code
```

## Cross-platform sharing

Prefer sharing:

- Domain models and use cases
- Capability contracts
- API schemas and serialization-safe contracts
- Formatting and validation primitives that are truly platform-neutral
- Test fixtures and contract tests

Share UI only when its framework and behavior are genuinely portable. Keep platform-specific presentation and lifecycle behavior in the platform app.

Avoid large modules filled with `if web`, `if iOS`, `if Android`, `if Windows`, and `if macOS`. Use a stable port with small platform adapters.

## Cross-cutting ownership

### Authentication

- Login presentation: UI
- Token or session parsing: Transport
- Identity-provider operation: Capability and adapter
- Secure credential storage: Capability and platform adapter
- Business access decision: Domain

### Push notifications

- Provider delivery: vendor adapter
- Device receipt: Transport
- Business meaning and resulting action: Domain
- Presentation: UI or notification Capability
- Push-token storage: persistence through a narrow port

### Deep links

- Receipt and parsing: Transport
- Navigation presentation: UI
- Permission and business validation: Domain

Never trust a deep link merely because the operating system opened it.

### Payments

- Checkout presentation: UI
- Delivered request validation: Transport
- Purchase eligibility and policy: Domain
- Stable payment operation: Capability
- Stripe, StoreKit, or Play Billing: adapter

### Files

- Picker presentation: UI
- File-event intake: Transport
- Permitted business use: Domain
- Stable file operations: Capability
- Browser, device, desktop, or cloud implementation: adapter
- File metadata: persistence

### Analytics and logging

- Interaction intent may originate in UI.
- Domain decides important product events.
- Analytics Capability provides the stable API.
- PostHog or another SDK stays in an adapter.
- Request timing and error counts are operational Transport telemetry.
- Persistence performance telemetry stays with persistence infrastructure.

### Validation

- Immediate form feedback: UI
- Message shape and protocol validation: Transport
- Business rule validation: Domain
- Provider constraints: Capability or adapter
- Data integrity constraints: persistence

### Errors

- User-facing presentation: UI
- Protocol and status mapping: Transport
- Business errors: Domain
- Stable integration errors: Capability
- Provider-specific errors: adapter
- Persistence errors: persistence adapter

### Configuration

- Public display configuration: UI
- Protocol and server configuration: Transport
- Business policy: Domain-owned configuration
- Adapter selection: composition root
- Provider endpoints and credentials: adapter configuration
- Database connection configuration: persistence infrastructure

## Offline and synchronization

For offline or local-first applications:

- UI displays offline, pending, optimistic, and conflict states.
- Transport receives synchronization messages and delivers queued commands.
- Domain protects invariants and owns business-specific conflict or merge policy.
- Capabilities define synchronization, connectivity, queue, and local repository ports.
- Adapters store pending commands, detect connectivity, run background synchronization, and communicate with remote services.

Distinguish mechanical and business conflict handling:

- Comparing versions, retrying delivery, and persisting a queue are infrastructure concerns.
- Deciding whether two changes can merge without violating product rules is a Domain concern.

Make queued commands idempotent when possible. Preserve stable operation IDs across retries. Do not place business conflict-resolution rules in UI components or raw synchronization handlers.
