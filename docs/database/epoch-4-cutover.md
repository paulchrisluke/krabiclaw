# Database epoch 4 cutover

**Status: Release candidate runbook**
**Issues:** #788 (Products), #820 (messaging and CMS schema correction)

Epoch 4 provisions a new production D1 resource, rebuilds the standalone
staging qualification database as the unreleased schema changes, resets
disposable preview in place, and begins
from `migrations/0000_epoch_4_baseline.sql`. The baseline must never be applied
to an Epoch 3 resource. The Epoch 3 production D1 remains untouched rollback
state until post-production verification is complete and it is explicitly
retired.

Normal schema work still follows [migrations.md](migrations.md). This document is
the exceptional database-epoch procedure for the Product category model and the
final pre-production Epoch 4 schema correction.

## Why this is an epoch and not a migration

A category stops being a string on every Product and becomes a record.
`products.category` is dropped and replaced by a `category_id` foreign key that
is `NOT NULL`.

Neither half can be done by a generated migration on a live resource:

- SQLite cannot add a `NOT NULL` column with no default to a populated table.
- Dropping `products.category` rebuilds `products`, and
  [release-and-outage-prevention.md](../operations/release-and-outage-prevention.md)
  prohibits rebuilding a referenced parent table with `DROP TABLE`. `products`
  is referenced by `reviews`, `prices`, and two composite foreign keys.

Creating the new schema from a baseline and loading transformed data avoids both.
The same corrected baseline removes the superseded messaging tables and
duplicate fact columns audited in #820, plus the approved dead CMS fields. No
historical inbox or notification rows are backfilled.

## Canonical ownership after cutover

- `product_categories` owns category identity, display name, slug, and order.
  There is no category string on `products` and no derived category anywhere.
- `products.sort_order` orders Products **within one category**. It is dense and
  zero-based per category. It is no longer a location-wide stream, and category
  order is no longer implied by contiguous runs in it.
- Categories are scoped by `product_type`. The single `Experiences` category at a
  location never appears in the menu sections the CMS manages.
- Category names are localized once on the category row
  (`resource_localizations` type `product_category`), not once per Product.
- `availability_overrides` owns manual availability for both reservations and
  experiences. Its owner discriminator requires exactly one location or
  experience. The split legacy override tables do not exist in Epoch 4.
- An `open` or `closed` override is a tenant decision. A slot that is full from
  bookings is derived runtime state and does not rewrite that decision.
- `tenant_page_variants` owns each page's localized title, path, summary, SEO,
  and document. `tenant_pages` retains only identity, scope, configuration,
  provenance, and audit fields. Its unused legacy slug is discarded, not used
  to rewrite any variant route.
- The unused `platform_content` store and editor are removed. Platform docs,
  their documents and blocks, media, and redirects remain unchanged.

## The customer-visible invariant

Category order follows each category's **first visible appearance in the location's
existing flat order**, which is exactly what the public collection page renders
today. Hidden-only sections follow the visible sections. Product order restarts densely
inside each category, preserving relative order for both visible and hidden Products.

A correct cutover therefore changes nothing a customer sees: the same sections
in the same order, containing the same items in the same order. The verifier
asserts this directly by rendering both databases and comparing.

## Repeatable local proof

The frozen Epoch 3 export is authoritative. Operator exports and transformed
databases stay outside Git.

```sh
yarn lint:migrations
yarn lint:schema-drift
yarn test:unit
node scripts/epoch4-data.mjs transform /absolute/path/epoch3.sqlite /absolute/path/epoch4.sqlite
node scripts/epoch4-data.mjs verify    /absolute/path/epoch3.sqlite /absolute/path/epoch4.sqlite
```

`transform` refuses to overwrite its output and writes
`<epoch4.sqlite>.manifest.json`. It fails on a Product it cannot map, a Product
assigned a category from another location or site, any unexpected source/destination table or column, any unmapped legacy Product
category translation, or any foreign-key violation.

`verify` proves:

- The application table and column census changes only as declared;
- every unrelated application table retains its row count and typed logical
  hash, including Prices, Better Auth identity/session state, bookings, media,
  and every retained Product content, SEO, metadata, and audit field;
- booking policy, experience, tenant page, post, availability, and social-channel rows preserve every
  retained field through explicit projections;
- every tenant page has a source-locale variant whose presentation fields match
  the removed parent copies, all variant rows retain their logical hashes, and
  `platform_content` is empty before it can be discarded;
- the invalid legacy offer with neither coupon nor terms becomes `standard`,
  and social provider IDs move from `posts.google_post_id` to
  `post_channel_jobs.provider_post_id`;
- historical thread, entry, delivery, notification, and read rows remain empty
  in the target, with discarded source counts recorded in the manifest;
- every reservation and experience override appears once in the consolidated
  table with the same identity, scope, date, time, decision, capacity, note,
  and audit fields, with its count and logical hash recorded in the manifest;
- Product category membership, category scope/name/slug/order, and the relative
  order of all Products match the planned transformation;
