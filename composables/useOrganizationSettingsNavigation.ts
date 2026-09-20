import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'

// The rows on Menu. The settings level renders this list as its index column
// and names the open leaf from it, and the desktop slideover renders the same
// list, so a row exists in one place.
export function useOrganizationSettingsNavigation() {
  const route = useRoute()
  const dashboard = useDashboardSite()
  const { orgPaths } = useDashboardSiteLinks()

  const organization = dashboard.organization
  const settingsPath = computed(() => orgPaths.value.settings)

  const items = computed(() => [
    { id: 'general', label: 'Organization', summary: organization.value?.name ?? '', to: `${settingsPath.value}/general` },
    { id: 'members', label: 'Team', summary: 'People and access', to: `${settingsPath.value}/members` },
    { id: 'billing', label: 'Billing', summary: 'Plans and payments', to: `${settingsPath.value}/billing` },
    { id: 'connect', label: 'Payouts', summary: 'Stripe business onboarding', to: `${settingsPath.value}/connect` },
    { id: 'log-out', label: 'Log out', action: { label: 'Log out' } },
  ])

  const groups = computed<EditorNavigationGroup[]>(() => [{ id: 'organization', items: items.value }])

  const activeItem = computed(() => {
    const segment = route.path.slice(`${settingsPath.value}/`.length).split('/')[0]
    return route.path === settingsPath.value ? null : segment
  })

  /** The open leaf's title, from the row that opened it. */
  const activeLabel = computed(() => items.value.find(item => item.id === activeItem.value)?.label)

  return { settingsPath, groups, activeItem, activeLabel }
}
