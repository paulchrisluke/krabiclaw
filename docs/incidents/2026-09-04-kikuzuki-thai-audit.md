# Kikuzuki Thai production audit — issue #807

Investigated 2026-09-04 using the public production browser, public APIs,
SELECT-only production D1 queries, deployed-branch source, and GitHub history.
This is an investigation and proposed completion plan. No production content,
configuration, schema, or application code was changed.

Thai is not working for Kikuzuki. Its language license is active, but the
platform Thai catalog is stale and the tenant has no stored resource
translations or Thai page variants. These are independent blockers.

## Verified production state

| Check | Observed result |
| --- | --- |
| Home footer language menu | English only |
| Menu footer language menu | English only |
| `/th` | Browser displays 404 |
| `/th/menu` | Browser displays 404 |
| Public locales API | English and Thai both report `published` |
| Thai localized-shell API | 404, `Localized route was not found` |
| Organization access | Growth, unexpired at audit time |
| Thai language license | `active` |
| Thai platform catalog | `available`, but its source manifest hash is stale |
| Stored Thai platform messages | 228; deployed English manifest requires 316 |
| Missing platform message keys | 88; no extra keys |
| Kikuzuki resource localizations | 0 across all locales and resource types |
| Kikuzuki Thai tenant-page variants | 0 |
| Kikuzuki English tenant-page variants | 2: `/` and `/about` |

Public evidence:

