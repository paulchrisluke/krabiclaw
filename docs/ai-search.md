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

Platform doc and platform blog admin writes trigger a full AI Search rebuild after the content mutation completes. Platform MCP blog/doc mutations do the same.

## Environment expectations

- AI Search is required infrastructure for local, preview, staging, and production.
- `wrangler.toml` must keep the `AI_SEARCH` namespace binding in every environment block.
- Local development should run with the normal Cloudflare dev environment and remote AI Search bindings available.
- An environment should not be treated as healthy after content changes until the AI Search rebuild has completed successfully.
