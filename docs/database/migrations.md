# Database Migrations

**Status: Contract**

`server/db/schema.ts` is the only schema source of truth. `migrations/` holds the
generated baseline and any generated migrations after it. Custom hand-written
migrations are prohibited; if an LLM proposes, generates, or edits one, stop and
require human review.

## What D1 can and cannot do

Cloudflare D1 enforces foreign keys on every statement and cannot turn them off.
`PRAGMA defer_foreign_keys` delays violation checks, but `ON DELETE CASCADE`
actions still run, and `PRAGMA legacy_alter_table` is ignored (verified against
local and remote D1). Two consequences shape this contract:

1. **A referenced parent table can never be rebuilt in place.** Dropping it
   cascades into every child; renaming it rewrites the children's foreign keys to
   the new name, so a replacement table cannot take the old name. Only leaf tables,
   or a family whose children are rebuilt in the same migration against the new
   parent (build beside, copy, drop leaf-first, rename last), can change shape.
2. **SQLite cannot alter a CHECK constraint.** A CHECK that lists a closed set of
   values (`status IN (...)`, `kind IN (...)`, `theme_id IN (...)`) turns every new
   value into a table rebuild, which on a parent table is impossible.

Therefore the schema keeps **structural** CHECKs (JSON shape, canonical instants,
cross-column rules) and does **not** encode closed value sets as CHECKs. Value
sets live in the registries under `shared/` and `utils/` and are enforced by the
application. Every remaining CHECK is written without a table qualifier so the
build-beside rebuild of a leaf family stays possible.

## Normal schema change

1. Start from current `staging`. Run `yarn install --immutable` and
   `yarn lint:schema-drift` **before editing `schema.ts`**. An unchanged schema
   must produce no migration or metadata change.
2. Edit `schema.ts`. Adding a value to a set is a registry change, not a schema change.
3. Run `yarn db:generate`.
4. Inspect the generated migration. If it contains ANY change not explained by
   the `schema.ts` diff, stop, delete the generated output, and diagnose the
   generator. Never edit generated SQL or `migrations/meta`.
5. Run `yarn lint:migrations`. It replays the chain in SQLite and refuses a
   `DROP TABLE` of a parent that surviving tables still reference.
6. Rebuild local D1 from the chain (`yarn schema:local` on a fresh state, then
   `yarn db:pull:local`), run `yarn test:d1` and `yarn lint:schema-drift`.
7. Deploy only through the PR/branch workflow. CI applies migrations **before**
   each deploy, so every migration must be backward compatible with the Worker
   already running: the old Worker serves against the new schema for the length
   of the deploy. A contraction — dropping a column or constraint something still
   reads — ships a release after the code that stopped reading it. Never both in
   one release.

   Deploying first would leave a window of new code against old schema, which is
   the direction that breaks: a Worker reading a column its migration has not
   created yet fails every request until the migration lands. It also leaves that
   code live if the migration fails, where migrating first aborts before anything
   deploys.

## Rebaseline

When a change needs a parent-table rebuild (a constraint change on `sites`,
`organization`, `content_documents` and the like), the schema is rebaselined:

1. Regenerate `migrations/` from scratch: delete the directory, run
   `yarn db:generate --name baseline`. Archive the previous baseline under
   `migrations-archive/<epoch>/` so the transfer test has its source shape.
2. Put every data transform the new shape needs into
   `scripts/rebaseline-data.mjs` (`TRANSFORMS`) and its invariants
   (`TARGET_INVARIANT_QUERIES`). The script copies an export into a database
   built from the new baseline, runs the transforms, audits foreign keys,
   integrity and invariants, and writes the data-only payload. Retired tables
   and columns are dropped and named in the manifest.
3. Prove it: `yarn test:migrations` (fixture from the archived baseline) and a
   rehearsal against a private production export.
4. Preview and local are rebuilt by `yarn db:pull:local` / `yarn db:pull:preview`,
   which already run the transfer script.
5. The live database is not frozen for this. Prepare the new database ahead of
   time (create it, `wrangler d1 migrations apply`, rehearse a load). At cutover:
   export live, run the transfer, `node scripts/reset-d1.mjs --config <binding>
   --apply --confirm <id>`, load the payload, verify with
   `node scripts/verify-d1-payload.mjs <target.sqlite> --config <binding>`, deploy
   the candidate on the new binding, then check the old database for rows created
   after the export timestamp and copy them. Total: minutes, no downtime. CI must
   be green on the candidate before the export starts. 

Squashing is not a routine operation: it needs the prepared database and the
verified transfer above. Never rewrite the migration ledger of a live database
by hand.

## Generator and guard maintenance

Drizzle Kit is pinned. `patches/drizzle-kit+0.31.10.patch` normalizes boolean
defaults in the SQLite comparison representation only. The drift guard imports
the canonical Drizzle config, uses a relative temporary output path, rejects
stderr, requires an explicit no-change result, and checks that every committed
migration byte is unchanged. When changing the generator, its patch, or these
guards, run `yarn test:migrations` as well as the normal checks.

## Preview

- Preview is disposable. `yarn db:reset:preview` drops every application object
  and replays the chain; `yarn db:pull:preview` reseeds it from production
  through the transfer script.
- Never alter `d1_migrations` manually and never patch preview schema by hand.
