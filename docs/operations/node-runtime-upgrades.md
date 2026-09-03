# Node Runtime Upgrades

Node is part of the deployed build contract. A Node upgrade is not complete
when the application starts locally; the same exact runtime must build, test,
and package the generated Cloudflare Worker locally and in every CI lane.

## Version sources

`.nvmrc` declares the exact repository runtime. Keep these consumers aligned in
the same change:

- `.nvmrc`: exact local and release runtime;
- both `package.json` files: `engines.node` must equal the exact `.nvmrc`
  version and `packageManager` must keep the integrity-pinned Yarn release;
- `package.json` `@types/node`: use the runtime major unless a documented
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
   corepack yarn --version
   ```

   The two Node versions must match exactly. A convenient system Node or a
   bundled agent runtime at a different version is not equivalent evidence.
4. Enable Corepack, install both package graphs immutably, and run:

   ```bash
   corepack enable
   corepack yarn install --immutable
   corepack yarn --cwd workers/email-inbound install --immutable
   corepack yarn quality
   corepack yarn test:unit
   corepack yarn build
   corepack yarn test:e2e:local
   corepack yarn wrangler deploy --dry-run --strict
   corepack yarn wrangler deploy --env preview --dry-run --strict
   corepack yarn wrangler deploy --env staging --dry-run --strict
   ```

   Node 25 and later do not bundle Corepack. Add and pin a separate Corepack
   bootstrap before widening `engines.node` beyond Node 24.

5. Inspect the production build and dry-run output for the generated entrypoint
   `.output/server/index.mjs`, named Durable Object exports, native `fetch`,
   `scheduled`, and `queue` handlers, and a compressed Worker below Cloudflare's
   account limit.
6. Open a ready pull request to `staging`. The deployed preview must pass its
   full selected coverage on the exact PR head; a local pass alone is not enough.
7. After merge, require the exact staging deployment and complete browser
   qualification to pass. The updated `staging` to `main` PR reuses those
   exact-head checks before production promotion.

## Failure handling

Read the first real failing step and reproduce that operation with the exact
new Node version. Do not compensate by increasing browser timeouts, suppressing
console or hydration failures, weakening assertions, changing framework
versions, or restoring compatibility launch paths. If the upgrade itself is
incompatible, keep the previous known-good Node version and resolve the
dependency constraint separately.
