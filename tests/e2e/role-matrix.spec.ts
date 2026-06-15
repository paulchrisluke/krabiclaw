import { expect, test } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'
import { ensureSite } from './helpers/ensure-site'

type RoleUser = {
  id: string
  role: 'owner' | 'admin' | 'editor' | 'member'
}

test.describe('role permission matrix', () => {
  test.describe.configure({ mode: 'serial' })

  test('content + billing permissions by role', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    const ownerLogin = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders(), maxRedirects: 0 })
    expect(ownerLogin.status()).toBe(302)
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

    const createUser = async (role: 'admin' | 'editor' | 'member') => {
      const res = await request.post(`${baseURL}/api/dev/test-member`, {
        data: { role, organizationId },
        headers: devLoginHeaders(),
      })
      expect(res.status()).toBe(200)
      const body = await res.json() as { user: RoleUser }
      expect(body.user.id).toEqual(expect.any(String))
      return body.user
    }

    const admin = await createUser('admin')
    const editor = await createUser('editor')
    const member = await createUser('member')

    const asUser = async (userId: string) => {
      const login = await request.get(devLoginUrl(baseURL!, userId), { headers: devLoginHeaders(), maxRedirects: 0 })
      expect(login.status()).toBe(302)
    }

    const checkoutStatus = async (expected: 'owner' | 'non_owner') => {
      const res = await request.post(`${baseURL}/api/billing/checkout`, {
        data: { plan: 'growth', interval: 'month' },
      })
      if (expected === 'owner') {
        expect(res.status()).not.toBe(403)
      } else {
        expect(res.status()).toBe(403)
      }
    }

    const contentUpdateStatus = async () => request.post(`${baseURL}/api/editor/sites/${siteId}/content/save`, {
      data: {
        page: 'home',
        changes: { 'hero.title': `Role matrix ${Date.now()}` },
      },
    })

    const assertRole = async (
      userId: string,
      expectedCheckout: 'owner' | 'non_owner',
      expectedContentUpdate?: number,
    ) => {
      await asUser(userId)
      await checkoutStatus(expectedCheckout)
      if (siteId && expectedContentUpdate !== undefined) {
        expect((await contentUpdateStatus()).status()).toBe(expectedContentUpdate)
      }
    }

    await assertRole(ownerUserId!, 'owner', 200)
    await assertRole(admin.id, 'non_owner', 200)
    await assertRole(editor.id, 'non_owner', 200)
    await assertRole(member.id, 'non_owner', 404)

  })

  test('post update/delete permissions by role', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    const ownerLogin = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders(), maxRedirects: 0 })
    expect(ownerLogin.status()).toBe(302)

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

    const createUser = async (role: 'admin' | 'editor' | 'member') => {
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
    const member = await createUser('member')

    const asUser = async (userId: string) => {
      const login = await request.get(devLoginUrl(baseURL!, userId), { headers: devLoginHeaders(), maxRedirects: 0 })
      expect(login.status()).toBe(302)
    }

    const createDraftPost = async (title: string) => {
      await asUser(ownerUserId!)
      const res = await request.post(`${baseURL}/api/editor/sites/${siteId}/posts`, {
        data: {
          title,
          body: `Body for ${title}`,
        },
      })
      expect(res.status()).toBe(201)
      const body = await res.json() as { post?: { id?: string } }
      expect(body.post?.id).toEqual(expect.any(String))
      return body.post!.id!
    }

    const updatePostAs = async (userId: string, postId: string, expectedStatus: number) => {
      await asUser(userId)
      const res = await request.patch(`${baseURL}/api/editor/sites/${siteId}/posts/${postId}`, {
        data: { title: `Updated ${Date.now()}` },
      })
      expect(res.status()).toBe(expectedStatus)
    }

    const deletePostAs = async (userId: string, postId: string, expectedStatus: number) => {
      await asUser(userId)
      const res = await request.delete(`${baseURL}/api/editor/sites/${siteId}/posts/${postId}`)
      expect(res.status()).toBe(expectedStatus)
    }

    const ownerPostId = await createDraftPost(`Owner delete ${Date.now()}`)
    await updatePostAs(ownerUserId!, ownerPostId, 200)
    await deletePostAs(ownerUserId!, ownerPostId, 200)

    const adminPostId = await createDraftPost(`Admin delete ${Date.now()}`)
    await updatePostAs(admin.id, adminPostId, 200)
    await deletePostAs(admin.id, adminPostId, 200)

    const editorPostId = await createDraftPost(`Editor delete ${Date.now()}`)
    await updatePostAs(editor.id, editorPostId, 200)
    await deletePostAs(editor.id, editorPostId, 404)

    const memberPostId = await createDraftPost(`Member edit ${Date.now()}`)
    await updatePostAs(member.id, memberPostId, 404)
    await deletePostAs(member.id, memberPostId, 404)
  })
})
