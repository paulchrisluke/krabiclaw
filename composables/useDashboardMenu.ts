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
  const organizationSettings = useOrganizationSettingsNavigation()
  const personal = computed(() => typeof route.name === 'string' && route.name.startsWith('dashboard-account'))

  const orgBase = computed(() => {
    const slug = route.params.orgSlug
    return typeof slug === 'string' && slug ? `/dashboard/${slug}` : null
  })

  /** The Menu tab is the organization's settings level; its rows are the leaves beneath it. */
  const menuPageTo = computed(() => personal.value ? '/dashboard/account/menu' : orgBase.value ? `${orgBase.value}/settings` : '/dashboard')

  const notificationsTo = computed(() => orgBase.value ? `${orgBase.value}/settings/notifications` : null)

  /** Ends the session and returns here after the next sign-in. */
  async function logOut() {
    const redirect = route.fullPath
    await authClient.signOut()
    await navigateTo({ path: '/login', query: { redirect } })
  }

  // Airbnb's "Switch to hosting": one row above Log out. One business switches straight to it;
  // several open the list under Account settings; none offers to start one.
  const switchRow = computed(() => {
    const businesses = (scopeHeaderModel?.value.peers ?? []).filter(peer => peer.label !== 'Personal')
    if (businesses.length === 1) return businesses[0]!.to ? { id: 'switch-business', label: `Switch to ${businesses[0]!.label}`, to: businesses[0]!.to } : { id: 'switch-business', label: `Switch to ${businesses[0]!.label}`, action: {} }
    if (businesses.length > 1) return { id: 'switch-business', label: 'Switch to a business', to: '/dashboard/account/profile/businesses' }
    return { id: 'switch-business', label: 'Start a business', to: '/dashboard/onboarding' }
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

  return { menuPageTo, notificationsTo, groups, activeItem, scopeModel, logOut, personal }
}
