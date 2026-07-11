#!/usr/bin/env node
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BLAWBY_PARITY_ROUTES,
  BLAWBY_PARITY_VIEWPORTS,
  BLAWBY_REFERENCE_COMMIT,
  BLAWBY_REFERENCE_ETAG,
  BLAWBY_REFERENCE_URL,
} from './blawby-parity-config.mjs'

function parseArgs(argv) {
  const args = {
    url: '',
    source: 'blawby',
    sourceRevision: '',
    outDir: 'client-imports/north-carolina-legal-services/evidence',
    tenantSlug: '',
    routes: structuredClone(BLAWBY_PARITY_ROUTES),
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--url') args.url = argv[++i]
    else if (arg === '--source') args.source = argv[++i]
    else if (arg === '--source-revision') args.sourceRevision = argv[++i]
    else if (arg === '--out-dir') args.outDir = argv[++i]
    else if (arg === '--tenant-slug') args.tenantSlug = argv[++i]
    else if (arg === '--route') {
      const [name, route] = argv[++i].split('=')
      if (!name || !route) throw new Error('--route must use name=/path')
      args.routes[name] = { path: route, sections: [] }
    }
  }
  if (!['reference', 'blawby'].includes(args.source)) {
    throw new Error('--source must be reference or blawby')
  }
  if (args.source === 'reference') {
    args.sourceRevision ||= BLAWBY_REFERENCE_COMMIT
    if (args.sourceRevision !== BLAWBY_REFERENCE_COMMIT) {
      throw new Error(`Reference captures must use pinned commit ${BLAWBY_REFERENCE_COMMIT}`)
    }
  } else {
    args.sourceRevision ||= process.env.GITHUB_SHA || 'working-tree'
  }
  return args
}

function resolveUrl(base, route) {
  const baseUrl = new URL(base)
  const resolved = new URL(route, `${baseUrl.origin}/`)
  if (resolved.origin !== baseUrl.origin) throw new Error(`Route escapes capture origin: ${route}`)
  return resolved.toString()
}

function portablePath(root, filePath) {
  return path.relative(path.resolve(root), filePath).replaceAll('\\', '/')
}

async function stabilizePage(page) {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  })
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
    const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
    const step = Math.max(window.innerHeight, 600)
    for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
      window.scrollTo(0, top)
      await delay(50)
    }
    window.scrollTo(0, 0)
    const images = Array.from(document.images)
    await Promise.race([
      Promise.all(images.map(image => image.complete
        ? Promise.resolve()
        : new Promise(resolve => {
            image.addEventListener('load', resolve, { once: true })
            image.addEventListener('error', resolve, { once: true })
          }))),
      delay(5_000),
    ])
  })
}

