import { expect, test, type APIRequestContext } from '@playwright/test'
import { createHash } from 'node:crypto'
import { loginAs } from './helpers/auth'
import { createScratchLocation, ensureLocation, MCP_GROWTH_SERVICE_SITE_ID, MCP_GROWTH_SITE_ID, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_SERVICE_USER_ID, MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

async function inventoryAccessToken(request: APIRequestContext, baseURL: string, clientId: string) {
  const redirectUri = `${baseURL}/oauth/test-callback`
  const verifier = 'krabiclaw-inventory-provider-e2e-verifier-0123456789'
  const authorize = await request.get(`${baseURL}/api/auth/oauth2/authorize?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid offline_access inventory:write',
    resource: `${baseURL}/api/integrations/inventory`,
    state: 'inventory-provider',
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'consent',
  })}`, { maxRedirects: 0 })
  expect(authorize.status(), await authorize.text()).toBe(302)
  const consentUrl = new URL(authorize.headers()['location']!, baseURL)
  expect(consentUrl.pathname).toBe('/oauth/consent')
  const consent = await request.post(`${baseURL}/api/auth/oauth2/consent`, {
    headers: { Origin: baseURL },
    data: { accept: true, oauth_query: consentUrl.search.slice(1) },
  })
  expect(consent.status(), await consent.text()).toBe(200)
  const code = new URL((await consent.json() as { url: string }).url).searchParams.get('code')
  expect(code).toBeTruthy()
  const token = await request.post(`${baseURL}/api/auth/oauth2/token`, {
    headers: { Origin: baseURL },
    form: { grant_type: 'authorization_code', client_id: clientId, code: code!, redirect_uri: redirectUri, code_verifier: verifier },
  })
  expect(token.status(), await token.text()).toBe(200)
  const accessToken = (await token.json() as { access_token?: string }).access_token
  expect(accessToken).toBeTruthy()
  return accessToken!
}

async function createOrderingProduct(request: APIRequestContext, baseURL: string, locationId: string, name: string) {
  const response = await mcpRequest(request, baseURL, {
    method: 'tools/call', toolName: 'create_product',
    args: {
      site_id: MCP_GROWTH_SITE_ID, location_id: locationId, category: 'Inventory', name,
      price: { amount_minor: 12000, currency: 'THB' }, channel_availability: { seo: true, ordering: true },
    },
  })
  expect(response.status()).toBe(200)
  return mcpData<{ product: { id: string; available: boolean; inventory: null } }>(await response.json()).product
}

test.describe('location inventory authority', () => {
  test('KrabiClaw inventory is append-only, idempotent, revalidated, and shared by MCP, dashboard, and public catalog', async ({ request, baseURL }) => {
    test.setTimeout(120_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const locationId = await createScratchLocation(request, baseURL!, MCP_GROWTH_SITE_ID)
    const product = await createOrderingProduct(request, baseURL!, locationId, `Inventory ${Date.now()}`)
    expect(product.inventory).toBeNull()
    expect(product.available).toBe(false)

    const beforeAuthority = await request.get(`${baseURL}/api/public/sites/${MCP_GROWTH_SITE_ID}/ordering-catalog`)
    expect(beforeAuthority.status()).toBe(200)
    const beforeProduct = (await beforeAuthority.json() as { products: Array<{ id: string; available: boolean; inventory: unknown }> }).products.find(row => row.id === product.id)
    expect(beforeProduct?.inventory).toBeNull()
    expect(beforeProduct?.available).toBe(false)

    const authority = await request.put(`${baseURL}/api/editor/sites/${MCP_GROWTH_SITE_ID}/locations/${locationId}/inventory/authority`, {
      data: { authority_type: 'krabiclaw' },
    })
    expect(authority.status(), await authority.text()).toBe(200)

    const move = async (toolName: string, quantity: number, key: string) => {
      const response = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName,
        args: {
          site_id: MCP_GROWTH_SITE_ID, product_id: product.id, quantity, idempotency_key: key,
          ...(toolName === 'record_inventory_movement' ? { movement_type: 'restock' } : { reference_type: 'order', reference_id: 'order-e2e' }),
        },
      })
      expect(response.status()).toBe(200)
      return response.json()
    }

    const restockKey = `restock-${crypto.randomUUID()}`
    const restock = mcpData<{ movement: { available_quantity: number; revision: number } }>(await move('record_inventory_movement', 10, restockKey))
    expect(restock.movement).toMatchObject({ available_quantity: 10, revision: 1 })
    const duplicate = mcpData<{ movement: { available_quantity: number; revision: number } }>(await move('record_inventory_movement', 10, restockKey))
    expect(duplicate.movement).toMatchObject({ available_quantity: 10, revision: 1 })
    expect(mcpData<{ movement: { available_quantity: number } }>(await move('reserve_inventory', 4, `reserve-${crypto.randomUUID()}`)).movement.available_quantity).toBe(6)
    expect(mcpData<{ movement: { available_quantity: number } }>(await move('release_inventory', 2, `release-${crypto.randomUUID()}`)).movement.available_quantity).toBe(8)
    expect(mcpData<{ movement: { quantity_on_hand: number; quantity_reserved: number } }>(await move('consume_inventory', 2, `consume-${crypto.randomUUID()}`)).movement).toMatchObject({ quantity_on_hand: 8, quantity_reserved: 0 })

    const insufficient = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'reserve_inventory',
      args: { site_id: MCP_GROWTH_SITE_ID, product_id: product.id, quantity: 9, idempotency_key: `oversell-${crypto.randomUUID()}`, reference_type: 'order', reference_id: 'order-e2e' },
    })
    expect(insufficient.status()).toBe(200)
    expect((await insufficient.json()).result?.isError).toBe(true)

    const dashboard = await request.get(`${baseURL}/api/editor/sites/${MCP_GROWTH_SITE_ID}/locations/${locationId}/inventory`)
    expect(dashboard.status(), await dashboard.text()).toBe(200)
    expect((await dashboard.json() as { items: Array<{ product_id: string; available_quantity: number }> }).items).toContainEqual(expect.objectContaining({ product_id: product.id, available_quantity: 8 }))
    const publicCatalog = await request.get(`${baseURL}/api/public/sites/${MCP_GROWTH_SITE_ID}/ordering-catalog`)
    expect(publicCatalog.status()).toBe(200)
    expect((await publicCatalog.json() as { products: Array<{ id: string; available: boolean; inventory: { status: string; available_quantity: number } }> }).products)
      .toContainEqual(expect.objectContaining({ id: product.id, available: true, inventory: expect.objectContaining({ status: 'available', available_quantity: 8 }) }))

    const concurrentProduct = await createOrderingProduct(request, baseURL!, locationId, `Concurrent Inventory ${Date.now()}`)
    const concurrentKey = `concurrent-${crypto.randomUUID()}`
    const concurrentResponses = await Promise.all([1, 2].map(quantity => mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'record_inventory_movement',
      args: { site_id: MCP_GROWTH_SITE_ID, product_id: concurrentProduct.id, movement_type: 'restock', quantity, idempotency_key: concurrentKey },
    })))
    expect(concurrentResponses.map(response => response.status())).toEqual([200, 200])
    const concurrentBodies = await Promise.all(concurrentResponses.map(response => response.json()))
    expect(concurrentBodies.map(body => body.result?.isError === true).sort()).toEqual([false, true])

    await loginAs(request, baseURL!, MCP_GROWTH_SERVICE_USER_ID)
    const crossTenant = await request.get(`${baseURL}/api/editor/sites/${MCP_GROWTH_SITE_ID}/locations/${locationId}/inventory`)
    expect(crossTenant.status()).toBe(404)

    await loginAs(request, baseURL!, 'user-e2e-pottery-editor')
    const editorLocationId = await ensureLocation(request, baseURL!, 'site-pottery-house')
    const editorAuthorityChange = await request.put(`${baseURL}/api/editor/sites/site-pottery-house/locations/${editorLocationId}/inventory/authority`, {
      data: { authority_type: 'krabiclaw' },
    })
    expect(editorAuthorityChange.status()).toBe(403)
    const editorMcpAuthorityChange = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'set_inventory_authority',
      args: { site_id: 'site-pottery-house', location_id: editorLocationId, authority_type: 'krabiclaw' },
    })
    expect(editorMcpAuthorityChange.status()).toBe(200)
    expect((await editorMcpAuthorityChange.json()).result?.isError).toBe(true)
  })

  test('push-only external authority deduplicates events, orders resource versions, fails stale/unresolved stock closed, and rejects session auth', async ({ request, baseURL }) => {
    test.setTimeout(120_000)
    await loginAs(request, baseURL!, MCP_GROWTH_SERVICE_USER_ID)
    const otherLocationId = await ensureLocation(request, baseURL!, MCP_GROWTH_SERVICE_SITE_ID)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const locationId = await createScratchLocation(request, baseURL!, MCP_GROWTH_SITE_ID)
    const product = await createOrderingProduct(request, baseURL!, locationId, `External Inventory ${Date.now()}`)
    const clientId = `${baseURL}/api/auth/oauth2/test-inventory-client-metadata?nonce=${Date.now()}`
    const authority = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'set_inventory_authority',
      args: {
        site_id: MCP_GROWTH_SITE_ID, location_id: locationId, authority_type: 'external', provider: 'e2e-provider',
        oauth_client_id: clientId, provider_account_reference: 'merchant-e2e', external_location_reference: 'location-e2e',
      },
    })
    expect(authority.status()).toBe(200)

    const sessionAttempt = await request.post(`${baseURL}/api/integrations/inventory/sites/${MCP_GROWTH_SITE_ID}/locations/${locationId}/events`, {
      data: { provider_event_id: 'session', product_id: product.id, resource_version: 1, quantity_on_hand: 1, valid_until: new Date(Date.now() + 60_000).toISOString(), payload: {} },
    })
    expect(sessionAttempt.status()).toBe(401)

    const accessToken = await inventoryAccessToken(request, baseURL!, clientId)
    const push = async (providerEventId: string, resourceVersion: number, quantity: number, productId = product.id, validUntil = new Date(Date.now() + 60_000).toISOString()) => {
      const response = await request.post(`${baseURL}/api/integrations/inventory/sites/${MCP_GROWTH_SITE_ID}/locations/${locationId}/events`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { provider_event_id: providerEventId, product_id: productId, resource_version: resourceVersion, quantity_on_hand: quantity, valid_until: validUntil, payload: { source: 'e2e' } },
      })
      expect(response.status(), await response.text()).toBe(200)
      return response.json() as Promise<{ outcome: string; inventory: { quantity_on_hand: number; status: string } | null }>
    }
    const eventId = `provider-${crypto.randomUUID()}`
    await expect(push(eventId, 2, 7)).resolves.toMatchObject({ outcome: 'applied', inventory: { quantity_on_hand: 7, status: 'available' } })
    await expect(push(eventId, 2, 99)).resolves.toMatchObject({ outcome: 'duplicate', inventory: { quantity_on_hand: 7 } })
    await expect(push(`older-${crypto.randomUUID()}`, 1, 99)).resolves.toMatchObject({ outcome: 'stale', inventory: { quantity_on_hand: 7 } })
    await expect(push(`newer-${crypto.randomUUID()}`, 3, 5)).resolves.toMatchObject({ outcome: 'applied', inventory: { quantity_on_hand: 5 } })
    await expect(push(`unknown-${crypto.randomUUID()}`, 1, 2, crypto.randomUUID())).resolves.toMatchObject({ outcome: 'unresolved', inventory: null })
    const reservation = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'reserve_inventory',
      args: { site_id: MCP_GROWTH_SITE_ID, product_id: product.id, quantity: 4, idempotency_key: `external-reserve-${crypto.randomUUID()}`, reference_type: 'order', reference_id: 'external-order-e2e' },
    })
    expect(reservation.status()).toBe(200)
    await expect(push(`unresolved-${crypto.randomUUID()}`, 4, 2)).resolves.toMatchObject({
      outcome: 'unresolved', inventory: { quantity_on_hand: 5, status: 'unavailable' },
    })
    const unresolvedCatalog = await request.get(`${baseURL}/api/public/sites/${MCP_GROWTH_SITE_ID}/ordering-catalog`)
    expect((await unresolvedCatalog.json() as { products: Array<{ id: string; available: boolean; inventory: { state: string; status: string } }> }).products)
      .toContainEqual(expect.objectContaining({ id: product.id, available: false, inventory: expect.objectContaining({ state: 'unresolved', status: 'unavailable' }) }))
    await expect(push(`resolved-${crypto.randomUUID()}`, 5, 6)).resolves.toMatchObject({ outcome: 'applied', inventory: { quantity_on_hand: 6, status: 'available' } })
    await expect(push(`expired-${crypto.randomUUID()}`, 6, 6, product.id, new Date(Date.now() - 1_000).toISOString())).resolves.toMatchObject({ outcome: 'applied', inventory: { status: 'unavailable' } })
    const staleProductResponse = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'get_product', args: { site_id: MCP_GROWTH_SITE_ID, product_id: product.id },
    })
    expect(staleProductResponse.status()).toBe(200)
    expect(mcpData<{ product: { available: boolean } }>(await staleProductResponse.json()).product.available).toBe(false)

    const crossTenant = await request.post(`${baseURL}/api/integrations/inventory/sites/${MCP_GROWTH_SERVICE_SITE_ID}/locations/${otherLocationId}/events`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { provider_event_id: 'cross-tenant', product_id: product.id, resource_version: 5, quantity_on_hand: 1, valid_until: new Date(Date.now() + 60_000).toISOString(), payload: {} },
    })
    expect(crossTenant.status()).toBe(404)
  })
})
