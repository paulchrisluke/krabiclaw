import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { devLoginHeaders } from './test-env'
import { ensureSite } from './helpers/ensure-site'
import { loginAs } from './helpers/auth'

type RoleUser = {
  id: string
  role: 'owner' | 'admin' | 'editor' | 'member'
}

test.describe('chowbot tools', () => {
  test.describe.configure({ mode: 'serial' })

  test('delete_post enforces owner/admin boundary through ChowBot tool path', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)

    const sessionRes = await request.get(`${baseURL}/api/auth/get-session`)
    expect(sessionRes.status()).toBe(200)
    const session = await sessionRes.json() as { user?: { id?: string } }
    const ownerUserId = session.user?.id
    expect(ownerUserId).toEqual(expect.any(String))

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as {
      organization?: { id?: string }
      restaurant?: { id?: string | null }
    }
    const organizationId = context.organization?.id
    const siteId = await ensureSite(request, baseURL!, context.restaurant?.id ?? null)
    expect(organizationId).toEqual(expect.any(String))

    const createUser = async (role: 'admin' | 'editor') => {
      const res = await request.post(`${baseURL}/api/dev/test-member`, {
        data: { role, organizationId },
        headers: devLoginHeaders(),
      })
      expect(res.status()).toBe(200)
      const body = await res.json() as { user: RoleUser }
      return body.user
    }

    const admin = await createUser('admin')
    const editor = await createUser('editor')

    const createDraftPost = async (title: string) => {
      await loginAs(request, baseURL!, ownerUserId!)
      const res = await request.post(`${baseURL}/api/editor/sites/${siteId}/posts`, {
        data: { title, body: `Body for ${title}` },
      })
      expect(res.status()).toBe(201)
      const body = await res.json() as { post?: { id?: string } }
      expect(body.post?.id).toEqual(expect.any(String))
      return body.post!.id!
    }

    const execDeletePostTool = async (userId: string, postId: string) => {
      await loginAs(request, baseURL!, userId)
      const res = await request.post(`${baseURL}/api/dev/chowbot-tool`, {
        headers: devLoginHeaders(),
        data: {
          siteId,
          toolName: 'delete_post',
          input: { post_id: postId },
          messages: [{ role: 'user', content: 'yes, delete it' }],
        },
      })
      expect(res.status()).toBe(200)
      return res.json() as Promise<{ result: { deleted?: boolean; error?: string } }>
    }

    const ownerPostId = await createDraftPost(`Owner ChowBot delete ${Date.now()}`)
    const ownerDelete = await execDeletePostTool(ownerUserId!, ownerPostId)
    expect(ownerDelete.result).toEqual({ post_id: ownerPostId, deleted: true })

    const adminPostId = await createDraftPost(`Admin ChowBot delete ${Date.now()}`)
    const adminDelete = await execDeletePostTool(admin.id, adminPostId)
    expect(adminDelete.result).toEqual({ post_id: adminPostId, deleted: true })

    const editorPostId = await createDraftPost(`Editor ChowBot delete ${Date.now()}`)
    const editorDelete = await execDeletePostTool(editor.id, editorPostId)
    expect(editorDelete.result).toEqual({ error: 'Only owners or admins can delete posts.' })

    await loginAs(request, baseURL!, ownerUserId!)
    const stillThere = await request.get(`${baseURL}/api/editor/sites/${siteId}/posts/${editorPostId}`)
    expect(stillThere.status()).toBe(200)
  })

  test('rename_site rollback preserves original brand and subdomain through ChowBot tool path', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as {
      restaurant?: { id?: string | null }
    }
    const siteId = await ensureSite(request, baseURL!, context.restaurant?.id ?? null)

    const beforeRes = await request.get(`${baseURL}/api/sites/${siteId}/settings`)
    expect(beforeRes.status()).toBe(200)
    const beforeBody = await beforeRes.json() as {
      settings: {
        brand_name: string
        subdomain: string
      }
    }

    const toolRes = await request.post(`${baseURL}/api/dev/chowbot-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: 'rename_site',
        input: {
          brand_name: `${beforeBody.settings.brand_name} ChowBot Rollback ${Date.now()}`,
        },
        messages: [{ role: 'user', content: 'rename the site' }],
        forceSubdomainRegistrationFailure: true,
      },
    })
    expect(toolRes.status()).toBe(200)
    expect(await toolRes.json()).toEqual({
      result: {
        error: 'Failed to register subdomain with Cloudflare. The rename was not applied.',
      },
    })

    const afterRes = await request.get(`${baseURL}/api/sites/${siteId}/settings`)
    expect(afterRes.status()).toBe(200)
    const afterBody = await afterRes.json() as {
      settings: {
        brand_name: string
        subdomain: string
      }
    }

    expect(afterBody.settings.brand_name).toBe(beforeBody.settings.brand_name)
    expect(afterBody.settings.subdomain).toBe(beforeBody.settings.subdomain)
  })

  test('location update and Q&A tools use the canonical write path end-to-end', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as {
      restaurant?: { id?: string | null }
    }
    const siteId = await ensureSite(request, baseURL!, context.restaurant?.id ?? null)

    const listLocationsRes = await request.post(`${baseURL}/api/dev/chowbot-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: 'get_locations',
        input: {},
        messages: [{ role: 'user', content: 'show me locations' }],
      },
    })
    expect(listLocationsRes.status()).toBe(200)
    const listLocationsBody = await listLocationsRes.json() as {
      result: Array<{ id: string; title: string }>
    }
    expect(Array.isArray(listLocationsBody.result)).toBe(true)
    expect(listLocationsBody.result.length).toBeGreaterThan(0)
    const locationId = listLocationsBody.result[0]!.id

    const updateLocationRes = await request.post(`${baseURL}/api/dev/chowbot-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: 'update_location',
        input: {
          location_id: locationId,
          title: `Updated Tool Location ${Date.now()}`,
          status: 'inactive',
        },
        messages: [{ role: 'user', content: 'update the location' }],
      },
    })
    expect(updateLocationRes.status()).toBe(200)
    const updateLocationBody = await updateLocationRes.json() as {
      result: { id?: string; title?: string; status?: string; error?: string }
    }
    expect(updateLocationBody.result.error).toBeUndefined()
    expect(updateLocationBody.result.id).toBe(locationId)
    expect(updateLocationBody.result.status).toBe('inactive')

    const addQaRes = await request.post(`${baseURL}/api/dev/chowbot-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: 'add_qa',
        input: {
          location_id: locationId,
          question: `Do you take walk-ins? ${Date.now()}`,
          answer: 'Yes',
        },
        messages: [{ role: 'user', content: 'add a q and a' }],
      },
    })
    expect(addQaRes.status()).toBe(200)
    const addQaBody = await addQaRes.json() as {
      result: { id?: string; added?: boolean; error?: string }
    }
    expect(addQaBody.result.error).toBeUndefined()
    expect(addQaBody.result.id).toEqual(expect.any(String))
    const qaId = addQaBody.result.id!

    const deleteQaRes = await request.post(`${baseURL}/api/dev/chowbot-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: 'delete_qa',
        input: {
          location_id: locationId,
          qa_id: qaId,
        },
        messages: [{ role: 'user', content: 'yes, delete the q and a' }],
      },
    })
    expect(deleteQaRes.status()).toBe(200)
    expect(await deleteQaRes.json()).toEqual({
      result: {
        qa_id: qaId,
        deleted: true,
      },
    })

  })
})
