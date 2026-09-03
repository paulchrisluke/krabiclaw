---
name: verify-krabiclaw
description: Verify KrabiClaw's tenant websites and authenticated dashboard through the production-like local Worker. Use after changing user-visible web behavior, tenant routing, guest submissions, authentication, or dashboard entry.
---

# Verify KrabiClaw

KrabiClaw's primary user-facing product is its multi-tenant web UI. The dashboard, ChowBot, WhatsApp, and ChatGPT MCP app share the server domain model, but this skill drives the tenant sites and dashboard in a browser. Use the existing MCP commands for connector-only changes.

The controller builds the Cloudflare Worker, creates a private local D1 directory, applies the canonical migrations and seed generators, provisions the canonical Better Auth fixtures, and starts Wrangler at `http://localhost:4173`. It refuses to share an active run or an occupied port. Set `KRABICLAW_VERIFY_PORT` before launch when port 4173 is unavailable.

## Launch

From the repository root, run:

```powershell
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs launch
```

The command runs `yarn build`, prepares isolated state under `.tmp/verify-krabiclaw/runtime/<run-id>/`, and waits until the NCLS tenant responds through `x-preview-tenant`. It prints the run ID and base URL only after the Worker and a Better Auth fixture session are ready.

Do not start a second controller in the same checkout. A normal developer server can run beside it because the verifier uses a separate port and D1 directory.

Teardown is the cleanup command below. Do not kill Wrangler or workerd by process name.

## Doctor

Run this first when the browser, auth, or tenant data looks wrong:

```powershell
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs doctor
```

Doctor checks the launched PID, confirms that its Windows process tree owns the configured port, hashes the Worker build, compares the checkout revision, loads NCLS through tenant routing, and reads the seeded Better Auth session. A failure means the instance is not worth driving. Clean it up and launch again.

## Drive

Read [features/README.md](features/README.md), then run the feature that matches the change:

```powershell
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive tenant-navigation
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive experience-booking
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive restaurant-reservation
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive guest-contact
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive dashboard-login
```

The first four commands run the repository's existing Playwright journeys against the active isolated Worker. `dashboard-login` drives the visible email form and confirms the resulting browser session. Tenant requests use `x-preview-tenant`; direct `*.localhost` navigation is not a valid local route.

## Evidence

Proof is retained under `.tmp/verify-krabiclaw/evidence/<run-id>/<feature>-<timestamp>/`.

- Playwright journeys retain `trace.zip`, which records the browser action, page state, network calls, and assertions.
- Dashboard sign-in retains screenshots before entry, after entry, and after redirect, plus ARIA snapshots and `evidence.json`.
- Guest submission journeys assert the persisted row and log-only notification records. A confirmation page alone is not enough.
- Every run writes `evidence.json` with the revision, command target, result, and artifact paths.

Exercise the real user path. Do not replace a browser action with an internal setter or test-only write endpoint. Production boundaries may use their existing local modes: this verifier sets email, WhatsApp, and Discord to `log_only`, then verifies the records those modes create. It never points at preview, staging, or production.

Keep both the action and its resulting state. A final screenshot without the triggering action is weak evidence. A dry-run label is not proof; inspect its trace or recorded side effects.

## Cleanup

Run:

```powershell
node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs cleanup
```

Cleanup kills only the PID tree recorded by this run and removes only its directory under `.tmp/verify-krabiclaw/runtime/`. It removes the active-state file. It does not remove `.tmp/verify-krabiclaw/evidence/`.

After cleanup, confirm the named evidence directory still exists. If launch or drive fails, run cleanup before retrying.

## Helpers

[`scripts/control.mjs`](scripts/control.mjs) is the executable controller. Invoke it with Node as shown above. Its commands are `launch`, `doctor`, `drive <feature>`, and `cleanup`. Run it with no command to print the supported feature IDs.

The controller owns the verification process, its private D1 state, its credentials, and its evidence directory. Do not edit `.tmp/verify-krabiclaw/active.json` by hand.
