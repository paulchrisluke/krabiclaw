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
  requireOrganizationProduct,
  listCollectionProducts,
  listCollections,
  listLocationProducts,
  listMetafieldDefinitions,
  listOrganizationProducts,
  reconcileProducts,
  removeProductLocation,
  reorderCollections,
  setCollectionProducts,
  setProductLocation,
  setProductPublication,
  updateCollection,
  updateProduct,
} from '~/server/utils/product-management'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { mcpPageInfo, mcpPageWindow } from '~/server/utils/mcp-pagination'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { listOrganizationsForUser } from '~/server/utils/mcp-workflows'
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
  await assertResourceAccess(ctx.organization.db, {
    ...memberAccessPrincipal(ctx.organization.membership, { env: ctx.organization.env }),
    resourceLocationId: locationId,
  })
}

/**
 * The Product this site carries, as an MCP error.
 *
 * One lookup: `requireOrganizationProduct` is the rule — the catalog is
 * organization-owned and a site reaches a product through its publication row
 * — and this only restates its refusal in the transport's own shape.
 */
async function resolveCarriedProduct(ctx: McpExecutorContext, productId: string): Promise<Product> {
  return await requireOrganizationProduct(ctx.organization.db, {
    organizationId: ctx.organization.organizationId, productId,
  }).catch((error: unknown) => {
    const message = (error as { statusMessage?: string }).statusMessage
    throw mcpProtocolError(MCP_ERROR.invalidParams, message && message !== 'Not Found' ? message : 'Product not found')
  })
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
  const { toolName, args, organization } = ctx
  const actor = { actorId: organization.userId }
  const scope = { organizationId: organization.organizationId}

  switch (toolName) {
    // Both list tools read the window first and ask the database for exactly
    // one page, so a catalog of four hundred is not loaded and hydrated to
    // answer a request for fifty.
    case 'list_products': {
      const window = mcpPageWindow(args, { resource: 'products' })
      const products = await listOrganizationProducts(organization.db, { ...scope, publishedOnly: args.published_only === true, window })
      return productPage(products, window)
    }
    case 'list_location_products': {
      const locationId = requiredString(args, 'location_id')
      await authorizeLocation(ctx, locationId)
      const window = mcpPageWindow(args, { resource: 'products' })
      const products = await listLocationProducts(organization.db, {
        organizationId: organization.organizationId, locationId, window,
        publishedOnly: args.published_only === true,
      })
      return productPage(products, window)
    }
    case 'get_product':
      return { product: await resolveCarriedProduct(ctx, requiredString(args, 'product_id')) }

    case 'create_product': {
      // The site carries what it created, withheld until someone publishes it
      // — written with the product, so the product is loaded once.
      const product = await createProduct(organization.db, {
        organizationId: organization.organizationId,
        product: args as unknown as CreateProductInput, actor,
        publication: { published: false },
      })
      return { product }
    }
    case 'update_product': {
      const productId = requiredString(args, 'product_id')
      await resolveCarriedProduct(ctx, productId)
      return {
        product: await updateProduct(organization.db, {
          ...scope, productId, patch: omit(args, ['product_id']) as unknown as UpdateProductInput, actor,
        }),
      }
    }
    case 'delete_product': {
      const productId = requiredString(args, 'product_id')
      await resolveCarriedProduct(ctx, productId)
      await deleteProduct(organization.db, { organizationId: organization.organizationId, productId })
      return { deleted: true }
    }
    case 'set_product_publication': {
      const productId = requiredString(args, 'product_id')
      const target = await getProduct(organization.db, organization.organizationId, productId)
      // Attaching a product to this site is not a way in to a product the
      // caller could not already reach. One carried by a site outside their
      // access stays outside it — otherwise publishing it here would be the
      // permission to edit it everywhere.
      if (target.publications.length > 0) {
        const visible = new Set((await listOrganizationsForUser(organization.db, organization.env, organization.userId)).map(row => String(row.id)))
        if (target.publications.some(entry => !visible.has(entry.organization_id))) {
          throw mcpProtocolError(MCP_ERROR.invalidParams, 'That product is carried by a site you do not have access to')
        }
      }
      if (typeof args.published !== 'boolean') throw mcpProtocolError(MCP_ERROR.invalidParams, 'published must be a boolean')
      await setProductPublication(organization.db, { ...scope, productId, published: args.published, actor })
      return { product: await getProduct(organization.db, organization.organizationId, productId) }
    }
    case 'set_product_location': {
      const productId = requiredString(args, 'product_id')
      const locationId = requiredString(args, 'location_id')
      // Both halves are checked: the location the caller may reach, and the
      // product this site actually carries. Authorizing one says nothing
      // about the other.
      await resolveCarriedProduct(ctx, productId)
      await authorizeLocation(ctx, locationId)
      await setProductLocation(organization.db, {
        organizationId: organization.organizationId, productId, locationId,
        active: typeof args.active === 'boolean' ? args.active : undefined,
        published: typeof args.published === 'boolean' ? args.published : undefined,
        actor,
      })
      return { product: await getProduct(organization.db, organization.organizationId, productId) }
    }
    case 'remove_product_location': {
      const productId = requiredString(args, 'product_id')
      const locationId = requiredString(args, 'location_id')
      await resolveCarriedProduct(ctx, productId)
      await authorizeLocation(ctx, locationId)
      await removeProductLocation(organization.db, { organizationId: organization.organizationId, productId, locationId })
      return { product: await getProduct(organization.db, organization.organizationId, productId) }
    }
    case 'batch_create_products': {
      // The site carries what it created, withheld until someone publishes it
      // — written in the same batch as the products themselves.
      const products = await createProductsBatch(organization.db, {
        ...scope, products: objectArray(args.products, 'products') as unknown as CreateProductInput[], actor,
        publication: { published: false },
      })
      return { products }
    }
    case 'reconcile_products':
      return {
        products: await reconcileProducts(organization.db, {
          ...scope,
          products: objectArray(args.products, 'products') as unknown as ReconcileProductInput[],
          actor,
          deactivateMissing: args.deactivate_missing === true,
        }),
      }

    case 'list_collections': {
      const locationId = args.location_id === undefined ? undefined : (args.location_id === null ? null : requiredString(args, 'location_id'))
      return { collections: await listCollections(organization.db, { ...scope, locationId }) }
    }
    case 'create_collection': {
      const locationId = typeof args.location_id === 'string' ? args.location_id : null
      if (locationId) await authorizeLocation(ctx, locationId)
      return {
        collection: await createCollection(organization.db, {
          organizationId: organization.organizationId,
          collection: {
            location_id: locationId,
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
        collection: await updateCollection(organization.db, {
          organizationId: organization.organizationId,
          collectionId: requiredString(args, 'collection_id'),
          patch: omit(args, ['collection_id']),
          actor,
        }),
      }
    case 'delete_collection':
      await deleteCollection(organization.db, {
        organizationId: organization.organizationId, collectionId: requiredString(args, 'collection_id'),
      })
      return { deleted: true }
    case 'set_collection_products': {
      const collectionId = requiredString(args, 'collection_id')
      await setCollectionProducts(organization.db, {
        organizationId: organization.organizationId, collectionId,
        productIds: requiredStringArray(args.product_ids, 'product_ids'), actor,
      })
      const products = await listCollectionProducts(organization.db, { organizationId: organization.organizationId, collectionId })
      return { products: products.map(productListItem) }
    }
    case 'reorder_collections': {
      const locationId = args.location_id === undefined || args.location_id === null ? null : requiredString(args, 'location_id')
      await reorderCollections(organization.db, {
        ...scope, locationId, collectionIds: requiredStringArray(args.collection_ids, 'collection_ids'), actor,
      })
      return { collections: await listCollections(organization.db, { ...scope, locationId }) }
    }

    case 'list_metafield_definitions':
      return { definitions: (await listMetafieldDefinitions(organization.db, organization.organizationId)).map(definitionResult) }
    case 'create_metafield_definition':
      return {
        definition: definitionResult(await createMetafieldDefinition(organization.db, {
          organizationId: organization.organizationId,
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
      await deleteMetafieldDefinition(organization.db, {
        organizationId: organization.organizationId, definitionId: requiredString(args, 'definition_id'),
      })
      return { deleted: true }
  }
  return NOT_HANDLED
}
