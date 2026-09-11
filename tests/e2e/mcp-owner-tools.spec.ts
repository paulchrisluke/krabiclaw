import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID, MCP_GROWTH_SERVICE_USER_ID } from './helpers/plan-fixtures'
import { MCP_GROWTH_SITE_ID, mcpRequest, mcpData, createScratchLocation, ensureSite, ensureLocation } from './helpers/mcp'

// Split out of mcp.spec.ts (owner tool-coverage tests) — see helpers/mcp.ts
// for why. This group covers the bulk of an owner's MCP tool surface: site
// page/settings, notifications/submissions, location/reviews/QA
// lifecycle, and Products/posts/media/experiences workflows.

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
      expect(names).toEqual(expect.arrayContaining(['delete_media_asset', 'delete_experience', 'update_location']))

    })

    test('owner can manage media and experience tools including public booking', async ({ request, baseURL }) => {
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

      const experience = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_experience',
        args: { site_id: siteId, location_id: locationId, title: 'MCP Kayak Tour', body: 'Half-day tour', status: 'active', recurring_slots: { monday: ['14:00'], tuesday: ['14:00'], wednesday: ['14:00'], thursday: ['14:00'], friday: ['14:00'], saturday: ['14:00'], sunday: ['14:00'] }, max_capacity: 6 },
      })
      expect(experience.status()).toBe(200)
      const experienceBody = await experience.json()
      const experienceId = mcpData<{ id: string }>(experienceBody).id
      expect(experienceId).toEqual(expect.any(String))

      const listedExperiences = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'list_experiences',
        args: { site_id: siteId },
      })
      expect(listedExperiences.status()).toBe(200)
      const experiencesBody = await listedExperiences.json()
      expect(mcpData<{ experiences: Array<{ id: string }> }>(experiencesBody).experiences.some(item => item.id === experienceId)).toBe(true)

      const experienceRead = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'get_experience',
        args: { site_id: siteId, experience_id: experienceId },
      })
      expect(experienceRead.status()).toBe(200)

      const experienceUpdate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'update_experience',
        args: { site_id: siteId, experience_id: experienceId, tagline: 'Updated through MCP', tags: ['small group'] },
      })
      expect(experienceUpdate.status()).toBe(200)

      const invalidExperience = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_experience',
        args: { site_id: siteId, location_id: locationId, title: 'Invalid MCP Experience', status: 'draft' },
      })
      expect(invalidExperience.status()).toBe(200)
      const invalidExperienceBody = await invalidExperience.json()
      expect(invalidExperienceBody.result?.isError).toBe(true)

      const experienceReadBody = await experienceRead.json()
      const experienceSlug = mcpData<{ experience: { slug: string } }>(experienceReadBody).experience.slug
      expect(experienceSlug).toEqual(expect.any(String))

      const futureDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const booking = await request.post(`${baseURL}/api/public/sites/${siteId}/experiences/${experienceSlug}/book`, {
        data: {
          guest_name: 'MCP Experience Guest',
          guest_email: `mcp-exp-${Date.now()}@example.test`,
          party_size: 2,
          booking_date: futureDate,
          time_slot: '14:00',
          notes: 'Created via public booking flow for MCP coverage',
        },
      })
      expect(booking.status(), await booking.text()).toBe(201)
      const bookingBody = await booking.json() as { booking_id: string }
      const bookingId = bookingBody.booking_id
      expect(bookingId).toEqual(expect.any(String))

      const bookingsList = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'list_bookings',
        args: { site_id: siteId, experience_id: experienceId },
      })
      expect(bookingsList.status()).toBe(200)
      const bookingsBody = await bookingsList.json()
      const listedBooking = mcpData<{ bookings: Array<{ id: string; location_id: string | null; location_title: string | null }> }>(bookingsBody)
        .bookings.find(item => item.id === bookingId)
      expect(listedBooking?.location_id).toEqual(expect.any(String))
      expect(listedBooking?.location_title).toEqual(expect.any(String))

      const bookingUpdate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'update_booking',
        args: { site_id: siteId, experience_id: experienceId, booking_id: bookingId, status: 'confirmed' },
      })
      expect(bookingUpdate.status()).toBe(200)

      const deleteExperienceCandidate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_experience',
        args: { site_id: siteId, location_id: locationId, title: 'Delete MCP Experience', body: 'Temporary experience', status: 'inactive' },
      })
      expect(deleteExperienceCandidate.status()).toBe(200)
      const deleteExperienceCandidateBody = await deleteExperienceCandidate.json()
      const deleteExperienceId = mcpData<{ id: string }>(deleteExperienceCandidateBody).id
      expect(deleteExperienceId).toEqual(expect.any(String))

      const deleteExperienceRes = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'delete_experience',
        args: { site_id: siteId, experience_id: deleteExperienceId },
      })
      expect(deleteExperienceRes.status()).toBe(200)
    })
  })

})
