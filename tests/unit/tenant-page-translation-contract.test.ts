import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

const editor = read('lib/components/workspace/content/TenantPageEditor.vue')
const postRoute = read('server/api/editor/sites/[siteId]/pages.post.ts')

// Kikuzuki's tenant Pages editor (Home/About/Contact) already had a working
// locale switcher and locale-scoped tenant_page_variants CRUD before this
// session - the only real gap was that switching to a locale with no
// existing variant only reported "unavailable", with no way to create one.
// Fixing that surfaced three separate defects, found and fixed in sequence
// while live-testing against all three of Kikuzuki's real pages:

test('the locale switcher offers to create a translation instead of only erroring when none exists', () => {
  assert.match(editor, /No \$\{nextLocale\} version of this page exists yet\. Create one now/)
  assert.match(editor, /window\.confirm\(/)
})

test("a new-locale draft keeps the source page's path instead of re-slugifying from the title", () => {
  // Bug: save()'s new-page path was always `/${slugifyTitle(title)}` unless
  // selected.value.id was set. A translation draft has id === '' (it's not
  // saved yet) same as a genuinely new page, so Home's Thai variant would
  // have gotten path '/home' instead of '/' - live-verified fixed via
  // `SELECT path FROM tenant_page_variants WHERE page_id = '...home' AND
  // locale = 'th'` returning '/', not '/home'.
  assert.match(editor, /const creatingVariantFor = ref<string \| null>\(null\)/)
  assert.match(editor, /const path = selected\.value\.id \|\| creatingVariantFor\.value \? selected\.value\.path/)
})

test('a new-locale draft regenerates block ids instead of reusing the source page\'s own', () => {
  // Bug: the draft copied selected.value.blocks unchanged, including each
  // block's id - saving then tried to INSERT content_blocks rows that
  // already existed for the English page under those same ids, and D1
  // rejected it with a UNIQUE constraint violation on the primary key.
  // Live-verified fixed, and that media placements (e.g. a Hero image)
  // still carry over correctly onto the new block ids.
  assert.match(editor, /const blocks = selected\.value\.blocks\.map\(\(block, position\) => \(\{/)
  assert.match(editor, /id: crypto\.randomUUID\(\), data: structuredClone\(toRaw\(block\.data\)\)/)
})

test('creating a translation is trusted to touch a system page (Home/About/Contact) only via an existing pageId', () => {
  // Bug: createTenantPage's trustedSystemPage safety check (server/utils/
  // tenant-pages.ts) blocks creating pageType:'system' pages through the
  // ordinary POST /pages endpoint at all - Home/About/Contact are all
  // page_type 'system', so every translation attempt 400'd with "System
  // pages are managed by the site template" before this. Passing
  // trustedSystemPage based on body.pageId is safe because pageId only
  // resolves to a page this request's write-access was already verified
  // against, and createTenantPage re-derives pageType from THAT existing
  // row rather than trusting the client's own pageType - it can't be used
  // to mint an arbitrary new system page.
  assert.match(postRoute, /trustedSystemPage: Boolean\(body\.pageId\)/)
})
