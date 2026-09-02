# Layer ownership reference

## Contents

- UI
- Domain
- Capabilities
- Vendor and platform adapters
- Supporting foundations
- Placement test

## UI

UI presents information, collects input, manages presentation state, and sends user intentions through an application entry point.

Web UI may contain pages, routes, layouts, components, forms, navigation, client state, query hooks, loading/error states, accessibility behavior, formatting, and typed client calls.

Mobile UI may contain screens, navigation stacks, tabs, sheets, gestures, keyboard and safe-area behavior, permission screens, offline indicators, and notification or deep-link presentation.

Desktop UI may contain windows, panels, menus, toolbars, dialogs, tray interfaces, renderer components, presentation shortcuts, drag-and-drop presentation, and update notifications.

Shared UI may contain design tokens, icons, framework-compatible primitives, formatting functions, and genuinely portable feature components. Do not force materially different platform behavior into one abstraction.

UI may use:

- A typed Transport client
- A restricted local application bridge
- UI packages
- Safe shared contracts

UI must not directly:

- Query persistence as a shortcut
- Import ORM records
- Call server vendor SDKs
- Store privileged secrets
- Implement authoritative business rules or authorization
- Access unrestricted desktop or native APIs

Client validation improves feedback. Transport and Domain validation remain authoritative.

## Domain

Domain contains platform-independent product meaning. A Domain use case should work from web, mobile, desktop, CLI, webhook, queue, or worker entry points.

Domain may contain:

- Entities, value objects, aggregates, identifiers, and state machines
- Use cases, commands, queries, and application services
- Business policies, invariants, eligibility, pricing, ownership, and approval rules
- Business authorization and state transitions
- Workflow coordination
- Domain events and errors
- Application-owned inputs and results
- Repository or Capability ports owned by the application

Domain must not know about:

- UI frameworks
- HTTP, RPC, WebSockets, IPC, deep-link, push, queue, or CLI formats
- Framework request objects
- ORM records or raw SQL
- Vendor SDKs
- Device or operating-system APIs
- Scattered environment-variable reads

Domain may call stable Capability and persistence ports. It must not import UI, delivery frameworks, or concrete adapters.

## Capabilities

Capabilities define stable operations the application needs without exposing a provider, device, framework, or operating system.

Server examples:

- Payments
- Email
- Object storage
- Analytics
- Search
- Authentication
- Notifications
- Tax
- PDF generation
- AI services
- Message publishing

Device examples:

- Camera, photos, microphone, and location
- Biometrics and contacts
- Clipboard and secure storage
- Local notifications and push registration
- File selection, sharing, and haptics
- Connectivity status

Desktop examples:

- Filesystem and native dialogs
- Tray and window management
- Global shortcuts and auto-update
- Printing and credential storage
- Local process integration

Local-first examples:

- Local persistence
- Synchronization
- Conflict detection
- Command queueing
- Offline storage
- Cache management
- Connectivity monitoring

Capability rules:

- Expose application-owned names, inputs, outputs, and errors.
- Keep APIs small and intentional.
- Hide SDK objects, native handles, provider responses, and platform terminology.
- Normalize implementation errors.
- Do not import UI, Transport, or concrete adapters.
- Allow implementations to be replaced without rewriting Domain.

Prefer `chargePayment(input): PaymentResult` over `createStripePaymentIntent(input)`.

## Vendor and platform adapters

Adapters implement Capabilities using specific providers, devices, frameworks, or operating systems.

Examples:

- Stripe, S3, PostHog, email providers, Auth0, APNs, and FCM
- iOS Keychain, Android Keystore, StoreKit, and Google Play Billing
- Windows Credential Manager, macOS Keychain, and native filesystem APIs
- Electron or Tauri plugins
- IndexedDB, service workers, browser notifications, and browser file APIs

Adapter rules:

- Keep implementation-specific imports inside adapters.
- Translate Capability inputs into implementation calls.
- Translate results into application-owned outputs.
- Normalize provider-specific errors.
- Do not make business decisions.
- Do not expose SDK types upward.
- Keep credentials in the correct trusted environment.

Adapters normally import the ports they implement. Wire adapters to consumers in a composition root; do not make Capability packages import concrete adapters.

## Supporting foundations

### Shared

Shared foundations may contain:

- Stable contracts and serialization-safe types
- Shared schemas and branded identifiers
- Date, money, result, and other framework-independent primitives
- Small, genuinely shared utilities
- Platform-neutral test factories

Shared must not become a miscellaneous dumping ground. It must not contain business workflows, UI components, vendor SDKs, arbitrary persistence logic, or imports from higher layers.

### Persistence

Persistence foundations may contain:

- Database and ORM setup
- Schemas, tables, migrations, and connection management
- Queries, transactions, repositories, and persistence adapters
- Record-to-application mapping
- Persistence errors and test utilities
- Server databases, SQLite, IndexedDB, embedded databases, and encrypted local stores

Persistence rules:

- UI must not access persistence directly as a shortcut.
- Transport must not issue arbitrary queries.
- Domain uses repository or persistence ports.
- ORM and record types must not leak into Domain.
- Business decisions must not hide inside queries or ORM hooks.
- True data-integrity constraints remain appropriate in the database.

Persistence adapters may import the application-owned repository port and types they implement. Wire them in the composition root.

## Placement test

- Displays information or collects input: UI.
- Receives or translates an external message: Transport.
- Decides what the product should do: Domain.
- Defines a stable external or platform operation: Capability.
- Uses a specific SDK, device API, or OS API: adapter.
- Defines a stable, framework-independent contract or primitive: shared foundation.
- Persists or retrieves data: persistence adapter.
- Constructs the application and injects implementations: composition root.

If a file answers more than one question, split it into responsibility-specific modules connected through explicit application-owned interfaces.
