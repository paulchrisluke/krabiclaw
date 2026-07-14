# AI Search

KrabiClaw uses Cloudflare AI Search as the single retrieval backend for platform knowledge.

## Instance layout

- Namespace: `default`
- Environment isolation comes from `AI_SEARCH_INSTANCE_ID`:
  - production: `krabiclaw-platform-knowledge`
  - staging: `krabiclaw-platform-knowledge-staging`
  - preview: `krabiclaw-platform-knowledge-preview`

KrabiClaw uses the native `AI_SEARCH` Workers namespace binding as the canonical runtime path for instance management, item indexing, and search queries against the environment-specific instance in the built-in `default` namespace.

## Indexed corpus

The platform knowledge index contains:

- published platform docs
- published platform blog posts
- public help FAQs and route guidance
- public platform pages such as home, pricing, features, and templates
- authenticated dashboard destinations used by command search

Canonical metadata lives in [config/platform-knowledge.ts](../config/platform-knowledge.ts). Retrieval and rebuild logic live in [server/utils/public-search.ts](../server/utils/public-search.ts).

## Rebuild flow

Run a full rebuild with:

```bash
yarn ai-search:sync --base-url https://staging.krabiclaw.com
```

Required secret:

- `PLATFORM_SEARCH_REINDEX_SECRET`

The script calls:

- `POST /api/internal/search/reindex`

That endpoint rebuilds the full corpus from the current DB plus static platform metadata, clears the existing AI Search items, uploads the new documents, and waits for indexing to finish.

## Automatic refresh

Platform doc and platform blog admin writes trigger a full AI Search rebuild after the content mutation completes (`schedulePlatformKnowledgeIndexRebuild()` in `server/utils/platform-search-rebuild.ts`). Platform MCP blog/doc mutations do the same. Failures on this in-request path are logged with `console.error` (visible in Workers Logs); they do not retry automatically.

Deploys and tenant client imports that write `blog_posts` directly do **not** go through that in-request hook, so they need an explicit rebuild:

- `yarn deploy`, `yarn deploy:staging`, and `yarn deploy:preview` (`package.json`) each run `yarn ai-search:sync:<env>` as their last step.
- CI (`.github/workflows/ci.yml`) runs a dedicated "Rebuild AI Search index (preview|staging|production)" step after every preview/staging/prod deploy, using a `PLATFORM_SEARCH_REINDEX_SECRET_PREVIEW` / `_STAGING` / (unsuffixed for prod) repo secret synced to the Worker just before it. This step has no `continue-on-error` — a failed rebuild fails the job instead of silently leaving that environment's search stale.
- `scripts/generate-ncls-blawby-seed.mjs` (the NCLS/Blawby tenant blog fixture, which inserts into `blog_posts` directly) also makes a best-effort reindex call after a successful `--preview` apply, so running it by hand doesn't leave the fixture unindexed even before CI's own rebuild step runs.

Any new script that writes `blog_posts`, `platform_docs`, or NCLS/Blawby-style tenant blog fixtures directly (bypassing the admin/MCP write paths) must either call `POST /api/internal/search/reindex` itself or be followed by `yarn ai-search:sync` in whatever deploy/CI step runs it.

## Environment expectations

- AI Search is required infrastructure for local, preview, staging, and production.
- `wrangler.toml` must keep the `AI_SEARCH` namespace binding in every environment block.
- Local development should run with the normal Cloudflare dev environment and remote AI Search bindings available.
- An environment should not be treated as healthy after content changes until the AI Search rebuild has completed successfully.
