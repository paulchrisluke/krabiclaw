/**
 * Create or update KrabiClaw's own marketing pages from content/platform/pages.json.
 *
 * KrabiClaw is a tenant of its own platform: its marketing pages are page
 * documents like every other site's, rendered by components/platform/
 * PlatformCanonicalPage.vue (#903). That means the content is data, and data
 * has to come from somewhere a new environment can read — this file and the
 * JSON beside it are that somewhere. Authored only into a database, the content
 * existed in exactly one place and a routine `yarn local:setup` erased it.
 *
 * Everything goes through the editor HTTP boundary the dashboard and the MCP
 * tools use: Better Auth sign-in, Better Auth admin impersonation of the
 * platform organization's owner, then POST/PATCH /api/editor/sites/platform/
 * pages and the page-scoped Q&A endpoints. No row is written by hand.
 *
 * Re-runnable: a page that exists at the path is updated, and a page's Q&A
 * records are replaced rather than appended to.
 *
 *   BASE_URL=http://localhost:3000 \
 *   CMS_EMAIL=you@example.com CMS_PASSWORD=... \
 *   PLATFORM_OWNER_USER_ID=<user id> \
 *   node --experimental-strip-types scripts/seed-platform-pages.ts
 */
import { readFileSync } from 'node:fs'

interface SeedBlock { type: string; data: Record<string, unknown> }
interface SeedQa { question: string; answer: string }
interface SeedPage {
  path: string
  title: string
  summary: string
  seoTitle: string | null
  seoDescription: string | null
  pageType: string
  blocks: SeedBlock[]
  qa?: SeedQa[]
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.CMS_EMAIL ?? 'developer@playwright.example'
const PASSWORD = process.env.CMS_PASSWORD ?? process.env.LOCAL_DEVELOPER_PASSWORD
const OWNER_USER_ID = process.env.PLATFORM_OWNER_USER_ID
const SITE_ID = process.env.PLATFORM_SITE_ID ?? 'platform'
if (!PASSWORD) throw new Error('CMS_PASSWORD (or LOCAL_DEVELOPER_PASSWORD) is required')
if (!OWNER_USER_ID) throw new Error('PLATFORM_OWNER_USER_ID is required: the user id that owns the platform organization')

const jar = new Map<string, string>()
function storeCookies(response: Response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0] ?? ''
    const index = pair.indexOf('=')
    const name = pair.slice(0, index)
    const value = pair.slice(index + 1)
    if (value === '' || /Max-Age=0/i.test(raw)) jar.delete(name)
    else jar.set(name, value)
  }
}

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: BASE,
      referer: `${BASE}/`,
      cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  storeCookies(response)
  const text = await response.text()
  let parsed: unknown = text
  try { parsed = JSON.parse(text) } catch { /* a non-JSON body is reported as the text it was */ }
  return { status: response.status, body: parsed as T }
}

function expect<T>(label: string, result: { status: number; body: T }, ...ok: number[]) {
  if (!ok.includes(result.status)) throw new Error(`${label} failed: ${result.status} ${JSON.stringify(result.body)}`)
  return result
}

const source = JSON.parse(
  readFileSync(new URL('../content/platform/pages.json', import.meta.url), 'utf8'),
) as { pages: SeedPage[] }

expect('sign-in', await call('POST', '/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD }), 200)
expect('impersonate', await call('POST', '/api/auth/admin/impersonate-user', { userId: OWNER_USER_ID }), 200)
console.log(`signed in as ${EMAIL}, acting as the platform owner`)

interface ListedPage { id: string; path: string; updated_at: string }
const listed = expect('list pages', await call<{ pages: ListedPage[] }>(
  'GET', `/api/editor/sites/${SITE_ID}/pages?locale=en`), 200)
const byPath = new Map<string, ListedPage>(listed.body.pages.map(page => [page.path, page]))

let failed = false
for (const page of source.pages) {
  const { qa = [], ...pageInput } = page
  const payload = {
    locale: 'en',
    sortOrder: 0,
    recipe: null,
    canonicalUrl: null,
    robots: null,
    ...pageInput,
    blocks: pageInput.blocks.map((block, position) => ({
      id: crypto.randomUUID(),
      type: block.type,
      position,
      data: block.data,
      media: [],
    })),
  }
  const current = byPath.get(page.path)
  const result = current
    ? await call('PATCH', `/api/editor/sites/${SITE_ID}/pages/${current.id}`, { ...payload, expectedUpdatedAt: current.updated_at })
    : await call('POST', `/api/editor/sites/${SITE_ID}/pages`, payload)
  if (!(current ? result.status === 200 : result.status === 201)) {
    console.error(`${current ? 'update' : 'create'} ${page.path} FAILED ${result.status} ${JSON.stringify(result.body)}`)
    failed = true
    continue
  }
  console.log(`${current ? 'update' : 'create'} ${page.path} ${result.status}`)

  // The FAQ block renders the page's Q&A records, so they are replaced with the
  // seed's rather than added to whatever a previous run left.
  const scope = `page_path=${encodeURIComponent(page.path)}`
  const existingQa = await call<{ qa?: Array<{ id: string }> }>('GET', `/api/editor/sites/${SITE_ID}/qa?${scope}`)
  for (const record of existingQa.body?.qa ?? []) {
    const removed = await call('DELETE', `/api/editor/sites/${SITE_ID}/qa/${record.id}?${scope}`)
    if (removed.status >= 300) { console.error(`  qa delete FAILED ${record.id} ${removed.status}`); failed = true }
  }
  for (const [index, item] of qa.entries()) {
    const answer = await call('POST', `/api/editor/sites/${SITE_ID}/qa`, {
      question: item.question,
      answer: item.answer,
      is_owner_answer: true,
      status: 'published',
      sort_order: index,
      page_path: page.path,
    })
    if (answer.status >= 300) { console.error(`  qa FAILED ${page.path} ${index} ${answer.status} ${JSON.stringify(answer.body)}`); failed = true }
  }
  if (qa.length) console.log(`  qa ${page.path}: ${existingQa.body?.qa?.length ?? 0} replaced with ${qa.length}`)
}

expect('stop-impersonating', await call('POST', '/api/auth/admin/stop-impersonating', {}), 200)
if (failed) process.exitCode = 1
