import { expect, test, type Page } from '@playwright/test'
import { blawbyBaseURL, blawbyExtraHeaders, potteryHouseBaseURL, potteryHouseExtraHeaders, setupTenantHeaders } from './helpers'

// Labels that must never appear in a visible search heading or badge — they describe
// how a record is stored, not what the user is opening. See issue #254.
const BANNED_LABELS = ['Platform Pages', 'Routes', 'Route']

// WCAG 2.1 relative luminance / contrast ratio, computed from resolved rgb() colors so
// these assertions work regardless of which CSS custom property actually supplied the
// color. The point is to test the rendered result, not which token produced it.
function relativeLuminance([r, g, b]: [number, number, number]) {
  const channel = (value: number) => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function parseRgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\(([^)]+)\)/)
  if (!match) throw new Error(`Unrecognized color format: ${value}`)
  const [r, g, b] = match[1]!.split(',').map(part => Number.parseFloat(part.trim()))
  return [r ?? 0, g ?? 0, b ?? 0]
}

function contrastRatio(foreground: string, background: string) {
  const l1 = relativeLuminance(parseRgb(foreground))
  const l2 = relativeLuminance(parseRgb(background))
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (lighter + 0.05) / (darker + 0.05)
}

async function assertNoBannedLabels(page: Page) {
  const dialog = page.getByRole('dialog')
  for (const banned of BANNED_LABELS) {
    await expect(dialog.getByText(banned, { exact: true })).toHaveCount(0)
  }
}

async function assertDialogContrast(page: Page, minRatio = 4.5) {
  const dialog = page.getByRole('dialog')
  const input = dialog.locator('input[type="text"]')

  const colors = await input.evaluate((element) => {
    const inputStyle = getComputedStyle(element)
    const panel = element.closest('[role="dialog"]') as HTMLElement
    const panelStyle = getComputedStyle(panel)
    return { text: inputStyle.color, background: panelStyle.backgroundColor }
  })

  const ratio = contrastRatio(colors.text, colors.background)
  expect(ratio, `input text vs panel background contrast (${colors.text} on ${colors.background})`).toBeGreaterThanOrEqual(minRatio)
}

async function openSearchAfterHydration(page: Page, accessibleName: string) {
  const trigger = page.getByRole('button', { name: accessibleName })
  await expect(trigger).toBeVisible()
  await expect(trigger).toBeEnabled()
  await expect(async () => {
    await trigger.click()
    await expect(page.getByRole('dialog')).toHaveCount(1, { timeout: 1_000 })
  }, `${accessibleName} should open after hydration`).toPass({ timeout: 10_000 })
}

test.describe('platform command search modal', () => {
  test('teleports to <body> and never shows storage-shaped labels', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/blog`, { waitUntil: 'load' })
    await openSearchAfterHydration(page, 'Open blog search')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Teleport target for the platform variant is <body> directly — it has no tenant
    // palette to escape (see PlatformCommandSearchModal.vue's teleportTarget computed).
    const teleportedToBody = await dialog.evaluate(node => node.parentElement?.parentElement === document.body)
    expect(teleportedToBody).toBe(true)

    await assertDialogContrast(page)

    await page.locator('input[type="text"]').fill('pricing')
    await page.waitForTimeout(400)
    await assertNoBannedLabels(page)
  })
})

test.describe('Saya command search modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, potteryHouseBaseURL, potteryHouseExtraHeaders)
  })

  test('teleports into #saya-portal-root and keeps AA contrast in light and dark mode', async ({ page }) => {
    await page.goto(`${potteryHouseBaseURL}/blog/group-bookings-create-a-unique-pottery-experience-in-krabi`, { waitUntil: 'load' })
    await openSearchAfterHydration(page, 'Open story search')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const teleportedIntoSayaPortal = await dialog.evaluate(node => Boolean(node.closest('#saya-portal-root')))
    expect(teleportedIntoSayaPortal).toBe(true)

    await assertDialogContrast(page)
    await assertNoBannedLabels(page)

    await page.locator('input[type="text"]').fill('group bookings for retreats')
    await page.waitForTimeout(400)
    await assertNoBannedLabels(page)

    // Re-check contrast in dark mode — Saya's --ui-* tokens flip under `.dark .saya-theme`
    // (assets/css/saya.css), and the modal reuses those same semantic classes rather than
    // a light-only hardcoded palette.
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await assertDialogContrast(page)
  })
})

test.describe('Blawby command search modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, blawbyBaseURL, blawbyExtraHeaders)
  })

  test('teleports into #blawby-portal-root, inherits tenant palette, and keeps AA contrast', async ({ page }) => {
    const response = await page.goto(`${blawbyBaseURL}/article/getting-a-divorce-in-north-carolina`, { waitUntil: 'load' })
    test.skip(response?.status() === 404, 'NCLS Blawby fixture is not seeded in the shared staging environment')
    await openSearchAfterHydration(page, 'Open article search')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const teleportedIntoBlawbyPortal = await dialog.evaluate(node => Boolean(node.closest('#blawby-portal-root')))
    expect(teleportedIntoBlawbyPortal).toBe(true)

    // The dialog uses Nuxt UI semantic text classes; inside .blawby-theme, --ui-text
    // bridges to --blawby-ink so contrast never depends on the tenant accent color.
    const lightTokens = await dialog.evaluate((node) => {
      const shell = node.closest('.blawby-shell') as HTMLElement
      const ink = getComputedStyle(shell).getPropertyValue('--blawby-ink').trim()
      const uiText = getComputedStyle(shell).getPropertyValue('--ui-text').trim()
      const primary = getComputedStyle(shell).getPropertyValue('--blawby-primary').trim()
      const probe = document.createElement('span')
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      document.body.appendChild(probe)
      probe.style.color = ink
      const inkRgb = getComputedStyle(probe).color
      probe.style.color = primary
      const primaryRgb = getComputedStyle(probe).color
      probe.remove()

      const input = node.querySelector('input[type="text"]') as HTMLElement
      const inputRgb = getComputedStyle(input).color
      return { inputRgb, inkRgb, primaryRgb, uiText, ink }
    })
    expect(lightTokens.uiText).toBe(lightTokens.ink)
    expect(lightTokens.inputRgb).toBe(lightTokens.inkRgb)
    expect(lightTokens.inputRgb).not.toBe(lightTokens.primaryRgb)

    await assertDialogContrast(page)

    await page.locator('input[type="text"]').fill('divorce')
    await page.waitForTimeout(400)
    await assertNoBannedLabels(page)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const darkTokens = await dialog.evaluate((node) => {
      const shell = node.closest('.blawby-shell') as HTMLElement
      return {
        colorScheme: getComputedStyle(shell).colorScheme,
        bg: getComputedStyle(shell).getPropertyValue('--blawby-bg').trim(),
        uiBg: getComputedStyle(shell).getPropertyValue('--ui-bg').trim(),
        ink: getComputedStyle(shell).getPropertyValue('--blawby-ink').trim(),
        uiText: getComputedStyle(shell).getPropertyValue('--ui-text').trim(),
      }
    })
    expect(darkTokens.colorScheme).toBe('dark')
    expect(darkTokens.bg).toBe('#0f1222')
    expect(darkTokens.uiBg).toBe(darkTokens.bg)
    expect(darkTokens.ink).toBe('#f4f6fb')
    expect(darkTokens.uiText).toBe(darkTokens.ink)
    await assertDialogContrast(page)
  })
})
