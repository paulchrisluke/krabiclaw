import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { replaceMarkdownRange, splitMarkdownAt } from '../../utils/markdown-source.ts'
import { platformBlogDraftCreateInput } from '../../server/utils/platform-content-request.ts'

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
    '../../lib/components/workspace/blog/BlogPostEditor.vue',
  ]
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /resolveBlogSeo\(/, path)
  }
})

test('editor supplies the complete public article model and scopes both theme token families', async () => {
  const source = await readFile(new URL('../../lib/components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  for (const prop of ['category', 'published-at', 'updated-at', 'author-name', 'author-image', 'site-name', 'media-url', 'media-kind', 'read-minutes']) {
    assert.match(source, new RegExp(`:${prop}=`), prop)
  }
  assert.match(source, /templateName\.value === 'saya'/)
  assert.match(source, /--saya-primary/)
  assert.match(source, /--blawby-primary/)
})

test('markdown editing makes visual and lossless source modes explicit', async () => {
  const source = await readFile(new URL('../../components/ui/RichTextEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /<UEditor[\s\S]*v-if="mode === 'rich'"/)
  assert.match(source, /<div v-else[\s\S]*<textarea[\s\S]*:value="modelValue"[\s\S]*@input="emitSource"/)
  assert.match(source, /replaceMarkdownRange\(props\.modelValue, start, end, replacement\)/)
  assert.match(source, /splitMarkdownAt\(props\.modelValue, start\)/)
  assert.match(source, /editorMode: 'source'/)
  assert.match(source, /editorMode: 'rich'/)
})

test('source-native Markdown operations preserve tables, HTML, links, lists, and formatting exactly', () => {
  const markdown = [
    '## Heading **with bold**',
    '',
    '- [linked item](https://example.com)',
    '- second item with _italics_',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| one | two |',
    '',
    '<aside data-kind="legal">Raw <strong>HTML</strong></aside>',
  ].join('\n')
  const position = markdown.indexOf('| Name')
  const halves = splitMarkdownAt(markdown, position)
  assert.equal(halves.before + halves.after, markdown)

  const linkedItemStart = markdown.indexOf('linked item')
  const edited = replaceMarkdownRange(markdown, linkedItemStart, linkedItemStart + 'linked item'.length, 'updated link text')
  assert.equal(edited.replace('updated link text', 'linked item'), markdown)
  assert.match(edited, /\| Name \| Value \|[\s\S]*<aside data-kind="legal">Raw <strong>HTML<\/strong><\/aside>/)
})

test('editor autosave requires canonical documents and serializes draft creation', async () => {
  const source = await readFile(new URL('../../lib/components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /if \(!loaded\.content_document\) throw new Error\('Blog content document is missing'\)[\s\S]*structuredClone\(loaded\.content_document\.blocks \|\| \[\]\)/)
  assert.match(source, /let createDraftPromise: Promise<BlogPost \| null> \| null = null/)
  assert.match(source, /if \(createDraftPromise\) return await createDraftPromise/)
  assert.match(source, /social_image_asset_id: form\.social_image_asset_id \|\| null/)
  assert.match(source, /flush: 'sync'/)
  assert.match(source, /const persistedPostId = computed\(\(\) => post\.value\?\.id \|\| postId\.value\)/)
  assert.match(source, /function buildSaveSnapshot\(id = persistedPostId\.value\)/)
  assert.match(source, /async function flushSaveAndNavigate\(\) \{[\s\S]*await flushSave\(\)[\s\S]*!props\.isEdit && !postId\.value && saved\?\.id[\s\S]*repository\.editUrl\(saved\.id\)/)
  assert.doesNotMatch(source, /await navigateTo\(props\.repository\.editUrl\(created\.id\)\)/)
})

test('editor creation persists one draft before any token-checked publish or schedule lifecycle', async () => {
  const source = await readFile(new URL('../../lib/components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  const createStart = source.indexOf('async function createDraft')
  const createEnd = source.indexOf('function isDraftValid', createStart)
  const createFlow = source.slice(createStart, createEnd)
  const createCall = createFlow.split('\n').find(line => line.includes('props.repository.create(')) ?? ''
  assert.match(createCall, /props\.repository\.create\(/)
  assert.doesNotMatch(createCall, /\bpublish\s*:/)
  assert.doesNotMatch(createCall, /\bscheduled_for\s*:/)
  assert.match(createFlow, /if \(publishAfterCreateRequested\) \{[\s\S]*props\.repository\.publish\(created\.id, \{[\s\S]*\.\.\.lifecycleVersionInput\(\)/)
  assert.match(source, /post && \(post\.status === 'published' \|\| post\.status === 'scheduled'\)[\s\S]*@click="unpublish"/)
  assert.match(source, /form\.scheduled_for = toLocalDatetime\(lifecycle\.scheduled_for\)[\s\S]*publishTiming\.value = lifecycle\.scheduled_for \? 'Scheduled' : 'Now'/)
})

test('shared blog creation is draft-only and rejects lifecycle fields', async () => {
  const source = await readFile(new URL('../../server/utils/platform-content.ts', import.meta.url), 'utf8')
  const createStart = source.indexOf('export async function createPlatformBlogPost')
  const createEnd = source.indexOf('export async function updatePlatformBlogLifecycle', createStart)
  const createFlow = source.slice(createStart, createEnd)
  assert.match(createFlow, /assertDraftOnlyBlogCreate\(input\)/)
  assert.match(createFlow, /'draft',[\s\S]*input\.visibility \?\? 'public',[\s\S]*null,[\s\S]*null/)
  assert.match(createFlow, /label: 'Draft canonical blocks'/)
  assert.match(createFlow, /publish: false/)
  assert.doesNotMatch(createFlow, /parseScheduledFor/)
})

test('admin blog create preserves explicit draft metadata and rejects lifecycle fields before mapping', async () => {
  const source = await readFile(new URL('../../server/api/admin/blog/posts.post.ts', import.meta.url), 'utf8')
  assert.match(source, /assertDraftOnlyBlogCreate\(body\)/)
  const mapped = platformBlogDraftCreateInput({
    title: 'Complete draft',
    content_blocks: [{ type: 'markdown', data: { markdown: 'Draft body', editor_mode: 'rich' } }],
    tags: ['canonical', 'draft'],
    seo_title: 'Search title',
    social_image_asset_id: 'asset-social',
    visibility: 'unlisted',
  })
  assert.deepEqual({
    tags: mapped.tags,
    seo_title: mapped.seo_title,
    social_image_asset_id: mapped.social_image_asset_id,
    visibility: mapped.visibility,
  }, {
    tags: ['canonical', 'draft'],
    seo_title: 'Search title',
    social_image_asset_id: 'asset-social',
    visibility: 'unlisted',
  })
  assert.equal(Object.hasOwn(mapped, 'publish'), false)
  assert.equal(Object.hasOwn(mapped, 'scheduled_for'), false)
})

test('settings panel behaves as an accessible modal', async () => {
  const source = await readFile(new URL('../../lib/components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /<USlideover v-model:open="settingsOpen" title="Post settings" side="right" modal/)
  assert.match(source, /:content="\{ onOpenAutoFocus: focusCategory \}"/)
  assert.match(source, /<UInput ref="categoryInput" v-model="form\.category" \/>/)
  assert.match(source, /function focusCategory\(event: Event\) \{[\s\S]*event\.preventDefault\(\)[\s\S]*categoryInput\.value\?\.inputRef\?\.focus\(\)/)
  assert.match(source, /@keydown="onSettingsKeydown"/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /settingsButton\.value\?\.\$el\?\.focus\(\)/)
})

test('block controls preserve writable content and persisted-post action boundaries', async () => {
  const renderer = await readFile(new URL('../../components/blog/BlogArticleRenderer.vue', import.meta.url), 'utf8')
  const editor = await readFile(new URL('../../lib/components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  assert.match(renderer, /index === 0 \? 'forward' : 'back'/)
  assert.match(renderer, /\{ \.\.\.step, text: value \}/)
  assert.match(editor, /if \(!last \|\| \(last\.type !== 'markdown' && last\.type !== 'heading'\)\)/)
  assert.match(editor, /function handleMergeBlock[\s\S]*ensureTrailingTextBlock\(\)/)
  assert.match(editor, /<UButton v-if="post" color="error"/)
  assert.match(editor, /async function share\(\) \{ if \(!post\.value \|\| !persistedPostId\.value\) return/)
  assert.match(editor, /async function remove\(\) \{ if \(!post\.value \|\| !persistedPostId\.value/)
})
