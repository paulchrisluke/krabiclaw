import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

const repoRoot = process.cwd()
const routesRoot = join(repoRoot, 'pages', 'dashboard')
const auditPath = join(repoRoot, 'docs', 'design', 'cms-redesign-packet', 'AUDIT.tsv')

if (!existsSync(routesRoot) || !existsSync(auditPath)) {
  throw new Error('Run this script from the KrabiClaw repository root after checking out the CMS redesign packet.')
}

function walkFiles(directory, extension) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name)
      return statSync(path).isDirectory() ? walkFiles(path, extension) : [path]
    })
    .filter(path => path.endsWith(extension))
}

function parseTsv(source) {
  const [headerLine, ...lines] = source.trimEnd().split(/\r?\n/)
  const headers = headerLine.split('\t')
  return lines.map((line) => {
    const values = line.split('\t')
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function routeFromPageFile(path) {
  const segments = relative(routesRoot, path).split(sep)
  const last = segments.pop().replace(/\.vue$/, '')
  if (last !== 'index') segments.push(last)
  return `/dashboard${segments.length ? `/${segments.join('/')}` : ''}`
}

function packetRouteKey(route) {
  if (route === '/dashboard') return '/dashboard'
  if (route === '/dashboard/onboarding') return '/onboarding-dashboard'
  if (route.startsWith('/dashboard/account')) return route.slice('/dashboard'.length)
  if (route === '/dashboard/[orgSlug]') return '/index'
  if (route === '/dashboard/[orgSlug]/onboarding') return '/onboarding-org'
  if (route.startsWith('/dashboard/[orgSlug]/')) return route.slice('/dashboard/[orgSlug]'.length)
  return route
}

function normalizeAuditRoute(route) {
  const hadLeadingSlash = route.trim().startsWith('/')
  let normalized = route.trim()
    .replace(/ \(both locations\)$/, '')
    .replace(/ selected-item edit state$/, '')
    .replace(/ working screen$/, '')
  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  normalized = normalized
    .replace(/^\/dashboard\/\[orgSlug\]/, '/')
    .replace('/locations/take-me-away-by-kikuzuki', '/locations/[locationSlug]')
  if (normalized.startsWith('/locations/')) normalized = `/sites/[siteSlug]${normalized}`
  if (!hadLeadingSlash && normalized.startsWith('/sites/') && !normalized.startsWith('/sites/[siteSlug]')) {
    normalized = normalized.replace('/sites/', '/sites/[siteSlug]/')
  }
  return normalized.replace(/\/+/g, '/')
}

const genericComponentPrefixes = ['U', 'Nuxt']
const genericComponents = new Set(['ClientOnly', 'KeepAlive', 'Suspense', 'Teleport', 'Transition'])

function rootApplicationComponentName(source) {
  const template = source.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ''
  const name = template.match(/<(?!template\b)([A-Z][A-Za-z0-9]*)\b/)?.[1] ?? null
  if (!name || genericComponents.has(name) || genericComponentPrefixes.some(prefix => name.startsWith(prefix))) return null
  return name
}

const chromeComponents = new Set(['DashboardAccountMenu', 'DashboardNavbarLeading', 'DashboardScopeHeader', 'DashboardSidebarCollapseButton'])

function applicationComponentNames(source) {
  const templateStart = source.indexOf('<template>')
  const scriptStart = source.indexOf('<script')
  const template = templateStart >= 0 ? source.slice(templateStart, scriptStart >= 0 ? scriptStart : undefined) : ''
  return [...new Set([...template.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)]
    .map(match => match[1])
    .filter(name => !genericComponents.has(name)
      && !genericComponentPrefixes.some(prefix => name.startsWith(prefix))
      && !chromeComponents.has(name)))]
}

const componentFiles = [join(repoRoot, 'components'), join(repoRoot, 'lib', 'components')]
  .filter(existsSync)
  .flatMap(directory => walkFiles(directory, '.vue'))

const componentsByName = new Map()
for (const path of componentFiles) {
  const name = basename(path, '.vue')
  const matches = componentsByName.get(name) ?? []
  matches.push(path)
  componentsByName.set(name, matches)
}

function resolveComponent(name) {
  const matches = componentsByName.get(name) ?? []
  return matches.length === 1 ? matches[0] : null
}

function classifyPattern({ pageSource, combinedSource, componentNames }) {
  const template = pageSource.match(/<template>([\s\S]*?)<\/template>/)?.[1]
  const trivialTemplate = template === undefined || /^\s*(?:<div\s*\/>)?\s*$/.test(template)
  if (trivialTemplate && /navigateTo\(|sendRedirect\(/.test(pageSource)) return 'redirect'
  if (componentNames.includes('TenantPageEditor')) return 'continuous block editor'
  if (componentNames.includes('BlogPostEditor')) return 'writing canvas + settings slideover'
  if (componentNames.includes('ProductEditor')) {
    return /USlideover/.test(combinedSource) ? 'collection + edit slideover' : 'collection + sibling editor'
  }
  if (componentNames.includes('OnboardingWizard') && componentNames.includes('OnboardingPreviewPane')) return 'onboarding canvas + live preview'
  if (/EditorPaneShell/.test(combinedSource)) return 'hub + focused detail'
  if (componentNames.some(name => /GuestThreadInbox|Conversation/.test(name)) || /UChatMessages/.test(combinedSource)) return 'conversation list/detail'
  if (/MediaLibraryGrid|MediaPicker/.test(combinedSource)) return 'media grid/picker'
  if (/USlideover/.test(combinedSource)) return 'list/canvas + slideover'
  if (/UModal/.test(combinedSource)) return 'list/form + modal'
  if (/UDashboardPanel/.test(combinedSource) && /UForm|@submit/.test(combinedSource)) return 'dashboard form'
  if (/UDashboardPanel/.test(combinedSource) && /v-for/.test(combinedSource)) return 'dashboard list/overview'
  if (/UDashboardPanel/.test(combinedSource)) return 'dashboard detail'
  if (/UForm|@submit/.test(combinedSource)) return 'form'
  if (/v-for/.test(combinedSource)) return 'list/overview'
  return 'route-local'
}

function evidenceForRoute(route) {
  const key = packetRouteKey(route)
  if (key.endsWith('/[...segments]')) {
    const prefix = key.slice(0, -'/[...segments]'.length)
    return normalizedAuditRows.filter(row => row.normalizedRoute.startsWith(`${prefix}/`))
  }
  return normalizedAuditRows.filter(row => row.normalizedRoute === key)
}

function writeModel(source) {
  const methods = [...source.matchAll(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/g)].map(match => match[1])
  const uniqueMethods = [...new Set(methods)]
  const parts = []
  if (/EditorPaneShell/.test(source)) parts.push('detail Cancel/Save')
  else if (/StickySaveBar/.test(source)) parts.push('sticky Reset/Save')
  else if (/label=['"]Save['"]|@save=|@click=['"]save/.test(source)) parts.push('explicit Save')
  else if (/label=['"]Publish|Publish now/.test(source)) parts.push('publish action')
  else if (/@submit|UForm/.test(source)) parts.push('form submit')
  else parts.push('route-specific or read-only')
  if (uniqueMethods.length) parts.push(uniqueMethods.join('/'))
  if (/onBeforeRouteLeave|beforeunload|Unsaved changes|\bdirty\b/.test(source)) parts.push('dirty guard')
  return parts.join('; ')
}

function shellModel(source) {
  const parts = ['dashboard layout']
  if (/EditorPaneShell/.test(source)) parts.push('responsive index/detail split')
  if (/UDashboardPanel/.test(source)) parts.push('dashboard panel/navbar')
  if (/USlideover/.test(source)) parts.push('slideover')
  if (/UModal/.test(source)) parts.push('modal')
  if (/StickySaveBar/.test(source)) parts.push('sticky save bar')
  return parts.join('; ')
}

const auditRows = parseTsv(readFileSync(auditPath, 'utf8')).filter(row => row.scope === 'CMS')
const normalizedAuditRows = auditRows.map(row => ({ ...row, normalizedRoute: normalizeAuditRoute(row.route_or_state) }))

const inventory = walkFiles(routesRoot, '.vue')
  .map((pagePath) => {
    const pageSource = readFileSync(pagePath, 'utf8')
    const route = routeFromPageFile(pagePath)
    const directOwnerName = rootApplicationComponentName(pageSource)
    const directOwnerPath = directOwnerName ? resolveComponent(directOwnerName) : null
    const componentNames = applicationComponentNames(pageSource)
    const contentComponentPaths = [...new Set(componentNames.map(resolveComponent).filter(path => path !== null))]
    const contentComponentSources = contentComponentPaths.map(path => readFileSync(path, 'utf8'))
    const combinedSource = [pageSource, ...contentComponentSources].join('\n')
    const evidence = evidenceForRoute(route)
    const owner = directOwnerPath ?? pagePath
    const delegates = contentComponentPaths.filter(path => path !== owner)
    return {
      route,
      page: relative(repoRoot, pagePath).split(sep).join('/'),
      owner: relative(repoRoot, owner).split(sep).join('/'),
      delegates: delegates.map(path => relative(repoRoot, path).split(sep).join('/')),
      ownerName: directOwnerName ?? 'route component',
      pattern: classifyPattern({ pageSource, combinedSource, componentNames }),
      shell: shellModel(combinedSource),
      save: writeModel(combinedSource),
      evidenceStatus: [...new Set(evidence.map(row => row.status))].join(', ') || 'not listed',
      screenshots: evidence.filter(row => row.screenshot).map(row => row.screenshot),
      blockers: [...new Set(evidence.filter(row => row.blocker).map(row => row.blocker))],
    }
  })
  .sort((left, right) => left.route.localeCompare(right.route))

const matchedAuditRows = new Set()
for (const item of inventory) {
  for (const row of evidenceForRoute(item.route)) matchedAuditRows.add(row)
}

const patternCounts = Object.entries(Object.groupBy(inventory, item => item.pattern))
  .map(([pattern, items]) => ({ pattern, count: items.length }))
  .sort((left, right) => right.count - left.count || left.pattern.localeCompare(right.pattern))

const ownerCounts = Object.entries(Object.groupBy(inventory, item => item.owner))
  .map(([owner, items]) => ({ owner, count: items.length }))
  .filter(item => item.count > 1)
  .sort((left, right) => right.count - left.count || left.owner.localeCompare(right.owner))

const unmatchedEvidence = normalizedAuditRows
  .filter(row => !matchedAuditRows.has(row))
  .map(row => ({ route: row.route_or_state, status: row.status, blocker: row.blocker, exclusion: row.exclusion_reason }))

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ inventory, patternCounts, ownerCounts, unmatchedEvidence }, null, 2)}\n`)
  process.exit(0)
}

const escapeCell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
const routeRows = inventory.map(item => {
  const evidence = item.screenshots.length ? `${item.evidenceStatus}; ${item.screenshots.length} screenshot(s)` : item.evidenceStatus
  const delegates = item.delegates.length ? item.delegates.map(path => `\`${escapeCell(path)}\``).join('<br>') : ''
  return `| \`${escapeCell(item.route)}\` | \`${escapeCell(item.owner)}\` | ${delegates} | ${escapeCell(item.pattern)} | ${escapeCell(item.shell)} | ${escapeCell(item.save)} | ${escapeCell(evidence)} |`
})
const lines = [
  '# Tenant CMS route and UI-owner inventory',
  '',
  `Generated by \`node scripts/audit-cms-redesign-inventory.mjs\` from ${inventory.length} Nuxt dashboard routes and ${auditRows.length} CMS packet audit rows.`,
  '',
  '## Pattern counts',
  '',
  '| Pattern | Routes |',
  '|---|---:|',
  ...patternCounts.map(item => `| ${escapeCell(item.pattern)} | ${item.count} |`),
  '',
  '## Shared canonical owners',
  '',
  '| Owner | Routes |',
  '|---|---:|',
  ...ownerCounts.map(item => `| \`${escapeCell(item.owner)}\` | ${item.count} |`),
  '',
  '## Route inventory',
  '',
  '| Route | Canonical owner | Delegated content | Current pattern | Shell | Save model | Packet evidence |',
  '|---|---|---|---|---|---|---|',
  ...routeRows,
  '',
  '## Packet entries without an exact route match',
  '',
  'These are duplicate concrete-location captures, privacy exclusions, blocked interaction states, not-applicable routes, or packet aliases that need human interpretation rather than another source route.',
  '',
  '| Packet route or state | Status | Blocker or exclusion |',
  '|---|---|---|',
  ...unmatchedEvidence.map(item => `| \`${escapeCell(item.route)}\` | ${escapeCell(item.status)} | ${escapeCell(item.blocker || item.exclusion)} |`),
  '',
]

const checkArgumentIndex = process.argv.indexOf('--check')
if (checkArgumentIndex >= 0) {
  const requestedPath = process.argv[checkArgumentIndex + 1]
  const snapshotPath = requestedPath
    ? join(repoRoot, requestedPath)
    : join(repoRoot, 'docs', 'design', 'cms-redesign-packet', 'implementation-inventory.md')
  const snapshot = readFileSync(snapshotPath, 'utf8')
  const snapshotRouteRows = snapshot.split(/\r?\n/).filter(line => line.startsWith('| `/dashboard'))
  if (JSON.stringify(snapshotRouteRows) !== JSON.stringify(routeRows)) {
    throw new Error(`Route inventory snapshot is stale. Regenerate ${relative(repoRoot, snapshotPath)} with this script.`)
  }
  process.stdout.write(`Verified ${routeRows.length} route rows in ${relative(repoRoot, snapshotPath)}.\n`)
  process.exit(0)
}

process.stdout.write(lines.join('\n'))

