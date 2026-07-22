import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Contract tests for the dashboard/Nuxt UI consolidation cleanup: AppAvatar,
// AppToast + its custom composable, SettingsSection, and the hand-built
// dashboard search/account-popover infrastructure were all removed in favor
// of documented Nuxt UI primitives (UAvatar, useToast(), UCard,
// UDashboardSearch/UDashboardSearchButton, UDropdownMenu). These assertions
// exist so a future change can't silently reintroduce any of them.

const repoRoot = new URL('../../', import.meta.url)

function walkSourceFiles(startDirs: string[]): string[] {
  const skip = new Set(['node_modules', '.output', '.git', '.nuxt', '.wrangler', 'dist'])
  const files: string[] = []
  const stack = startDirs.map(dir => fileURLToPath(new URL(dir, repoRoot)))
  while (stack.length) {
    const dir = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (skip.has(entry)) continue
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        stack.push(full)
      } else if (entry.endsWith('.vue') || entry.endsWith('.ts')) {
        files.push(full)
      }
    }
  }
  return files
}

const sourceFiles = walkSourceFiles(['components', 'pages', 'composables', 'layouts'])
const fileContents = new Map(sourceFiles.map(file => [file, readFileSync(file, 'utf8')]))

test('no AppAvatar component or usage remains', () => {
  for (const [file, content] of fileContents) {
    assert.doesNotMatch(content, /AppAvatar/, `${file} still references AppAvatar`)
  }
})

test('no AppToast component, custom toast composable, or addToast() usage remains', () => {
  for (const [file, content] of fileContents) {
    assert.doesNotMatch(content, /AppToast/, `${file} still references AppToast`)
    assert.doesNotMatch(content, /addToast\(/, `${file} still calls addToast(`)
    assert.doesNotMatch(content, /composables\/useToast'/, `${file} still imports the deleted custom useToast composable`)
  }
})

test('no SettingsSection component remains', () => {
  for (const [file, content] of fileContents) {
    assert.doesNotMatch(content, /SettingsSection/, `${file} still references SettingsSection`)
  }
})

const layoutSource = readFileSync(new URL('../../layouts/dashboard.vue', import.meta.url), 'utf8')

test('layouts/dashboard.vue uses UDashboardSearchButton and UDashboardSearch, not the platform command-search modal', () => {
  assert.match(layoutSource, /<UDashboardSearchButton/)
  assert.match(layoutSource, /<UDashboardSearch\b/)
  assert.doesNotMatch(layoutSource, /PlatformCommandSearchModal/)
  assert.doesNotMatch(layoutSource, /PlatformCommandSearchTrigger/)
})

test('layouts/dashboard.vue account menu uses UDropdownMenu via DashboardAccountMenu, not a hand-built popover', () => {
  assert.match(layoutSource, /<DashboardAccountMenu/)
  assert.doesNotMatch(layoutSource, /<UPopover/)
})

const accountMenuSource = readFileSync(
  new URL('../../components/workspace/dashboard/DashboardAccountMenu.vue', import.meta.url),
  'utf8',
)

test('DashboardAccountMenu uses UDropdownMenu', () => {
  assert.match(accountMenuSource, /<UDropdownMenu/)
})

test('Saya and Blawby custom tenant search still exist and still use their own portal roots', () => {
  const modalSource = readFileSync(
    new URL('../../components/platform/search/PlatformCommandSearchModal.vue', import.meta.url),
    'utf8',
  )
  assert.match(modalSource, /#saya-portal-root/)
  assert.match(modalSource, /#blawby-portal-root/)

  const blogSlugSource = readFileSync(new URL('../../pages/blog/[slug].vue', import.meta.url), 'utf8')
  assert.match(blogSlugSource, /PlatformCommandSearchModal[^>]*variant="saya"/)

  const articleSlugSource = readFileSync(new URL('../../pages/article/[slug].vue', import.meta.url), 'utf8')
  assert.match(articleSlugSource, /PlatformCommandSearchModal[^>]*variant="blawby"/)
})

test('DashboardScopeHeader remains a thin UDropdownMenu items-mapper, unchanged by the consolidation', () => {
  const scopeHeaderSource = readFileSync(
    new URL('../../components/workspace/dashboard/DashboardScopeHeader.vue', import.meta.url),
    'utf8',
  )
  assert.match(scopeHeaderSource, /<UDropdownMenu/)
})

test('domain components remain intact after the consolidation', () => {
  const domainComponents = [
    '../../components/workspace/editor/MenuEditor.vue',
    '../../components/workspace/editor/MenuItemDetailEditor.vue',
    '../../components/workspace/editor/PostEditor.vue',
    '../../components/workspace/content/CmsContentEditor.vue',
    '../../components/workspace/content/ContentPageIndex.vue',
    '../../components/workspace/content/SitePreviewFrame.vue',
    '../../components/workspace/blog/BlogPostEditor.vue',
    '../../components/dashboard/BookingPolicyForm.vue',
  ]
  for (const relativePath of domainComponents) {
    assert.doesNotThrow(() => readFileSync(new URL(relativePath, import.meta.url), 'utf8'), `${relativePath} should still exist`)
  }
})
