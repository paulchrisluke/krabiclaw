import type { CreateProductInput, Product, ReconcileProductInput, UpdateProductInput } from '~/server/types/products'
import {
  createCollection,
  createMetafieldDefinition,
  createProduct,
  createProductsBatch,
  deleteCollection,
  deleteMetafieldDefinition,
  deleteProduct,
  getProduct,
  listCollectionProducts,
  listCollections,
  listLocationProducts,
  listMetafieldDefinitions,
  listSiteProducts,
  reconcileProducts,
  removeProductLocation,
  reorderCollections,
  setCollectionProducts,
  setProductLocation,
  setProductPublication,
  updateCollection,
  updateProduct,
} from '~/server/utils/product-management'
import { assertResourceAccess } from '~/server/utils/member-access'
import { mcpPageInfo, mcpPageWindow } from '~/server/utils/mcp-pagination'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { listSitesForUser } from '~/server/utils/mcp-workflows'
import type { MetafieldDefinition } from '~/shared/metafields'
import type { McpExecutorContext } from './shared'
import { NOT_HANDLED, objectArray, omit, requiredString, requiredStringArray } from './shared'

/**
 * Writing to a product is an organization-wide act, and a location-scoped
 * editor must not get there by naming a location. This authorizes the
 * location for the rows that ARE location-scoped — offering, withdrawing, and
 * per-location pricing.
 */
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

/**
 * Resolve a product this site actually carries.
 *
 * The catalog is organization-owned, so a site reaches a product through its
 * publication row. Without one, the product exists but is none of this
 * site's business.
 */
async function resolveCarriedProduct(ctx: McpExecutorContext, productId: string): Promise<Product> {
  const product = await getProduct(ctx.site.db, ctx.site.organizationId, productId).catch(() => null)
  if (!product) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Product not found')
  if (!product.publications.some(entry => entry.site_id === ctx.site.siteId)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'This site does not carry that product')
  }
  return product
}

/** One page of products, with the extra row the query asked for removed. */
function productPage(products: Product[], window: { limit: number; offset: number }) {
  const page = products.slice(0, window.limit)
  return {
    products: page.map(productListItem),
    page_info: mcpPageInfo(window, page.length, products.length > window.limit, { resource: 'products' }),
  }
}

function productListItem(product: Product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    active: product.active,
    variant_count: product.variants.length,
    publications: product.publications,
    locations: product.locations,
  }
}

function definitionResult(definition: MetafieldDefinition) {
  return {
    id: definition.id, namespace: definition.namespace, key: definition.key, name: definition.name,
    description: definition.description, value_type: definition.value_type,
    validations: definition.validations, localizable: definition.localizable,
  }
}

