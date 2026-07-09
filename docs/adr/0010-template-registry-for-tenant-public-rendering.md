# Use a Template Registry for Tenant Public Rendering

KrabiClaw already stores `theme_id` and `theme`, but tenant public rendering is still Saya-shaped in the route/layout code. KrabiClaw will introduce a central template registry that maps a tenant's selected template to route components, layouts, navigation/footer components, copy behavior, and supported content models rather than adding scattered vertical checks throughout public pages.

## Consequences

Tenant public templates must follow KrabiClaw public-surface performance rules: avoid Nuxt UI interactive components on high-traffic tenant pages, prefer lightweight native/Vue components, keep icon usage deliberate, and preserve SSR speed discipline.

## Considered Options

- Template registry and route dispatch: explicit, reusable, and keeps business logic shared.
- Page-level vertical checks: faster initially, but turns public routes into conditional branches.
- Separate legal-only route tree: clear separation, but duplicates platform behavior and invites drift.