- the customer-visible rendered order is identical, excluding hidden Products;
- every Product resolves to a category;
- no Product references a category from another location, site, or product type;
- every category's Product order is dense and zero-based;
- `PRAGMA foreign_key_check` is empty.

Both commands accept SQLite files or full Wrangler SQL exports. Verification
writes `<target>.verification.json` with per-table counts and logical hashes.
Wrangler/Cloudflare internal tables are excluded: migration history belongs to
the new resource and must never be copied from Epoch 3.

`transform` refuses to run against a source that has already been transformed,
because an Epoch 4 source has no `products.category` column to map from.

## Preview is reset, not reprovisioned

Preview does not get a new D1 resource. It is reset in place:

```sh
yarn db:reset:preview   # drops application objects, replays the chain, reseeds
```

The rule that a baseline must never be applied to a prior-epoch resource exists
to protect production rollback state. Preview holds fixtures, is rebuilt from
seeds on demand,
and is declared disposable in [migrations.md](migrations.md) — there is nothing
to roll back to and nothing to protect. Reprovisioning it every epoch would
strand resources and force a binding change for no benefit.

The standalone staging database qualifies an unreleased epoch and may be reset
or replaced while that epoch is still under review. Preview and staging are not
production rollback state.

After the reset, the preview database is structurally a fresh Epoch 4 database.
There is no Epoch 3 data to transform, because preview data comes from seeds.

Then open the CMS Products hub and one category, and the public collection page
for Kikuzuki. Confirm the sections and their order match the pre-cutover site.

## Staging

Staging is a standalone qualification database, not production rollback state.
While Epoch 4 remains unreleased, reset the bound staging resource or provision
a replacement APAC staging D1, then apply the corrected committed baseline with
`wrangler d1 migrations apply DB --env staging --remote`. Recreate staging data
through the canonical staging provisioning path. Do not transform or preserve a
superseded staging candidate merely because an earlier Epoch 4 baseline was
applied to it, and never edit `d1_migrations` or patch its schema in place.

Before a reset or replacement, verify the exact Worker binding and database ID,
confirm production still points to the retained Epoch 3 database, and retain no
claim that staging data is customer rollback state. If a replacement resource is
used, commit its verified staging binding before merging the feature PR.

For a verified local candidate, SQLite's standard data-only export provides the
import payload without schema or migration-history writes:

```sh
sqlite3 /absolute/path/epoch4.sqlite '.dump --data-only --nosys --newlines' > /absolute/path/epoch4-data.sql
```

Wrap that payload with `PRAGMA foreign_keys = OFF;` and
`PRAGMA foreign_keys = ON;`. This applies only to the empty candidate's bulk
import through `wrangler d1 execute --remote --file`, which runs outside one SQL
transaction and rolls back failed imports using a saved bookmark. Transaction-
scoped `defer_foreign_keys` is insufficient for this path; see the
[Cloudflare maintainer's import explanation](https://github.com/cloudflare/workers-sdk/discussions/13499).
The `--newlines` option avoids SQLite's newer `unistr()` dump expressions,
which D1 does not support. A fresh export must pass full logical parity and
`foreign_key_check` before the candidate can be bound.

The production transformer creates no `d1_migrations` table. Apply the committed
baseline through Wrangler first; never import schema or prior-resource migration
history. Confirm the production candidate has zero application rows before
importing. After the import, export the complete destination with
`wrangler d1 export` and verify that export against the source.

Commit the verified staging binding before merging the feature PR. The ordinary
staging deployment then finds its baseline already applied. Staging validation
is read-only apart from the import itself.

Prepared resources (the old resources remain available for rollback):

| Environment | Epoch 4 D1 | Retained Epoch 3 D1 |
| --- | --- | --- |
| Staging | Rebuild the verified standalone Epoch 4 resource before merge | Not production rollback state |
| Production | `73d8e172-b7a0-45b3-b200-ae052de52e57` | `4a02e2ec-6fb0-4bed-96ab-925ec1e508df` |

The production binding in the candidate configuration does not change the running
Worker. Keep the new production database empty apart from its Wrangler baseline
until the final frozen export has been transformed and verified.

## Production

Production cutover follows the database-epoch write freeze in
[release-and-outage-prevention.md](../operations/release-and-outage-prevention.md):

1. Deploy the exact release candidate once with the Epoch 3 production binding
   and `DB_WRITE_FROZEN = "true"`.
2. Wait at least 60 seconds for requests already running on the prior Worker
   version to drain before taking the final export.
3. Transform and verify the final export. Do not proceed on any verifier failure.
4. Import into the new production D1 and re-run the verifier against a fresh
   export of it.
5. Deploy `main` bound to the new D1 with the flag omitted, which restores HTTP,
   queue, and cron processing.
6. Re-open the affected customer journeys: Kikuzuki menu and items first, then
   Pottery House and NCLS collection pages.

If cutover cannot finish promptly, restore the prior Worker version rather than
allowing queued messages to exhaust their retry limit.

The Epoch 3 production resource is retained for rollback and is not retired by
this release.
