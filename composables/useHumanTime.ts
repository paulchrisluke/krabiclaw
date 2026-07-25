import { onMounted, onUnmounted, readonly, ref } from 'vue'

// Shared human-readable time formatting (issue #442). Generalizes the relative-time
// behavior previously duplicated in useSiteEventLabels().timeAgo() and the local
// formatRelative()/formatDate() helpers in the billing settings page.
//
// The live-refresh timer is a single shared interval (module-scoped), not one per
// component instance — every mounted consumer of useHumanTime() shares the same tick,
// so a page rendering many relative timestamps (e.g. the guest-thread inbox list) does
// not spin up one setInterval per row.
const now = ref(Date.now())
let intervalHandle: ReturnType<typeof setInterval> | null = null
let subscriberCount = 0

const REFRESH_INTERVAL_MS = 30_000

function startSharedTimer() {
  if (intervalHandle || !import.meta.client) return
  intervalHandle = setInterval(() => {
    now.value = Date.now()
  }, REFRESH_INTERVAL_MS)
}

function stopSharedTimer() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function formatRelativeTime(value: string | Date | null | undefined, referenceMs: number = Date.now()): string {
  const date = parseDate(value)
  if (!date) return '—'

  const diff = referenceMs - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

export interface ExactDateTimeOptions {
  dateStyle?: 'full' | 'long' | 'medium' | 'short'
  timeStyle?: 'full' | 'long' | 'medium' | 'short'
  includeTime?: boolean
}

export function formatExactDateTime(value: string | Date | null | undefined, options: ExactDateTimeOptions = {}): string {
  const date = parseDate(value)
  if (!date) return '—'

  if (options.includeTime) {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: options.dateStyle ?? 'medium',
      timeStyle: options.timeStyle ?? 'short',
    }).format(date)
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: options.dateStyle ?? 'long',
  }).format(date)
}

/**
 * `now.value` (client-only, starts ticking once the first consumer mounts) can be used
 * by callers that want a reactive "time ago" label that refreshes on its own — pass it
 * as the `referenceMs` second argument to formatRelativeTime inside a computed().
 * Reading `Date.now()` directly at module/setup-eval time would differ between the SSR
 * render and client hydration; this composable only ever mutates `now` inside a
 * client-only setInterval callback, started from onMounted, so the very first render
 * (both server and client) always uses the same non-reactive `Date.now()` default via
 * formatRelativeTime's own parameter default.
 */
export function useHumanTime() {
  onMounted(() => {
    subscriberCount += 1
    now.value = Date.now()
    startSharedTimer()
  })

  onUnmounted(() => {
    subscriberCount = Math.max(0, subscriberCount - 1)
    if (subscriberCount === 0) stopSharedTimer()
  })

  return {
    now: readonly(now),
    formatRelativeTime,
    formatExactDateTime,
  }
}
