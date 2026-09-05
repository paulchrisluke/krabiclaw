# Database Migrations

**Status: Contract**

`server/db/schema.ts` is the only schema source of truth.

Custom migrations are prohibited. If an LLM proposes, generates, or edits one,
stop and require human review. Do not commit or apply it.

## Normal schema change

1. Start from current `staging` with the repository-pinned Node and Yarn versions.
   Run `yarn install --immutable` and `yarn lint:schema-drift` **before editing
   `schema.ts`**. An unchanged schema must produce no migration or metadata change.
   If this fails, fix generation separately before adding the intended schema change.
2. Edit `schema.ts`.
3. Run `yarn db:generate`.
4. Inspect the generated migration. If it contains ANY change not explained by
   the `schema.ts` diff:
   - STOP.
   - Delete the newly generated migration/meta output.
   - Do not edit generated SQL.
   - Do not edit `migrations/meta`.
   - Do not "correct" the migration manually.
   - Do not apply anything.
   - Diagnose why generation is not a clean diff.
5. Run `yarn lint:migrations` before applying the generated SQL. Referenced parent
   tables must never be rebuilt using `DROP TABLE`, including when Drizzle emits
   `PRAGMA foreign_keys=OFF`. A generated migration is not automatically safe.
6. Rebuild local D1 from the complete migration chain.
7. Run schema/invariant/foreign-key checks and `yarn lint:schema-drift` again.
8. Deploy only through the PR/branch workflow.

## Generator and guard maintenance

Epoch 2 and Epoch 3 were explicit cutovers to new D1 resources, not a repeatable
way to repair a generator diff. The committed Epoch 3 SQL and snapshots remain
immutable. Do not regenerate a baseline, rewrite a snapshot, remove a journal
entry, cast away schema types, or revert Better Auth boolean mapping to silence
an unexpected diff.

Drizzle Kit 0.31.10 compares SQLite integer defaults `0`/`1` and boolean defaults
`false`/`true` as different JSON values even though their database behavior is
equivalent. The existing `patch-package --error-on-fail` install step applies
`patches/drizzle-kit+0.31.10.patch` to normalize boolean defaults **only in the
SQLite comparison representation**. It does not rewrite stored snapshots,
generated metadata, application schema, or runtime boolean mapping. The exact
Kit version is pinned so a dependency update cannot silently change this behavior.
If this checkout was installed before a dependency patch changed, run
`yarn rebuild nuxt-app` after the immutable install to rerun the existing
postinstall step; Yarn may otherwise reuse its cached workspace build. Then
repeat the no-change preflight. Likewise, after pulling a lockfile update,
reinstall before treating SDK type errors as source-contract failures.
An SQL expression such as `sql\`0\`` is a string in snapshot metadata; matching the
printed SQL alone does not establish that two snapshots have the same representation.

The drift guard imports the canonical Drizzle config, uses a relative temporary
output path, and removes all temporary output. Kit 0.31.10 mishandles absolute
snapshot paths and can print an error while exiting zero. Therefore a successful
exit code alone is insufficient: the guard rejects stderr, requires an explicit
no-change result, and checks that every copied migration/metadata byte is unchanged.

Migration lint replays the chain only in an empty, in-memory SQLite database. It
uses SQLite's parser and authorizer to reject a parent-table drop before execution
when foreign keys still reference it. This is a structural safeguard, not a
substitute for local D1 validation with existing data and `foreign_key_check`.

When changing the generator, its dependency patch, or these guards, run
`yarn test:migrations` as well as the normal checks. The retained tests exercise
the real CLI/API: unchanged boolean mapping, a genuine additive change, generator
errors that exit zero, an unsafe parent rebuild, and a permissible unreferenced
table removal. Remove the dependency patch only when an upstream replacement
passes these checks against the unchanged committed history. Do not bypass the
guards or change expected history to make an upgrade pass.

## Preview

- Preview is disposable. It is reset in place for an ordinary migration change
  and for a database epoch. Production epochs require a new resource to retain
  rollback state; standalone staging may be reset or reprovisioned while the
  epoch remains unreleased.
- When an in-flight migration changes after preview has applied it, reset the existing preview database in place using the repository command, replay the complete migration chain, and reseed.
- Never alter `d1_migrations` manually.
- Never patch preview schema manually.
- Never create a replacement preview database as a workaround.

## Shared environments

- Production migration history is immutable after cutover. Fix later production
  schema changes with a new `schema.ts` change and a new generated migration.
- Staging is a standalone qualification database. While a database epoch is
  unreleased and production still runs the prior epoch, staging may be reset or
  reprovisioned from the corrected generated baseline. An earlier staging apply
  does not force another epoch.
- Once an epoch reaches production, its baseline and generated metadata are
  immutable in both the repository and every retained environment.
- Never preserve staging data by copying it into production. Recreate required
  staging fixtures through the canonical seed and provisioning commands.

## Database epochs

- Squashing/rebaselining is not a normal migration operation.
- It requires the explicit database-epoch procedure.
- Never rewrite migration history for a production or rollback D1 resource.
  During an unreleased epoch, rebuild the standalone staging resource instead
  of mutating its migration ledger.
