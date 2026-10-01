# Products overview

The approved v3 visual is implemented by Krabiclaw's published page document at
`/products`. Migration `0002_products_overview.sql` retains the former Features
document identity and replaces its blocks. Platform `/features` links redirect
permanently to `/products`, preserving query parameters. Customer catalog routes
continue to use their existing product presentation.

The page uses the existing `products` recipe and canonical typed blocks: `hero`,
`button_group`, `media_text`, `workflow_grid`, `feature_grid`, and `cta`. The
platform template gives this recipe its editorial presentation. Buttons use
`PlatformAccountCta` and the shared platform button styles.

Future product detail pages are ordinary platform page documents at
`/products/:slug`, served by the existing catch-all route. Set their recipe to
`products` and compose the same blocks; no product-specific Vue component or
route is required. A `media_text` block can use its normal `media` placement for
one image, or `items.<index>.image` placements for multiple examples. Example
type distinguishes website examples from photos/posts. Titles, descriptions,
captions, links, and image alternatives remain authored content. No detail
documents are published by this change.

Images under `public/images/products` are supplied source assets from the
owner-approved reference package. Their canonical media records use the static
provider because the files ship with the Worker. The NCLS image is solely a
website example; it makes no claim about AI usage. The social images are real
published examples and make no claim of automatic synchronization.

Reference: Library `libfile_4c811c9886288191b17a5f1e2a36ae94`,
`krabiclaw-products-overview-v3.png`. The transferred package was checksum
verified as SHA-256
`a3b21436e3aba4074ed43446adee42d9a1f3d8ea0ed9d4160d2404088ef0a1f9`
and the actual reference pixels inspected before implementation.

Canonical metadata, JSON-LD, localization, sitemap discovery, and public resource
cache invalidation remain in the existing page-document pipeline. No preview
environment switch or external media publication is required.
