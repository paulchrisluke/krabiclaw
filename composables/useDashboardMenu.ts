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
  return useMediaQuery('(min-width: 1024px)')
}

export function useDashboardMenu() {
  const route = useRoute()
  const scopeHeaderModel = inject(dashboardScopeHeaderModelKey, null)
  const organizationSettings = useOrganizationSettingsNavigation()

  const orgBase = computed(() => {
    const slug = route.params.orgSlug
    return typeof slug === 'string' && slug ? `/dashboard/${slug}` : null
  })

  /** Links shown in the top nav and the bottom bar; the organization surfaces build their own. */
  const primaryNavItems = computed<Array<{ key: string; label: string; icon: string; to: string; active: boolean }> | null>(() => null)

  /** The Menu tab is the organization's settings level; its rows are the leaves beneath it. */
  const menuPageTo = computed(() => orgBase.value ? `${orgBase.value}/settings` : '/dashboard')

  const notificationsTo = computed(() => orgBase.value ? `${orgBase.value}/settings/notifications` : null)

  /** Ends the session and returns here after the next sign-in. Stays put if the sign-out failed. */
  async function logOut() {
    const redirect = route.fullPath
    const { error } = await authClient.signOut()
    if (error) throw new Error(error.message || 'Sign-out failed')
    await navigateTo({ path: '/login', query: { redirect } })
  }

  const groups = computed<EditorNavigationGroup[]>(() => organizationSettings.groups.value)
  const activeItem = computed(() => organizationSettings.activeItem.value)

  /** Organization/site switcher. */
  const scopeModel = computed(() => scopeHeaderModel?.value ?? null)

  return { primaryNavItems, menuPageTo, notificationsTo, groups, activeItem, scopeModel, logOut }
}
