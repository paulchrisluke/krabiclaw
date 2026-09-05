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

## Signing in

After `local:setup`, start the app and use the URL, email, and password printed
under `Local developer sign-in`. Setup generates a fresh password on every run,
prints it once, and stores only its hash in local D1. No reusable local password
is recorded in the repository.

The account exists only in local D1. It is a platform admin and an owner in each
curated tenant organization, so it is the single manual sign-in for platform,
demo, Pottery House, Kikuzuki, and NCLS work. Better Auth handles the normal
email/password request and stores only the password hash; there is no auth
bypass, magic header, or cookie to paste.

`local:setup` refreshes the fixture users and sessions. If local data or auth is
stale, run the whole command again and then sign in again. Do not run an
individual seed or provisioning script as an alternate repair path.

Automated Playwright, preview, and public-tunnel gates generate or require their
own test secrets internally. Those are test inputs, not additional local
developer accounts. The public ChatGPT tunnel contract is documented separately
in [local-mcp-harness.md](local-mcp-harness.md).

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
corepack yarn chatgpt:submission:check && corepack yarn lint:migrations && corepack yarn lint:schema-drift && corepack yarn lint:seeds
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
