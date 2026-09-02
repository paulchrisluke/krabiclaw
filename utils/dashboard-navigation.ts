import type { CmsManagerCapability } from '~/config/cms-registry'

export type DashboardPrimaryNavigationKey = 'home' | 'calendar' | 'website' | 'inbox'

interface DashboardPrimaryNavigationDefinition {
  key: DashboardPrimaryNavigationKey
  label: string
  icon: string
}

export const dashboardPrimaryNavigation = [
  { key: 'home', label: 'Home', icon: 'i-lucide-house' },
  { key: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar-days' },
  { key: 'website', label: 'Website', icon: 'i-lucide-globe-2' },
  { key: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox' },
] as const satisfies readonly DashboardPrimaryNavigationDefinition[]

export interface DashboardPrimaryNavigationItem {
  readonly key: DashboardPrimaryNavigationKey
  readonly label: string
  readonly icon: string
  readonly to: string
  readonly active: boolean
  readonly 'aria-current': 'page' | undefined
}

export type DashboardPrimaryNavigation =
  | { kind: 'unavailable'; items: [] }
  | { kind: 'available'; items: DashboardPrimaryNavigationItem[] }

export type DashboardPrimaryNavigationContext =
  | { kind: 'unavailable' }
  | { kind: 'organization'; organizationSlug: string }
  | { kind: 'site'; organizationSlug: string; siteSlug: string }
  | { kind: 'location'; organizationSlug: string; siteSlug: string; locationSlug: string }

export function resolveDashboardPrimaryNavigation(input: {
  context: DashboardPrimaryNavigationContext
  currentPath: string
}): DashboardPrimaryNavigation {
  if (input.context.kind === 'unavailable') return { kind: 'unavailable', items: [] }

  const organizationBase = `/dashboard/${encodeURIComponent(input.context.organizationSlug)}`
  const siteBase = input.context.kind === 'site' || input.context.kind === 'location'
    ? `${organizationBase}/sites/${encodeURIComponent(input.context.siteSlug)}`
    : null
  const locationBase = input.context.kind === 'location'
    ? `${siteBase}/locations/${encodeURIComponent(input.context.locationSlug)}`
    : null
  const targets: Record<DashboardPrimaryNavigationKey, string> = {
    home: organizationBase,
    calendar: `${organizationBase}/calendar`,
    website: siteBase ?? `${organizationBase}/sites`,
    inbox: locationBase
      ? `${locationBase}/inbox`
      : siteBase ? `${siteBase}/inbox` : `${organizationBase}/inbox`,
  }
  const active = classifyDashboardPrimaryNavigation({
    currentPath: input.currentPath,
    organizationBase,
    inboxTarget: targets.inbox,
  })

  return {
    kind: 'available',
    items: dashboardPrimaryNavigation.map((definition) => {
      const isActive = definition.key === active
      return {
        ...definition,
        to: targets[definition.key],
        active: isActive,
        'aria-current': isActive ? 'page' : undefined,
      }
    }),
  }
}

function classifyDashboardPrimaryNavigation(input: {
  currentPath: string
  organizationBase: string
  inboxTarget: string
}): DashboardPrimaryNavigationKey | null {
  if (matchesPath(input.currentPath, input.inboxTarget)) return 'inbox'
  if (matchesPath(input.currentPath, `${input.organizationBase}/calendar`)) return 'calendar'
  if (input.currentPath === input.organizationBase) return 'home'
  if (matchesPath(input.currentPath, `${input.organizationBase}/sites`)) return 'website'
  return null
}

function matchesPath(currentPath: string, target: string): boolean {
  return currentPath === target || currentPath.startsWith(`${target}/`)
}

export type DashboardManagerRouteContext =
  | { scope: 'site'; organizationSlug: string; siteSlug: string }
  | { scope: 'location'; organizationSlug: string; siteSlug: string; locationSlug: string }

export function resolveDashboardManagerRoute(input: {
  manager: CmsManagerCapability
  context: DashboardManagerRouteContext
}): string | null {
  if (input.manager.scope !== input.context.scope) return null

  const siteBase = `/dashboard/${encodeURIComponent(input.context.organizationSlug)}/sites/${encodeURIComponent(input.context.siteSlug)}`
  if (input.context.scope === 'site') {
    return input.manager.route
      ? `${siteBase}/${input.manager.route}`
      : `${siteBase}/locations`
  }

  const locationBase = `${siteBase}/locations/${encodeURIComponent(input.context.locationSlug)}`
  const relativeRoute = input.manager.route.replace(/^:location\/?/, '')
  return relativeRoute ? `${locationBase}/${relativeRoute}` : locationBase
}
