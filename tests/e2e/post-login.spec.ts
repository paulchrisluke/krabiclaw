import { expect, test } from '@playwright/test'
import { dismissPreviewToolbar } from './helpers'
import { loginAs } from './helpers/auth'

test('a verified user without an organization starts onboarding and can explicitly visit their profile', async ({ request, baseURL }) => {
  await loginAs(request, baseURL!, 'user-e2e-oauth-private-cimd')

  const destination = await request.get('/api/post-login', { maxRedirects: 0 })
  expect(destination.status()).toBe(302)
  expect(destination.headers().location).toBe('/dashboard/onboarding')

  const profile = await request.get('/api/post-login?redirect=/dashboard/account/profile', { maxRedirects: 0 })
  expect(profile.status()).toBe(302)
  expect(profile.headers().location).toBe('/dashboard/account/profile')
})

for (const width of [390, 1280]) {
  test(`public auth CTAs reflect the SSR session at ${width}px`, async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    await dismissPreviewToolbar(page)
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/docs']) {
      await page.goto(path)
      const header = page.locator('header').first()
      // `Start free` is the action at every width. At 620px and below the
      // header bar gives up its `Sign in` text link and the collapsed
      // navigation carries it instead.
      await expect(header.getByRole('link', { name: 'Start free', exact: true }).first()).toBeVisible()
      const barSignIn = header.getByRole('link', { name: 'Sign in', exact: true }).first()
      if (width > 620) {
        await expect(barSignIn).toBeVisible()
      } else {
        await expect(barSignIn).toBeHidden()
        await header.getByRole('button', { name: 'Open menu' }).click()
        await expect(header.locator('#platform-mobile-nav').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
      }
    }
    for (const path of ['/login', '/signup']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: path === '/login' ? 'Sign in' : 'Create your account', exact: true })).toBeVisible()
    }

    await loginAs(page.request, baseURL!, 'user-e2e-oauth-private-cimd')
    const session = await (await page.request.get('/api/auth/get-session')).json()

    // The marketing homepage is for people without an account. A signed-in
    // owner is sent to their dashboard rather than shown the pitch, which is
    // what stopped a returning owner clicking "Start free" a second time.
    const home = await page.request.get('/', { maxRedirects: 0 })
    expect(home.status()).toBe(302)
    expect(home.headers().location).toBe('/api/post-login')

    for (const path of ['/docs', '/plugin', '/features', '/pricing', '/templates/saya']) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      const html = await response!.text()
      expect(html).toContain(`Account: ${session.user.name}`)
      expect(html).not.toContain('href="/signup')
      expect(response!.headers()['cache-control']).toContain('no-store')
      const header = page.locator('header').first()
      // The avatar is a disclosure, not a link: it carries no label of its own
      // because a word in English is not something every owner can act on.
      const account = header.getByLabel(`Account: ${session.user.name}`).first()
      await expect(account).toBeVisible()
      await expect(page.locator('a[href^="/signup"]')).toHaveCount(0)
      await account.click()
      await expect(header.getByRole('link', { name: 'Dashboard', exact: true }).first()).toHaveAttribute('href', '/api/post-login')
      await expect(header.getByRole('link', { name: 'Account settings', exact: true })).toHaveAttribute('href', '/dashboard/account/profile')
      await expect(header.getByRole('button', { name: 'Log out', exact: true })).toBeVisible()
    }
    for (const path of ['/login', '/signup']) {
      const response = await page.request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(302)
      expect(response.headers().location).toBe('/api/post-login')
      const target = '/dashboard/account/profile'
      const redirected = await page.request.get(`${path}?redirect=${encodeURIComponent(target)}`, { maxRedirects: 0 })
      expect(redirected.headers().location).toBe(`/api/post-login?redirect=${encodeURIComponent(target)}`)
      const unsafe = await page.request.get(`${path}?redirect=https://example.com`, { maxRedirects: 0 })
      expect(unsafe.headers().location).toBe('/api/post-login')
      await page.goto(path)
      await expect(page).toHaveURL(/\/dashboard\/onboarding$/)
    }
    await page.goto('/oauth/login')
    await expect(page.getByRole('button', { name: /^Continue as / })).toBeVisible()
    await page.getByRole('button', { name: 'Sign in with a different account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sign in to connect', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/oauth\/login$/)
  })
}

test('invitation account switching updates the reactive session without reloading', async ({ page, baseURL }) => {
  await loginAs(page.request, baseURL!, 'user-e2e-oauth-private-cimd')
  await dismissPreviewToolbar(page)
  await page.goto('/accept-invitation/nonexistent-invitation')
  await page.getByRole('button', { name: 'Sign in with a different account', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Sign in with email', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with a different account', exact: true })).toHaveCount(0)
})

test('signed-in Growth CTA retains its plan through the canonical billing redirect', async ({ page, baseURL }) => {
  await loginAs(page.request, baseURL!, 'user-e2e-demo-owner')
  await page.goto('/pricing')
  const growth = page.getByRole('link', { name: 'Get Growth', exact: true })
  await expect(growth).toHaveAttribute('href', '/api/post-login?plan=growth')
  const destination = await page.request.get('/api/post-login?plan=growth', { maxRedirects: 0 })
  expect(destination.status()).toBe(302)
  expect(destination.headers().location).toBe('/dashboard/ember-slice-demo/settings/billing?plan=growth')
  const invalid = await page.request.get('/api/post-login?plan=unknown', { maxRedirects: 0 })
  expect(invalid.status()).toBe(400)
})

test('sign-in surfaces the last used method without remembering the account', async ({ page, baseURL }) => {
  await dismissPreviewToolbar(page)
  await loginAs(page.request, baseURL!, 'user-e2e-oauth-private-cimd')
  const signOut = await page.request.post('/api/auth/sign-out', { headers: { origin: baseURL! }, data: {} })
  expect(signOut.status()).toBe(200)

  await page.goto('/login')
  // Better Auth's lastLoginMethod records the method, so the email form is
  // badged. No identity is retained: the email field is empty and nothing
  // offers to continue as the previous account.
  await expect(page.getByText('Last used', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: /Continue as/ })).toHaveCount(0)
  expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull()
})
