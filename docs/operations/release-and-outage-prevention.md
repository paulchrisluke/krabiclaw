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

### Release-owner emergency override

The release owner may explicitly waive waiting for an incomplete qualification
check for one named release when production already has a material
customer-facing regression and delay would prolong the incident. The owner must
acknowledge the incomplete gate and authorize the promotion directly. Do not
infer an override from urgency, prior releases, or general deployment access.

Before promotion, record the customer impact, the exact checks being waived or
left incomplete, and the required post-deploy verification in the promotion
pull request or merge record. Begin production verification as soon as the
deployment converges. If the affected journey is not restored, use Cloudflare's
ordinary deployment history to restore the last known-good Worker and continue
incident recovery through the normal release flow.

This override cannot waive a known reproducible first-party failure,
database-epoch or migration safeguards, production data protections, or the
restriction on production writes and notifications without an explicit canary.

Validation follows product risk:

1. Test the affected tenant journey first.
2. Check all three customer sites for shared public changes.
3. Expand the retained tenant matrix only for shared renderer, routing,
   theme, content-model, or destructive content-migration changes.

A reproducible first-party failure blocks promotion. An operator-closed tab or
an isolated third-party timeout is not an application failure; retry the
inspection once to determine ownership, then report the actual result.

## Normal release sequence

1. Keep one coherent bugfix or feature in one ready pull request targeting
   `staging`. Split work only when the changes are independently releasable.
2. Run focused validation locally. CI owns the environment-specific build,
   preview deployment, tenant rendering/navigation, and affected E2E coverage
   selected from `config/e2e-impact-map.mjs`.
3. When preview deploys, test the affected customer journey immediately.
4. Merge to `staging` after required PR checks and preview validation pass.
5. When staging deploys, begin read-only MCP and tenant browser validation
   immediately.
6. Open or update the ordinary `staging` to `main` pull request. It reuses the
   completed checks attached to that exact staging SHA without another deploy,
   provisioning pass, or CI qualification cycle.
7. Promote only after the retained release qualification, required checks, and
   scoped customer validation pass.
8. After production deploys, repeat the affected read-only customer journeys
   and production smoke. Use an explicit canary identity for any production
   action that writes or sends notifications.

Production deployment and verification remain separate jobs. Verification
must confirm that customer-domain HTML, Nuxt build metadata, and referenced
assets have converged on the exact deployed build before browser coverage
starts. Retry only the verification job after a verification failure; do not
redeploy a healthy production Worker to repeat browser checks.

GitHub workflow runs and Cloudflare's native deployment history are sufficient
release evidence. Do not invent a second mapping between Git commits and Worker
version identifiers.

## Browser and MCP verification

Use the browser state appropriate to the behavior. Anonymous public routes may
use a fresh context. OAuth and MCP checks must use a credentialed tenant account;
rendering the login page does not validate authentication.

For an auth or MCP change, exercise the deployed flow end to end:

- OAuth protected-resource and authorization-server discovery;
- credentialed authorization with PKCE and token exchange;
- bearer-authenticated MCP `initialize` and `tools/list`;
- `get_workspace_context` and a tenant-scoped read such as `list_sites`;
- the affected safe write or media journey when tool behavior changed;
- one real ChatGPT app session when the defect involves ChatGPT tool selection,
  attachment delivery, or host-provided file arguments.

For affected tenant routes, verify the final URL, tenant identity, visible copy,
first-party media, primary navigation and calls to action, console errors,
failed first-party requests, hydration errors, blank sections, and late content
disappearance. Mutating form, booking, and MCP interactions belong only on local
or preview disposable data. Staging and production checks stay read-only unless
a dedicated canary is explicitly authorized.

The representative client order is:

1. Pottery House: home, experiences and details, locations, contact, and
   reservations.
2. Kikuzuki: home, menu and items, locations, and reservations.
3. NCLS: home, services and details, pricing, articles, contact, and schedule.

Platform marketing, dashboard, CMS, ChowBot, billing, site administration, and
platform MCP are outside the release-qualified scope.

For a shared renderer, routing, theme, content-model, or destructive
content-migration change, expand that representative set to every published
route using the sitemap and fixture inventory. Check desktop and narrow/mobile
layouts and full-page media composition. A route that was not opened remains
unverified, but unrelated route families do not block a narrowly scoped change.

## Migration and content safety

For the canonical migration workflow, see [docs/database/migrations.md](../database/migrations.md).

Never rewrite migration history for an active D1 database resource. Rebaselining schema history requires a new database epoch: provision new D1 resources, apply one generated baseline, transfer and verify data explicitly, cut bindings over under the documented write freeze, and retain the old production resource for rollback.

The database-epoch write freeze is the only exception to the normal one-deploy release path. Deploy the exact release candidate once with the old production D1 binding and `DB_WRITE_FROZEN = "true"`. That flag returns HTTP 503 before Nitro routes or middleware can reach D1, fails inbound email handling before it can read or write D1, defers queue batches with an explicit retry, and skips scheduled work. Wait at least 60 seconds for requests already running on the prior Worker version to drain before taking the final export. After the import and invariant checks pass, the ordinary `main` deployment must bind the new D1 resource and omit the flag, which restores HTTP, email, queue, and cron processing. If cutover cannot finish promptly, restore the prior Worker version instead of allowing queued messages to exhaust their retry limit.

Before dropping or retiring a legacy table or writer:

- remove every runtime reader and writer;
- inventory any records that require mapping into the canonical schema;
- fail on unmapped records rather than silently discarding them;
- apply the migration locally from a clean database and from the prior schema;
- compare the resulting schema and run `PRAGMA foreign_key_check`;
- repeat a read-only schema and foreign-key check after deployment.

Never rebuild a referenced parent table with `DROP TABLE`; D1 may execute foreign-key actions during a generated rebuild. An obsolete unreferenced table may be dropped in the same release once these checks pass. Do not retain inert tables or compatibility code for an extra release as a substitute for proving the migration.

Never reseed or hand-mutate production to hide a renderer, routing, or migration bug. Preserve customer data and fix the source of truth.

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
