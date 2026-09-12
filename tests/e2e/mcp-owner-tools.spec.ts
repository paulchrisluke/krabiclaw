import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID, MCP_GROWTH_SERVICE_USER_ID } from './helpers/plan-fixtures'
import { MCP_GROWTH_SITE_ID, mcpRequest, mcpData, createScratchLocation, ensureSite, ensureLocation } from './helpers/mcp'

// Split out of mcp.spec.ts (owner tool-coverage tests) — see helpers/mcp.ts
// for why. This group covers the bulk of an owner's MCP tool surface: site
// page/settings, notifications/submissions, location/reviews/QA
// lifecycle, and Product/post/media workflows.

test.describe('stateless MCP server', () => {
  test('owner can use site content and settings tools', async ({ request, baseURL }) => {
    test.setTimeout(120_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = await ensureSite(request, baseURL!)

    const sitesList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_sites',
      args: {},
    })
    expect(sitesList.status()).toBe(200)
    const sitesListBody = await sitesList.json()
    const sitesListText = sitesListBody?.result?.content?.[0]?.text as string | undefined
    expect(sitesListText).toContain('You have')

    const siteRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: siteId },
    })
    expect(siteRead.status()).toBe(200)

    const pageList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_tenant_pages',
      args: { site_id: siteId, locale: 'en' },
    })
    expect(pageList.status()).toBe(200)
    const homeVariant = mcpData<{ pages: Array<{ id: string; path: string }> }>(await pageList.json()).pages.find(page => page.path === '/')
    expect(homeVariant?.id).toBeTruthy()

    const pageBefore = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_tenant_page',
      args: { site_id: siteId, variant_id: homeVariant!.id },
    })
    expect(pageBefore.status()).toBe(200)
    const pageBeforeData = mcpData<{
      page: {
        document: { updated_at: string }
        blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown>; media: unknown[] }>
      }
    }>(await pageBefore.json()).page
    const contentUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_tenant_page',
      args: {
        site_id: siteId,
        variant_id: homeVariant!.id,
        expected_updated_at: pageBeforeData.document.updated_at,
        blocks: pageBeforeData.blocks.map(block => ({
          id: block.id,
          type: block.type,
          position: block.position,
          data: block.type === 'hero'
            ? { ...block.data, title: `MCP Hero ${Date.now()}`, subtitle: 'Drafted through MCP' }
            : block.data,
          media: block.media,
        })),
      },
    })
    expect(contentUpdate.status()).toBe(200)

    const contentRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_tenant_page',
      args: { site_id: siteId, variant_id: homeVariant!.id },
    })
    expect(contentRead.status()).toBe(200)
    const mergedBody = await contentRead.json()
    const mergedHero = mcpData<{ page: { blocks: Array<{ type: string; data: Record<string, unknown> }> } }>(mergedBody).page.blocks.find(item => item.type === 'hero')
    expect(mergedHero?.data.title).toContain('MCP Hero')

    const settingsBefore = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site_settings',
      args: { site_id: siteId },
    })
    expect(settingsBefore.status()).toBe(200)

    const settingsUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_site_settings',
      args: { site_id: siteId, brand_description: 'Updated through MCP' },
    })
    expect(settingsUpdate.status()).toBe(200)

    const brandColorUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'set_brand_color',
      args: { site_id: siteId, color: '#0F4C5C' },
    })
    expect(brandColorUpdate.status()).toBe(200)
    const brandColorBody = await brandColorUpdate.json()
    expect(mcpData<{ brand_color: string; updated: boolean }>(brandColorBody).brand_color).toBe('#0F4C5C')
    expect(mcpData<{ brand_color: string; updated: boolean }>(brandColorBody).updated).toBe(true)

  })

  test('owner can use submission inquiry tools', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = await ensureSite(request, baseURL!)

    const locationId = await ensureLocation(request, baseURL!, siteId)
    const locationSetup = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'update_location',
      args: {
        site_id: siteId, location_id: locationId, timezone: 'Asia/Bangkok',
        opening_hours: { periods: Array.from({ length: 7 }, (_, day) => ({
          open: { day, hour: 12, minute: 0 }, close: { day, hour: 22, minute: 0 },
        })) },
      },
    })
    expect(mcpData<{ ok: boolean }>(await locationSetup.json()).ok).toBe(true)

    // Creating the policy is what lets a location take reservations: there is
    // no site-level default underneath it, so a guest cannot book until the
    // owner has said the branch takes tables.
    const policySetup = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'update_reservation_policy',
      args: { site_id: siteId, location_id: locationId, slot_capacity: 20 },
    })
    expect(policySetup.status(), await policySetup.text()).toBe(200)

    const publicContact = await request.post(`${baseURL}/api/public/sites/${siteId}/contact`, {
      data: { name: 'MCP Contact', email: `mcp-contact-${Date.now()}@example.test`, message: 'hello from MCP e2e' },
    })
    expect(publicContact.status()).toBe(201)
    const publicReservation = await request.post(`${baseURL}/api/public/sites/${siteId}/reservations`, {
      data: {
        name: 'MCP Reservation',
        email: `mcp-res-${Date.now()}@example.test`,
        phone: '+14155552673',
        date: '2030-01-15',
        time: '19:00',
        guests: '2',
        location_id: locationId,
      },
    })
    expect(publicReservation.status(), await publicReservation.text()).toBe(201)

    const listContacts = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_contact_inquiries',
      args: { site_id: siteId },
    })
    expect(listContacts.status()).toBe(200)
    const contactsBody = await listContacts.json()
    const contactSubmissionId = mcpData<{ submissions: Array<{ id: string }> }>(contactsBody).submissions[0]?.id
    expect(contactSubmissionId).toEqual(expect.any(String))

    const listReservations = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_reservation_inquiries',
      args: { site_id: siteId },
    })
    expect(listReservations.status()).toBe(200)
    const reservationsBody = await listReservations.json()
    const reservationSubmission = mcpData<{ submissions: Array<{
      id: string
      location_id: string | null
      location_title: string | null
      guests: string
      date: string
      time: string
      party_size?: unknown
      requested_date?: unknown
      requested_time?: unknown
    }> }>(reservationsBody).submissions[0]
    const reservationSubmissionId = reservationSubmission?.id
    expect(reservationSubmissionId).toEqual(expect.any(String))
    expect(reservationSubmission?.location_id).toEqual(expect.any(String))
    expect(reservationSubmission?.location_title).toEqual(expect.any(String))
    expect(reservationSubmission?.guests).toBe('2')
    expect(reservationSubmission?.date).toBe('2030-01-15')
    expect(reservationSubmission?.time).toBe('19:00')
    expect(reservationSubmission?.party_size).toBeUndefined()
    expect(reservationSubmission?.requested_date).toBeUndefined()
    expect(reservationSubmission?.requested_time).toBeUndefined()

    const tools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId,
    })
    expect(tools.status()).toBe(200)
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string }> } }
    const toolNames = toolsBody.result.tools.map(tool => tool.name)
    expect(toolNames).toContain('get_contact_inquiries')
    expect(toolNames).toContain('get_reservation_inquiries')
    expect(toolNames).not.toContain('update_contact_submission')
    expect(toolNames).not.toContain('update_reservation_submission')
  })

  test('owner can use location, reviews, and QA lifecycle tools', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID

    const locationId = await createScratchLocation(request, baseURL!, siteId)

    const locationRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_location',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(locationRead.status()).toBe(200)

    const locationUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_location',
      args: { site_id: siteId, location_id: locationId, phone: '+1 555 555 0111', city: 'Ao Nang' },
    })
    expect(locationUpdate.status()).toBe(200)

    const reviewsList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_location_reviews',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(reviewsList.status()).toBe(200)

    const qaCreate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_location_qa',
      args: { site_id: siteId, location_id: locationId, question: 'Do you have vegan options?', answer: 'Yes', is_owner_answer: true },
    })
    expect(qaCreate.status()).toBe(200)
    const qaCreateBody = await qaCreate.json()
    const qaId = mcpData<{ id: string }>(qaCreateBody).id
    expect(qaId).toEqual(expect.any(String))

    const qaUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_location_qa',
      args: { site_id: siteId, location_id: locationId, qa_id: qaId, answer: 'Yes, clearly marked vegan options.' },
    })
    expect(qaUpdate.status()).toBe(200)

    const qaList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_location_qa',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(qaList.status()).toBe(200)

    const qaCreateSecond = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_location_qa',
      args: { site_id: siteId, location_id: locationId, question: 'Are pets allowed?', answer: 'Yes, on the patio.', is_owner_answer: true },
    })
    expect(qaCreateSecond.status()).toBe(200)
    const qaCreateSecondBody = await qaCreateSecond.json()
    const qaIdSecond = mcpData<{ id: string }>(qaCreateSecondBody).id
    expect(qaIdSecond).toEqual(expect.any(String))

    const qaReorder = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'reorder_location_qa',
      args: {
        site_id: siteId,
        location_id: locationId,
        updates: [
          { id: qaId, sort_order: 2 },
          { id: qaIdSecond, sort_order: 1 },
        ],
      },
    })
    expect(qaReorder.status()).toBe(200)

    const qaDelete = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location_qa',
      args: { site_id: siteId, location_id: locationId, qa_id: qaId },
    })
    expect(qaDelete.status()).toBe(200)

    const qaDeleteSecond = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location_qa',
      args: { site_id: siteId, location_id: locationId, qa_id: qaIdSecond },
    })
    expect(qaDeleteSecond.status()).toBe(200)

    const requestId = crypto.randomUUID()
    const cleanupStarted = Date.now()
    const cleanupLog = { requestId, method: 'DELETE', path: `/api/sites/${siteId}/locations/${locationId}` }
    console.log('[e2e-cleanup]', JSON.stringify({ ...cleanupLog, event: 'started', testTimeoutMs: test.info().timeout }))
    try {
      const deleteLocationRes = await request.delete(`${baseURL}${cleanupLog.path}`, { headers: { 'x-request-id': requestId } })
      console.log('[e2e-cleanup]', JSON.stringify({ ...cleanupLog, event: 'finished', durationMs: Date.now() - cleanupStarted, status: deleteLocationRes.status(), rayId: deleteLocationRes.headers()['cf-ray'] }))
      expect(deleteLocationRes.status()).toBe(200)
    } catch (error) {
      console.log('[e2e-cleanup]', JSON.stringify({ ...cleanupLog, event: 'failed', durationMs: Date.now() - cleanupStarted }))
      throw error
    }
  })

  test('owner can manage site-level Q&A and provenance-aware reviews', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID
    const qaIds: string[] = []
    let reviewId = ''
    try {
      for (const question of [`MCP site question A ${Date.now()}`, `MCP site question B ${Date.now()}`]) {
        const response = await mcpRequest(request, baseURL!, {
          method: 'tools/call',
          toolName: 'create_site_qa',
          args: { site_id: siteId, question, answer: 'Site-wide answer.' },
        })
        expect(response.status()).toBe(200)
        const id = mcpData<{ id: string }>(await response.json()).id
        expect(id).toEqual(expect.any(String))
        qaIds.push(id)
      }

      const reorder = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'reorder_site_qa',
        args: { site_id: siteId, updates: [{ id: qaIds[0], sort_order: 2 }, { id: qaIds[1], sort_order: 1 }] },
      })
      expect(reorder.status()).toBe(200)

      const qaList = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'list_site_qa', args: { site_id: siteId },
      })
      expect(qaList.status()).toBe(200)

      const reviewCreate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_owner_entered_site_review',
        args: {
          site_id: siteId,
          author_name: 'MCP reviewer',
          rating: 5,
          content: 'The service was clear, responsive, and useful.',
          collection_method: 'email',
          original_reference: 'MCP regression fixture',
          publication_authorized: true,
          status: 'approved',
        },
      })
      expect(reviewCreate.status()).toBe(200)
      const reviewData = mcpData<{ id: string; verified: boolean }>(await reviewCreate.json())
      reviewId = reviewData.id
      expect(reviewId).toEqual(expect.any(String))
      expect(reviewData.verified).toBe(false)

      const reviewList = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'list_site_reviews', args: { site_id: siteId },
      })
      expect(reviewList.status()).toBe(200)

      const reviewUpdate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'update_owner_entered_site_review',
        args: { site_id: siteId, review_id: reviewId, rating: 4 },
      })
      expect(reviewUpdate.status()).toBe(200)
    } finally {
      for (const qaId of qaIds) {
        await mcpRequest(request, baseURL!, {
          method: 'tools/call', toolName: 'delete_site_qa', args: { site_id: siteId, qa_id: qaId },
        })
      }
      if (reviewId) {
        await mcpRequest(request, baseURL!, {
          method: 'tools/call', toolName: 'delete_owner_entered_site_review', args: { site_id: siteId, review_id: reviewId },
        })
      }
    }
  })

  test.describe('owner management workflows', () => {
    test('CMS manages locations while MCP rejects business setup tools', async ({ request, baseURL }) => {
      await loginAs(request, baseURL!, MCP_GROWTH_SERVICE_USER_ID)
      const siteId = await ensureSite(request, baseURL!)
      const locationId = await createScratchLocation(request, baseURL!, siteId)

      const deleteLocationRes = await request.delete(`${baseURL}/api/sites/${siteId}/locations/${locationId}`)
      expect(deleteLocationRes.status()).toBe(200)
      const catalog = await mcpRequest(request, baseURL!, { method: 'tools/list' })
      const names = (await catalog.json()).result.tools.map((tool: { name: string }) => tool.name)
      for (const toolName of ['create_site', 'create_location', 'delete_location', 'copy_location_batch']) {
        expect(names).not.toContain(toolName)
        const rejected = await mcpRequest(request, baseURL!, {
          method: 'tools/call', toolName, args: { site_id: siteId, location_id: locationId },
        })
        expect(rejected.status()).toBe(200)
        expect((await rejected.json()).error.code).toBe(-32601)
      }
      expect(names).toEqual(expect.arrayContaining(['delete_media_asset', 'delete_product', 'update_location']))

    })

    test('owner can manage media and Product tools including public booking', async ({ request, baseURL }) => {
      test.setTimeout(120_000)
      await loginAs(request, baseURL!, MCP_GROWTH_SERVICE_USER_ID)
      const siteId = await ensureSite(request, baseURL!)
      const locationId = await ensureLocation(request, baseURL!, siteId)

      const locationSetup = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'update_location',
        args: { site_id: siteId, location_id: locationId, timezone: 'Asia/Bangkok' },
      })
      expect(mcpData<{ ok: boolean }>(await locationSetup.json()).ok).toBe(true)

      const mediaList = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'get_site_media_assets',
        args: { site_id: siteId },
      })
      expect(mediaList.status()).toBe(200)

      // A bookable Product is created by the same tool as any other Product;
      // what a customer buys is a variant, and the price lives there.
      const product = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_product',
        args: {
          site_id: siteId,
          name: 'MCP Kayak Tour',
          description: 'Half-day tour',
          variants: [{ name: 'Per person', prices: [{ unit_amount: 150000, currency: 'THB' }] }],
        },
      })
      expect(product.status()).toBe(200)
      const created = mcpData<{ product: { id: string; slug: string } }>(await product.json()).product
      expect(created.id).toEqual(expect.any(String))

      for (const [toolName, args] of [
        ['set_product_publication', { site_id: siteId, product_id: created.id, published: true }],
        ['set_product_location', { site_id: siteId, product_id: created.id, location_id: locationId, active: true, published: true }],
      ] as const) {
        const response = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName, args })
        expect(response.status(), await response.text()).toBe(200)
      }

      const listed = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'list_products', args: { site_id: siteId },
      })
      expect(listed.status()).toBe(200)
      expect(mcpData<{ products: Array<{ id: string }> }>(await listed.json()).products.some(item => item.id === created.id)).toBe(true)

      const read = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'get_product', args: { site_id: siteId, product_id: created.id },
      })
      expect(read.status()).toBe(200)
      const readProduct = mcpData<{ product: { slug: string; locations: Array<{ location_id: string; published: boolean }> } }>(await read.json()).product
      expect(readProduct.locations.some(entry => entry.location_id === locationId && entry.published)).toBe(true)

      const update = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'update_product',
        args: { site_id: siteId, product_id: created.id, description: 'Updated through MCP', tags: ['small group'] },
      })
      expect(update.status()).toBe(200)

      const invalid = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_product', args: { site_id: siteId, name: '' },
      })
      expect(invalid.status()).toBe(200)
      expect((await invalid.json()).result?.isError).toBe(true)

      // A Product with no materialized sessions offers nothing to book, and
      // says so rather than inventing a slot from a rule nobody generated.
      const sessions = await request.get(`${baseURL}/api/public/sites/${siteId}/products/${readProduct.slug}/sessions`)
      expect([200, 404, 409]).toContain(sessions.status())
      if (sessions.status() === 200) {
        const { sessions: rows } = await sessions.json() as { sessions: Array<{ id: string; is_full: boolean }> }
        const open = rows.find(session => !session.is_full)
        if (open) {
          const booking = await request.post(`${baseURL}/api/public/sites/${siteId}/products/${readProduct.slug}/book`, {
            data: {
              guest_name: 'MCP Product Guest',
              guest_email: `mcp-product-${Date.now()}@example.test`,
              party_size: 2,
              session_id: open.id,
              notes: 'Created via public booking flow for MCP coverage',
            },
          })
          expect(booking.status(), await booking.text()).toBe(201)
          const { booking_id: bookingId } = await booking.json() as { booking_id: string }
          expect(bookingId).toEqual(expect.any(String))
        }
      }

      const deleteCandidate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_product',
        args: { site_id: siteId, name: 'Delete MCP Product', description: 'Temporary Product' },
      })
      expect(deleteCandidate.status()).toBe(200)
      const deleteId = mcpData<{ product: { id: string } }>(await deleteCandidate.json()).product.id
      const deleted = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'delete_product', args: { site_id: siteId, product_id: deleteId },
      })
      expect(deleted.status()).toBe(200)
    })
  })

})
