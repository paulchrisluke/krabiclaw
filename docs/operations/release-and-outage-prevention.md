# Release and Outage Prevention

This contract applies to work that changes, deploys, or releases user-facing
runtime behavior or database schema. It keeps the release path simple and makes
customer behavior, rather than release bookkeeping, the approval signal.

## Release rule

Krabiclaw uses a branch-driven flow: a
pull request deploys nothing, a push to `staging` deploys the staging Worker,
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
2. Run the E2E suite locally against a local D1 (`yarn e2e:local:prepare &&
   yarn test:e2e:local`). Pull-request CI runs `Checks` and its own isolated
   local-D1 E2E suite; there is no preview deployment.
3. Merge to `staging` after required PR checks and local validation pass.
4. When staging deploys, begin read-only MCP and tenant browser validation
   immediately.
5. Open or update the ordinary `staging` to `main` pull request. It reuses the
   completed checks attached to that exact staging SHA without another deploy,
   provisioning pass, or CI qualification cycle.
6. Promote only after the required checks on that exact SHA and the scoped
   customer validation pass.
7. After production deploys, repeat the affected read-only customer journeys
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
- `get_workspace_context` and a tenant-scoped read such as `list_organizations`;
- the affected safe write or media journey when tool behavior changed;
- one real ChatGPT app session when the defect involves ChatGPT tool selection,
  attachment delivery, or host-provided file arguments.

For affected tenant routes, verify the final URL, tenant identity, visible copy,
first-party media, primary navigation and calls to action, console errors,
failed first-party requests, hydration errors, blank sections, and late content
disappearance. Mutating form, booking, and MCP interactions belong only on local
disposable data. Staging and production checks stay read-only unless
a dedicated canary is explicitly authorized.

Verification means completing what the customer came to do, up to the last
read-only step. Opening a class means opening its booking form and seeing a
time to choose; opening a dish means its price and photograph; opening a
service means its page in the site's own design. A page that renders with an
empty state is a failed check unless that emptiness is the tenant's own data.
Row counts, foreign-key checks, and `typecheck` describe the database and the
build; none of them is a customer journey, and a cutover is not verified until
one has been walked on each representative surface. On 2026-09-12 a catalog
cutover passed every count — 406 products, 627 prices, 0 FK violations — while
no class on any site had a bookable time, because nobody opened a booking form.

The representative client order is:

1. Pottery House: home, experiences and details, locations, contact, and
   reservations.
2. Kikuzuki: home, menu and items, locations, and reservations.
3. NCLS: home, services and details, pricing, articles, contact, and schedule.
4. Krabiclaw's own site: home, documentation, blog, and the help form. It is an
   ordinary site on the platform template, so it is qualified like a tenant.

Dashboard, CMS, ChowBot, and billing are outside the release-qualified scope.

For a shared renderer, routing, theme, content-model, or destructive
content-migration change, expand that representative set to every published
route using the sitemap and fixture inventory. Check desktop and narrow/mobile
layouts and full-page media composition. A route that was not opened remains
unverified, but unrelated route families do not block a narrowly scoped change.

## Migration and content safety

All Cloudflare D1 databases, including replacements, must be created with
`--location wnam` (Western North America). Do not omit the location hint or
create an APAC database. Confirm the creation result reports WNAM before
adding the binding or loading any data.

Change `server/db/schema.ts` first, then use `yarn db:generate` to add a forward
migration under `migrations/`. Keep every migration already applied to a live D1
immutable. A normal staging or production deployment runs `wrangler d1
migrations apply` before the Worker deploy; new tables, columns and indexes use
that path. Run `yarn lint:migrations`, `yarn lint:schema-drift` and `yarn
test:migrations` locally, then check schema drift and `PRAGMA foreign_key_check`
on each deployed database.

SQLite cannot alter a CHECK constraint in place. When a constraint on a table
referenced by other tables must change, Drizzle generates a table rebuild whose
`DROP TABLE` can cascade-delete D1 child rows. That case alone uses a replacement
database. Name the constraint and affected references in the pull request. A
replacement gets a new generated baseline and a fresh D1 migration ledger; move
the prior SQL and metadata intact to `migrations-history/<version>/`. Never edit
an already deployed migration and ask D1 to replay it under the same filename.

