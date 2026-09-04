#!/usr/bin/env node
/**
 * Data migration for the product_categories model change.
 *
 * Before this change a category was a string on every Product, and category
 * order was implied by contiguous runs in one flat sort_order stream per
 * location. This maps that onto real category rows and per-category ordering.
 *
 * It never invents or drops a Product. Any row it cannot map is a hard failure,
 * because silently discarding a client's menu item is worse than stopping.
 *
 * Usage:
 *   node scripts/product-category-data.mjs export  --env=<local|staging|production>
 *   node scripts/product-category-data.mjs plan    --input=<export.json>
 *   node scripts/product-category-data.mjs verify  --env=<local|staging|production>
 *
 * `export` writes a JSON backup of every Product's current category and order.
 * `plan` turns that backup into SQL: one product_categories row per distinct
 * (location, product_type, category), and a category_id plus per-category
 * sort_order for every Product. Apply the SQL through the normal migration or
 * epoch path — this script never writes to a database itself.
 * `verify` re-reads a database and asserts the invariants the model depends on.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnYarn } from './utils/spawn-yarn.mjs'

const ENVIRONMENT_FLAGS = {
  local: ['--local'],
  staging: ['--remote', '--env', 'staging'],
  production: ['--remote'],
}

function argument(name, fallback = null) {
  const match = process.argv.find(value => value.startsWith(`--${name}=`))
  return match ? match.slice(name.length + 3) : fallback
}

function query(environment, sql) {
  const flags = ENVIRONMENT_FLAGS[environment]
  if (!flags) throw new Error(`Unknown --env "${environment}". Use local, staging, or production.`)
  const result = spawnYarn(['--silent', 'wrangler', 'd1', 'execute', 'DB', ...flags, '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`wrangler exited ${result.status}: ${result.stderr ?? ''}`)
  const raw = result.stdout
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error(`Could not parse wrangler output:\n${raw}`)
  return JSON.parse(raw.slice(start, end + 1))[0]?.results ?? []
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

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
 * Category order follows each category's first appearance in the location's
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
    String(a.location_id).localeCompare(String(b.location_id))
    || String(a.product_type).localeCompare(String(b.product_type))
    || Number(a.sort_order) - Number(b.sort_order)
    || String(a.id).localeCompare(String(b.id))
  ))

  for (const product of ordered) {
    const name = String(product.category).trim()
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
    // sort_order restarts inside each category, which is what makes the
    // per-category dense ordering the new model relies on correct.
    const position = productSortOrder.get(category.id) ?? 0
    productSortOrder.set(category.id, position + 1)
    assignments.push({ product_id: product.id, category_id: category.id, sort_order: position })
  }

  return { categories, assignments }
}

function renderSql({ categories, assignments }, actor) {
  const now = new Date().toISOString()
  const categoryRows = categories.map(category => `  (${[
    sqlString(category.id), sqlString(category.organization_id), sqlString(category.site_id),
    sqlString(category.location_id), sqlString(category.product_type), sqlString(category.name),
    sqlString(category.slug), category.sort_order, sqlString(now), sqlString(now), sqlString(actor), sqlString(actor),
  ].join(', ')})`).join(',\n')

  const updates = assignments.map(assignment => (
    `UPDATE products SET category_id = ${sqlString(assignment.category_id)}, sort_order = ${assignment.sort_order} WHERE id = ${sqlString(assignment.product_id)};`
  )).join('\n')

  return `-- Generated by scripts/product-category-data.mjs. Do not hand-edit.
-- ${categories.length} categories, ${assignments.length} Products.

INSERT INTO product_categories
  (id, organization_id, site_id, location_id, product_type, name, slug, sort_order, created_at, updated_at, created_by, updated_by)
VALUES
${categoryRows};

${updates}
`
}

const PRODUCT_EXPORT_SQL = `SELECT id, organization_id, site_id, location_id, product_type, category, sort_order FROM products ORDER BY location_id, product_type, sort_order, id`

function main() {
  const command = process.argv[2]

  if (command === 'export') {
    const environment = argument('env')
    const products = query(environment, PRODUCT_EXPORT_SQL)
    const output = argument('output', `product-category-export.${environment}.json`)
    writeFileSync(output, `${JSON.stringify({ environment, exported_at: new Date().toISOString(), products }, null, 2)}\n`)
    console.log(`Exported ${products.length} Products from ${environment} to ${output}`)
    return
  }

  if (command === 'plan') {
    const input = argument('input')
    if (!input) throw new Error('plan requires --input=<export.json>')
    const { products } = JSON.parse(readFileSync(input, 'utf8'))
    const plan = planCategories(products)
    const output = argument('output', input.replace(/\.json$/, '') + '.sql')
    writeFileSync(output, renderSql(plan, argument('actor', 'migration:product-categories')))
    console.log(`Planned ${plan.categories.length} categories for ${plan.assignments.length} Products -> ${output}`)
    return
  }

  if (command === 'verify') {
    const environment = argument('env')
    const failures = []
    const [orphaned] = query(environment, `SELECT COUNT(*) AS count FROM products WHERE category_id IS NULL OR category_id NOT IN (SELECT id FROM product_categories)`)
    if (Number(orphaned?.count ?? 0) > 0) failures.push(`${orphaned.count} Product(s) have no resolvable category`)

    const [misscoped] = query(environment, `SELECT COUNT(*) AS count FROM products p JOIN product_categories pc ON pc.id = p.category_id WHERE pc.location_id <> p.location_id OR pc.site_id <> p.site_id OR pc.product_type <> p.product_type`)
    if (Number(misscoped?.count ?? 0) > 0) failures.push(`${misscoped.count} Product(s) reference a category from another location, site, or type`)

    const [gaps] = query(environment, `SELECT COUNT(*) AS count FROM (SELECT category_id FROM products GROUP BY category_id HAVING COUNT(*) <> MAX(sort_order) + 1 OR MIN(sort_order) <> 0)`)
    if (Number(gaps?.count ?? 0) > 0) failures.push(`${gaps.count} category(ies) have a non-dense Product order`)

    if (failures.length) {
      console.error(`Product category verification FAILED on ${environment}:`)
      for (const failure of failures) console.error(`- ${failure}`)
      process.exit(1)
    }
    console.log(`Product category verification passed on ${environment}.`)
    return
  }

  console.error('Usage: product-category-data.mjs <export|plan|verify> --env=<local|staging|production>')
  process.exit(1)
}

if (import.meta.filename === process.argv[1]) main()
