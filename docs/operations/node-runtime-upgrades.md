# Node Runtime Upgrades

Node is part of the deployed build contract. A Node upgrade is not complete
when the application starts locally; the same exact runtime must build, test,
and package the generated Cloudflare Worker locally and in every CI lane.

## Version sources

`.nvmrc` declares the exact repository runtime. Keep these consumers aligned in
the same change:

- `.nvmrc` — exact local and release runtime;
- `package.json` `engines.node` — must admit the exact `.nvmrc` version;
- `package.json` `@types/node` — use the runtime major unless a documented
  dependency constraint requires a different type major;
- every `actions/setup-node` step in `.github/workflows/`;
- README local-setup guidance;
- any container, deployment, or automation configuration discovered with
  `rg -n "node-version|NODE_VERSION|\.nvmrc" .github .`.

Do not update only the developer shell or only GitHub Actions. Do not change
Nuxt, Nitro, Wrangler, TypeScript, or other framework versions merely to bundle
them with a Node upgrade; those require their own demonstrated reason.

## Upgrade procedure

1. Pick one exact stable Node release supported by the current Nuxt/Nitro,
   Wrangler, package-manager, and native dependency versions.
2. Update every version source above in one commit. If dependency metadata or
   native packages change, regenerate `yarn.lock`; otherwise keep the existing
   frozen lockfile.
3. Start a fresh shell and prove the active runtime before installing or
   testing:

   ```bash
   node -v
   printf 'expected v%s\n' "$(tr -d '\n' < .nvmrc)"
   yarn --version
   ```

   The two Node versions must match exactly. A convenient system Node or a
   bundled agent runtime at a different version is not equivalent evidence.
4. Install with `yarn install --frozen-lockfile` and run:

   ```bash
   yarn quality
   yarn test:unit
   yarn build
   yarn test:e2e:local
   npx wrangler deploy --dry-run --strict
   npx wrangler deploy --env preview --dry-run --strict
   npx wrangler deploy --env staging --dry-run --strict
   ```

5. Inspect the production build and dry-run output for the generated entrypoint
   `.output/server/index.mjs`, named Durable Object exports, native `fetch`,
   `scheduled`, and `queue` handlers, and a compressed Worker below Cloudflare's
   account limit.
6. Open a ready pull request to `staging`. The deployed preview must pass its
   full selected coverage on the exact PR head; a local pass alone is not enough.
7. After merge, require the exact staging deployment and browser lane to pass.
   The updated `staging` to `main` PR must then pass the complete exact-head
   release qualification before production promotion.

## Failure handling

Read the first real failing step and reproduce that operation with the exact
new Node version. Do not compensate by increasing browser timeouts, suppressing
console or hydration failures, weakening assertions, changing framework
versions, or restoring compatibility launch paths. If the upgrade itself is
incompatible, keep the previous known-good Node version and resolve the
dependency constraint separately.
