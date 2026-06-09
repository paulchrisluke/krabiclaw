import { expect, test } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'

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
    const siteId = context.restaurant?.id ?? null
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

    const draftStatus = async () => request.post(`${baseURL}/api/editor/sites/${siteId}/content/draft`, {
      data: {
        page: 'home',
        changes: { 'hero.title': `Role matrix ${Date.now()}` },
      },
    })

    const publishStatus = async () => request.post(`${baseURL}/api/editor/sites/${siteId}/content/publish`, {
      data: { page: 'home' },
    })

    const assertRole = async (
      userId: string,
      expectedCheckout: 'owner' | 'non_owner',
      expectedDraft?: number,
      expectedPublish?: number,
    ) => {
      await asUser(userId)
      await checkoutStatus(expectedCheckout)
      if (siteId && expectedDraft !== undefined && expectedPublish !== undefined) {
        expect((await draftStatus()).status()).toBe(expectedDraft)
        expect((await publishStatus()).status()).toBe(expectedPublish)
      }
    }

    await assertRole(ownerUserId!, 'owner', 200, 200)
    await assertRole(admin.id, 'non_owner', 200, 200)
    await assertRole(editor.id, 'non_owner', 200, 404)
    await assertRole(member.id, 'non_owner', 404, 404)

    if (!siteId) {
      // No restaurant workspace in this environment: content draft/publish role checks are not applicable.
      return
    }
  })
})
