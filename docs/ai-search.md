# AI Search

Krabiclaw uses Cloudflare AI Search as the single retrieval backend for platform knowledge.

## Instance layout

- Namespace: `default`
- Environment isolation comes from `AI_SEARCH_INSTANCE_ID`:
  - production: `krabiclaw-platform-knowledge`
  - staging: `krabiclaw-platform-knowledge-staging`
  - ordinary local development: `krabiclaw-platform-knowledge-preview`
  - local E2E: a dedicated, explicitly provisioned instance named by
    `PLAYWRIGHT_AI_SEARCH_INSTANCE_ID`
  - CI E2E: `krabiclaw-e2e-<run ID>-<attempt>`, created and deleted by that run

### Provisioning an instance

The instance is infrastructure and is created once, out of band — the application never
creates one at runtime. A rebuild against a missing instance fails and names it, which is
the intended outcome: it means the environment is not provisioned, not that a blog write
went wrong.

```bash
yarn wrangler ai-search create <AI_SEARCH_INSTANCE_ID> --namespace default --type builtin
```

`ensurePlatformKnowledgeInstance()` then re-asserts the retrieval configuration
(`platformKnowledgeInstanceConfig()` in `server/utils/public-search.ts`) at the start of
every rebuild, so index method, fusion, tokenizer, and the custom metadata schema always
match the code that queries them.

Krabiclaw uses the native `AI_SEARCH` Workers namespace binding as the canonical runtime path for instance management, item indexing, and search queries against the environment-specific instance in the built-in `default` namespace.

## Indexed corpus

One instance holds two kinds of document, told apart by metadata:

- The platform's own corpus, with no `organization_id`: published platform docs and blog posts,
  the help FAQ, and the public platform pages (home, pricing, features, templates).
  Canonical metadata lives in [config/platform-knowledge.ts](../config/platform-knowledge.ts).
- Each business's slice, carrying its `organization_id`: its published blog (the `tenant_blog`
  surface, read by its public site) and every record its dashboard can open — locations,
  products and collections, Q&A, posts, pages, articles including drafts, guest threads,
  members and media (the `dashboard` surface). `buildWorkspaceDocuments()` in
  [server/utils/public-search.ts](../server/utils/public-search.ts) builds these; each
  document carries the dashboard URL it opens at.

The dashboard's command palette reads `/api/dashboard/search`, which checks the member's
access to the organization and filters the query to `surface = dashboard` and
`organization_id IN (<that organization>, '')`, so a business sees its own records and the platform's
guides and nothing else. Navigation rows in the palette come from the Menu's own
navigation, not the index.

## Keeping a business's slice current

Every write to a site's data queues a "this site changed" row
(`publicResourceCacheInvalidationQuery`, table `public_resource_cache_invalidations`) in the
write's own batch: content documents, products and collections, locations, media, guest
threads at intake, and Better Auth's member hooks. The drainer
(`drainPublicResourceCacheInvalidations`) clears the site's caches and runs
`syncOrganizationSearchIndex()`, which lists the site's own items by its hashed
organization key segment, rebuilds its documents from D1, uploads the ones whose
`content_hash` changed and deletes the ones that are gone. Dashboard editor responses
and mutating MCP tool calls await the scoped drain before reporting success. The scheduled task also drains queued work every two minutes. A failed
drain is reported to the caller and retained for reconciliation. A write therefore costs
one list of the site's items plus one upload per changed record; Cloudflare indexes the upload asynchronously, usually within seconds.

## Rebuild flow

Run the production rebuild with:

```bash
yarn ai-search:sync:prod
```

Required secret:

- `PLATFORM_SEARCH_REINDEX_SECRET`

The script calls `POST /api/internal/search/reindex` for the platform corpus, then
for each returned organization with `?organization=<id>`. Each request performs a bounded
batch; the script repeats that pass until its reported pending count reaches zero.

To initialize or reconcile one explicitly named organization's slice against the
Worker serving the corresponding D1 snapshot, use the same command with its internal ID:

```bash
yarn ai-search:sync --base-url http://localhost:3107 --organization org-demo
```

This calls only `?organization=org-demo`; it does not rebuild the platform or other
businesses. Use a dedicated AI Search instance for each concurrently different D1 snapshot.

Staging and production CI (`.github/workflows/ci.yml`) sync the
`PLATFORM_SEARCH_REINDEX_SECRET` repository secret and run a blocking rebuild when a file
that defines the indexed corpus or its rendering changes. A failed rebuild fails the
deploy job. Local and CI E2E runs use dedicated instances corresponding to their D1
snapshots. Initialize the organizations a test writes through the scoped command
when that instance is new; the browser suite does not rebuild every tenant first.

## Environment expectations

- AI Search is required infrastructure for local, preview, staging, and production.
- A local E2E index belongs to one D1 snapshot; concurrent runs with different
  snapshots must use different instances.
- `wrangler.toml` must keep the `AI_SEARCH` namespace binding in every environment block.
- Local development should run with the normal Cloudflare dev environment and remote AI Search bindings available.
- Production should not be treated as healthy after indexed content changes until the AI Search rebuild has completed successfully.
