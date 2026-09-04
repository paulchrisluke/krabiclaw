import { queryFirst } from '~/server/db'
import type { CreateProductInput, Product, SyncProductInput, UpdateProductInput } from '~/server/types/products'
import { createProduct, createProductsBatch, deleteProduct, deleteProductCategory, getProduct, listLocationProducts, moveProductCategory, moveProducts, renameProductCategory, syncProducts, updateProduct } from '~/server/utils/product-management'
import { extractProductsFromMediaAsset } from '~/server/utils/chowbot-media'
import { assertResourceAccess } from '~/server/utils/member-access'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import type { McpExecutorContext } from './shared'
import { NOT_HANDLED, objectArray, omit, requiredString, requiredStringArray } from './shared'

async function authorizeLocation(ctx: McpExecutorContext, locationId: string) {
  await assertResourceAccess(ctx.site.db, {
    env: ctx.site.env,
    memberId: ctx.site.memberId,
    role: ctx.site.role,
    organizationId: ctx.site.organizationId,
    siteId: ctx.site.siteId,
    resourceLocationId: locationId,
  })
}

async function resolveStoredProduct(ctx: McpExecutorContext, productId: string) {
  const scope = await queryFirst<{ location_id: string }>(ctx.site.db, `SELECT location_id FROM products WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`, [productId, ctx.site.organizationId, ctx.site.siteId])
  if (!scope) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Product not found')
  await authorizeLocation(ctx, scope.location_id)
  const product = await getProduct(ctx.site.db, ctx.site.organizationId, ctx.site.siteId, scope.location_id, productId)
  if (!product) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Product not found')
  return product
}

function productListItem(product: Product) {
  return {
    id: product.id,
    location_id: product.location_id,
    category: product.category,
    name: product.name,
    description: product.description,
    price: product.price
      ? {
          amount_minor: product.price.amount_minor,
          currency: product.price.currency,
          unit: product.price.unit,
          tax_behavior: product.price.tax_behavior,
          compare_at_amount_minor: product.price.compare_at_amount_minor,
        }
      : null,
    is_visible: product.is_visible,
    available: product.available,
    sort_order: product.sort_order,
  }
}

export async function handleProductsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { args, site, toolName } = ctx
  switch (toolName) {
    case 'list_location_products': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const products = await listLocationProducts(site.db, site.organizationId, site.siteId, locationId)
      const page = paginateMcpCollection(products, args, { resource: `products:${site.siteId}:${locationId}` })
      return { products: page.items.map(productListItem), page_info: page.page_info }
    }
    case 'get_product': return { product: await resolveStoredProduct(ctx, requiredString(args, 'product_id')) }
    case 'create_product': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return { product: await createProduct(site.db, site.organizationId, site.siteId, locationId, omit(args, ['location_id']) as unknown as CreateProductInput, { actorId: site.userId }, site.env) }
    }
    case 'update_product': {
      const product = await resolveStoredProduct(ctx, requiredString(args, 'product_id'))
      return { product: await updateProduct(site.db, site.organizationId, site.siteId, product.location_id, product.id, omit(args, ['product_id']) as UpdateProductInput, { actorId: site.userId }, site.env) }
    }
    case 'delete_product': {
      const product = await resolveStoredProduct(ctx, requiredString(args, 'product_id'))
      return { deleted: await deleteProduct(site.db, site.organizationId, site.siteId, product.location_id, product.id, site.userId) }
    }
    case 'move_products': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const productIds = requiredStringArray(args.product_ids, 'product_ids')
      const beforeProductId = args.before_product_id === null ? null : requiredString(args, 'before_product_id')
      await moveProducts({ db: site.db, organizationId: site.organizationId, siteId: site.siteId, locationId, productIds, beforeProductId, actor: site.userId })
      return { moved: true }
    }
    case 'move_product_category': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const beforeCategory = args.before_category === null ? null : requiredString(args, 'before_category')
      await moveProductCategory({ db: site.db, organizationId: site.organizationId, siteId: site.siteId, locationId, category: requiredString(args, 'category'), beforeCategory, actor: site.userId })
      return { moved: true }
    }
    case 'rename_product_category': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return { updated: await renameProductCategory(site.db, site.organizationId, site.siteId, locationId, requiredString(args, 'old_category'), requiredString(args, 'new_category'), site.userId) }
    }
    case 'delete_product_category': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return { deleted: await deleteProductCategory(site.db, site.organizationId, site.siteId, locationId, requiredString(args, 'category'), site.userId) }
    }
    case 'batch_create_products': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return { products: await createProductsBatch(site.db, site.organizationId, site.siteId, locationId, objectArray(args.products, 'products') as unknown as CreateProductInput[], { actorId: site.userId }) }
    }
    case 'sync_products': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return { products: await syncProducts(site.db, site.organizationId, site.siteId, locationId, objectArray(args.products, 'products') as unknown as SyncProductInput[], { actorId: site.userId }, args.set_missing_unavailable === true) }
    }
    case 'import_products_from_media': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return extractProductsFromMediaAsset(site.db, site.env, { organizationId: site.organizationId, siteId: site.siteId, userId: site.userId, assetId: requiredString(args, 'asset_id'), locationId, sessionId: site.sessionId })
    }
    default: return NOT_HANDLED
  }
}
