import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'

// The rows on Menu. Every organization is one business with one site, so the
// site's own things sit here beside the team and the billing: Menu is the
// business's page. The settings level renders this list as its index column
// and names the open leaf from it, and the desktop slideover renders the same
// list, so a row exists in one place.
export function useOrganizationSettingsNavigation() {
  const route = useRoute()
  const { orgPaths, businessPaths } = useDashboardSiteLinks()

  const settingsPath = computed(() => orgPaths.value.settings)

  const items = computed(() => {
    const business = businessPaths.value
    return [
      ...(business
        ? [
            { id: 'pages', label: 'Pages', summary: 'The pages on the website', to: business.pages },
            { id: 'blog', label: 'Blog', summary: 'Articles', to: business.blog },
            { id: 'qa', label: 'Reviews and Q&A', summary: 'What guests read before they visit', to: business.qa },
            { id: 'brand', label: 'Brand', summary: 'Name, logo, description, colour, font, contact', to: business.brand },
            { id: 'website', label: 'Website', summary: 'Domain, languages, currency, search, analytics', to: business.settings },
          ]
        : []),
      { id: 'members', label: 'Team', summary: 'People and access', to: `${settingsPath.value}/members` },
      { id: 'billing', label: 'Billing', summary: 'Plans and payments', to: `${settingsPath.value}/billing` },
      { id: 'connect', label: 'Payouts', summary: 'Stripe business onboarding', to: `${settingsPath.value}/connect` },
      { id: 'log-out', label: 'Log out', action: { label: 'Log out' } },
    ]
  })

  const groups = computed<EditorNavigationGroup[]>(() => [{ id: 'business', items: items.value }])

  const activeItem = computed(() => {
    if (!route.path.startsWith(`${settingsPath.value}/`)) return null
    return route.path.slice(`${settingsPath.value}/`.length).split('/')[0]
  })

  /** The open leaf's title, from the row that opened it. */
  const activeLabel = computed(() => items.value.find(item => item.id === activeItem.value)?.label)

  return { settingsPath, groups, activeItem, activeLabel }
}
