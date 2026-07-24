import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID, MCP_MANAGED_USER_ID } from './helpers/plan-fixtures'
import { MCP_GROWTH_SITE_ID, MCP_MANAGED_SITE_ID, mcpRequest, mcpData, createScratchLocation } from './helpers/mcp'

// Split out of mcp.spec.ts (owner tool-coverage tests) — see helpers/mcp.ts
// for why. This group covers the bulk of an owner's MCP tool surface: site
// content/settings, notifications/submissions, location/reviews/QA
// lifecycle, and menus/posts/media/experiences workflows.

test.describe('stateless MCP server', () => {
  test('owner can use site content and settings tools', async ({ request, baseURL }) => {
    test.setTimeout(120_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID

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

    const contentUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_page_content',
      args: {
        site_id: siteId,
        page: 'home',
        changes: {
          'hero.title': `MCP Hero ${Date.now()}`,
          'hero.subtitle': 'Drafted through MCP',
        },
      },
    })
    expect(contentUpdate.status()).toBe(200)

    const contentRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_page_fields',
      args: { site_id: siteId, page: 'home' },
    })
    expect(contentRead.status()).toBe(200)
    const mergedBody = await contentRead.json()
    const mergedHero = mcpData<{ fields: Array<{ field: string; hero_title?: string }> }>(mergedBody).fields.find(item => item.field === 'hero')
    expect(mergedHero?.hero_title).toContain('MCP Hero')

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

    const deleteFieldSeed = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_page_content',
      args: {
        site_id: siteId,
        page: 'about',
        changes: {
          'story.headline': `Delete me ${Date.now()}`,
        },
      },
    })
    expect(deleteFieldSeed.status()).toBe(200)

    const deleteField = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_content_field',
      args: { site_id: siteId, page: 'about', field: 'story.headline' },
    })
    expect(deleteField.status()).toBe(200)
  })

  test('owner can use notification settings and submission inquiry tools', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID

    const notifications = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_notification_settings',
      args: { site_id: siteId, whatsapp_phone: '+1 415 555 2671' },
    })
    expect(notifications.status()).toBe(200)
    const notificationsBody = await notifications.json()
    expect(mcpData<{ notifications: { whatsapp_phone: string } }>(notificationsBody).notifications.whatsapp_phone).toContain('+14155552671')

    const notificationsRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_notification_settings',
      args: { site_id: siteId },
    })
    expect(notificationsRead.status()).toBe(200)

    const publicContact = await request.post(`${baseURL}/api/public/sites/${siteId}/contact`, {
      data: { name: 'MCP Contact', email: `mcp-contact-${Date.now()}@example.test`, message: 'hello from MCP e2e' },
    })
    expect(publicContact.status()).toBe(201)
    const publicReservation = await request.post(`${baseURL}/api/public/sites/${siteId}/reservations`, {
      data: {
        name: 'MCP Reservation',
        email: `mcp-res-${Date.now()}@example.test`,
        phone: '+15555550199',
        date: '2030-01-15',
        time: '19:00',
        guests: '2',
        location_id: 'loc-mcp-growth',
      },
    })
    expect(publicReservation.status()).toBe(201)

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
    const qaId = mcpData<{ id?: string }>(qaCreateBody).id
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
    const qaIdSecond = mcpData<{ id?: string }>(qaCreateSecondBody).id
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

    const deleteLocationRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(deleteLocationRes.status()).toBe(200)
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
        const id = mcpData<{ id?: string }>(await response.json()).id
        expect(id).toEqual(expect.any(String))
        qaIds.push(id!)
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
      const reviewData = mcpData<{ id?: string; verified?: boolean }>(await reviewCreate.json())
      reviewId = reviewData.id ?? ''
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

  test('owner can use menus, posts, media, and experiences workflow tools', async ({ request, baseURL }) => {
    // 31 sequential real API round-trips (menus, items, posts, media, experiences,
    // cleanup) — has repeatedly landed right at a 180s budget on its final
    // delete_location cleanup call under normal (non-degraded) preview latency,
    // with every prior assertion passing. Not a hang: each individual step is fast,
    // there are just a lot of them.
    test.setTimeout(300_000)
    await loginAs(request, baseURL!, MCP_MANAGED_USER_ID)
    const siteId = MCP_MANAGED_SITE_ID
    const locationId = await createScratchLocation(request, baseURL!, siteId)

    const menu = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu',
      args: { site_id: siteId, name: `MCP Menu ${Date.now()}` },
    })
    expect(menu.status()).toBe(200)
    const menuBody = await menu.json()
    const menuId = mcpData<{ id?: string; menu?: { id: string } }>(menuBody).id ?? mcpData<{ id?: string; menu?: { id: string } }>(menuBody).menu?.id
    expect(menuId).toEqual(expect.any(String))

    const menuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Mains', name: 'MCP Curry', price_amount: '12.50' },
    })
    expect(menuItem.status()).toBe(200)
    const menuItemBody = await menuItem.json()
    const menuItemId = mcpData<{ id?: string; item?: { id: string } }>(menuItemBody).id ?? mcpData<{ id?: string; item?: { id: string } }>(menuItemBody).item?.id
    expect(menuItemId).toEqual(expect.any(String))

    const secondMenuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Mains', name: 'MCP Noodles', price_amount: '11.25', sort_order: 2 },
    })
    expect(secondMenuItem.status()).toBe(200)
    const secondMenuItemBody = await secondMenuItem.json()
    const menuItemIdSecond = mcpData<{ id?: string; item?: { id: string } }>(secondMenuItemBody).id ?? mcpData<{ id?: string; item?: { id: string } }>(secondMenuItemBody).item?.id
    expect(menuItemIdSecond).toEqual(expect.any(String))

    const dessertMenuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Desserts', name: 'MCP Mango Sticky Rice', price_amount: '8.00' },
    })
    expect(dessertMenuItem.status()).toBe(200)

    const menuRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_menu',
      args: { site_id: siteId, menu_id: menuId },
    })
    expect(menuRead.status()).toBe(200)
    const menuReadBody = await menuRead.json()
    expect(mcpData<{ menu: { items: Array<{ name: string }> } }>(menuReadBody).menu.items.some(item => item.name === 'MCP Curry')).toBe(true)

    const menusList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_menus',
      args: { site_id: siteId },
    })
    expect(menusList.status()).toBe(200)

    const menuUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_menu',
      args: { site_id: siteId, menu_id: menuId, description: 'Updated through MCP', status: 'published' },
    })
    expect(menuUpdate.status()).toBe(200)

    const menuItemUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_menu_item',
      args: { site_id: siteId, menu_item_id: menuItemId, name: 'MCP Green Curry', price_amount: '13.00' },
    })
    expect(menuItemUpdate.status()).toBe(200)

    const renameSection = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'rename_menu_section',
      args: { site_id: siteId, menu_id: menuId, old_name: 'Mains', new_name: 'Entrees' },
    })
    expect(renameSection.status()).toBe(200)

    const reorderMenu = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'reorder_menu_items',
      args: {
        site_id: siteId,
        menu_id: menuId,
        updates: [
          { id: menuItemId, sort_order: 2 },
          { id: menuItemIdSecond, sort_order: 1 },
        ],
      },
    })
    expect(reorderMenu.status()).toBe(200)

    const deleteDessertSection = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_menu_section',
      args: { site_id: siteId, menu_id: menuId, section_name: 'Desserts' },
    })
    expect(deleteDessertSection.status()).toBe(200)

    const deleteMenuItemRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_menu_item',
      args: { site_id: siteId, menu_item_id: menuItemIdSecond },
    })
    expect(deleteMenuItemRes.status()).toBe(200)

    const post = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_post',
      args: { site_id: siteId, title: 'MCP Post', body: 'Created through MCP' },
    })
    expect(post.status()).toBe(200)
    const postBody = await post.json()
    const postId = mcpData<{ id?: string; post?: { id: string } }>(postBody).id ?? mcpData<{ id?: string; post?: { id: string } }>(postBody).post?.id
    expect(postId).toEqual(expect.any(String))

    const publishedPost = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'publish_post',
      args: { site_id: siteId, post_id: postId, channels: ['site'] },
    })
    expect(publishedPost.status()).toBe(200)

    const postUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_post',
      args: { site_id: siteId, post_id: postId, title: 'MCP Post Updated', body: 'Updated through MCP' },
    })
    expect(postUpdate.status()).toBe(200)

    const postsList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_posts',
      args: { site_id: siteId },
    })
    expect(postsList.status()).toBe(200)

    const postRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_post',
      args: { site_id: siteId, post_id: postId },
    })
    expect(postRead.status()).toBe(200)

    const postDeleteCandidate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_post',
      args: { site_id: siteId, title: 'Delete Me', body: 'Temporary post' },
    })
    expect(postDeleteCandidate.status()).toBe(200)
    const postDeleteCandidateBody = await postDeleteCandidate.json()
    const postDeleteId = mcpData<{ id?: string; post?: { id: string } }>(postDeleteCandidateBody).id ?? mcpData<{ id?: string; post?: { id: string } }>(postDeleteCandidateBody).post?.id
    expect(postDeleteId).toEqual(expect.any(String))

    const postDelete = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_post',
      args: { site_id: siteId, post_id: postDeleteId },
    })
    expect(postDelete.status()).toBe(200)

    const mediaList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site_media_assets',
      args: { site_id: siteId },
    })
    expect(mediaList.status()).toBe(200)

    const experience = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_experience',
      args: { site_id: siteId, title: 'MCP Kayak Tour', body: 'Half-day tour', status: 'active', time_slots: ['14:00'], max_capacity: 6 },
    })
    expect(experience.status()).toBe(200)
    const experienceBody = await experience.json()
    const experienceId = mcpData<{ id?: string; experience?: { id: string } }>(experienceBody).id ?? mcpData<{ id?: string; experience?: { id: string } }>(experienceBody).experience?.id
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
      args: { site_id: siteId, experience_id: experienceId, tagline: 'Updated through MCP', available_note: 'Call ahead to confirm.' },
    })
    expect(experienceUpdate.status()).toBe(200)

    const invalidExperience = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_experience',
      args: { site_id: siteId, title: 'Invalid MCP Experience', status: 'draft' },
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
    expect(booking.status()).toBe(201)
    const bookingBody = await booking.json() as { booking_id: string }
    const bookingId = bookingBody.booking_id
    expect(bookingId).toEqual(expect.any(String))

    const bookingsList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_experience_bookings',
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
      toolName: 'update_experience_booking',
      args: { site_id: siteId, experience_id: experienceId, booking_id: bookingId, status: 'confirmed' },
    })
    expect(bookingUpdate.status()).toBe(200)

    const deleteExperienceCandidate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_experience',
      args: { site_id: siteId, title: 'Delete MCP Experience', body: 'Temporary experience', status: 'inactive' },
    })
    expect(deleteExperienceCandidate.status()).toBe(200)
    const deleteExperienceCandidateBody = await deleteExperienceCandidate.json()
    const deleteExperienceId = mcpData<{ id?: string; experience?: { id: string } }>(deleteExperienceCandidateBody).id ?? mcpData<{ id?: string; experience?: { id: string } }>(deleteExperienceCandidateBody).experience?.id
    expect(deleteExperienceId).toEqual(expect.any(String))

    const deleteExperienceRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_experience',
      args: { site_id: siteId, experience_id: deleteExperienceId },
    })
    expect(deleteExperienceRes.status()).toBe(200)

    const deleteMenuRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_menu',
      args: { site_id: siteId, menu_id: menuId },
    })
    expect(deleteMenuRes.status()).toBe(200)

    const deleteLocationRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(deleteLocationRes.status()).toBe(200)
  })

})
