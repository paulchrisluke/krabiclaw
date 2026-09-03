import { queryFirst } from '~/server/db'
import type { CreateProductInput, Product, SyncProductInput, UpdateProductInput } from '~/server/types/products'
import { createProduct, createProductsBatch, deleteProduct, deleteProductCategory, getProduct, listLocationProducts, moveProductCategory, moveProducts, renameProductCategory, syncProducts, updateProduct } from '~/server/utils/product-management'
import { extractProductsFromMediaAsset } from '~/server/utils/chowbot-media'
import { assertResourceAccess } from '~/server/utils/member-access'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import type { McpExecutorContext } from './shared'
import { NOT_HANDLED, objectArray, omit, requiredString, requiredStringArray } from './shared'
import { applyInventoryMovement, listLocationInventory, setInventoryAuthority } from '~/server/utils/inventory'
import type { SetInventoryAuthorityInput } from '~/shared/inventory'
import { projectProductOrderingAvailability } from '~/shared/ordering-catalog'

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
  const projected = projectProductOrderingAvailability(product)
  return {
    id: projected.id,
    location_id: projected.location_id,
    category: projected.category,
    name: projected.name,
    description: projected.description,
    price: projected.price
      ? {
          id: projected.price.id,
          amount_minor: projected.price.amount_minor,
          currency: projected.price.currency,
          unit: projected.price.unit,
          tax_behavior: projected.price.tax_behavior,
          compare_at_amount_minor: projected.price.compare_at_amount_minor,
        }
      : null,
    is_visible: projected.is_visible,
    available: projected.available,
    sort_order: projected.sort_order,
    channel_availability: projected.channel_availability,
    inventory: projected.inventory,
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
    case 'get_product': return { product: projectProductOrderingAvailability(await resolveStoredProduct(ctx, requiredString(args, 'product_id'))) }
    case 'create_product': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return { product: projectProductOrderingAvailability(await createProduct(site.db, site.organizationId, site.siteId, locationId, omit(args, ['location_id']) as unknown as CreateProductInput, site.userId, site.env)) }
    }
    case 'update_product': {
      const product = await resolveStoredProduct(ctx, requiredString(args, 'product_id'))
      return { product: projectProductOrderingAvailability(await updateProduct(site.db, site.organizationId, site.siteId, product.location_id, product.id, omit(args, ['product_id']) as UpdateProductInput, site.userId, site.env)) }
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
      const products = await createProductsBatch(site.db, site.organizationId, site.siteId, locationId, objectArray(args.products, 'products') as unknown as CreateProductInput[], site.userId)
      return { products: products.map(projectProductOrderingAvailability) }
    }
    case 'sync_products': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const products = await syncProducts(site.db, site.organizationId, site.siteId, locationId, objectArray(args.products, 'products') as unknown as SyncProductInput[], site.userId, args.set_missing_unavailable === true)
      return { products: products.map(projectProductOrderingAvailability) }
    }
    case 'import_products_from_media': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const result = await extractProductsFromMediaAsset(site.db, site.env, { organizationId: site.organizationId, siteId: site.siteId, userId: site.userId, assetId: requiredString(args, 'asset_id'), locationId, sessionId: site.sessionId })
      return { ...result, products: result.products.map(projectProductOrderingAvailability) }
    }
    case 'get_location_inventory': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      return listLocationInventory(site.db, site.organizationId, site.siteId, locationId)
    }
    case 'set_inventory_authority': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const authorityType = requiredString(args, 'authority_type')
      const input: SetInventoryAuthorityInput = authorityType === 'krabiclaw'
        ? { authority_type: 'krabiclaw' }
        : authorityType === 'external'
          ? {
              authority_type: 'external', provider: requiredString(args, 'provider'), oauth_client_id: requiredString(args, 'oauth_client_id'),
              provider_account_reference: requiredString(args, 'provider_account_reference'), external_location_reference: requiredString(args, 'external_location_reference'),
            }
          : (() => { throw mcpProtocolError(MCP_ERROR.invalidParams, 'Unsupported inventory authority') })()
      return { authority: await setInventoryAuthority(site.db, site.organizationId, site.siteId, locationId, input, { id: site.userId, role: site.role }) }
    }
    case 'record_inventory_movement':
    case 'reserve_inventory':
    case 'release_inventory':
    case 'consume_inventory': {
      const product = await resolveStoredProduct(ctx, requiredString(args, 'product_id'))
      const movementType = toolName === 'record_inventory_movement' ? requiredString(args, 'movement_type') : toolName.replace('_inventory', '')
      if (!['restock', 'waste', 'manual_adjustment', 'reserve', 'release', 'consume'].includes(movementType)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, 'Unsupported inventory movement')
      }
      if (!Number.isSafeInteger(args.quantity) || Number(args.quantity) === 0) throw mcpProtocolError(MCP_ERROR.invalidParams, 'quantity must be a non-zero safe integer')
      const hasReference = args.reference_type !== undefined || args.reference_id !== undefined
      const reference = hasReference ? { reference_type: requiredString(args, 'reference_type'), reference_id: requiredString(args, 'reference_id') } : undefined
      const movement = await applyInventoryMovement(site.db, {
        organizationId: site.organizationId, siteId: site.siteId, locationId: product.location_id, productId: product.id,
      }, {
        movement_type: movementType as 'restock' | 'waste' | 'manual_adjustment' | 'reserve' | 'release' | 'consume',
        quantity: Number(args.quantity), idempotency_key: requiredString(args, 'idempotency_key'), reference,
      }, { type: 'user', id: site.userId })
      return { movement }
    }
    default: return NOT_HANDLED
  }
}