The replacement is prepared while the old Worker stays live. Use the existing
`scripts/pull-production-snapshot.ts` path for preflight, initial load and final
delta, specifying the old database with `--source`. The script refuses
unexpected source tables or columns, validates copied rows, checks foreign keys
and target schema, and previews rows changed or deleted since the initial
export. The delta inserts newly created rows only. Inspect changed and deleted
keys before retiring the old database; carry important edits explicitly,
without overwriting new-database writes. There is no write freeze or
maintenance response in the application.

For the v6-to-v7 social cleanup, create empty v7 databases with location hint
`wnam` and apply the generated baseline with `wrangler d1 migrations apply`.
Never execute the SQL file directly: its migration ledger must record it.
The transfer recognizes the immutable v6 migration chain, retains existing
category IDs, and copies account, session, OAuth and `jwks` rows from each
environment's own source. Local development omits encrypted production keys.

The replacement changes `content_documents_social_source_check` on the parent of
content blocks and publication receipts. Imports are retired only after the
owner-approved imported website posts and unused media have been deleted.
Transfer rejects any remaining imported post, attached import receipt or live
imported asset; it removes erased import receipts, media provenance and retired
connection sync state. Outbound publication receipts and authored content remain.

```sh
node --experimental-strip-types scripts/pull-production-snapshot.ts --source krabiclaw-staging-v6 --out staging-preflight.sqlite
node --experimental-strip-types scripts/pull-production-snapshot.ts --staging --source krabiclaw-staging-v6 --out staging-initial.sqlite
node --experimental-strip-types scripts/pull-production-snapshot.ts --production --source krabiclaw-production-v6 --out production-initial.sqlite
node --experimental-strip-types scripts/pull-production-snapshot.ts --staging --source krabiclaw-staging-v6 --out staging-final.sqlite --delta-from staging-initial.sqlite
node --experimental-strip-types scripts/pull-production-snapshot.ts --production --source krabiclaw-production-v6 --out production-final.sqlite --delta-from production-initial.sqlite
```

Prepare the load before the binding repoint. Inspect changes and deletions since
the initial load immediately before deployment; carry important edits explicitly
and preserve writes to the new database. After each deployment, verify schema,
foreign keys and customer journeys on the new binding before promoting further.

Before dropping or retiring a legacy table or writer:

- remove every runtime reader and writer;
- inventory any records that require mapping into the canonical schema;
- fail on unmapped records rather than silently discarding them;
- apply the migration locally from a clean database and from the prior schema;
- compare the resulting schema and run `PRAGMA foreign_key_check`;
- repeat a read-only schema and foreign-key check after deployment.

When a change turns a value the runtime computed into rows the runtime reads
— a schedule into sessions, a flag into a placement — the same change ships
whatever creates those rows, unattended, and the migration derives them for the
data already there. A CMS button is not a generator. The check for such a
change is the surface that reads the rows, not the count of rules that would
have produced them.

A change that deletes or moves a public route lists every retired path and what
answers it now, in the pull request: a restored route, or a deliberate 404 with
the reason. A retired path is not redirected — a 301 keeps the retired shape
addressable and reachable forever, which is the thing the deletion was for, and
it hides from every caller that the route it holds no longer exists. The same change updates the
production verification spec, the template sitemap allowlist, and any robots
rule that named the path — those three are where a retired route keeps
answering after the page is gone. Customer-facing names are decided with the
owner before a route is renamed: a schema word is not a navigation label.

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
4. Repair the source in one narrow pull request through the normal `staging`
   and `main` branch flow.

Do not build a custom rollback system or delay emergency stabilization for
release bookkeeping.

## Handoff

Report what landed, which environment deployed, which customer journeys were
actually exercised, and what remains unverified. Do not call platform-only
checks client-site verification, a rendered login page an auth pass, or a
scripted request a real ChatGPT tool-usage pass.