export async function handleProductsTools(ctx: McpExecutorContext) {
  const { toolName, args, site } = ctx
  const actor = { actorId: site.userId }
  const scope = { organizationId: site.organizationId, siteId: site.siteId }

  switch (toolName) {
    // Both list tools read the window first and ask the database for exactly
    // one page, so a catalog of four hundred is not loaded and hydrated to
    // answer a request for fifty.
    case 'list_products': {
      const window = mcpPageWindow(args, { resource: 'products' })
      const products = await listSiteProducts(site.db, { ...scope, publishedOnly: args.published_only === true, window })
      return productPage(products, window)
    }
    case 'list_location_products': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const window = mcpPageWindow(args, { resource: 'products' })
      const products = await listLocationProducts(site.db, {
        organizationId: site.organizationId, locationId, window,
        ...(args.published_only === true ? { publishedOnSiteId: site.siteId } : {}),
      })
      return productPage(products, window)
    }
    case 'get_product':
      return { product: await resolveCarriedProduct(ctx, requiredString(args, 'product_id')) }

    case 'create_product': {
      // The site carries what it created, withheld until someone publishes it
      // — written with the product, so the product is loaded once.
      const product = await createProduct(site.db, {
        organizationId: site.organizationId, siteId: site.siteId,
        product: args as unknown as CreateProductInput, actor,
        publication: { published: false },
      })
      return { product }
    }
    case 'update_product': {
      const productId = requiredString(args, 'product_id')
      await resolveCarriedProduct(ctx, productId)
      return {
        product: await updateProduct(site.db, {
          ...scope, productId, patch: omit(args, ['product_id']) as unknown as UpdateProductInput, actor,
        }),
      }
    }
    case 'delete_product': {
      const productId = requiredString(args, 'product_id')
      await resolveCarriedProduct(ctx, productId)
      await deleteProduct(site.db, { organizationId: site.organizationId, productId })
      return { deleted: true }
    }
    case 'set_product_publication': {
      const productId = requiredString(args, 'product_id')
      const target = await getProduct(site.db, site.organizationId, productId)
      // Attaching a product to this site is not a way in to a product the
      // caller could not already reach. One carried by a site outside their
      // access stays outside it — otherwise publishing it here would be the
      // permission to edit it everywhere.
      if (target.publications.length > 0) {
        const visible = new Set((await listSitesForUser(site.db, site.env, site.userId)).map(row => String(row.id)))
        if (target.publications.some(entry => !visible.has(entry.site_id))) {
          throw mcpProtocolError(MCP_ERROR.invalidParams, 'That product is carried by a site you do not have access to')
        }
      }
      if (typeof args.published !== 'boolean') throw mcpProtocolError(MCP_ERROR.invalidParams, 'published must be a boolean')
      await setProductPublication(site.db, { ...scope, productId, published: args.published, actor })
      return { product: await getProduct(site.db, site.organizationId, productId) }
    }
    case 'set_product_location': {
      const productId = requiredString(args, 'product_id')
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      await setProductLocation(site.db, {
        organizationId: site.organizationId, productId, locationId,
        active: typeof args.active === 'boolean' ? args.active : undefined,
        published: typeof args.published === 'boolean' ? args.published : undefined,
        actor,
      })
      return { product: await getProduct(site.db, site.organizationId, productId) }
    }
    case 'remove_product_location': {
      const productId = requiredString(args, 'product_id')
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      await removeProductLocation(site.db, { organizationId: site.organizationId, productId, locationId })
      return { product: await getProduct(site.db, site.organizationId, productId) }
    }
    case 'batch_create_products': {
      // The site carries what it created, withheld until someone publishes it
      // — written in the same batch as the products themselves.
      const products = await createProductsBatch(site.db, {
        ...scope, products: objectArray(args.products, 'products') as unknown as CreateProductInput[], actor,
        publication: { published: false },
      })
      return { products }
    }
    case 'reconcile_products':
      return {
        products: await reconcileProducts(site.db, {
          ...scope,
          products: objectArray(args.products, 'products') as unknown as ReconcileProductInput[],
          actor,
          deactivateMissing: args.deactivate_missing === true,
        }),
      }

    case 'list_collections': {
      const locationId = args.location_id === undefined ? undefined : (args.location_id === null ? null : requiredString(args, 'location_id'))
      return { collections: await listCollections(site.db, { ...scope, locationId }) }
    }
    case 'create_collection': {
      const locationId = typeof args.location_id === 'string' ? args.location_id : null
      if (locationId) await authorizeLocation(ctx, locationId)
      return {
        collection: await createCollection(site.db, {
          organizationId: site.organizationId,
          collection: {
            site_id: site.siteId, location_id: locationId,
            name: requiredString(args, 'name'),
            description: typeof args.description === 'string' ? args.description : null,
            sort_order: typeof args.sort_order === 'number' ? args.sort_order : undefined,
          },
          actor,
        }),
      }
    }
    case 'update_collection':
      return {
        collection: await updateCollection(site.db, {
          organizationId: site.organizationId,
          collectionId: requiredString(args, 'collection_id'),
          patch: omit(args, ['collection_id']),
          actor,
        }),
      }
    case 'delete_collection':
      await deleteCollection(site.db, {
        organizationId: site.organizationId, collectionId: requiredString(args, 'collection_id'),
      })
      return { deleted: true }
    case 'set_collection_products': {
      const collectionId = requiredString(args, 'collection_id')
      await setCollectionProducts(site.db, {
        organizationId: site.organizationId, collectionId,
        productIds: requiredStringArray(args.product_ids, 'product_ids'), actor,
      })
      const products = await listCollectionProducts(site.db, { organizationId: site.organizationId, collectionId })
      return { products: products.map(productListItem) }
    }
    case 'reorder_collections': {
      const locationId = args.location_id === undefined || args.location_id === null ? null : requiredString(args, 'location_id')
      await reorderCollections(site.db, {
        ...scope, locationId, collectionIds: requiredStringArray(args.collection_ids, 'collection_ids'), actor,
      })
      return { collections: await listCollections(site.db, { ...scope, locationId }) }
    }

    case 'list_metafield_definitions':
      return { definitions: (await listMetafieldDefinitions(site.db, site.organizationId)).map(definitionResult) }
    case 'create_metafield_definition':
      return {
        definition: definitionResult(await createMetafieldDefinition(site.db, {
          organizationId: site.organizationId,
          definition: {
            namespace: requiredString(args, 'namespace'),
            key: requiredString(args, 'key'),
            name: requiredString(args, 'name'),
            description: typeof args.description === 'string' ? args.description : null,
            value_type: requiredString(args, 'value_type') as MetafieldDefinition['value_type'],
            validations: (args.validations ?? {}) as MetafieldDefinition['validations'],
            localizable: args.localizable === true,
          },
          actor,
        })),
      }
    case 'delete_metafield_definition':
      await deleteMetafieldDefinition(site.db, {
        organizationId: site.organizationId, definitionId: requiredString(args, 'definition_id'),
      })
      return { deleted: true }
  }
  return NOT_HANDLED
}
