import { expect, test, type Dialog } from '@playwright/test'
import { collectPageErrors, setupTenantHeaders } from './helpers'
import { dashboardOrgHeaders, devLoginHeaders, devLoginUrl } from './test-env'

test.describe('dashboard functional smoke', () => {
  test('dev login opens the owner dashboard', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('body')).toContainText(/Sites|Let's build your site/)

    const dashboard = await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
    expect(dashboard?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText(/Sites|Let's build your site/)

    expect(errors).toEqual([])
  })

  test('owner can open core dashboard pages for their org', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    const errors = collectPageErrors(page)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const suffix = Date.now()
    const userId = `e2e-dashboard-org-pages-${suffix}`
    const login = await page.goto(devLoginUrl(baseURL!, userId), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)

    const createSiteRes = await page.request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Dashboard Pages Test ${suffix}`,
        subdomain: `e2e-dashboard-pages-${suffix}`,
        vertical: 'restaurant',
      },
    })
    expect(createSiteRes.status()).toBe(200)

    const contextRes = await page.request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { organization?: { slug?: string } }
    const orgSlug = context.organization?.slug
    expect(orgSlug).toBeTruthy()

    const pages = [
      `/dashboard/${orgSlug}/settings/general`,
      `/dashboard/${orgSlug}/settings/billing`,
      `/dashboard/${orgSlug}/support`,
    ]

    for (const route of pages) {
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(400)
      await expect(page.locator('body')).not.toContainText('Site Not Found')
      await expect(page.locator('body')).not.toContainText('Vite Error')
      await expect(page.locator('body')).not.toContainText('wrong link sando')
    }

    const nonHydrationErrors = errors.filter((err) => !err.includes('Hydration completed but contains mismatches.'))
    expect(nonHydrationErrors).toEqual([])
  })

  test('organization Today and Calendar render agenda data, navigate months, and filter kinds', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)

    const agendaItem = (overrides: Record<string, unknown> = {}) => ({
      id: 'reservation:e2e-agenda-reservation',
      kind: 'reservation',
      startsAt: '2026-08-13T02:00:00.000Z',
      endsAt: null,
      dayKey: '2026-08-13',
      timeZone: 'Asia/Bangkok',
      showTimeZone: false,
      title: 'Agenda Guest',
      subtitle: '2 guests',
      status: 'new',
      siteId: 'site-pottery-house',
      locationId: 'loc-pottery-house',
      locationTitle: 'Pottery House Krabi',
      to: '/dashboard/pottery-house-krabi/sites/pottery-house/conversations/thread-e2e-agenda',
      ...overrides,
    })
    const metadata = {
      availableKinds: ['reservation', 'experience_booking', 'post', 'thread'],
      sites: [{ id: 'site-pottery-house', label: 'Pottery House Krabi', slug: 'pottery-house' }],
      locations: [{ id: 'loc-pottery-house', siteId: 'site-pottery-house', title: 'Pottery House Krabi' }],
    }

    await page.route('**/api/dashboard/today', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [agendaItem()], attention: [],
          counts: { reservations: 1, experienceBookings: 0, threadsNeedingAttention: 0, posts: 0 },
          ...metadata, resolvedAt: '2026-08-13T03:00:00.000Z',
        }),
      })
    })
    await page.goto(`${baseURL}/dashboard/pottery-house-krabi`, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Today', exact: true }).first().click()
    await expect(page).toHaveURL(/\/dashboard\/pottery-house-krabi\/today$/)
    await expect(page.getByRole('navigation', { name: "Today's metrics" })).toContainText('Reservations')
    const scheduleLink = page.getByRole('link', { name: /Agenda Guest/ })
    await expect(scheduleLink).toBeVisible()
    await expect(scheduleLink).toHaveAttribute('href', '/dashboard/pottery-house-krabi/sites/pottery-house/conversations/thread-e2e-agenda')

    let agendaRequestCount = 0
    await page.route('**/api/dashboard/agenda?**', async route => {
      agendaRequestCount += 1
      const requestUrl = new URL(route.request().url())
      const from = requestUrl.searchParams.get('from')!
      const kind = requestUrl.searchParams.get('kinds')
      const itemKind = kind === 'post' ? 'post' : 'reservation'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [agendaItem({
            id: `${itemKind}:${agendaRequestCount}`,
            kind: itemKind,
            dayKey: from,
            startsAt: `${from}T02:00:00.000Z`,
            title: `${itemKind === 'post' ? 'Post' : 'Reservation'} month ${agendaRequestCount}`,
          })],
          ...metadata,
        }),
      })
    })
    await page.getByRole('link', { name: 'Calendar', exact: true }).first().click()
    await expect(page).toHaveURL(/\/dashboard\/pottery-house-krabi\/calendar$/)
    await expect(page.getByText(/Reservation month/).first()).toBeVisible()
    const monthHeading = page.getByRole('heading', { level: 2 }).first()
    const firstMonthLabel = await monthHeading.textContent()
    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(monthHeading).not.toHaveText(firstMonthLabel ?? '')
    await expect(page.getByText(/Reservation month 2/).first()).toBeVisible()

    await page.getByRole('combobox', { name: 'Kind' }).click()
    await page.getByRole('option', { name: 'Post', exact: true }).click()
    await expect(page.getByText(/Post month 3/).first()).toBeVisible()
    expect(agendaRequestCount).toBeGreaterThanOrEqual(3)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('calendar-month-grid')).toBeHidden()
    await expect(page.getByTestId('calendar-mobile-list')).toBeVisible()
    await expect(page.getByTestId('calendar-mobile-list').getByRole('link', { name: /Post month 3/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to Pottery House Krabi' })).toBeVisible()
  })

  test('Pages manager runs one typed-block and custom-page lifecycle tracer journey', async ({ page, baseURL }) => {
    test.setTimeout(240_000)
    const applicationErrors: string[] = []
    page.on('pageerror', error => applicationErrors.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') applicationErrors.push(`console: ${message.text()}`)
    })
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-mcp-growth'), { waitUntil: 'load' })

    const response = await page.goto(`${baseURL}/dashboard/mcp-growth-fixture/sites/mcp-growth-fixture/pages`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    await expect(page.getByText('Site pages', { exact: true })).toBeVisible()
    await expect(page.getByText('Blocks', { exact: true })).toBeVisible()

    const localeResponse = await page.request.post(`${baseURL}/api/editor/sites/site-mcp-growth/locales`, {
      data: { locale: 'th', label: 'Thai', status: 'published', fallback_enabled: true },
    })
    expect(localeResponse.status()).toBe(200)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('combobox', { name: 'Page locale' })).toContainText('en')

    const blockCards = page.locator('[data-block-index]')
    const blockLabels = async () => blockCards.evaluateAll(cards => cards.map(card => card.querySelector('p.font-medium')?.textContent?.trim() || ''))
    const chooseAndAddBlock = async (label: string) => {
      const blockType = page.getByRole('combobox', { name: 'New block type' })
      await blockType.click()
      await page.getByRole('option', { name: label, exact: true }).click()
      await page.getByRole('button', { name: 'Add block', exact: true }).click()
    }
    const pagesCollectionPath = '/api/editor/sites/site-mcp-growth/pages'
    const waitForPagesRefresh = () => page.waitForResponse(candidate => {
      const url = new URL(candidate.url())
      return candidate.request().method() === 'GET'
        && url.pathname === pagesCollectionPath
        && url.searchParams.get('locale') === 'en'
    }, { timeout: 30_000 })
    const saveDraft = async () => {
      const saveResponse = page.waitForResponse(candidate => {
        const url = new URL(candidate.url())
        return (url.pathname === pagesCollectionPath || url.pathname.startsWith(`${pagesCollectionPath}/`))
          && ['POST', 'PATCH'].includes(candidate.request().method())
      }, { timeout: 30_000 })
      const refreshResponse = waitForPagesRefresh()
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      const saved = await saveResponse
      expect([200, 201]).toContain(saved.status())
      const refreshed = await refreshResponse
      expect(refreshed.status()).toBe(200)
      await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible({ timeout: 30_000 })
    }
    const runPageAction = async (action: 'publish' | 'unpublish' | 'archive' | 'restore') => {
      const actionResponse = page.waitForResponse(candidate => {
        const url = new URL(candidate.url())
        return candidate.request().method() === 'POST'
          && url.pathname.startsWith(`${pagesCollectionPath}/`)
          && url.pathname.endsWith(`/${action}`)
      }, { timeout: 30_000 })
      const refreshResponse = waitForPagesRefresh()
      await page.getByRole('button', { name: action[0]!.toUpperCase() + action.slice(1), exact: true }).click()
      const acted = await actionResponse
      expect(acted.status()).toBe(200)
      const refreshed = await refreshResponse
      expect(refreshed.status()).toBe(200)
    }

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const pageTitle = `E2E Pages ${suffix}`
    const dirtyTitle = `${pageTitle} dirty`
    const markdown = `Persisted preview content ${suffix}`
    const pagePath = `/e2e-pages-${suffix}`

    const rootPage = page.locator('aside button').filter({ has: page.locator('span').filter({ hasText: /^\/$/ }) })
    await expect(rootPage).toHaveCount(1)
    await rootPage.click()
    await expect(rootPage).toHaveClass(/border-primary/)
    await expect(page.getByRole('heading', { name: 'MCP Growth Fixture', exact: true })).toBeVisible()
    await expect(page.getByText('Block data JSON', { exact: true })).toHaveCount(0)

    const pagesListResponse = await page.request.get(`${baseURL}/api/editor/sites/site-mcp-growth/pages?locale=en`)
    expect(pagesListResponse.status()).toBe(200)
    const pagesList = await pagesListResponse.json() as { pages?: Array<{ id?: string; path?: string }> }
    const aboutPage = pagesList.pages?.find(item => item.path === '/about')
    expect(aboutPage?.id).toBeTruthy()
    const aboutButton = page.locator('aside button').filter({ hasText: '/about' })
    await expect(aboutButton).toHaveCount(1)
    await page.route(`${baseURL}/api/editor/sites/site-mcp-growth/pages/${aboutPage!.id}`, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ malformed: true }) })
    })
    await aboutButton.click()
    await expect(page.getByText('API response did not match its contract', { exact: true })).toBeVisible()
    await expect(page.getByText('Page could not be loaded', { exact: true })).toBeVisible()
    await expect(page.getByText('Page could not be saved', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'MCP Growth Fixture', exact: true })).toBeVisible()
    await page.unroute(`${baseURL}/api/editor/sites/site-mcp-growth/pages/${aboutPage!.id}`)

    // Start a custom page and exercise typed insert/select, duplicate, the
    // button-bearing block reorder control, and native drag/drop ordering.
    await page.getByRole('button', { name: 'New page', exact: true }).click()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(pageTitle)
    await page.getByRole('textbox', { name: 'Path', exact: true }).fill(pagePath)

    await chooseAndAddBlock('Rich text')
    await page.getByRole('textbox', { name: 'Rich text / Markdown' }).fill(markdown)
    await chooseAndAddBlock('Heading')
    await page.getByRole('textbox', { name: 'Heading text' }).fill(`Heading ${suffix}`)
    await chooseAndAddBlock('Button group')
    await page.getByRole('textbox', { name: 'Label', exact: true }).fill('Read more')
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill('/about')
    await chooseAndAddBlock('Divider')
    await expect(blockCards).toHaveCount(4)

    await blockCards.nth(1).getByRole('button', { name: 'Edit block' }).click()
    await expect(page.getByRole('textbox', { name: 'Heading text' })).toBeVisible()

    // Every leave path owns the same dirty-discard decision. Decline each
    // transition and keep the current editor and dirty state intact.
    const newPageDialog = page.waitForEvent('dialog').then(dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'New page', exact: true }).click()
    await newPageDialog
    await expect(page.getByRole('heading', { name: pageTitle, exact: true })).toBeVisible()
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()

    const rootPageDialog = page.waitForEvent('dialog').then(dialog => dialog.dismiss())
    await rootPage.click()
    await rootPageDialog
    await expect(page.getByRole('heading', { name: pageTitle, exact: true })).toBeVisible()
    await expect(rootPage).not.toHaveClass(/border-primary/)

    let localePromptCount = 0
    const localeDialog = page.waitForEvent('dialog').then(async dialog => {
      localePromptCount += 1
      await dialog.dismiss()
    })
    await page.getByRole('combobox', { name: 'Page locale' }).click()
    await page.getByRole('option', { name: 'th', exact: true }).click()
    await localeDialog
    await expect(page.getByRole('combobox', { name: 'Page locale' })).toContainText('en')
    await expect(page.getByRole('heading', { name: pageTitle, exact: true })).toBeVisible()
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
    expect(localePromptCount).toBe(1)

    const currentPagesUrl = page.url()
    const routeLeaveDialog = page.waitForEvent('dialog').then(dialog => dialog.dismiss())
    await page.locator('[id^="dashboard-sidebar"]').getByRole('link', { name: 'Today', exact: true }).click()
    await routeLeaveDialog
    await expect(page).toHaveURL(currentPagesUrl)
    await expect(page.getByRole('heading', { name: pageTitle, exact: true })).toBeVisible()

    const headingDuplicate = blockCards.nth(1).getByRole('button', { name: 'Duplicate block' })
    await expect(headingDuplicate).toBeVisible()
    await headingDuplicate.click()
    await expect(blockCards).toHaveCount(5)
    expect(await blockLabels()).toEqual(['Rich text', 'Heading', 'Heading', 'Button group', 'Divider'])

    await blockCards.nth(3).getByRole('button', { name: 'Move block up' }).click()
    expect(await blockLabels()).toEqual(['Rich text', 'Heading', 'Button group', 'Heading', 'Divider'])

    const sourceHeader = blockCards.nth(4).locator('[draggable="true"]')
    const targetHeader = blockCards.nth(0).locator('[draggable="true"]')
    await sourceHeader.dragTo(targetHeader)
    expect(await blockLabels()).toEqual(['Divider', 'Rich text', 'Heading', 'Button group', 'Heading'])

    // Image blocks stay in the editor as a typed validation error; Save must
    // not issue a mutation until the missing asset is resolved.
    await chooseAndAddBlock('Image')
    await expect(page.getByText('Media asset', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Select media/ })).toBeVisible()
    await expect(page.getByText('Needs attention', { exact: true })).toBeVisible()
    let saveRequests = 0
    const trackSave = (request: { url(): string; method(): string }) => {
      if (request.url().includes('/api/editor/sites/site-mcp-growth/pages') && ['POST', 'PATCH'].includes(request.method())) saveRequests += 1
    }
    page.on('request', trackSave)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/Resolve the highlighted fields in block/)).toBeVisible()
    expect(saveRequests).toBe(0)
    page.off('request', trackSave)

    const mediaPicker = page.getByRole('button', { name: /Select media/ })
    const mediaResponse = page.waitForResponse(candidate => candidate.url().includes('/api/editor/sites/site-mcp-growth/media'))
    await mediaPicker.click()
    const mediaList = await mediaResponse
    expect(mediaList.status()).toBe(200)
    const mediaPayload = await mediaList.json() as { media?: Array<{ id?: string; alt_text?: string }> }
    expect(mediaPayload.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'media-site-mcp-growth-fixture-image', alt_text: 'Seeded MCP image fixture' }),
    ]))
    const mediaDialog = page.getByRole('dialog')
    await expect(mediaDialog).toBeVisible()
    const seededAsset = page.locator('button').filter({ hasText: 'site-mcp-growth-fixture.jpg' })
    await expect(seededAsset).toHaveCount(1)
    await seededAsset.click()
    await mediaDialog.getByRole('button', { name: 'Done', exact: true }).click()
    const mediaAlt = `E2E media alt ${suffix}`
    await page.getByRole('textbox', { name: 'Alt text', exact: true }).fill(mediaAlt)
    await expect(page.getByText('Needs attention', { exact: true })).toHaveCount(0)

    await saveDraft()
    await expect(page.getByRole('link', { name: 'Preview', exact: true })).toBeVisible()

    // A dirty editor disables Preview and each destructive/status transition
    // must preserve it when its discard dialog is declined.
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(dirtyTitle)
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled()
    let discardPrompt = ''
    const dirtyPublishDialog = page.waitForEvent('dialog').then(async dialog => {
      discardPrompt = dialog.message()
      await dialog.dismiss()
    })
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await dirtyPublishDialog
    expect(discardPrompt).toBe('Discard unsaved page changes?')
    await expect(page.getByRole('heading', { name: dirtyTitle, exact: true })).toBeVisible()

    const dirtyDuplicateDialog = page.waitForEvent('dialog').then(async dialog => {
      expect(dialog.message()).toBe('Discard unsaved page changes?')
      await dialog.dismiss()
    })
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
    await dirtyDuplicateDialog
    await expect(page.getByRole('heading', { name: dirtyTitle, exact: true })).toBeVisible()
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(pageTitle)
    await saveDraft()

    // Keep the responsive path in the same journey, then return to the
    // desktop viewport for the status controls and preview assertion.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByText('Blocks', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Preview', exact: true })).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 800 })

    const pageRow = () => page.locator('aside button').filter({ hasText: pageTitle })
    const expectStatus = async (status: string) => await expect(pageRow().getByText(status, { exact: true })).toBeVisible()
    await expectStatus('draft')

    await runPageAction('publish')
    await expectStatus('published')
    await runPageAction('unpublish')
    await expectStatus('draft')

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(dirtyTitle)
    const dirtyArchiveDialog = page.waitForEvent('dialog').then(dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await dirtyArchiveDialog
    await expect(page.getByRole('heading', { name: dirtyTitle, exact: true })).toBeVisible()
    await expectStatus('draft')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(pageTitle)
    await saveDraft()

    const archiveDialog = page.waitForEvent('dialog').then(async dialog => {
      expect(dialog.message()).toBe('Archive this page? It will stop rendering publicly.')
      await dialog.accept()
    })
    await runPageAction('archive')
    await archiveDialog
    await expectStatus('archived')
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
    await expect(page.getByText('This page has publication history and cannot be deleted. Archive or replace it instead.', { exact: true })).toBeVisible()
    await runPageAction('restore')
    await expectStatus('draft')

    // The saved draft preview must reflect the canonical title and block body.
    const previewHref = await page.getByRole('link', { name: 'Preview', exact: true }).getAttribute('href')
    expect(previewHref).toContain(`/preview/site/site-mcp-growth${pagePath}`)
    const preview = await page.context().newPage()
    await preview.goto(new URL(previewHref!, baseURL!).toString(), { waitUntil: 'domcontentloaded' })
    await expect(preview).toHaveTitle(new RegExp(pageTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await expect(preview.locator('body')).toContainText(markdown)
    await expect(preview.getByRole('img', { name: mediaAlt, exact: true })).toBeVisible()
    await preview.close()

    // A published page keeps its history and cannot be deleted, even after it
    // is archived. Duplicate it to obtain a never-published draft whose delete
    // path can be exercised without weakening that domain invariant.
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
    await expect(page.getByText('This page has publication history and cannot be deleted. Archive or replace it instead.', { exact: true })).toBeVisible()

    const copyTitle = `${pageTitle} copy`
    const duplicateResponse = page.waitForResponse(candidate => (
      new URL(candidate.url()).pathname === pagesCollectionPath
      && candidate.request().method() === 'POST'
    ), { timeout: 30_000 })
    const duplicateRefreshResponse = waitForPagesRefresh()
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
    await expect(page.getByRole('heading', { name: copyTitle, exact: true })).toBeVisible()
    const duplicated = await duplicateResponse
    expect(duplicated.status()).toBe(201)
    const duplicateRefresh = await duplicateRefreshResponse
    expect(duplicateRefresh.status()).toBe(200)
    await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible({ timeout: 30_000 })
    const copyRow = () => page.locator('aside button').filter({ hasText: copyTitle })
    await expect(copyRow().getByText('draft', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()

    const dirtyCopyTitle = `${copyTitle} dirty`
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(dirtyCopyTitle)
    const dirtyDeleteDialog = page.waitForEvent('dialog').then(dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await dirtyDeleteDialog
    await expect(page.getByRole('heading', { name: dirtyCopyTitle, exact: true })).toBeVisible()

    const deletePrompts: string[] = []
    let resolveDeleteDialogs!: () => void
    let rejectDeleteDialogs!: (_error: unknown) => void
    const deleteDialogs = new Promise<void>((resolve, reject) => {
      resolveDeleteDialogs = resolve
      rejectDeleteDialogs = reject
    })
    const acceptDeleteDialogs = async (dialog: Dialog) => {
      try {
        deletePrompts.push(dialog.message())
        await dialog.accept()
        if (deletePrompts.length === 2) resolveDeleteDialogs()
      } catch (error) {
        rejectDeleteDialogs(error)
      }
    }
    page.on('dialog', acceptDeleteDialogs)
    const deleteResponse = page.waitForResponse(candidate => {
      const url = new URL(candidate.url())
      return candidate.request().method() === 'DELETE'
        && url.pathname.startsWith(`${pagesCollectionPath}/`)
    }, { timeout: 30_000 })
    const deleteRefreshResponse = waitForPagesRefresh()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await deleteDialogs
    page.off('dialog', acceptDeleteDialogs)
    expect(deletePrompts).toEqual([
      'Discard unsaved page changes?',
      'Delete this page and its revisions? This cannot be undone.',
    ])
    const deleted = await deleteResponse
    expect(deleted.status()).toBe(200)
    const deleteRefresh = await deleteRefreshResponse
    expect(deleteRefresh.status()).toBe(200)
    await expect(copyRow()).toHaveCount(0)
    expect(applicationErrors).toEqual([])
  })

  test('Pages manager keeps the newest selection when page responses finish out of order', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-mcp-growth'), { waitUntil: 'load' })

    const response = await page.goto(`${baseURL}/dashboard/mcp-growth-fixture/sites/mcp-growth-fixture/pages`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    await expect(page.getByText('Site pages', { exact: true })).toBeVisible()

    const pagesResponse = await page.request.get(`${baseURL}/api/editor/sites/site-mcp-growth/pages?locale=en`)
    expect(pagesResponse.status()).toBe(200)
    const pageSummaries = (await pagesResponse.json()) as { pages?: Array<{ id: string; path: string; title: string }> }
    const about = pageSummaries.pages?.find(item => item.path === '/about')
    const contact = pageSummaries.pages?.find(item => item.path === '/contact')
    expect(about?.id).toBeTruthy()
    expect(contact?.id).toBeTruthy()

    const aboutButton = page.locator('aside button').filter({ hasText: '/about' })
    const contactButton = page.locator('aside button').filter({ hasText: '/contact' })
    await expect(aboutButton).toHaveCount(1)
    await expect(contactButton).toHaveCount(1)

    let releaseAbout!: () => void
    const aboutRelease = new Promise<void>(resolve => { releaseAbout = resolve })
    await page.route(`${baseURL}/api/editor/sites/site-mcp-growth/pages/${about!.id}`, async route => {
      await aboutRelease
      await route.continue()
    })

    try {
      // Dispatch the same DOM click events in one browser task so both valid
      // selections are in flight before Vue reflects the first request's busy
      // state. The first response is held until the newer page is visible,
      // proving the request gate rather than a timing accident.
      await page.evaluate(({ firstPath, secondPath }) => {
        const buttons = [...document.querySelectorAll('aside button')]
        for (const path of [firstPath, secondPath]) {
          const button = buttons.find(candidate => candidate.textContent?.includes(path))
          if (!button) throw new Error(`Missing page selection button for ${path}`)
          button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        }
      }, { firstPath: '/about', secondPath: '/contact' })

      await expect(page.getByRole('heading', { name: contact!.title, exact: true })).toBeVisible()
      releaseAbout()
      await expect(page.getByRole('heading', { name: contact!.title, exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: about!.title, exact: true })).toHaveCount(0)
    } finally {
      releaseAbout()
      await page.unroute(`${baseURL}/api/editor/sites/site-mcp-growth/pages/${about!.id}`)
    }
  })

  test('canonical account, organization, site, and location routes render with responsive navigation', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)

    const routes = [
      ['/dashboard/account/profile', 'Profile'],
      ['/dashboard/pottery-house-krabi', 'Sites'],
      ['/dashboard/pottery-house-krabi/settings', 'Organization Settings'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house', 'Pottery House Krabi'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house/locations', 'Locations'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house/settings', 'Site Settings'],
      // The navbar falls back to the literal 'Location Overview' only when the
      // location hasn't loaded yet (see locations/[locationSlug]/index.vue) —
      // the Krabi fixture location always has a real title, so it renders
      // that instead; asserting the fallback string here never matched.
      ['/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi', 'Pottery House Krabi'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/settings', 'Location Settings'],
    ] as const

    for (const [path, visibleText] of routes) {
      const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'load' })
      expect(response?.status(), path).toBeLessThan(400)
      await expect(page.getByText(visibleText, { exact: true }).first()).toBeVisible()
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house`, { waitUntil: 'load' })
    await expect(page.locator('[data-sidebar-control-ready="true"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /Search dashboard, docs, help/i })).toBeVisible()
    await page.getByRole('button', { name: /Search dashboard, docs, help/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('dashboard-account-menu-button').click()
    await expect(page.getByText('Profile', { exact: true })).toBeVisible()
    await expect(page.getByText('Platform Status', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'load' })
    await expect(page.locator('[data-sidebar-control-ready]')).toHaveAttribute('data-sidebar-control-ready', 'true')
    await expect(page.getByRole('navigation')).toContainText('Today')
    await expect(page.getByRole('navigation')).toContainText('Calendar')
    await expect(page.getByRole('link', { name: 'Locations', exact: true })).toBeVisible()

    expect((await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/new`)).status()).toBe(404)
    expect((await page.request.patch(`${baseURL}/api/dashboard/location-preference`, {
      headers: {
        ...dashboardOrgHeaders('pottery-house-krabi'),
        'x-dashboard-site-slug': 'pottery-house',
      },
      data: { locationId: 'loc-pottery-house' },
    })).status()).toBe(404)
  })

  test('site-wide manager reaches its site workspace but not organization settings', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })

    const memberResponse = await page.request.post(`${baseURL}/api/dev/test-member`, {
      headers: devLoginHeaders(),
      data: { role: 'editor', organizationId: 'org-pottery-house', name: 'E2E Site Manager' },
    })
    expect(memberResponse.status()).toBe(200)
    const member = await memberResponse.json() as { user: { id: string } }

    await page.goto(devLoginUrl(baseURL!, member.user.id), { waitUntil: 'load' })
    const siteSettings = await page.goto(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/settings`, { waitUntil: 'load' })
    expect(siteSettings?.status()).toBeLessThan(400)
    await expect(page.getByText('Site Settings', { exact: true }).first()).toBeVisible()

    const organizationSettings = await page.goto(`${baseURL}/dashboard/pottery-house-krabi/settings`, { waitUntil: 'load' })
    expect(organizationSettings?.status()).toBe(404)
  })

  test('capability-gated manager routes 404 when the vertical does not expose them, and resolve when it does', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })

    // Pottery House is an experience/saya site, not a restaurant (config/cms-registry.ts
    // verticalDefaultFeatures — verified against the live seed via `yarn seed:pottery-local`,
    // not assumed from the fixture name). Its default feature set has 'experiences'
    // ('location.experiences') but not 'menu' — that's restaurant-only — and 'site.services' has
    // no catalog entry in the saya template at all regardless of vertical.
    // toBeLessThan(400) alone would also pass on a 3xx redirect to some unrelated page (e.g. a
    // stale auth bounce to /login) — assert the exact success status AND that the final URL (after
    // following any redirect) is still the requested path, so a redirect can't silently satisfy this.
    // This test intentionally asserts manager behavior rather than mutable client-authored records.
    const experiences = await page.goto(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/experiences`, { waitUntil: 'load' })
    expect(experiences?.status(), 'location.experiences should resolve for an experience-vertical site').toBe(200)
    expect(new URL(page.url()).pathname).toBe('/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/experiences')
    await expect(page.getByText('Experiences', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add experience' }).first()).toBeVisible()

    const services = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/professional-services`)
    expect(services.status(), 'site.services has no catalog entry for saya and must 404, never redirect or render').toBe(404)

    const locationMenu = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/menu`)
    expect(locationMenu.status(), 'location.menu is restaurant-only and off by default for the experience vertical').toBe(404)

    const testimonials = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/testimonials`)
    expect(testimonials.status(), 'owner-entered testimonials are the site reputation manager').toBe(200)

    const oldSiteReviews = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/reviews`)
    expect(oldSiteReviews.status(), 'site-level reviews route was renamed to testimonials and must not redirect').toBe(404)

    const siteMedia = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/media`)
    expect(siteMedia.status(), 'media library is site-managed').toBe(200)

    const locationMedia = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/media`)
    expect(locationMedia.status(), 'location media was removed because it exposed the site library').toBe(404)

    const locationPhotos = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/photos`)
    expect(locationPhotos.status(), 'location photos remain the location-specific gallery manager').toBe(200)
  })

  test('location experiences page distinguishes populated, empty, and failed list states', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })

    // The experiences page fetches its list via a direct server-side call during
    // SSR (see loadDashboardLocationExperiences in dashboard-editor-resources.ts),
    // which never goes through the browser's network stack — page.route() cannot
    // intercept it on a page.goto/page.reload (hard) navigation. It only fetches
    // client-side (interceptable) when the component mounts via an in-app SPA
    // transition, so every mocked visit below arrives via a NuxtLink click from
    // the location overview page rather than a URL navigation. That click must
    // land after hydration completes — waitUntil: 'load' resolves as soon as the
    // document and its resources finish loading, which can race ahead of Vue
    // attaching NuxtLink's client-side router interception; a click before that
    // point falls through to the anchor's plain href and forces a hard reload
    // (bypassing the mock again). 'networkidle' waits out that gap reliably.
    const overviewUrl = `${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi`
    const experiencesLink = page.getByRole('link', { name: 'Experiences', exact: true })

    // The route mock must be registered before the overview page loads, not
    // after — NuxtLink eagerly prefetches its target route's data as soon as
    // the link scrolls into view, so registering the mock after page.goto
    // would let that prefetch slip through with real data, which the later
    // click would then reuse from cache instead of hitting our mock.
    await page.route('**/api/editor/sites/site-pottery-house/experiences?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ experiences: [] }),
      })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await experiencesLink.click()
    await expect(page).toHaveURL(/\/experiences$/)
    await expect(page.getByText('Experiences', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add experience' }).first()).toBeVisible()
    await expect(page.getByText('No experiences yet')).toBeVisible()
    await page.unroute('**/api/editor/sites/site-pottery-house/experiences?**')

    // A fresh hard navigation back to the overview page discards the client-side
    // Nuxt payload cache, so the next click below performs a genuine new fetch
    // under the 500 mock rather than reusing the cached empty result above.
    await page.route('**/api/editor/sites/site-pottery-house/experiences?**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test failure' }),
      })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await experiencesLink.click()
    await expect(page).toHaveURL(/\/experiences$/)
    await expect(page.getByText('Experiences', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Could not load experiences')).toBeVisible()
    await expect(page.getByText('No experiences yet')).toBeHidden()
  })

  test('site media library distinguishes empty and failed list states', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-kikuzuki'), { waitUntil: 'load' })

    // Same SSR-direct-service constraint as the experiences page above (see the
    // comment there) — media.vue fetches via loadDashboardMedia during SSR, so
    // the mock must be hit through an in-app SPA transition, not a URL nav.
    const overviewUrl = `${baseURL}/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand`
    const mediaLink = page.getByRole('link').filter({ hasText: 'Media library' })

    await page.route('**/api/editor/sites/site-kikuzuki/media?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await mediaLink.click()
    await expect(page).toHaveURL(/\/media$/)
    await expect(page.getByText('No media yet')).toBeVisible()
    await page.unroute('**/api/editor/sites/site-kikuzuki/media?**')

    await page.route('**/api/editor/sites/site-kikuzuki/media?**', async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('limit') === '6') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) })
        return
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test failure' }) })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await mediaLink.click()
    await expect(page).toHaveURL(/\/media$/)
    await expect(page.getByText('No media yet')).toBeHidden()
    await expect(page.getByText('Test failure')).toBeVisible()
  })

  test('blog posts list distinguishes empty and failed list states', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-kikuzuki'), { waitUntil: 'load' })

    const overviewUrl = `${baseURL}/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand`
    const blogLink = page.getByRole('link').filter({ hasText: /^Blog/ })

    await page.route('**/api/editor/sites/site-kikuzuki/blog/posts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Pages', exact: true }).click()
    await blogLink.click()
    await expect(page).toHaveURL(/\/blog$/)
    await expect(page.getByText('No blog posts yet. Create your first post to get started.')).toBeVisible()
    await page.unroute('**/api/editor/sites/site-kikuzuki/blog/posts')

    await page.route('**/api/editor/sites/site-kikuzuki/blog/posts', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test failure' }) })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Pages', exact: true }).click()
    await blogLink.click()
    await expect(page).toHaveURL(/\/blog$/)
    await expect(page.getByText('No blog posts yet. Create your first post to get started.')).toBeHidden()
    await expect(page.getByText('Test failure')).toBeVisible()
  })

  test('location menu distinguishes empty and failed list states', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-kikuzuki'), { waitUntil: 'load' })

    const overviewUrl = `${baseURL}/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand/locations/kikuzuki-japanese-robatayaki-izakaya`
    const menuLink = page.getByRole('link', { name: 'Menu', exact: true })

    await page.route('**/api/editor/sites/site-kikuzuki/menus?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, menus: [] }) })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-sidebar-control-ready="true"]')).toBeVisible()
    await menuLink.click()
    await expect(page).toHaveURL(/\/menu$/)
    await expect(page.getByText('No menus yet')).toBeVisible()
    await page.unroute('**/api/editor/sites/site-kikuzuki/menus?**')

    await page.route('**/api/editor/sites/site-kikuzuki/menus?**', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test failure' }) })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-sidebar-control-ready="true"]')).toBeVisible()
    await menuLink.click()
    await expect(page).toHaveURL(/\/menu$/)
    await expect(page.getByText('No menus yet')).toBeHidden()
    await expect(page.getByText('Test failure')).toBeVisible()
  })
})
