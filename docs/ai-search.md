# AI Search

KrabiClaw uses Cloudflare AI Search as the single retrieval backend for platform knowledge.

## Instance layout

- Namespace: `default`
- Environment isolation comes from `AI_SEARCH_INSTANCE_ID`:
  - production: `krabiclaw-platform-knowledge`
  - staging: `krabiclaw-platform-knowledge-staging`
  - preview: `krabiclaw-platform-knowledge-preview`

### Provisioning an instance

The instance is infrastructure and is created once, out of band — the application never
creates one at runtime. A rebuild against a missing instance fails and names it, which is
the intended outcome: it means the environment is not provisioned, not that a blog write
went wrong.

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/autorag/rags" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"id":"<AI_SEARCH_INSTANCE_ID>"}'
```

`ensurePlatformKnowledgeInstance()` then re-asserts the retrieval configuration
(`platformKnowledgeInstanceConfig()` in `server/utils/public-search.ts`) at the start of
every rebuild, so index method, fusion, tokenizer, and the custom metadata schema always
match the code that queries them.

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

Run the production rebuild with:

```bash
yarn ai-search:sync:prod
```

Required secret:

- `PLATFORM_SEARCH_REINDEX_SECRET`

The script calls:

- `POST /api/internal/search/reindex`

That endpoint rebuilds the full corpus from the current DB plus static platform metadata, clears the existing AI Search items, uploads the new documents, and waits for indexing to finish.

## Automatic refresh

Article writes through MCP trigger a rebuild after the mutation completes (`schedulePlatformKnowledgeIndexRebuild()` in `server/utils/platform-search-rebuild.ts`). Platform MCP blog/doc mutations do the same. Failures on this in-request path are logged with `console.error` (visible in Workers Logs); they do not retry automatically.

A rebuild only uploads items whose content or metadata actually changed. Each uploaded item
carries a `content_hash` in its metadata, and an item whose stored hash still matches what
the rebuild would send is left alone. A one-post edit therefore costs a handful of uploads
rather than the whole corpus — re-uploading every item on every blog write is what exhausted
AI Search's rate limit on preview (issue #917). Items whose indexing status is `error` are
re-uploaded regardless of their hash.

Production deploys and client imports that write articles directly do **not** go through that in-request hook, so production needs an explicit rebuild:

- Production AI Search synchronization is an explicit final operation inside the production branch deployment job. Its result is retained with the production release evidence; direct deploy commands cannot invoke it.
- Production CI (`.github/workflows/ci.yml`) syncs the `PLATFORM_SEARCH_REINDEX_SECRET` repo secret and runs a blocking "Rebuild AI Search index (production)" step. A failed production rebuild fails the deploy job instead of silently leaving production search stale.
- Preview deploys intentionally do not rebuild AI Search. Staging deploys do not rebuild AI Search; staging is read-only.

Any new script that writes articles or tenant blog fixtures directly (bypassing the dashboard/MCP write paths) must either call `POST /api/internal/search/reindex` itself or be followed by `yarn ai-search:sync` in whatever deploy/CI step runs it.

## Environment expectations

- AI Search is required infrastructure for local, preview, staging, and production.
- `wrangler.toml` must keep the `AI_SEARCH` namespace binding in every environment block.
- Local development should run with the normal Cloudflare dev environment and remote AI Search bindings available.
- Production should not be treated as healthy after indexed content changes until the AI Search rebuild has completed successfully.