async function markCaptureSections(page, routeName, expectedSections) {
  return page.evaluate(({ routeName, expectedSections }) => {
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const contentSection = element => visible(element) && !['HEADER', 'FOOTER'].includes(element.tagName)
    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = 1
    colorCanvas.height = 1
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true })
    const normalizedColor = (value) => {
      if (!colorContext || !value) return value
      colorContext.clearRect(0, 0, 1, 1)
      colorContext.fillStyle = value
      colorContext.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data
      return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(3)})`
    }
    const normalizedFont = (value) => {
      const lower = value.toLowerCase()
      if (lower.includes('bitter')) return 'Bitter'
      if (lower.includes('marcellus')) return 'Marcellus'
      if (lower.includes('poppins')) return 'Poppins'
      return value.replaceAll('"', '')
    }
    const styleSnapshot = (element) => {
      if (!element) return null
      const style = getComputedStyle(element)
      return {
        background_color: normalizedColor(style.backgroundColor),
        border_radius: style.borderRadius,
        box_shadow: style.boxShadow === 'none' ? 'none' : 'present',
        color: normalizedColor(style.color),
        column_gap: style.columnGap,
        display: style.display,
        font_family: normalizedFont(style.fontFamily),
        font_size: style.fontSize,
        font_weight: style.fontWeight,
        grid_columns: style.display === 'grid' ? style.gridTemplateColumns.split(/\s+/).filter(Boolean).length : null,
        line_height: style.lineHeight,
        max_width: style.maxWidth,
        object_fit: style.objectFit,
        overflow_x: style.overflowX,
        overflow_y: style.overflowY,
        padding_bottom: style.paddingBottom,
        padding_left: style.paddingLeft,
        padding_right: style.paddingRight,
        padding_top: style.paddingTop,
        row_gap: style.rowGap,
        text_align: style.textAlign,
      }
    }
    const firstVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find(visible) || null
    const styleSignature = (element) => {
      const descendants = Array.from(element.querySelectorAll('*')).filter(visible)
      const grid = descendants.find((candidate) => getComputedStyle(candidate).display === 'grid') || null
      const card = descendants.find((candidate) => {
        const style = getComputedStyle(candidate)
        return style.borderRadius !== '0px'
          && style.boxShadow !== 'none'
          && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
      }) || null
      return {
        section: styleSnapshot(element),
        heading: styleSnapshot(firstVisible(element, 'h1, h2, h3')),
        copy: styleSnapshot(firstVisible(element, 'p')),
        grid: styleSnapshot(grid),
        card: styleSnapshot(card),
        media: styleSnapshot(firstVisible(element, 'img')),
      }
    }
    document.querySelectorAll('[data-parity-capture-slot]').forEach(element => {
      element.removeAttribute('data-parity-capture-slot')
    })

    const targets = []
    const add = (element, slot, name) => {
      if (!element || !visible(element)) return
      element.setAttribute('data-parity-capture-slot', slot)
      const rect = element.getBoundingClientRect()
      const documentWidth = document.documentElement.scrollWidth
      const documentHeight = document.documentElement.scrollHeight
      const x = Math.max(0, rect.left + window.scrollX)
      const y = Math.max(0, rect.top + window.scrollY)
      const width = Math.min(rect.width, documentWidth - x)
      const height = Math.min(rect.height, documentHeight - y)
      if (width <= 0 || height <= 0) return
      targets.push({
        slot,
        name,
        style_signature: styleSignature(element),
        clip: {
          x,
          y,
          width,
          height,
        },
      })
    }

    add(Array.from(document.querySelectorAll('header')).find(visible), 'header', 'header')

    let root = document.querySelector('[data-parity-root]')
    if (!root) {
      const mainCandidates = Array.from(document.querySelectorAll('main')).filter(visible)
      root = mainCandidates.sort((left, right) => {
        const leftChildren = Array.from(left.children).filter(visible).length
        const rightChildren = Array.from(right.children).filter(visible).length
        return rightChildren - leftChildren
      })[0] || null
    }

    if (root) {
      const explicit = Array.from(root.querySelectorAll('[data-parity-section]')).filter(element => {
        if (!visible(element)) return false
        return !element.parentElement?.closest('[data-parity-section]')
      })
      const elements = root.matches('section')
        ? [root]
        : explicit.length
        ? explicit
        : Array.from(root.children).filter(contentSection)
      if (!elements.length) {
        add(root, 'main-01', expectedSections[0] || `${routeName}-content`)
      } else {
        elements.forEach((element, index) => {
          const slot = `main-${String(index + 1).padStart(2, '0')}`
          const explicitName = element.getAttribute('data-parity-section')
          add(element, slot, explicitName || expectedSections[index] || `${routeName}-unexpected-${index + 1}`)
        })
      }
    }

    add(Array.from(document.querySelectorAll('footer')).find(visible), 'footer', 'footer')
    return targets
  }, { routeName, expectedSections })
}

const args = parseArgs(process.argv.slice(2))
if (!args.url) {
  console.error('Usage: node scripts/capture-blawby-screenshots.mjs --url https://example.com --source reference|blawby [--source-revision sha] [--out-dir dir]')
  process.exit(2)
}

let referenceEtag = null
if (args.source === 'reference') {
  const referenceUrl = new URL(args.url)
  if (referenceUrl.origin !== BLAWBY_REFERENCE_URL) {
    throw new Error(`Reference capture must use ${BLAWBY_REFERENCE_URL}`)
  }
  const response = await fetch(BLAWBY_REFERENCE_URL, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
  referenceEtag = response.headers.get('etag')
  if (referenceEtag !== BLAWBY_REFERENCE_ETAG) {
    throw new Error(`Live reference moved: expected ETag ${BLAWBY_REFERENCE_ETAG}, found ${referenceEtag || 'none'}. Review the source deployment before updating the pin.`)
  }
}

const browser = await chromium.launch()
const manifest = {
  schema_version: 2,
  captured_at: new Date().toISOString(),
  source: args.source,
  source_revision: args.sourceRevision,
  pinned_reference_revision: BLAWBY_REFERENCE_COMMIT,
  pinned_reference_etag: BLAWBY_REFERENCE_ETAG,
  observed_reference_etag: referenceEtag,
  base_url: args.url,
  browser: { name: 'chromium', version: browser.version(), device_scale_factor: 1 },
  rendering: {
    color_scheme: 'light',
    locale: 'en-US',
    reduced_motion: true,
    timezone: 'America/New_York',
  },
  screenshots: [],
  sections: [],
  states: [],
}

try {
  for (const [viewportName, viewport] of Object.entries(BLAWBY_PARITY_VIEWPORTS)) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      locale: 'en-US',
      reducedMotion: 'reduce',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: args.tenantSlug ? { 'x-preview-tenant': args.tenantSlug, 'cache-control': 'no-store' } : undefined,
    })
    await context.route(/(?:youtube\.com|youtu\.be|googlevideo\.com|vimeo\.com)/, route => route.abort())
    const page = await context.newPage()
    for (const [routeName, routeConfig] of Object.entries(args.routes)) {
      const targetUrl = resolveUrl(args.url, routeConfig.path)
      const filePath = path.resolve(args.outDir, 'screenshots', args.source, `${routeName}-${viewportName}.png`)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
      await stabilizePage(page)
      await page.screenshot({ path: filePath, fullPage: true })
      await page.evaluate(() => window.scrollTo(0, 0))
      const markedSections = await markCaptureSections(page, routeName, routeConfig.sections)
      const markedMainNames = markedSections
        .filter(section => section.slot.startsWith('main-'))
        .map(section => section.name)
      if (JSON.stringify(markedMainNames) !== JSON.stringify(routeConfig.sections)) {
        throw new Error(
          `Section recipe mismatch for ${routeName}/${viewportName}: `
          + `expected ${JSON.stringify(routeConfig.sections)}, found ${JSON.stringify(markedMainNames)}`,
        )
      }
      manifest.screenshots.push({
        route_name: routeName,
        route: routeConfig.path,
        viewport: viewportName,
        status: response?.status() ?? null,
        file: portablePath(args.outDir, filePath),
      })

      for (const section of markedSections) {
        const sectionPath = path.resolve(
          args.outDir,
          'screenshots',
          args.source,
          'sections',
          routeName,
          viewportName,
          `${section.slot}-${section.name}.png`,
        )
        await fs.mkdir(path.dirname(sectionPath), { recursive: true })
        try {
          if (section.slot !== 'header') {
            await page.locator('header').first().evaluate(element => { element.style.visibility = 'hidden' })
          }
          await page.locator(`[data-parity-capture-slot="${section.slot}"]`).first().screenshot({
            path: sectionPath,
            animations: 'disabled',
          })
        } catch (error) {
          throw new Error(
            `Section capture failed for ${routeName}/${viewportName}/${section.slot}-${section.name} `
            + `at ${JSON.stringify(section.clip)}: ${error instanceof Error ? error.message : String(error)}`,
          )
        } finally {
          if (section.slot !== 'header') {
            await page.locator('header').first().evaluate(element => { element.style.visibility = '' })
          }
        }
        manifest.sections.push({
          route_name: routeName,
          route: routeConfig.path,
          viewport: viewportName,
          slot: section.slot,
          name: section.name,
          style_signature: section.style_signature,
          file: portablePath(args.outDir, sectionPath),
        })
      }

      if (routeName === 'home' && viewportName === 'mobile') {
        const mobileToggle = page.locator('button[aria-label*="Toggle" i]').first()
        if (await mobileToggle.isVisible()) {
          await mobileToggle.click()
          await page.waitForTimeout(200)
          const statePath = path.resolve(args.outDir, 'screenshots', args.source, 'states', 'home-mobile-navigation-open-mobile.png')
          await fs.mkdir(path.dirname(statePath), { recursive: true })
          await page.locator('header').first().screenshot({ path: statePath, animations: 'disabled' })
          manifest.states.push({
            route_name: routeName,
            route: routeConfig.path,
            viewport: viewportName,
            name: 'mobile-navigation-open',
            file: portablePath(args.outDir, statePath),
          })
          await mobileToggle.click()
        }
      }
    }
    await context.close()
  }
} finally {
  await browser.close()
}

const manifestPath = path.resolve(args.outDir, `screenshots-${args.source}.json`)
await fs.mkdir(path.dirname(manifestPath), { recursive: true })
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  source: manifest.source,
  source_revision: manifest.source_revision,
  observed_reference_etag: manifest.observed_reference_etag,
  screenshots: manifest.screenshots.length,
  sections: manifest.sections.length,
  states: manifest.states.length,
  manifest: portablePath(process.cwd(), manifestPath),
}, null, 2)}\n`)
