import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { replaceMarkdownRange, splitMarkdownAt } from '../../utils/markdown-source.ts'

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

test('markdown editing keeps canonical source instead of parsing and serializing the document', async () => {
  const source = await readFile(new URL('../../components/ui/RichTextEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /<textarea[\s\S]*:value="modelValue"[\s\S]*@input="emitSource"/)
  assert.match(source, /replaceMarkdownRange\(props\.modelValue, start, end, replacement\)/)
  assert.match(source, /splitMarkdownAt\(props\.modelValue, start\)/)
  assert.doesNotMatch(source, /UEditor|ProseMirror|editor\.markdown|setContent/)
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
  assert.match(source, /<USlideover v-model:open="settingsOpen" title="Post settings" side="right" modal/)
  assert.match(source, /@after:enter="focusSettingsPanel" @after:leave="restoreSettingsFocus"/)
  assert.match(source, /@keydown="onSettingsKeydown"/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /const first = settingsFocusableElements\(\)\[0\][\s\S]*if \(first\) first\.focus\(\)[\s\S]*else settingsPanel\.value\?\.focus\(\)/)
  assert.match(source, /settingsButton\.value\?\.\$el\?\.focus\(\)/)
})

test('block controls preserve writable content and persisted-post action boundaries', async () => {
  const renderer = await readFile(new URL('../../components/blog/BlogArticleRenderer.vue', import.meta.url), 'utf8')
  const editor = await readFile(new URL('../../components/workspace/blog/BlogPostEditor.vue', import.meta.url), 'utf8')
  assert.match(renderer, /index === 0 \? 'forward' : 'back'/)
  assert.match(renderer, /\{ \.\.\.step, text: value \}/)
  assert.match(editor, /if \(!last \|\| \(last\.type !== 'markdown' && last\.type !== 'heading'\)\)/)
  assert.match(editor, /function handleMergeBlock[\s\S]*ensureTrailingTextBlock\(\)/)
  assert.match(editor, /:disabled="!post"/)
  assert.match(editor, /<UButton v-if="post" color="error"/)
  assert.match(editor, /async function share\(\) \{ if \(!post\.value \|\| !postId\.value\) return/)
  assert.match(editor, /async function remove\(\) \{ if \(!post\.value \|\| !postId\.value/)
})