- [Homepage](https://www.kikuzuki-thailand.com/)
- [Menu](https://www.kikuzuki-thailand.com/menu)
- [Thai homepage](https://www.kikuzuki-thailand.com/th)
- [Thai menu](https://www.kikuzuki-thailand.com/th/menu)
- [Public locale configuration](https://www.kikuzuki-thailand.com/api/public/sites/site-kikuzuki/locales)
- [Thai shell](https://www.kikuzuki-thailand.com/api/public/sites/site-kikuzuki/localized-shell/th)

The successful main-branch [CI run](https://github.com/paulchrisluke/krabiclaw/actions/runs/33828296775)
uses commit `14b31c527d9f77314b1517d053d66db69e3428cd`. Its production binding is
`krabiclaw-db-epoch3`, ID `4a02e2ec-6fb0-4bed-96ab-925ec1e508df`.
Queries above used that database and `site_id = 'site-kikuzuki'`.

The working checkout is ahead of production and points to epoch 4. An initial
read there returned no Kikuzuki rows; that result was excluded from the
production diagnosis. Do not use the checkout binding as proof of live data.

The stored catalog source hash is
`b8dcca33f1698ae9244a7e0f9b2588b5f729329200a892829ed8e4ad3d8b89cb`.
The English manifest calculated from deployed commit `14b31c5` is
`9b07c225b209faec3af740b2dba155e17588eacac306a4a7c93f63106153fc08`.
The repository's Thai JSON at that same commit passes the canonical validator
with all 316 messages. The checkout's newer catalog has 317; it must not be
submitted to the older production runtime, which rejects extra keys.

## Why the flag is missing

`composables/useI18n.ts` builds language choices from the current route's
`public-locale-representations`. `SayaFooter.vue` displays those choices.

`server/utils/public-locale-representations.ts` requires a corresponding page
variant or resource route for content pages. Functional/collection routes can
advertise a published locale, but all secondary choices still require successful
`assertSiteLanguageEntitlement()`.

That entitlement function rejects a platform catalog whose source hash differs
from the running English manifest. Public routing maps that failure to 404;
locale representation discovery omits the unavailable language. The public
`locales` endpoint only lists source/published locale records, so its
`published` response does not prove operational readiness or translated content.

Refreshing the catalog would remove one blocker. The home page would still need
its Thai variant, and untranslated menu items would still be omitted. The
current exact-localization contract intentionally permits sparse collections;
a successful empty Thai menu would not satisfy this task.

## What the history establishes

[Issue #663](https://github.com/paulchrisluke/krabiclaw/issues/663) introduced
manual, exact localization and explicitly excluded automatic translation.
Enabling a language grants access to author translations; it does not create
them. Subsequent billing changes made one secondary language Growth-included.
The live license already exists, so re-enabling or changing billing is not the
repair.

[PR #707](https://github.com/paulchrisluke/krabiclaw/pull/707), merged September 3,
records the failed earlier rollout, loss of a local translation copy, and
subsequent routing/rendering fixes. Its verification is evidence about runtime
behavior, not current tenant publication.

The retained `tests/e2e/tenant-localization.spec.ts` targets
`site-ncls-blawby`. Its setup publishes a complete platform catalog, enables Thai,
and creates sample translations before exercising them. It does not verify
Kikuzuki's live 446-item restaurant menu or detect the missing production data.

The present evidence supports an unfinished content publication and catalog
refresh. It does not establish when or why the current production translation
rows became absent, or that all remaining runtime paths will work once filled.

## Content to finish

| Canonical source inventory | Count at audit | Work |
| --- | ---: | --- |
| Visible standard Products: Kikuzuki Japanese Robatayaki & Izakaya | 312 | Thai item names, existing descriptions, categories, populated details/tags and SEO |
| Visible standard Products: Take Me Away by KIKUZUKI | 134 | Same, preserving each location's IDs and commercial data |
| Experience | 1 | Product identity plus experience-specific text and booking copy |
| Business locations | 2 | Existing names/descriptions/address presentation and metadata |
| Tenant page variants in English | 2 | Thai home and About variants, including authored blocks |
| Site | 1 | Brand presentation, description and populated SEO fields |
| Posts | 1 | Existing published copy and its route |
| Media assets | 109 | Inspect usage and translate meaningful public alt text where applicable |
| Booking policies | 2 | Inspect and translate existing public prose |
| Blog posts / Q&A | 0 / 0 | No content to invent |

Inventory counts are not assertions that every optional field is populated.
Include existing public link-page labels or additional configured copy discovered
when exporting the full source; these were not separately counted in this audit.
Customer reviews remain verbatim in their original languages under the existing
contract. Preserve amounts, currencies, quantities, media, hours, contact
destinations and availability. Reuse approved Thai wording where it exists in
client-owned material; do not fabricate missing business claims or descriptions.

## Proposed execution

1. **Prepare the actual content outside disposable database state.** Read the
   current source through the canonical CMS/MCP readers, retaining every resource
   ID, source value and route. Save the Thai text and proposed API payloads as
   durable, reviewable files before any local reset. Draft translations directly
   from that source and review Japanese dish terminology and factual details.
   This does not require a new translation service or product feature.

2. **Qualify the existing write path on disposable data.** Publish the matching
   Thai platform catalog through the existing admin API, then author the site,
   locations, home/About variants and representative dishes through the existing
   tenant APIs. Exercise home → Thai selector → menu → dish → location →
   reservation in the real production Worker build. Repair only a reproduced
   blocker through its canonical implementation and ordinary PR release path.

3. **Complete the full tenant payload.** Use
   `get_product_catalog_localization` and
   `sync_product_catalog_localization` for the menu, with batches of at most 250
   items; 446 standard Products require at least two batches. Each batch is
   atomic, not the whole multi-batch import. Use `put_resource_localization` for
   the site, locations, experience and other supported resources. Use
   `create_tenant_page` with the existing English `page_id`, `locale: 'th'` and
   translated blocks for the two page variants. Read back every submitted ID and
   value. PUT replaces the full localized representation, so payloads must carry
   all intended translated fields.

4. **Publish the reviewed content through authorized production authoring.**
   Publish the complete catalog using
   `POST /api/admin/localization/th/publish`, with the catalog from the exact
   deployed release. Updating the JSON file or saving messages alone does not
   refresh the stored manifest hash; publication does. Then apply the reviewed
   tenant payload through authenticated CMS/MCP operations and reconcile its
   read-back results. This is explicit customer-content authoring, not production
   test fixtures or direct D1 patching. Do not claim completion at the first
   successful batch or first visible flag.

5. **Accept the result on the actual customer domain.** Confirm the Thai choice
   on home and menu, switch both directions while retaining the corresponding
   resource, reload Thai URLs directly, and exercise navigation on desktop and
   mobile. Reconcile every in-scope menu item ID and all populated translated
   fields against the source inventory; confirm category order, detail routes,
   prices, images, SEO and hreflang. Check that Thai copy survives hydration.
   Browse the experience, both locations, About, post, gallery and reservation
   form. Submit test bookings only on disposable local/preview data. Run the
   existing client verification and produce the handoff required by the
   repository before calling the client site complete.

For production authoring, resolve the deployed contract at execution time. The
audited epoch-3 Product localization stores `category` per Product. The newer
epoch-4 code stores category names on `product_category` localizations. Use the
one contract that is deployed; do not send newer category payloads to the older
API or build a compatibility path. This task does not require promoting unrelated
staging changes or a database epoch.

## Keeping the result working

The runtime's global manifest hash makes every enabled secondary locale
unavailable when English interface messages change until its catalog is
republished. The hash covers all platform messages, including other templates.
Future releases touching that manifest therefore need catalog qualification on
preview, an explicit matching-catalog publication step through the existing admin
path, and an immediate read-only live locale check in the ordinary release flow.
Catalog publication must match the running release; publishing a future catalog
early is rejected by today's exact validator.

Extend the existing verification boundary to exercise Kikuzuki/Saya restaurant
translations and to check live catalog availability without creating fixtures in
production. Tests that install their own fresh catalogs remain useful but cannot
substitute for that read-only production check.

Completion means customers can browse Kikuzuki's full translated content on its
domain and editors can maintain it through the existing CMS/MCP path. Passing
CI, a `published` locale record, or a Thai flag alone is insufficient.
