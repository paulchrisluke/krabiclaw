# Dashboard sign-in

Dashboard sign-in lets a seeded organization owner authenticate through the visible email form and land in the Ember & Slice organization dashboard with a valid Better Auth session.

## Sub-features

- `login-open` renders the public Sign in page.
- `login-email` accepts the seeded email and local-only password.
- `login-submit` authenticates through Better Auth.
- `login-route` redirects to `/dashboard/ember-slice-demo`.
- `login-session` exposes the seeded demo owner through Better Auth's session endpoint.

## How to get to it (user POV)

- Open `Sign in` from the platform.
- Fill `Email` and `Password`.
- Choose `Sign in with email`.
- Arrive at the `Today` dashboard for Ember & Slice.

## Driving it with verify-krabiclaw controller

Preconditions:

- `doctor` passes and reports the Better Auth session for `user-e2e-demo-owner`.
- Use only the random password stored inside the active run's disposable runtime directory.

- **Drive sign-in.** Run `node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive dashboard-login`.
- **Confirm the action.** The evidence includes the Sign in page, filled email and masked password controls, and the click on `Sign in with email`.
- **Confirm routing.** The browser reaches `/dashboard/ember-slice-demo` and renders `Today`.
- **Confirm identity.** A session read from the same browser context returns `user-e2e-demo-owner`.
- **Proof.** Keep `01-login.png`, `02-credentials-entered.png`, `03-dashboard.png`, the two ARIA snapshots, and `evidence.json`.

## Gotchas

- The controller password is random per run and is deleted during cleanup. Do not copy it into repository files or reports.
- Google and WhatsApp are separate entry points. Email sign-in does not verify either one.
- An API-created cookie alone does not prove the visible login form. This drive fills and submits the browser form.
- Platform admin access is not tenant owner access. This fixture is an actual `org-demo` owner through Better Auth membership.
