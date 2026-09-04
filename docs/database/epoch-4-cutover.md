# Database epoch 4 Product category cutover

**Status: Release candidate runbook**
**Issue:** #788 (Products)

Epoch 4 provisions new preview, staging, and production D1 resources and begins
from `migrations/0000_epoch_4_baseline.sql`. The baseline must never be applied
to an Epoch 3 resource. The Epoch 3 production D1 remains untouched rollback
state until post-production verification is complete and it is explicitly
retired.

Normal schema work still follows [migrations.md](migrations.md). This document is
the exceptional database-epoch procedure authorized for the Product category
model change.

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

## The customer-visible invariant

Category order follows each category's **first appearance in the location's
existing flat order**, which is exactly what the public collection page renders
today. Product order restarts densely inside each category, preserving relative
order.

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
assigned a category from another location or site, a destination column that
requires a transformation it does not have, or any foreign-key violation.

`verify` proves:

- Product count is unchanged;
- Product content outside the category columns is unchanged, by logical hash;
- the rendered order is identical, position by position;
- every Product resolves to a category;
- no Product references a category from another location, site, or product type;
- every category's Product order is dense and zero-based;
- `PRAGMA foreign_key_check` is empty.

`transform` refuses to run against a source that has already been transformed,
because an Epoch 4 source has no `products.category` column to map from.

## Preview

1. Create a new APAC preview D1 and record its name and ID in the release evidence.
2. Apply only the Epoch 4 baseline through `wrangler d1 migrations apply`; never
   edit `d1_migrations`.
3. Transform the approved Epoch 3 preview export locally, import it into the
   empty candidate, and run the verifier against the imported candidate export.
4. Bind only the preview Worker configuration to the new preview D1.
5. Open the CMS Products hub and one category, and the public collection page for
   Kikuzuki. Confirm the sections and their order match the pre-cutover site.

## Staging

Repeat the preview sequence against a new staging D1. Staging validation is
read-only apart from the import itself.

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
