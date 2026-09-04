# Local development

**Status: Contract**

The whole local loop is four commands. If something here does not work, fix this
document or the scripts it names — do not invent a second way in.

```sh
yarn install
yarn schema:local   # apply the migration chain to a local D1
yarn seed:local     # load the demo, Kikuzuki, Pottery House, and NCLS fixtures
yarn dev            # http://localhost:3000
```

## Signing in

```sh
yarn dev:login
```

It provisions Better Auth credential accounts for every seeded fixture user and
prints the login URL, email, and password. Sign in at that URL like a normal
user. There is no dev bypass, no magic header, and no cookie to paste.

The password comes from `E2E_TEST_PASSWORD` when that is set, and is otherwise
generated per run and printed. The same script provisions preview
(`--preview`), so local and CI sign in through one code path.

Re-run `yarn dev:login` after `yarn seed:local` or any local database rebuild:
both replace the `user` rows, which drops the credentials and every session
with them.

### Dashboard URLs

The dashboard's `siteSlug` route parameter matches the site's **subdomain**,
not its `slug`. For Kikuzuki that is `kikuzuki-krabi-thailand`, not `kikuzuki`:

```
/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand/locations/kikuzuki-japanese-robatayaki-izakaya/products
```

A mismatched `siteSlug` resolves no site and the capability guard in
`middleware/dashboard.global.ts` returns a 404 rather than an error naming the
cause, so a 404 on a dashboard route is usually this and not a missing page.

## Rebuilding the database

```sh
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite*
yarn schema:local && yarn seed:local && yarn dev:login
```

Local D1 is disposable. Never hand-edit it to work around an application bug —
see [operations/release-and-outage-prevention.md](operations/release-and-outage-prevention.md).

## Which credential belongs to which job

Three separate things exist. They are not interchangeable, and only the first is
part of ordinary local development:

| Purpose | Command | Environment |
| --- | --- | --- |
| Sign in to the local dashboard | `yarn dev:login` | `E2E_TEST_PASSWORD` (optional) |
| Playwright end-to-end runs | `yarn e2e:local:prepare` | `E2E_TEST_PASSWORD` |
| The real ChatGPT MCP gate | `yarn test:mcp:chatgpt` | `LOCAL_MCP_TEST_EMAIL`, `LOCAL_MCP_TEST_PASSWORD` |

The MCP row needs its own account because a human completes OAuth and consent in
a real ChatGPT session against it — see
[local-mcp-harness.md](local-mcp-harness.md). Ordinary dashboard work does not
need it, and leaving those two variables empty is normal.
