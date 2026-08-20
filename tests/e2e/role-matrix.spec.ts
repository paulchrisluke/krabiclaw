import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test'
import { loginAs } from './helpers/auth'

type RoleUser = {
  id: string
  role: 'owner' | 'admin' | 'editor' | 'member'
}

type RoleRequests = Record<RoleUser['role'], APIRequestContext>
const SITE_ID = 'site-demo'
const ROLE_USERS: Record<RoleUser['role'], string> = {
  owner: 'user-e2e-demo-owner',
  admin: 'user-e2e-role-admin',
  editor: 'user-e2e-role-editor',
  member: 'user-e2e-role-member',
}

test.describe('role permission matrix', () => {
  test.describe.configure({ mode: 'serial' })

  let baseUrl: string
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
    roleRequests = {} as RoleRequests
    for (const [role, userId] of Object.entries(ROLE_USERS) as Array<[RoleUser['role'], string]>) {
      roleRequests[role] = await authenticatedRequest(userId)
    }
  })

  test.afterAll(async () => {
    await Promise.all(requestContexts.map(request => request.dispose()))
  })

  test('content permissions by role', async () => {
    test.setTimeout(60_000)

    const originalPages = await roleRequests.owner.get(`${baseUrl}/api/editor/sites/${SITE_ID}/pages`)
    expect(originalPages.status()).toBe(200)
    const home = ((await originalPages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(page => page.path === '/')
    expect(home?.id).toEqual(expect.any(String))
    const originalDetail = await roleRequests.owner.get(`${baseUrl}/api/editor/sites/${SITE_ID}/pages/${home!.id}`)
    expect(originalDetail.status()).toBe(200)
    const originalBody = await originalDetail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }> } }

    const contentUpdateStatus = async (request: APIRequestContext) => {
      const pages = await request.get(`${baseUrl}/api/editor/sites/${SITE_ID}/pages`)
      if (pages.status() !== 200) return pages
      const detail = await request.get(`${baseUrl}/api/editor/sites/${SITE_ID}/pages/${home!.id}`)
      if (detail.status() !== 200) return detail
      const body = await detail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
      const blocks = body.page.blocks.map(block => block.type === 'hero' ? { ...block, data: { ...block.data, title: `Role matrix ${Date.now()}` } } : block)
      return request.patch(`${baseUrl}/api/editor/sites/${SITE_ID}/pages/${home!.id}`, {
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
      const latestDetail = await roleRequests.owner.get(`${baseUrl}/api/editor/sites/${SITE_ID}/pages/${home!.id}`)
      expect(latestDetail.status()).toBe(200)
      const latestBody = await latestDetail.json() as { page: { document: { updated_at: string } } }
      const restored = await roleRequests.owner.patch(`${baseUrl}/api/editor/sites/${SITE_ID}/pages/${home!.id}`, {
        data: { blocks: originalBody.page.blocks, expectedDocumentUpdatedAt: latestBody.page.document.updated_at },
      })
      expect(restored.status()).toBe(200)
    }
  })

  test('post update/delete permissions by role', async () => {
    test.setTimeout(60_000)

    const createDraftPost = async (title: string) => {
      const res = await roleRequests.owner.post(`${baseUrl}/api/editor/sites/${SITE_ID}/posts`, {
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
      const res = await roleRequests[role].patch(`${baseUrl}/api/editor/sites/${SITE_ID}/posts/${postId}`, {
        data: { title: `Updated ${Date.now()}` },
      })
      expect(res.status()).toBe(expectedStatus)
    }

    const deletePostAs = async (role: RoleUser['role'], postId: string, expectedStatus: number) => {
      const res = await roleRequests[role].delete(`${baseUrl}/api/editor/sites/${SITE_ID}/posts/${postId}`)
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

    expect((await roleRequests.owner.delete(`${baseUrl}/api/editor/sites/${SITE_ID}/posts/${editorPostId}`)).status()).toBe(200)
    expect((await roleRequests.owner.delete(`${baseUrl}/api/editor/sites/${SITE_ID}/posts/${memberPostId}`)).status()).toBe(200)
  })
})
