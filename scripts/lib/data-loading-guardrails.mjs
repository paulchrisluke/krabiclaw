// Pure, filesystem-free check functions for the data-loading guardrails.
// Kept separate from the CLI runner (scripts/check-data-loading-guardrails.mjs)
// so they can be unit-tested directly against string fixtures — see
// tests/unit/check-data-loading-guardrails.test.ts.

export const PROHIBITED_LEGACY_PATHS = [
  'composables/useBootstrap.ts',
  'composables/useBootstrapParams.ts',
  'composables/loadPublicBootstrapPayload.ts',
  'server/utils/public-bootstrap.ts',
  'server/api/public/sites/[siteId]/bootstrap.get.ts',
  'server/api/public/drafts/[draftId]/bootstrap.get.ts',
]

// Named helpers previously deleted for silently converting a failed/errored
// read into a successful empty or default value (issue #480, prohibited
// behavior #5). Reintroducing a helper under one of these names is a
// regression even if its body changes.
export const BANNED_SILENT_EMPTY_SUCCESS_NAMES = [
  'fetchMenuCurrency',
]

// The canonical public/dashboard data-loading surface where a silent
// catch-to-empty-value is never acceptable (the loaders and API clients this
// issue introduced). Deliberately narrower than applicationRoots: broader
// directories (middleware, analytics plugins, autosave/cleanup call sites)
// contain legitimate fire-and-forget or fail-closed catches that are out of
// this issue's scope and would otherwise false-positive here.
export const CANONICAL_LOADER_PATHS = [
  'composables/usePublicPageData.ts',
  'composables/useSiteShell.ts',
  'composables/dashboardFetch.ts',
  'composables/useDashboardSite.ts',
  'server/utils/public-page.ts',
  'server/utils/public-shell.ts',
  'server/utils/public-base.ts',
  'server/utils/dashboard-context-service.ts',
  'server/utils/dashboard-context.ts',
]

const SILENT_EMPTY_CATCH_PATTERN = /\.catch\s*\(\s*(?:\(\s*\)|\w+)\s*=>\s*\(?(\[\]|\{\}|null)\)?\s*\)|catch\s*(?:\([^)]*\))?\s*\{\s*return\s*(\[\]|\{\}|null)\s*;?\s*\}/g

// A catch immediately following a local, synchronous parse of already-in-hand
// data (JSON.parse of a stored string, new URL() of a known string) is a
// malformed-input guard, not a network-read-to-empty-success fallback — the
// audit's own documented exception for corrupt cache entries is this same
// shape (public-resource-cache.ts). Require the preceding ~120 chars to
// contain that parse call before treating a catch-to-null/empty match as a
// real violation.
const LOCAL_PARSE_GUARD_PATTERN = /(?:JSON\.parse|new URL)\s*\(/

// Matches a declared identifier or conditional that combines "legacy" with
// "bootstrap"/"fallback" — the naming pattern a disabled/hidden legacy
// fallback flag would use (e.g. ENABLE_LEGACY_BOOTSTRAP, legacyFallbackEnabled).
// Deliberately requires a declaration/conditional context, not bare text, so
// a comment documenting that a legacy fallback was *removed* doesn't match.
const LEGACY_FALLBACK_FLAG_PATTERN = /\b(?:const|let|var|function)\s+\w*legacy\w*(?:bootstrap|fallback)\w*|\bif\s*\([^)]*\blegacy\w*(?:bootstrap|fallback)/i

export function checkGlobalFetchAndRetry(file, source) {
  const violations = []
  if (source.includes('globalThis.$fetch')) {
    violations.push(`${file}: mutates or references globalThis.$fetch`)
  }
  for (const match of source.matchAll(/\bretry\s*:\s*([^,\n}]+)/g)) {
    if (match[1].trim() !== '0') {
      violations.push(`${file}: app-owned fetch retry must be 0 (found ${match[1].trim()})`)
    }
  }
  return violations
}

export function checkBannedSilentEmptySuccessNames(file, source) {
  const violations = []
  for (const name of BANNED_SILENT_EMPTY_SUCCESS_NAMES) {
    if (new RegExp(`\\b${name}\\b`).test(source)) {
      violations.push(`${file}: reintroduces banned silent error-to-empty-success helper "${name}"`)
    }
  }
  return violations
}

export function checkSilentEmptyCatch(file, source) {
  const violations = []
  for (const match of source.matchAll(SILENT_EMPTY_CATCH_PATTERN)) {
    // Look back to the nearest enclosing `try {` (bounded window, since a
    // fixed-length lookbehind misses a parse call several lines above a
    // multi-line try body) and check whether it's guarding a local
    // JSON.parse/new URL call rather than a network read.
    const searchStart = Math.max(0, match.index - 500)
    const context = source.slice(searchStart, match.index)
    const lastTryIndex = context.lastIndexOf('try')
    const tryBody = lastTryIndex === -1 ? context : context.slice(lastTryIndex)
    if (LOCAL_PARSE_GUARD_PATTERN.test(tryBody)) continue
    violations.push(`${file}: canonical loader must not convert a failed read into an empty/null success value`)
  }
  return violations
}

export function checkLegacyFallbackFlag(file, source) {
  return LEGACY_FALLBACK_FLAG_PATTERN.test(source)
    ? [`${file}: disabled legacy fallback flags/branches must be deleted, not retained`]
    : []
}

export function checkDashboardFetchUsage(file, source) {
  const violations = []
  if (/\$fetch(?:<|\()/.test(source)) {
    violations.push(`${file}: use dashboardFetch for route-scoped API traffic`)
  }
  if (/(?<!\$)\bfetch\s*\(\s*['"`]\/api\//.test(source)) {
    violations.push(`${file}: use dashboardFetch for route-scoped API traffic`)
  }
  return violations
}

export function checkAdminFetchUsage(file, source) {
  return (/\$fetch(?:<|\()/.test(source) || /\bdashboardFetch(?:<|\()/.test(source))
    ? [`${file}: use applicationFetch for unscoped admin API traffic`]
    : []
}

export function checkSsrRequestEventCapture(file, source) {
  if (!file.startsWith('pages/') || !file.endsWith('.vue')) return []

  const firstAsyncData = source.indexOf('useAsyncData')
  if (firstAsyncData === -1) return []

  const requestEventCall = /\buseRequestEvent\s*\(\s*\)/g
  for (const match of source.matchAll(requestEventCall)) {
    if ((match.index ?? -1) > firstAsyncData) {
      return [`${file}: capture useRequestEvent() during page setup before useAsyncData`]
    }
  }
  return []
}
