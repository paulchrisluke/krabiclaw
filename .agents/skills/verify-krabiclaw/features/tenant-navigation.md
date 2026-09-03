# Tenant navigation

Tenant navigation resolves the correct client from the shared local host and lets a visitor move from a tenant home page to a list and a detail page without leaking another tenant's content.

## Sub-features

- `tenant-home` resolves Pottery House through `x-preview-tenant` and renders its identity.
- `tenant-list` opens the Experiences list through a visible link.
- `tenant-detail` opens Pottery Wheel Class and preserves Pottery House identity.
- `tenant-isolation` rejects Ember & Slice copy and empty fallback content throughout the journey.

## How to get to it (user POV)

- Open the Pottery House home page.
- Choose the `Experiences` link.
- Choose the `Pottery Wheel Class` link.

## Driving it with verify-krabiclaw controller

Preconditions:

- `doctor` passes for the active isolated Worker.
- The canonical Pottery House seed is present in the run's private D1.

- **Drive the linked journey.** Run `node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive tenant-navigation`. The existing `Pottery home` Playwright journey starts at `/`, clicks `a[href="/experiences"]`, then clicks `a[href="/experiences/pottery-wheel-class"]`.
- **Confirm tenant identity.** The pages contain `Pottery House`, the detail contains `Pottery Wheel Class`, and `[data-hydrated]` reads `true`.
- **Confirm isolation.** The body does not contain `Ember & Slice`, `No experiences yet`, or `Also part of Saya`.
- **Proof.** Keep the passing `trace.zip` and `evidence.json` under the controller's reported evidence directory. The trace must show the clicks and final detail page.

## Gotchas

- Direct `pottery-house.localhost` navigation bypasses the authoritative local routing contract.
- A direct `page.goto` to the detail route does not prove the home-to-list-to-detail links.
- Shared components can render successfully with the wrong tenant data. Assert identity and forbidden copy on every page.
- The media CDN can produce third-party noise. First-party navigation, hydration, or console failures still fail the journey.
