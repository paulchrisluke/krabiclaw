import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'

const USER_ID = 'user-mcp-free'
const SITE_ID = 'site-mcp-free'

test.describe('canonical tenant blog lifecycle', () => {
  test.describe.configure({ mode: 'serial' })
  test('dashboard API and public rendering share one guarded block document', async ({ request, baseURL }) => {
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
        { type: 'how_to', data: { steps: [{ name: 'First', text: 'Save blocks' }, { name: 'Second', text: 'Publish revision' }] } },
      ]
      const updated = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { content_blocks: updatedBlocks, expected_document_updated_at: initialToken },
      })
      expect(updated.status()).toBe(200)
      const updatedBody = await updated.json() as { post: { content_document: { document: { updated_at: string }; blocks: Array<{ type: string }> } } }
      expect(updatedBody.post.content_document.blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'divider', 'how_to'])
      const updatedToken = updatedBody.post.content_document.document.updated_at

      const stale = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { content_blocks: updatedBlocks, expected_document_updated_at: initialToken },
      })
      expect(stale.status()).toBe(409)

      const published = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { publish: true, expected_updated_at: (updatedBody.post as { updated_at?: string }).updated_at },
      })
      expect(published.status()).toBe(200)

      const publicPost = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${slug}`)
      expect(publicPost.status()).toBe(200)
      const publicBody = await publicPost.json() as { post: { content_blocks: Array<{ type: string; data: Record<string, unknown> }> } }
      expect(publicBody.post.content_blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'divider', 'how_to'])
      expect(publicBody.post.content_blocks[1]?.data.markdown).toBe('Updated **visual** prose.')

      const editorAfterPublish = await request.get(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
      const editorAfterPublishBody = await editorAfterPublish.json() as { post: { content_document: { document: { updated_at: string } } } }
      const unpublishedDraftBlocks = updatedBlocks.map(block => block.type === 'markdown'
        ? { ...block, data: { ...block.data, markdown: 'Unpublished draft prose.' } }
        : block)
      const draftUpdate = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, {
        data: { content_blocks: unpublishedDraftBlocks, expected_document_updated_at: editorAfterPublishBody.post.content_document.document.updated_at },
      })
      expect(draftUpdate.status()).toBe(200)
      const stillPublished = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${slug}`)
      const stillPublishedBody = await stillPublished.json() as { post: { content_blocks: Array<{ type: string; data: Record<string, unknown> }> } }
      expect(stillPublishedBody.post.content_blocks[1]?.data.markdown).toBe('Updated **visual** prose.')

      const republished = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`, { data: { publish: true } })
      expect(republished.status()).toBe(200)
      const republishedPublic = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${slug}`)
      const republishedBody = await republishedPublic.json() as { post: { content_blocks: Array<{ type: string; data: Record<string, unknown> }> } }
      expect(republishedBody.post.content_blocks[1]?.data.markdown).toBe('Unpublished draft prose.')

      const unpublished = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}/unpublish`)
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
    test.setTimeout(60_000)
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

      await page.getByRole('button', { name: 'Publish' }).click()
      await expect(page.getByText(/Published · Saved/)).toBeVisible()
      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Post title' })).toHaveValue(title)
      await expect(page.getByPlaceholder('Question')).toHaveValue('Does this round-trip?')
      await expect(page.getByPlaceholder('Answer')).toHaveValue('Yes, through one block document.')
      await page.getByRole('button', { name: 'Unpublish' }).click()
      await expect(page.getByText(/Draft · Saved/)).toBeVisible()
      const editorRead = await page.context().request.get(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
      const editorBody = await editorRead.json() as { post: { slug: string } }
      const hidden = await page.context().request.get(`${baseURL}/api/public/sites/${SITE_ID}/blog/${editorBody.post.slug}`)
      expect(hidden.status()).toBe(404)
    } finally {
      if (postId) await page.context().request.delete(`${baseURL}/api/editor/sites/${SITE_ID}/blog/${postId}`)
    }
  })
})
