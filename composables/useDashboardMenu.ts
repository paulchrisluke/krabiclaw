import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'
import { authClient } from '~/lib/auth-client'
import { useMediaQuery } from '@vueuse/core'

/**
 * How many Cancel/Save footers are mounted. While one is, a leaf is open as a
 * sheet, and the phone's tab bar goes away under it. DashboardPanelFooter
 * counts itself in and out; the layout reads the count.
 */
export function useDashboardLeafFooters() {
  return useState<number>('dashboard-leaf-footers', () => 0)
}

/**
 * Whether there is a second column. Tailwind's `lg`, the one width at which an
 * index and its open child sit side by side and an index opens its first child
 * on arrival rather than sitting beside an empty pane. One reading, shared by
 * the two shells, so the redirect and the layout cannot disagree.
 */
export function useDashboardPane() {
  return useMediaQuery(() => {
    const breakpoint = getComputedStyle(document.documentElement).getPropertyValue('--breakpoint-lg').trim()
    if (!breakpoint) throw createError({ statusCode: 500, statusMessage: 'Dashboard pane breakpoint is not configured.', fatal: true })
    return `(min-width: ${breakpoint})`
  })
}

export function useDashboardMenu() {
  const route = useRoute()
  const scopeHeaderModel = inject(dashboardScopeHeaderModelKey, null)
  const session = authClient.useSession()
  const organizationsState = authClient.useListOrganizations()

  /**
   * Two answers, kept apart. The tabs are the destination's: a route under an
   * organization has that organization's tabs and Menu, and the account's own
   * destinations — Account settings, Past activity, its Menu — have the
   * account's, so they light the account's Menu and exit to it. The
   * organization a page acts in is Better Auth's: the route's, otherwise the
   * session's active organization, which Your availability opens and switching
   * changes. Opening Account settings never changes the active organization.
   */
  const dashboard = useDashboardOrganization()
  const activeOrganizationId = computed(() => (session.value.data?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? null)
  const organization = computed(() => {
    const routed = dashboard.organization.value
    if (routed) return { id: routed.id, slug: routed.slug, name: routed.name }
    return unref(organizationsState).data?.find(candidate => candidate.id === activeOrganizationId.value) ?? null
  })
  const personal = computed(() => !dashboard.organization.value)
  const organizationSettings = useOrganizationSettingsNavigation(organization)

  const orgBase = computed(() => organization.value ? `/dashboard/${encodeURIComponent(organization.value.slug)}` : null)

  /** The Menu tab: the organization's launcher, or the account's. */
  const menuPageTo = computed(() => orgBase.value ? `${orgBase.value}/menu` : '/dashboard/account/menu')

  const notificationsTo = computed(() => orgBase.value ? `${orgBase.value}/notifications` : null)

  /** Ends the session and returns here after the next sign-in. */
  async function logOut() {
    const redirect = route.fullPath
    await authClient.signOut()
    await navigateTo({ path: '/login', query: { redirect } })
  }

  // Airbnb's "Switch to hosting": one row above Log out. One organization switches straight to it;
  // several open the list under Account settings; none offers to start one.
  const switchRow = computed(() => {
    const organizations = (scopeHeaderModel?.value.peers ?? []).filter(peer => peer.id)
    if (organizations.length === 1) return organizations[0]!.to ? { id: 'switch-organization', label: `Switch to ${organizations[0]!.label}`, to: organizations[0]!.to } : { id: 'switch-organization', label: `Switch to ${organizations[0]!.label}`, action: {} }
    if (organizations.length > 1) return { id: 'switch-organization', label: 'Switch to an organization', to: '/dashboard/account/profile/organizations' }
    return { id: 'switch-organization', label: 'New organization', to: '/dashboard/onboarding' }
  })
  const groups = computed<EditorNavigationGroup[]>(() => personal.value ? [{
    id: 'account', items: [
      { id: 'account', label: 'Account settings', to: '/dashboard/account/profile' },
      switchRow.value,
      { id: 'log-out', label: 'Log out', action: {} },
    ],
  }] : organizationSettings.groups.value)
  const activeItem = computed(() => organizationSettings.activeItem.value)

  /** Organization switcher. */
  const scopeModel = computed(() => scopeHeaderModel?.value ?? null)

  return { menuPageTo, notificationsTo, groups, activeItem, scopeModel, logOut, personal, organization, activeOrganizationId }
}
