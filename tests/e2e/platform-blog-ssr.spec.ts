import { expect, test } from '@playwright/test'

test('platform blog renders its public API posts in server HTML', async ({ request }) => {
  const api = await request.get('/api/public/blog')
  expect(api.ok()).toBe(true)
  const { posts } = await api.json()
  expect(Array.isArray(posts)).toBe(true)

  const response = await request.get('/blog')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  expect(markup.includes('Blog unavailable'), 'SSR must not render the blog error state').toBe(false)
  expect(markup.includes('Loading posts...'), 'SSR must finish loading the blog').toBe(false)
  if (posts.length === 0) {
    expect(markup).toContain('No posts yet')
  }
  for (const post of posts.filter((post: { hide_from_nav: boolean }, index: number) => index === 0 || !post.hide_from_nav)) {
    const title = post.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
    expect(markup).toContain(title)
  }
})

test('platform documentation renders its docs collection in server HTML', async ({ request }) => {
  const api = await request.get('/api/public/blog?collection=docs')
  expect(api.ok()).toBe(true)
  const { posts } = await api.json()
  expect(Array.isArray(posts)).toBe(true)
  for (const post of posts) expect(post.collection).toBe('docs')

  const index = await request.get('/docs')
  expect(index.ok()).toBe(true)
  const markup = (await index.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  for (const post of posts) {
    const title = post.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
    expect(markup).toContain(title)
  }

  const blog = await request.get('/api/public/blog')
  const blogPosts = (await blog.json()).posts as Array<{ collection: string }>
  for (const post of blogPosts) expect(post.collection).toBe('blog')
})

// Read the application's rendered graph, not a fixture or a second schema builder.
function renderedGraph(html: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  expect(scripts.length).toBeGreaterThan(0)
  return scripts.flatMap(match => {
    const schema = JSON.parse(match[1]!)
    expect(schema['@context']).toBe('https://schema.org')
    return (schema['@graph'] ?? [schema]) as Array<Record<string, unknown>>
  })
}

function requireNode(nodes: Array<Record<string, unknown>>, type: string) {
  const matches = nodes.filter(node => node['@type'] === type)
  expect(matches, `one ${type} per canonical page`).toHaveLength(1)
  return matches[0]!
}

function expectPageIdentity(nodes: Array<Record<string, unknown>>, url: string, pageType: string) {
  const ids = nodes.map(node => node['@id']).filter(Boolean)
  expect(new Set(ids).size, 'top-level graph identifiers are unique').toBe(ids.length)
  const page = requireNode(nodes, pageType)
  expect(page.url).toBe(url)
  expect(page['@id']).toBe(`${url}#webpage`)
  const breadcrumbs = requireNode(nodes, 'BreadcrumbList')
  expect(page.breadcrumb).toEqual({ '@id': breadcrumbs['@id'] })
  const entries = breadcrumbs.itemListElement as Array<{ position: number; name: string; item: string }>
  expect(entries.length).toBeGreaterThanOrEqual(2)
  entries.forEach((entry, i) => {
    expect(entry.position).toBe(i + 1)
    expect(entry.name.trim()).not.toBe('')
    expect(new URL(entry.item).origin).toBe(new URL(url).origin)
  })
  expect(entries.at(-1)?.item).toBe(url)
  return page
}

test('docs collection, categories and articles publish connected canonical JSON-LD', async ({ request, baseURL }) => {
  test.setTimeout(120_000)
  const response = await request.get('/api/public/blog?collection=docs')
  expect(response.status()).toBe(200)
  const { posts } = await response.json() as { posts: Array<{ slug: string; title: string; category: { slug: string; name: string } | null }> }
  expect(posts.length, 'the existing published docs must be available').toBeGreaterThan(0)
  const categories = [...new Set(posts.flatMap(post => post.category ? [post.category.slug] : []))]
  for (const path of ['/docs', ...categories.map(slug => `/docs/category/${slug}`)]) {
    const result = await request.get(path)
    expect(result.status()).toBe(200)
    const html = await result.text()
    const nodes = renderedGraph(html)
    const url = new URL(path, baseURL).href
    const page = expectPageIdentity(nodes, url, 'CollectionPage')
    const list = requireNode(nodes, 'ItemList')
    expect(page.mainEntity).toEqual({ '@id': list['@id'] })
    expect(list.mainEntityOfPage).toEqual({ '@id': page['@id'] })
    const expected = path === '/docs' ? posts : posts.filter(post => path.endsWith(`/${post.category?.slug}`))
    const entries = list.itemListElement as Array<{ position: number; item: { '@id': string; url: string; name: string } }>
    expect(list.numberOfItems).toBe(expected.length)
    expect(entries).toHaveLength(expected.length)
    expect(new Set(entries.map(entry => entry.item.url)).size).toBe(expected.length)
    entries.forEach((entry, i) => {
      expect(entry.position).toBe(i + 1)
      const article = expected.find(post => entry.item.url === new URL(`/docs/${post.slug}`, baseURL).href)
      expect(article, 'each schema item is a real published article').toBeDefined()
      expect(entry.item.name).toBe(article!.title)
      expect(entry.item['@id']).toBe(`${entry.item.url}#webpage`)
    })
  }
  for (const post of posts) {
    const path = `/docs/${post.slug}`
    const result = await request.get(path)
    expect(result.status()).toBe(200)
    const html = await result.text()
    const nodes = renderedGraph(html)
    const url = new URL(path, baseURL).href
    const page = expectPageIdentity(nodes, url, 'WebPage')
    const article = requireNode(nodes, 'TechArticle')
    expect(article.url).toBe(url)
    expect(article['@id']).toBe(`${url}#article`)
    expect(article.headline).toBe(post.title)
    expect(article.mainEntityOfPage).toEqual({ '@id': page['@id'] })
    expect(page.mainEntity).toEqual({ '@id': article['@id'] })
    expect(article.publisher).toEqual({ '@id': requireNode(nodes, 'Organization')['@id'] })
    expect(article.inLanguage).toBe('en-US')
    for (const key of ['datePublished', 'dateModified']) {
      if (article[key]) expect(Number.isNaN(Date.parse(String(article[key])))).toBe(false)
    }
    expect(nodes.some(node => node.aggregateRating || node.review)).toBe(false)
    const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    for (const node of nodes.filter(node => node['@type'] === 'HowTo')) {
      const steps = node.step as Array<{ text: string }>
      expect(steps.length).toBeGreaterThanOrEqual(2)
      for (const step of steps) expect(body).toContain(step.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'))
    }
  }
})

test('mobile docs retain full navigation and one accessible prompt copy action', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/docs/make-your-first-site-edit')
  await expect(page.locator('article h1')).toHaveText('Make your first site edit')
  const sections = page.getByRole('button', { name: 'On this page', exact: true })
  await sections.press('Enter')
  await expect(sections).toHaveAttribute('aria-expanded', 'true')
  const section = page.getByRole('navigation', { name: 'On this page' }).filter({ visible: true }).getByRole('link', { name: '3. Check the result', exact: true })
  await section.click()
  await expect(sections).toHaveAttribute('aria-expanded', 'false')
  expect(new URL(page.url()).hash).toContain('check-the-result')
  const copy = page.getByRole('button', { name: 'Copy prompt', exact: true })
  await expect(copy).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toHaveCount(0)
  const source = await page.locator('article pre').textContent()
  await copy.press('Enter')
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source)
  await page.getByRole('button', { name: 'Copied', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source)
  const viewport = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }))
  expect(viewport.document).toBeLessThanOrEqual(viewport.viewport)
  const next = page.getByRole('link', { name: 'Next Customize your brand and theme' })
  await expect(next).toBeVisible()
  const title = next.locator('span').last()
  const titleWidth = await title.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }))
  expect(titleWidth.scroll).toBeLessThanOrEqual(titleWidth.client + 1)
})
