# Release and Outage Prevention

This contract applies to work that changes, deploys, or releases user-facing
runtime behavior or database schema. It keeps the release path simple and makes
customer behavior, rather than release bookkeeping, the approval signal.

## Release rule

KrabiClaw uses the branch-driven flow in [release-flow.md](release-flow.md): a
pull request deploys preview, a push to `staging` deploys the staging Worker,
and a push to `main` deploys production. Each environment receives one normal
Cloudflare Worker deployment. Do not add candidate manifests, version-override
headers, Worker UUID tracking, custom release locks, or repository rollback
commands.

Green CI is necessary, but it is not release approval. As soon as an environment
is deployed, start the relevant browser and MCP checks while the remaining CI
jobs continue. Automated E2E and manual browser evidence are independent gates;
neither must wait for the other to begin.

Validation follows product risk:

1. Test the affected authenticated flow or tenant journey first.
2. Check representative client sites before platform marketing routes.
3. Run the exhaustive tenant route matrix only for shared renderer, routing,
   theme, content-model, or destructive content-migration changes.

A reproducible first-party failure blocks promotion. An operator-closed tab or
an isolated third-party timeout is not an application failure; retry the
inspection once to determine ownership, then report the actual result.

## Normal release sequence

1. Keep one coherent bugfix or feature in one ready pull request targeting
   `staging`. Split work only when the changes are independently releasable.
2. Run focused validation locally. CI owns the single environment-specific
   build, preview deployment, and representative preview E2E coverage.
3. When preview deploys, test the affected customer journey immediately.
4. Merge to `staging` after required PR checks and preview validation pass.
5. When staging deploys, begin credentialed MCP and tenant browser validation
   immediately while the full staging E2E suite continues.
6. Promote with the ordinary `staging` to `main` pull request only after the
   required staging checks and scoped customer validation pass.
7. After production deploys, repeat the affected read-only customer journeys
   and production smoke. Use an explicit canary identity for any production
   action that writes or sends notifications.

GitHub workflow runs and Cloudflare's native deployment history are sufficient
release evidence. Do not invent a second mapping between Git commits and Worker
version identifiers.

## Browser and MCP verification

Use the browser state appropriate to the behavior. Anonymous public routes may
use a fresh context. Dashboard, OAuth, and MCP checks must use a credentialed
test account; rendering the login page does not validate authentication.

For an auth or MCP change, exercise the deployed flow end to end:

- OAuth protected-resource and authorization-server discovery;
- credentialed authorization with PKCE and token exchange;
- bearer-authenticated MCP `initialize` and `tools/list`;
- `get_current_user` and a tenant-scoped read such as `list_sites`;
- the affected safe write or media journey when tool behavior changed;
- one real ChatGPT app session when the defect involves ChatGPT tool selection,
  attachment delivery, or host-provided file arguments.

For affected tenant routes, verify the final URL, tenant identity, visible copy,
first-party media, primary navigation and calls to action, console errors,
failed first-party requests, hydration errors, blank sections, and late content
disappearance. Mutating form and booking interactions belong on preview or
staging fixtures. Production checks stay read-only unless a dedicated canary is
explicitly authorized.

The representative client order is:

1. Pottery House: home, experiences and details, locations, contact, and
   reservations.
2. Kikuzuki: home, menu and items, locations, and reservations.
3. NCLS: home, services and details, pricing, articles, contact, and schedule.
4. Demo fixtures needed by the affected feature.
5. A minimal set of affected platform, authentication, help, docs, or legal
   routes.

For a shared renderer, routing, theme, content-model, or destructive
content-migration change, expand that representative set to every published
route using the sitemap and fixture inventory. Check desktop and narrow/mobile
layouts and full-page media composition. A route that was not opened remains
unverified, but unrelated route families do not block a narrowly scoped change.

## Migration and content safety

Applied migration files are immutable. `server/db/schema.ts` remains the source
of truth, and staging and production use native `wrangler d1 migrations apply`.

Before dropping or retiring a legacy table or writer:

- remove every runtime reader and writer;
- inventory any records that require mapping into the canonical schema;
- fail on unmapped records rather than silently discarding them;
- apply the migration locally from a clean database and from the prior schema;
- compare the resulting schema and run `PRAGMA foreign_key_check`;
- repeat a read-only schema and foreign-key check after deployment.

Never rebuild a referenced parent table with `DROP TABLE`; D1 may execute
foreign-key actions during a generated rebuild. An obsolete unreferenced table
may be dropped in the same release once these checks pass. Do not retain inert
tables or compatibility code for an extra release as a substitute for proving
the migration.

Never reseed or hand-mutate production to hide a renderer, routing, or migration
bug. Preserve customer data and fix the source of truth.

## Incident recovery

When a deployed customer journey is broken:

1. Identify the affected environment, client routes or MCP operations, and the
   observed first-party failure.
2. Use Cloudflare's ordinary deployment history to restore the last known-good
   Worker without changing D1 data.
3. Re-open the affected customer journeys, including the relevant client sites
   and authenticated flows.
4. Repair the source in one narrow pull request through the normal preview,
   `staging`, and `main` branch flow.

Do not build a custom rollback system or delay emergency stabilization for
release bookkeeping.

## Handoff

Report what landed, which environment deployed, which customer journeys were
actually exercised, and what remains unverified. Do not call platform-only
checks client-site verification, a rendered login page an auth pass, or a
scripted request a real ChatGPT tool-usage pass.
