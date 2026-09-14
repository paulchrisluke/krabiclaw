# Local development

**Status: Contract**

There is one local setup path for humans and agents:

```sh
corepack yarn install
corepack yarn local:setup
corepack yarn dev
```

Copy `.env.example` to `.env` and fill the required application secrets before
setup. `local:setup` is safe to repeat: it applies the migration chain, refreshes
the demo, Kikuzuki, Pottery House, and NCLS fixtures, provisions local auth, and
verifies the resulting D1 database. Do not replace its steps with direct
Wrangler writes or a hand-edited local database.

Fixtures are written before the Worker starts. Setup is not ready for a client
handoff until the post-start social-card generation and public verification pass:

```sh
corepack yarn local:cards
corepack yarn client:verify --url http://localhost:3000 --site-id site-demo --tenant-slug ember-slice-demo
```

It signs in as the developer account and regenerates every tenant's cards
through the same endpoint the dashboard's own button uses. It needs `yarn dev`
up, because rendering a card runs in the Worker, and it takes a while on the
first run — a card is rendered and uploaded per product, post and page. Requests
process five owners at a time. Each generated or reused PNG is fetched and its
1200×630 dimensions checked; every skipped or failed owner is reported. Re-running
reuses matching cards. Use `--site-id` to limit it to one site; KrabiClaw's own
site is an ordinary site here.

Approved `client:import --apply` runs this same generator for the imported site
and then `client:verify`; failed generation or verification prevents handoff.
It requires the target Worker to be running and `E2E_TEST_PASSWORD` for the
authorized account (`--email` selects it). Remote targets also require an explicit
`--base-url`.

Only production runs the `social-card-backfill` task: preview and staging set
`crons = []`, and it is bounded to a small number of owners per night.

Local and preview copy production through `db:pull:local` and `db:pull:preview`.
One SQL read captures the tables and rows from the same database revision.
D1 exports block concurrent application queries, so setup does not use that
operation. Changed schema, incomplete results, oversized copies, or failed
rebaseline integrity checks stop setup before it writes the target. Existing
bookings retain their
original dates; setup does not manufacture current activity. For date-sensitive
Today or Calendar checks, create bookings through the guest flow in the local
or preview environment.

## Signing in

After `local:setup`, start the app and use the URL, email, and password printed
under `Local developer sign-in`. Setup generates a fresh password on every run,
prints it once, and stores only its hash in local D1. No reusable local password
is recorded in the repository.

The account exists only in local D1. It is a Better Auth admin (it can
impersonate) and an owner in each curated tenant organization, so it is the
single manual sign-in for demo, Pottery House, Kikuzuki, and NCLS work. Better Auth handles the normal
email/password request and stores only the password hash; there is no auth
bypass, magic header, or cookie to paste.

### Signing in without typing

Retyping a freshly generated password every time is tedious, and an agent
driving a browser cannot do it at all. Set `LOCAL_DEVELOPER_EMAIL` and
`LOCAL_DEVELOPER_PASSWORD` in `.env` and re-run `corepack yarn local:setup`:
setup then provisions the hash for the password you chose instead of a
throwaway, and `http://localhost:3000/api/dev/login` signs you in and redirects
to the dashboard. Pass `?next=/some/path` to land somewhere else.

That route is still a real Better Auth `signInEmail` — it supplies the
credential rather than skipping the check — and it sits behind
`assertDevRouteAllowed`, so it 404s unless `import.meta.dev` or
`E2E_ALLOW_DEV_ROUTES` is on, and demands the `x-dev-route-secret` header on any
host that is not localhost. Leave both variables unset and nothing changes:
setup keeps minting a throwaway and the route answers 400.

`local:setup` refreshes the fixture users and sessions. If local data or auth is
stale, run the whole command again and then sign in again. Do not run an
individual seed or provisioning script as an alternate repair path.

## Dashboard URLs

Follow links rendered by the dashboard whenever possible. When constructing a
dashboard route, the URL segment named `siteSlug` contains the site's
**subdomain**, not the `sites.slug` database value.

| Tenant | Organization segment | Site segment (`subdomain`) |
| --- | --- | --- |
| Ember & Slice | `ember-slice-demo` | `demo` |
| Pottery House | `pottery-house-krabi` | `pottery-house` |
| Kikuzuki | `kikuzuki-krabi-thailand` | `kikuzuki-krabi-thailand` |
| NCLS | `north-carolina-legal-services` | `ncls` |

For example, Kikuzuki starts at:

```text
http://localhost:3000/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand
```

Using `kikuzuki` for the site segment returns 404 because the capability guard
resolves that segment against `sites.subdomain`.

## Before pushing

```sh
corepack yarn quality && corepack yarn test:unit && corepack yarn test:d1 && corepack yarn test:migrations && corepack yarn test:mcp
corepack yarn chatgpt:submission:check && corepack yarn lint:migrations && corepack yarn lint:schema-drift
```

That is every CI check that runs without a deployed environment. `test:unit`
alone is not enough: D1 and migration checks cover persistence behavior that
typecheck and unit tests cannot see.

Changing the MCP tool surface makes two generated artifacts stale. Regenerate
and commit both:

```sh
corepack yarn mcp:catalog:write
corepack yarn chatgpt:submission:write
```

`yarn install` normally runs `patch-package` through `postinstall`. If Yarn did
not rerun it after a dependency change, use:

```sh
corepack yarn patch-package --error-on-fail
```

## Isolated MCP verification

Set `PLAYWRIGHT_PORT` to an unused local port when another checkout is running,
for example `PLAYWRIGHT_PORT=3107 corepack yarn playwright test tests/e2e/mcp-owner-tools.spec.ts --workers=1`.
The standard local Worker preparation and worktree-local D1 storage remain in use.

The diagnostic `test:mcp:edit` script requires `--site-id`. The `test:mcp:image`
and `test:mcp:ops` scripts require both `--site-id` and `--location-id` for
explicit disposable fixtures provisioned through the approved setup/CMS path;
they no longer create business sites or locations through MCP.
