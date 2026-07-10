#!/usr/bin/env node
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BLAWBY_PARITY_ROUTES,
  BLAWBY_PARITY_VIEWPORTS,
  BLAWBY_REFERENCE_COMMIT,
} from './blawby-parity-config.mjs'

function parseArgs(argv) {
  const args = {
    url: '',
    source: 'blawby',
    sourceRevision: '',
    outDir: 'client-imports/north-carolina-legal-services/evidence',
    routes: structuredClone(BLAWBY_PARITY_ROUTES),
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--url') args.url = argv[++i]
    else if (arg === '--source') args.source = argv[++i]
    else if (arg === '--source-revision') args.sourceRevision = argv[++i]
    else if (arg === '--out-dir') args.outDir = argv[++i]
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
    const images = Array.from(document.images)
    await Promise.all(images.map(image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true })
          image.addEventListener('error', resolve, { once: true })
        })))
  })
}

async function markCaptureSections(page, routeName, expectedSections) {
  return page.evaluate(({ routeName, expectedSections }) => {
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    document.querySelectorAll('[data-parity-capture-slot]').forEach(element => {
      element.removeAttribute('data-parity-capture-slot')
    })

    const targets = []
    const add = (element, slot, name) => {
      if (!element || !visible(element)) return
      element.setAttribute('data-parity-capture-slot', slot)
      targets.push({ slot, name })
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
      const explicit = Array.from(root.querySelectorAll('[data-parity-section]')).filter(visible)
      const elements = root.matches('section')
        ? [root]
        : explicit.length
        ? explicit
        : Array.from(root.children).filter(visible)
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

const browser = await chromium.launch()
const manifest = {
  schema_version: 2,
  captured_at: new Date().toISOString(),
  source: args.source,
  source_revision: args.sourceRevision,
  pinned_reference_revision: BLAWBY_REFERENCE_COMMIT,
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
      const markedSections = await markCaptureSections(page, routeName, routeConfig.sections)
      await page.screenshot({ path: filePath, fullPage: true })
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
        await page.locator(`[data-parity-capture-slot="${section.slot}"]`).screenshot({ path: sectionPath })
        manifest.sections.push({
          route_name: routeName,
          route: routeConfig.path,
          viewport: viewportName,
          slot: section.slot,
          name: section.name,
          file: portablePath(args.outDir, sectionPath),
        })
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
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
