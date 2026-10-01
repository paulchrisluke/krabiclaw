# Krabiclaw

Krabiclaw helps local and professional-service businesses build and manage a
website through the dashboard and the ChatGPT app. Restaurant, experience and
service businesses share one tenant backend for locations, products, content,
media and guest activity. Public sites render on the server and use the template
registry; the platform marketing site is an ordinary platform-template site.

The dashboard handles onboarding, billing, organization settings and the guest
inbox. Authorized MCP operations manage existing tenant resources on the same
backend. A tool name alone does not establish plan availability, provider
success, a quota or a customer-facing promise.

## Product evidence

The [feature library](docs/product/feature-library.json) is the canonical mapping
from stable feature IDs to current availability, entitlement references, MCP
operations, implementation evidence, tests and unresolved owner decisions.
Read its [maintenance rules](docs/product/README.md) before adding a feature or
using it to review a pricing comparison. Reference labels are internal vocabulary
until approved for publication. The library does not supply paid marketing copy.

Runtime identities are `free` and `growth`; one organization subscription covers
its sites. Customer display names, Stripe product IDs, price IDs and lookup keys
are separate concepts. Renaming a plan label does not authorize an ID migration.

| Field | Canonical source |
| --- | --- |
| Paid plan name, description, image, marketing bullets | Stripe Product: `name`, `description`, `images`, `marketing_features` |
| Paid amount, currency and cadence | Stripe recurring Prices, validated by the application catalog contract |
| Paid display metadata | Stripe Product metadata read by `server/utils/billing-plans.ts` |
| Starter presentation and CTAs | `server/utils/billing-plans.ts`; Starter has no Stripe subscription product |
| Runtime entitlement policy | `server/utils/billing-entitlements.ts` |
| Current organization access | Better Auth subscription rows read by `server/utils/billing-access.ts`, then the actual operation gate |
| Feature mapping and verification | `docs/product/feature-library.json` |

Paid billing surfaces consume `/api/billing/plans`. Entitlements grant capability,
not presentation copy. An active/trialing subscription must satisfy the canonical
billing projection; a declaration is not proof that a send or write enforces it.

## Decisions still open

Review-request sending is currently paid; the owner question about Free remains
open. WhatsApp business notifications have a baseline billing-gate defect and a
separate isolated cost-control fix under review; authentication OTP is separate.
Saya and Blawby are both provisioned without a billing check, while Blawby's
marketing currently describes Growth inclusion. Documentation and the help form
exist; Community/Priority support wording does not establish a service promise.
These discrepancies must be resolved before publishing comparison claims.

A [read-only Stripe catalog snapshot](docs/product/stripe-catalog-verification.json)
records the verified provider catalog and discrepancies at its stated timestamp.
It is audit evidence, not a replacement catalog. Paid bullets and prices remain
provider-owned; this foundation does not edit pricing or synchronize marketing.

## Implementation context

- [MCP contract](docs/mcp.md) and `server/utils/mcp-tools/index.ts` define the public tool surface.
- `utils/template-registry.ts` owns customer template routing and presentation.
- `server/domain/requests.ts` and `server/domain/guest-threads/` own guest activity and delivery receipts.
- [Testing strategy](docs/testing-strategy.md) defines proof at real runtime boundaries.
- [Local development](docs/local-development.md) defines the current Worker setup.
