#!/usr/bin/env node
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const ROUTES = {
  home: '/',
  services: '/services',
  'service-detail': '/services/family',
  pricing: '/pricing',
  about: '/about',
  contact: '/contact',
  schedule: '/schedule',
  blog: '/blog',
  article: '/article/preparing-for-your-consultation',
  donate: '/donate',
  policy: '/policies/privacy',
}

const VIEWPORTS = {
  desktop: { width: 1440, height: 1200 },
  mobile: { width: 390, height: 1200 },
}

function parseArgs(argv) {
  const args = {
    url: '',
    source: 'blawby',
    outDir: 'client-imports/north-carolina-legal-services/evidence',
    routes: { ...ROUTES },
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--url') args.url = argv[++i]
    else if (arg === '--source') args.source = argv[++i]
    else if (arg === '--out-dir') args.outDir = argv[++i]
    else if (arg === '--route') {
      const [name, route] = argv[++i].split('=')
      if (!name || !route) throw new Error('--route must use name=/path')
      args.routes[name] = route
    }
  }
  return args
}

function resolveUrl(base, route) {
  return new URL(route, base.endsWith('/') ? base : `${base}/`).toString()
}

const args = parseArgs(process.argv.slice(2))
if (!args.url) {
  console.error('Usage: node scripts/capture-blawby-screenshots.mjs --url https://example.com --source reference|blawby [--out-dir dir]')
  process.exit(2)
}

const browser = await chromium.launch()
const manifest = {
  captured_at: new Date().toISOString(),
  source: args.source,
  base_url: args.url,
  screenshots: [],
}

try {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage({ viewport })
    for (const [routeName, route] of Object.entries(args.routes)) {
      const targetUrl = resolveUrl(args.url, route)
      const filePath = path.resolve(args.outDir, 'screenshots', args.source, `${routeName}-${viewportName}.png`)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForTimeout(750)
      await page.screenshot({ path: filePath, fullPage: true })
      manifest.screenshots.push({
        route_name: routeName,
        route,
        viewport: viewportName,
        status: response?.status() ?? null,
        file: filePath,
      })
    }
    await page.close()
  }
} finally {
  await browser.close()
}

const manifestPath = path.resolve(args.outDir, `screenshots-${args.source}.json`)
await fs.mkdir(path.dirname(manifestPath), { recursive: true })
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
