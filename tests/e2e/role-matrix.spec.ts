import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'
import { ensureSite } from './helpers/ensure-site'

type RoleUser = {
  id: string
  role: 'owner' | 'admin' | 'editor' | 'member'
}

type RoleRequests = Record<RoleUser['role'], APIRequestContext>

test.describe('role permission matrix', () => {
  test.describe.configure({ mode: 'serial' })

  let baseUrl: string
  let siteId: string
  let roleRequests: RoleRequests
  const requestContexts: APIRequestContext[] = []

  async function authenticatedRequest(userId?: string) {
    const request = await playwrightRequest.newContext()
    requestContexts.push(request)
    const login = await request.get(devLoginUrl(baseUrl, userId), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(login.status()).toBe(302)
    return request
  }

  test.beforeAll(async ({ baseURL }) => {
    const startedAt = Date.now()
    baseUrl = baseURL!
    const ownerRequest = await authenticatedRequest()
    const [sessionRes, contextRes] = await Promise.all([
      ownerRequest.get(`${baseUrl}/api/auth/get-session`),
      ownerRequest.get(`${baseUrl}/api/dashboard/context`),
    ])
    expect(sessionRes.status()).toBe(200)
    const session = await sessionRes.json() as { user?: { id?: string } }
    expect(session.user?.id).toEqual(expect.any(String))

    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as {
      organization?: { id?: string }
      site?: { id?: string | null }
    }
    const organizationId = context.organization?.id
    expect(organizationId).toEqual(expect.any(String))
    siteId = await ensureSite(ownerRequest, baseUrl, context.site?.id ?? null)

    const createUser = async (role: 'admin' | 'editor' | 'member') => {
      const res = await ownerRequest.post(`${baseUrl}/api/dev/test-member`, {
        data: { role, organizationId },
        headers: devLoginHeaders(),
      })
      expect(res.status()).toBe(200)
      const body = await res.json() as { user: RoleUser }
      expect(body.user.id).toEqual(expect.any(String))
      return body.user
    }

    const [admin, editor, member] = await Promise.all([
      createUser('admin'),
      createUser('editor'),
      createUser('member'),
    ])
    const [adminRequest, editorRequest, memberRequest] = await Promise.all([
      authenticatedRequest(admin.id),
      authenticatedRequest(editor.id),
      authenticatedRequest(member.id),
    ])
    roleRequests = {
      owner: ownerRequest,
      admin: adminRequest,
      editor: editorRequest,
      member: memberRequest,
    }
    expect(Date.now() - startedAt).toBeLessThan(30_000)
  })

  test.afterAll(async () => {
    await Promise.all(requestContexts.map(request => request.dispose()))
  })

  test('content permissions by role', async () => {
    test.setTimeout(60_000)

    const contentUpdateStatus = async (request: APIRequestContext) => {
      const pages = await request.get(`${baseUrl}/api/editor/sites/${siteId}/pages`)
      if (pages.status() !== 200) return pages
      const home = ((await pages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(page => page.path === '/')
      if (!home) return pages
      const detail = await request.get(`${baseUrl}/api/editor/sites/${siteId}/pages/${home.id}`)
      if (detail.status() !== 200) return detail
      const body = await detail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
      const blocks = body.page.blocks.map(block => block.type === 'hero' ? { ...block, data: { ...block.data, title: `Role matrix ${Date.now()}` } } : block)
      return request.patch(`${baseUrl}/api/editor/sites/${siteId}/pages/${home.id}`, {
        data: { blocks, expectedDocumentUpdatedAt: body.page.document.updated_at },
      })
    }

    const assertRole = async (role: RoleUser['role'], expectedContentUpdate: number) => {
      expect((await contentUpdateStatus(roleRequests[role])).status()).toBe(expectedContentUpdate)
    }

    await assertRole('owner', 200)
    await assertRole('admin', 200)
    await assertRole('editor', 200)
    await assertRole('member', 403)
  })

  test('post update/delete permissions by role', async () => {
    test.setTimeout(60_000)

    const createDraftPost = async (title: string) => {
      const res = await roleRequests.owner.post(`${baseUrl}/api/editor/sites/${siteId}/posts`, {
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

    const updatePostAs = async (role: RoleUser['role'], postId: string, expectedStatus: number) => {
      const res = await roleRequests[role].patch(`${baseUrl}/api/editor/sites/${siteId}/posts/${postId}`, {
        data: { title: `Updated ${Date.now()}` },
      })
      expect(res.status()).toBe(expectedStatus)
    }

    const deletePostAs = async (role: RoleUser['role'], postId: string, expectedStatus: number) => {
      const res = await roleRequests[role].delete(`${baseUrl}/api/editor/sites/${siteId}/posts/${postId}`)
      expect(res.status()).toBe(expectedStatus)
    }

    const [ownerPostId, adminPostId, editorPostId, memberPostId] = await Promise.all([
      createDraftPost(`Owner delete ${Date.now()}`),
      createDraftPost(`Admin delete ${Date.now()}`),
      createDraftPost(`Editor delete ${Date.now()}`),
      createDraftPost(`Member edit ${Date.now()}`),
    ])

    await Promise.all([
      (async () => {
        await updatePostAs('owner', ownerPostId, 200)
        await deletePostAs('owner', ownerPostId, 200)
      })(),
      (async () => {
        await updatePostAs('admin', adminPostId, 200)
        await deletePostAs('admin', adminPostId, 200)
      })(),
      (async () => {
        await updatePostAs('editor', editorPostId, 200)
        await deletePostAs('editor', editorPostId, 404)
      })(),
      (async () => {
        await updatePostAs('member', memberPostId, 403)
        await deletePostAs('member', memberPostId, 404)
      })(),
    ])

    expect((await roleRequests.owner.delete(`${baseUrl}/api/editor/sites/${siteId}/posts/${editorPostId}`)).status()).toBe(200)
    expect((await roleRequests.owner.delete(`${baseUrl}/api/editor/sites/${siteId}/posts/${memberPostId}`)).status()).toBe(200)
  })
})
