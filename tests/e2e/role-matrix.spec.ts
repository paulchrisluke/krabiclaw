import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test'
import { ensureSite } from './helpers/ensure-site'
import { inviteAndAcceptMember, loginAs } from './helpers/auth'

type RoleUser = {
  id: string
  role: 'owner' | 'admin' | 'editor' | 'member'
}

type RoleRequests = Record<RoleUser['role'], APIRequestContext>
const OWNER_USER_ID = 'user-e2e-role-owner'

test.describe('role permission matrix', () => {
  test.describe.configure({ mode: 'serial' })

  let baseUrl: string
  let siteId: string
  let roleRequests: RoleRequests
  const requestContexts: APIRequestContext[] = []

  async function authenticatedRequest(userId?: string) {
    const request = await playwrightRequest.newContext()
    requestContexts.push(request)
    await loginAs(request, baseUrl, userId)
    return request
  }

  test.beforeAll(async ({ baseURL }) => {
    test.setTimeout(120_000)
    baseUrl = baseURL!
    const ownerRequest = await authenticatedRequest(OWNER_USER_ID)
    const [sessionRes, contextRes] = await Promise.all([
      ownerRequest.get(`${baseUrl}/api/auth/get-session`),
      ownerRequest.get(`${baseUrl}/api/dashboard/context`),
    ])
    expect(sessionRes.status()).toBe(200)
    const session = await sessionRes.json() as { user?: { id?: string } }
    expect(session.user?.id).toEqual(expect.any(String))

    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { site?: { id?: string | null } }
    siteId = await ensureSite(ownerRequest, baseUrl, context.site?.id ?? null)
    const siteResponse = await ownerRequest.get(`${baseUrl}/api/sites/${siteId}`)
    expect(siteResponse.status()).toBe(200)
    const organizationId = ((await siteResponse.json()) as { organization_id?: string }).organization_id
    expect(organizationId).toEqual(expect.any(String))

    for (const fixture of [
      { userId: 'user-e2e-role-admin', role: 'admin' as const },
      { userId: 'user-e2e-role-editor', role: 'editor' as const, siteId },
      { userId: 'user-e2e-role-member', role: 'member' as const },
    ]) {
      await loginAs(ownerRequest, baseUrl, OWNER_USER_ID)
      await inviteAndAcceptMember(ownerRequest, baseUrl, {
        ...fixture,
        organizationId: organizationId!,
      })
    }
    await loginAs(ownerRequest, baseUrl, OWNER_USER_ID)

    const adminRequest = await authenticatedRequest('user-e2e-role-admin')
    const editorRequest = await authenticatedRequest('user-e2e-role-editor')
    const memberRequest = await authenticatedRequest('user-e2e-role-member')
    roleRequests = {
      owner: ownerRequest,
      admin: adminRequest,
      editor: editorRequest,
      member: memberRequest,
    }
  })

  test.afterAll(async () => {
    await Promise.all(requestContexts.map(request => request.dispose()))
  })

  test('content permissions by role', async () => {
    test.setTimeout(60_000)

    const originalPages = await roleRequests.owner.get(`${baseUrl}/api/editor/sites/${siteId}/pages`)
    expect(originalPages.status()).toBe(200)
    const home = ((await originalPages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(page => page.path === '/')
    expect(home?.id).toEqual(expect.any(String))
    const originalDetail = await roleRequests.owner.get(`${baseUrl}/api/editor/sites/${siteId}/pages/${home!.id}`)
    expect(originalDetail.status()).toBe(200)
    const originalBody = await originalDetail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }> } }

    const contentUpdateStatus = async (request: APIRequestContext) => {
      const pages = await request.get(`${baseUrl}/api/editor/sites/${siteId}/pages`)
      if (pages.status() !== 200) return pages
      const detail = await request.get(`${baseUrl}/api/editor/sites/${siteId}/pages/${home!.id}`)
      if (detail.status() !== 200) return detail
      const body = await detail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
      const blocks = body.page.blocks.map(block => block.type === 'hero' ? { ...block, data: { ...block.data, title: `Role matrix ${Date.now()}` } } : block)
      return request.patch(`${baseUrl}/api/editor/sites/${siteId}/pages/${home!.id}`, {
        data: { blocks, expectedDocumentUpdatedAt: body.page.document.updated_at },
      })
    }

    const assertRole = async (role: RoleUser['role'], expectedContentUpdate: number) => {
      expect((await contentUpdateStatus(roleRequests[role])).status()).toBe(expectedContentUpdate)
    }

    try {
      await assertRole('owner', 200)
      await assertRole('admin', 200)
      await assertRole('editor', 200)
      await assertRole('member', 403)
    } finally {
      const latestDetail = await roleRequests.owner.get(`${baseUrl}/api/editor/sites/${siteId}/pages/${home!.id}`)
      expect(latestDetail.status()).toBe(200)
      const latestBody = await latestDetail.json() as { page: { document: { updated_at: string } } }
      const restored = await roleRequests.owner.patch(`${baseUrl}/api/editor/sites/${siteId}/pages/${home!.id}`, {
        data: { blocks: originalBody.page.blocks, expectedDocumentUpdatedAt: latestBody.page.document.updated_at },
      })
      expect(restored.status()).toBe(200)
    }
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
