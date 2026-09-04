/**
 * Product field limits, shared by the server validator and the dashboard form.
 *
 * These live in `shared/` rather than beside the validator because the form has
 * to stop the tenant building a product the server will reject — a control must
 * not be able to build an invalid state — and `server/utils/product-validation`
 * imports Nitro, so a page cannot read the limits from there.
 */
export const PRODUCT_LIMITS = {
  batchCreate: 400,
  sync: 200,
  category: 120,
  name: 240,
  description: 10_000,
  tags: 32,
  tag: 120,
  detailGroups: 24,
  detailKey: 80,
  detailLabel: 120,
  detailValues: 32,
  detailValue: 500,
  detailPayload: 20_000,
  orderUrl: 2_048,
  seoTitle: 240,
  seoDescription: 1_000,
  canonicalUrl: 2_048,
  robots: 240,
} as const

/** A detail key is lowercase kebab-case. The server rejects anything else. */
export const PRODUCT_DETAIL_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
