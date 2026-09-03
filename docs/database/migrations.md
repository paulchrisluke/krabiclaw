# Database Migrations

**Status: Contract**

`server/db/schema.ts` is the only schema source of truth.

Custom migrations are prohibited. If an LLM proposes, generates, or edits one,
stop and require human review. Do not commit or apply it.

## Normal schema change

1. Edit `schema.ts`.
2. Run `yarn db:generate`.
3. Inspect the generated migration.
4. If it contains ANY change not explained by the `schema.ts` diff:
   - STOP.
   - Delete the newly generated migration/meta output.
   - Do not edit generated SQL.
   - Do not edit `migrations/meta`.
   - Do not "correct" the migration manually.
   - Do not apply anything.
   - Diagnose why generation is not a clean diff.
5. Rebuild local D1 from the complete migration chain.
6. Run schema/invariant/foreign-key checks and `yarn lint:migrations`.
7. Deploy only through the PR/branch workflow.

## Preview

- Preview is disposable.
- When an in-flight migration changes after preview has applied it, reset the existing preview database in place using the repository command, replay the complete migration chain, and reseed.
- Never alter `d1_migrations` manually.
- Never patch preview schema manually.
- Never create a replacement preview database as a workaround.

## Shared environments

- Once staging or production has applied a migration, that migration and its generated metadata are immutable.
- Fix subsequent schema changes with a new `schema.ts` change and new generated migration.

## Database epochs

- Squashing/rebaselining is not a normal migration operation.
- It requires the explicit database-epoch procedure.
- Never rewrite migration history for an active D1 database resource.
