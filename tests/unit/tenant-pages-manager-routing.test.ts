import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const managerPath = fileURLToPath(new URL('../../lib/components/workspace/content/TenantPagesManager.vue', import.meta.url))
const editorPath = fileURLToPath(new URL('../../lib/components/workspace/content/TenantPageEditor.vue', import.meta.url))
const overviewPath = fileURLToPath(new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue', import.meta.url))
const detailRoutePath = fileURLToPath(new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/pages/[pageId].vue', import.meta.url))

test('pages index links each page to a dedicated resource route with only a chevron affordance', () => {
  const manager = readFileSync(managerPath, 'utf8')

  assert.match(manager, /:to="`\$\{pagesPath\}\/\$\{page\.id\}`"/)
  assert.match(manager, /i-lucide-chevron-right/)
  assert.match(manager, /managedPageRecipes/)
  assert.doesNotMatch(manager, /query\.page|router\.replace|label="Edit"|i-lucide-pencil/)
  assert.doesNotMatch(manager, /Page settings|label="Page type"|label="Recipe"|label="Canonical URL"|label="Robots"|label="SEO title"|label="SEO description"/)
})

test('page identity is represented by the pageId route rather than query selection', () => {
  const detailRoute = readFileSync(detailRoutePath, 'utf8')
  const overview = readFileSync(overviewPath, 'utf8')

  assert.match(detailRoute, /route\.params\.pageId/)
  assert.match(overview, /\/pages\/\$\{page\.id\}/)
  assert.doesNotMatch(overview, /query: \{ page:/)
})

test('focused page editor hides system metadata and presents content as sections', () => {
  const editor = readFileSync(editorPath, 'utf8')

  assert.match(editor, /Page sections/)
  assert.match(editor, /Add section/)
  assert.doesNotMatch(editor, />Page type</)
  assert.doesNotMatch(editor, />Recipe</)
  assert.doesNotMatch(editor, />Canonical URL</)
  assert.doesNotMatch(editor, />Robots</)
  assert.doesNotMatch(editor, />SEO title</)
  assert.doesNotMatch(editor, />SEO description</)
  assert.doesNotMatch(editor, /One page system for every template/)
})

test('section editor removes developer metadata and type mutation controls', () => {
  const blockEditorPath = fileURLToPath(new URL('../../lib/components/workspace/content/TenantPageBlockEditor.vue', import.meta.url))
  const blockEditor = readFileSync(blockEditorPath, 'utf8')

  assert.doesNotMatch(blockEditor, /label="Block type"/)
  assert.doesNotMatch(blockEditor, /Typed fields:/)
  assert.doesNotMatch(blockEditor, /changeType/)
  assert.doesNotMatch(blockEditor, /Rich text \/ Markdown/)
})
