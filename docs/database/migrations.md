# Database Migrations

**Status: Contract**

`server/db/schema.ts` is the source of truth for every object supported by the
Drizzle SQLite schema DSL. Unsupported SQLite DDL may use the narrow custom
migration procedure below; the custom migration is the source of truth for that
DDL.

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

## Unsupported SQLite DDL

Use an official Drizzle custom migration only when the SQLite schema DSL cannot
represent a required invariant, such as a cross-row interval trigger:

1. Generate ordinary schema changes first and verify their SQL is clean.
2. Run `yarn drizzle-kit generate --custom --name <invariant-name>`.
3. Put only the unsupported DDL in that generated custom migration. Do not patch
   the ordinary generated migration or its metadata.
4. Include a fail-closed statement that validates all historical rows before the
   migration can be marked applied.
5. Rebuild D1 from the complete chain and prove the invariant through direct
   database writes.

Do not use a custom migration for tables, columns, indexes, foreign keys, or
checks that Drizzle can express in `schema.ts`.

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
