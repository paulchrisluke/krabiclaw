#!/usr/bin/env node
/**
 * Pure mapping from the pre-category Product model to the category model.
 *
 * Before this change a category was a string on every Product, and category
 * order was implied by contiguous runs in one flat sort_order stream per
 * location. This maps that onto real category rows and per-category ordering.
 *
 * The safety property is that customers see no change: category order follows
 * each category's first visible appearance in the location's existing flat order, which
 * is exactly what the public collection page renders today.
 *
 * No I/O lives here so the mapping can be tested directly and reused by the
 * epoch transform.
 */

function compareText(a, b) { return Buffer.compare(Buffer.from(String(a)), Buffer.from(String(b))) }

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '')
}

/**
 * Category order follows each category's first visible appearance in the location's
 * existing flat order, which is exactly what the public site renders today. The
 * migration is therefore invisible to customers: same sections, same order.
 */
export function planCategories(products) {
  const unmapped = products.filter(product => !product.category || !String(product.category).trim())
  if (unmapped.length) {
    throw new Error(`${unmapped.length} Product(s) have a blank category and cannot be mapped: ${unmapped.map(p => p.id).join(', ')}`)
  }

  const categories = []
  const categoryByKey = new Map()
  const slugsByLocation = new Map()
  const categorySortOrder = new Map()
  const productSortOrder = new Map()
  const assignments = []

  const ordered = [...products].sort((a, b) => (
    compareText(a.location_id, b.location_id)
    || compareText(a.product_type, b.product_type)
    || Number(a.sort_order) - Number(b.sort_order)
    || compareText(a.id, b.id)
  ))

  // Hidden Products must not move a visible section ahead of another section.
  // Hidden-only sections follow visible sections; member ordering is assigned
  // separately from the original complete stream below.
  const categoryOrder = [...ordered.filter(product => product.is_visible === 1), ...ordered.filter(product => product.is_visible !== 1)]
  for (const product of categoryOrder) {
    // Identity is the stored string exactly as it is, not a trimmed copy. Two
    // legacy values that differ only by whitespace render as two sections
    // today, so merging them here would change what customers see — which is
    // the one thing this migration must not do. The owner can merge them in
    // the CMS afterwards.
    const name = String(product.category)
    const scope = `${product.location_id}::${product.product_type}`
    const key = `${scope}::${name}`
    let category = categoryByKey.get(key)
    if (!category) {
      const base = slugify(name)
      if (!base) throw new Error(`Product category "${name}" does not produce a usable slug (Product ${product.id})`)
      const used = slugsByLocation.get(scope) ?? new Set()
      let slug = base
      for (let suffix = 2; used.has(slug); suffix += 1) slug = `${base}-${suffix}`
      used.add(slug)
      slugsByLocation.set(scope, used)
      const sortOrder = categorySortOrder.get(scope) ?? 0
      categorySortOrder.set(scope, sortOrder + 1)
      category = {
        // product_type is part of the identity: the uniqueness scope is
        // (location, product_type, slug), so leaving it out collides an
        // experience category with a menu section of the same name.
        id: `pc_${product.location_id}_${product.product_type}_${slug}`.slice(0, 200),
        organization_id: product.organization_id,
        site_id: product.site_id,
        location_id: product.location_id,
        product_type: product.product_type,
        name,
        slug,
        sort_order: sortOrder,
      }
      categoryByKey.set(key, category)
      categories.push(category)
    }
  }
  for (const product of ordered) {
    const category = categoryByKey.get(`${product.location_id}::${product.product_type}::${product.category}`)
    // sort_order restarts inside each category, which is what makes the
    // per-category dense ordering the new model relies on correct.
    const position = productSortOrder.get(category.id) ?? 0
    productSortOrder.set(category.id, position + 1)
    assignments.push({ product_id: product.id, category_id: category.id, sort_order: position })
  }

  return { categories, assignments }
}
