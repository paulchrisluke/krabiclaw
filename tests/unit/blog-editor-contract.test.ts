import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('slug changes preflight a post collision in the same site scope', async () => {
  const source = await readFile(new URL('../../server/utils/platform-content.ts', import.meta.url), 'utf8')
  assert.match(source, /SELECT id FROM blog_posts[\s\S]*slug = \? AND id != \?[\s\S]*site_id = \?/)
  assert.match(source, /if \(postCollision\) badRequest\('Slug already in use'\)/)
})

test('platform, Saya, Blawby, and editor SEO all use the shared resolver', async () => {
  const paths = [
    '../../pages/blog/[category]/[slug].vue',
    '../../pages/blog/[slug].vue',
    '../../pages/article/[slug].vue',
    '../../components/workspace/blog/BlogPostEditor.vue',
  ]
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /resolveBlogSeo\(/, path)
  }
})

test('editor supplies the complete public article model and scopes both theme token families', async () => {
  const source = await readFile(new URL('../../components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  for (const prop of ['category', 'published-at', 'updated-at', 'author-name', 'author-image', 'site-name', 'media-url', 'media-kind', 'read-minutes']) {
    assert.match(source, new RegExp(`:${prop}=`), prop)
  }
  assert.match(source, /templateName\.value === 'saya'/)
  assert.match(source, /--saya-primary/)
  assert.match(source, /--blawby-primary/)
})

test('markdown editing preserves the canonical source without an HTML round trip', async () => {
  const source = await readFile(new URL('../../components/blog/BlogArticleRenderer.vue', import.meta.url), 'utf8')
  assert.match(source, /<textarea[\s\S]*v-if="editable && block\.type === 'markdown'"[\s\S]*:value="textValue\(block\)"[\s\S]*@input="updateText\(index, block, \$event\)"/)
  assert.doesNotMatch(source, /htmlToMarkdown|contenteditable=/)
})

test('editor autosave preserves canonical empty documents and serializes draft creation', async () => {
  const source = await readFile(new URL('../../components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /if \(loaded\.content_document\)[\s\S]*structuredClone\(loaded\.content_document\.blocks \|\| \[\]\)[\s\S]*else/)
  assert.match(source, /let createDraftPromise: Promise<BlogPost \| null> \| null = null/)
  assert.match(source, /if \(createDraftPromise\) return await createDraftPromise/)
  assert.match(source, /social_image_asset_id: form\.social_image_asset_id \|\| null/)
  assert.match(source, /void flushSave\(\)\.catch\(\(\) => \{\}\)/)
  assert.match(source, /flush: 'sync'/)
})

test('settings panel behaves as an accessible modal', async () => {
  const source = await readFile(new URL('../../components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /@keydown="onSettingsKeydown"/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /settingsFocusableElements\(\)\[0\]\?\.focus\(\)/)
})
