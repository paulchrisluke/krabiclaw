import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'
import { authClient } from '~/lib/auth-client'

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
