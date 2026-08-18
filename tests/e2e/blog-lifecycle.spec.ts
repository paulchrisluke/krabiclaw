import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'

const USER_ID = 'user-e2e-free-owner'
const SITE_ID = 'site-mcp-free'
const BLOG_WRITE_STATEMENT_BUDGET = 35

function expectWriteBudget(response: { headers(): Record<string, string> }, maxStatements = BLOG_WRITE_STATEMENT_BUDGET) {
  const headers = response.headers()
  const statementCount = Number(headers['x-d1-query-count'])
  const batchCount = Number(headers['x-d1-batch-count'])
  expect(Number.isInteger(statementCount)).toBe(true)
  expect(Number.isInteger(batchCount)).toBe(true)
  expect(statementCount).toBeLessThanOrEqual(maxStatements)
  expect(batchCount).toBe(1)
}

function expectLifecycleBudget(response: { headers(): Record<string, string> }, maxStatements: number) {
  const headers = response.headers()
  const statementCount = Number(headers['x-d1-query-count'])
  const batchCount = Number(headers['x-d1-batch-count'])
  expect(Number.isInteger(statementCount)).toBe(true)
  expect(statementCount).toBeLessThanOrEqual(maxStatements)
  expect(batchCount).toBe(1)
}

test.describe('canonical tenant blog lifecycle', () => {
  test.describe.configure({ mode: 'serial' })
  test('dashboard API and public rendering share one guarded block document', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, USER_ID)
    const suffix = Date.now()
    let postId = ''
    let slug = ''

    try {
      const legacy = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/blog/posts`, {
        data: { title: `Legacy ${suffix}`, body: 'This must not create a shadow Markdown document.' },
      })
      expect(legacy.status()).toBe(400)
      await expect(legacy.json()).resolves.toMatchObject({ error: expect.stringContaining('content_blocks') })

      const created = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/blog/posts`, {
        data: {
          title: `Canonical blog ${suffix}`,
          category: 'News',
          tags: ['canonical', 'blocks'],
          content_blocks: [
            { type: 'heading', level: 2, data: { text: 'One document' } },
            { type: 'markdown', data: { markdown: 'Initial **visual** prose.', editor_mode: 'rich' } },
            { type: 'faq', data: { items: [{ question: 'Canonical?', answer: 'Always.' }] } },
          ],
        },
      })
      expectWriteBudget(created)
      expect(created.status()).toBe(200)
      const createdBody = await created.json() as { id: string; slug: string; post: { content_document: { document: { updated_at: string }; blocks: Array<{ type: string }> } } }
      postId = createdBody.id
      slug = createdBody.slug
      expect(createdBody.post.content_document.blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'faq'])
      const initialToken = createdBody.post.content_document.document.updated_at

      const updatedBlocks = [
        { type: 'heading', level: 2, data: { text: 'One document' } },
        { type: 'markdown', data: { markdown: 'Updated **visual** prose.', editor_mode: 'rich' } },
        { type: 'divider', data: {} },
        { type: 'how_to', data: { steps: [{ name: 'First', text: 'Save blocks' }, { name: 'Second', text: 'Publish the post' }] } },
      ]
      const updated = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { content_blocks: updatedBlocks, expected_document_updated_at: initialToken },
      })
      expectWriteBudget(updated)
      expect(updated.status()).toBe(200)
      const updatedBody = await updated.json() as { post: { updated_at: string; content_document: { document: { updated_at: string }; blocks: Array<{ type: string }> } } }
      expect(updatedBody.post.content_document.blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'divider', 'how_to'])
      const updatedToken = updatedBody.post.content_document.document.updated_at

      const stale = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { content_blocks: updatedBlocks, expected_document_updated_at: initialToken },
      })
      expect(stale.status()).toBe(409)

      const metadataUpdate = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { excerpt: 'Concurrency token owner.', expected_updated_at: updatedBody.post.updated_at },
      })
      expect(metadataUpdate.status()).toBe(200)
      const metadataBody = await metadataUpdate.json() as { post: { updated_at: string } }

      const rejectedLifecyclePatch = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { publish: true, expected_updated_at: updatedBody.post.updated_at },
      })
      expect(rejectedLifecyclePatch.status()).toBe(400)
      await expect(rejectedLifecyclePatch.json()).resolves.toMatchObject({ error: expect.stringContaining('publish operation') })

      const published = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}/publish`, {
        data: {
          expected_updated_at: metadataBody.post.updated_at,
          expected_document_updated_at: updatedToken,
          scheduled_for: null,
        },
      })
      expectLifecycleBudget(published, 7)
      expect(published.status()).toBe(200)
      const publishedBody = await published.json() as { success: true; lifecycle: { status: string; updated_at: string; content_document_updated_at: string } }
      expect(publishedBody).toEqual({
        success: true,
        lifecycle: expect.objectContaining({
          status: 'published',
          updated_at: expect.any(String),
          content_document_updated_at: expect.any(String),
        }),
      })

      const publicPost = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${slug}`)
      expect(publicPost.status()).toBe(200)
      const publicBody = await publicPost.json() as { post: { content_blocks: Array<{ type: string; data: Record<string, unknown> }> } }
      expect(publicBody.post.content_blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'divider', 'how_to'])
      expect(publicBody.post.content_blocks[1]?.data.markdown).toBe('Updated **visual** prose.')

      const editorAfterPublish = await request.get(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
      const editorAfterPublishBody = await editorAfterPublish.json() as { post: { content_document: { document: { updated_at: string } } } }
      const currentBlocks = updatedBlocks.map(block => block.type === 'markdown'
        ? { ...block, data: { ...block.data, markdown: 'Current published prose.' } }
        : block)
      const draftUpdate = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { content_blocks: currentBlocks, expected_document_updated_at: editorAfterPublishBody.post.content_document.document.updated_at },
      })
      expectWriteBudget(draftUpdate)
      expect(draftUpdate.status()).toBe(200)
      const stillPublished = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${slug}`)
      const stillPublishedBody = await stillPublished.json() as { post: { content_blocks: Array<{ type: string; data: Record<string, unknown> }> } }
      expect(stillPublishedBody.post.content_blocks[1]?.data.markdown).toBe('Current published prose.')

      const draftUpdateBody = await draftUpdate.json() as { post: { updated_at: string; content_document: { document: { updated_at: string } } } }
      const republished = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}/publish`, {
        data: {
          expected_updated_at: draftUpdateBody.post.updated_at,
          expected_document_updated_at: draftUpdateBody.post.content_document.document.updated_at,
          scheduled_for: null,
        },
      })
      expectLifecycleBudget(republished, 7)
      expect(republished.status()).toBe(200)
      const republishedBodyState = await republished.json() as { lifecycle: { updated_at: string; content_document_updated_at: string } }
      const republishedPublic = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${slug}`)
      const republishedBody = await republishedPublic.json() as { post: { content_blocks: Array<{ type: string; data: Record<string, unknown> }> } }
      expect(republishedBody.post.content_blocks[1]?.data.markdown).toBe('Current published prose.')

      const unpublished = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}/unpublish`, {
        data: {
          expected_updated_at: republishedBodyState.lifecycle.updated_at,
          expected_document_updated_at: republishedBodyState.lifecycle.content_document_updated_at,
        },
      })
      expectLifecycleBudget(unpublished, 6)
      expect(unpublished.status()).toBe(200)
      const hidden = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${slug}`)
      expect(hidden.status()).toBe(404)

      const reopened = await request.get(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
      expect(reopened.status()).toBe(200)
      const reopenedBody = await reopened.json() as { post: { content_document: { document: { updated_at: string }; blocks: Array<{ type: string }> } } }
      expect(reopenedBody.post.content_document.blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'divider', 'how_to'])
      expect(reopenedBody.post.content_document.document.updated_at).not.toBe(updatedToken)
    } finally {
      if (postId) await request.delete(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
    }
  })

  test('dashboard creates, edits, configures, publishes, and reopens canonical blocks', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    await loginAs(page.context().request, baseURL!, USER_ID)
    const title = `Dashboard block editor ${Date.now()}`
    let postId = ''
    try {
      await page.goto(`${baseURL}/dashboard/mcp-free-fixture/sites/mcp-free-fixture/blog`)
      await expect(page.getByRole('heading', { name: 'Blog Posts' })).toBeVisible()
      await page.getByRole('link', { name: 'New Post' }).click()

      await page.getByRole('textbox', { name: 'Post title' }).fill(title)
      const richEditor = page.locator('[contenteditable="true"]').first()
      await expect(richEditor).toBeVisible()
      await richEditor.fill('A visual editor paragraph with **canonical blocks**.')

      await page.getByRole('button', { name: 'Insert block' }).first().click()
      await page.getByRole('button', { name: 'FAQ', exact: true }).click()
      await expect(page.getByPlaceholder('Question')).toBeVisible()
      await page.getByPlaceholder('Question').fill('Does this round-trip?')
      await page.getByPlaceholder('Answer').fill('Yes, through one block document.')

      await page.waitForURL(url => /\/blog\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'))
      postId = page.url().split('/').at(-1) ?? ''
      await page.getByRole('button', { name: 'Post settings' }).click()
      const dialog = page.getByRole('dialog', { name: 'Post settings' })
      await expect(dialog).toBeVisible()
      await expect(page.getByLabel('Category')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('button', { name: 'Post settings' })).toBeFocused()

      const publishResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/editor/sites/${SITE_ID}/blog/${postId}/publish`) && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Publish' }).click()
      await expect(page.getByText(/Published · Saved/)).toBeVisible()
      expectLifecycleBudget(await publishResponsePromise, 7)
      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Post title' })).toHaveValue(title)
      await expect(page.getByPlaceholder('Question')).toHaveValue('Does this round-trip?')
      await expect(page.getByPlaceholder('Answer')).toHaveValue('Yes, through one block document.')
      const unpublishResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/editor/sites/${SITE_ID}/blog/${postId}/unpublish`) && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Unpublish' }).click()
      await expect(page.getByText(/Draft · Saved/)).toBeVisible()
      expectLifecycleBudget(await unpublishResponsePromise, 6)

      await page.getByRole('button', { name: 'Post settings' }).click()
      const scheduleDialog = page.getByRole('dialog', { name: 'Post settings' })
      await scheduleDialog.getByRole('combobox', { name: 'Publish timing' }).click()
      await page.getByRole('option', { name: 'Scheduled', exact: true }).click()
      const scheduledLocal = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
      await scheduleDialog.getByLabel('Scheduled for').fill(scheduledLocal)
      await page.keyboard.press('Escape')
      const scheduleResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/editor/sites/${SITE_ID}/blog/${postId}/publish`) && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Publish' }).click()
      await expect(page.getByText(/Scheduled · Saved/)).toBeVisible()
      expectLifecycleBudget(await scheduleResponsePromise, 5)
      const cancelScheduleResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/editor/sites/${SITE_ID}/blog/${postId}/unpublish`) && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Unpublish' }).click()
      await expect(page.getByText(/Draft · Saved/)).toBeVisible()
      expectLifecycleBudget(await cancelScheduleResponsePromise, 6)

      const editorRead = await page.context().request.get(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
      const editorBody = await editorRead.json() as { post: { slug: string } }
      const hidden = await page.context().request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${editorBody.post.slug}`)
      expect(hidden.status()).toBe(404)
    } finally {
      if (postId) await page.context().request.delete(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
    }
  })
})
