# KrabiClaw verification map

This directory is the maintained source for KrabiClaw's browser-verifiable user behavior. The main user-facing product is the tenant web UI. Dashboard sign-in is included because it proves the shared Better Auth session and organization routing used by the CMS.

## Baseline preconditions

- Run the controller from the repository root.
- Launch the production-like Worker with `node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs launch`.
- Require `doctor` to pass before driving a feature.
- Use the controller's base URL and private D1 directory. Never substitute preview, staging, production, or the normal `.wrangler/state` database.
- Keep email, WhatsApp, and Discord in `log_only` mode.
- Never drive an instance the controller did not start.

## Driving conventions

- Start each recipe from a freshly launched run when it mutates guest data.
- Use the feature ID exactly as shown in its file.
- Local tenant requests use the repository's `x-preview-tenant` routing contract.
- Playwright roles, labels, hrefs, and existing data attributes are the stable handles. Do not use screen coordinates.
- Keep trace files and `evidence.json` after cleanup.

## Proof and skip reporting

- Capture the action and resulting state, not only the last page.
- A tenant navigation proof needs the source page, clicked link, destination URL, and tenant-specific content.
- A guest submission proof needs the form action, HTTP success, confirmation route, persisted record, and log-only notification records.
- An auth proof needs the visible form, dashboard redirect, and Better Auth session identity.
- Report an unreachable entry point with the attempted command and missing precondition.
- Do not report one tenant, submission type, or authentication route as proof of another.

## Feature entry contract

Each feature file describes the user-visible behavior, every mapped entry point, the exact controller command, and its proof. The controller uses the repository's Playwright tests for established journeys and a focused browser drive for dashboard sign-in.

## Features

- [Tenant navigation](./tenant-navigation.md) covers shared-host tenant resolution and linked page navigation.
- [Experience booking](./experience-booking.md) covers a Pottery House class booking, persistence, and notifications.
- [Restaurant reservation](./restaurant-reservation.md) covers a Kikuzuki table request, persistence, and notifications.
- [Guest contact](./guest-contact.md) covers a Pottery House contact submission and notifications.
- [Dashboard sign-in](./dashboard-login.md) covers Better Auth email sign-in and organization dashboard routing.
