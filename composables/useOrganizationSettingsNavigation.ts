import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { requireProductPresentation } from '~/utils/product-presentation'

// The rows on Menu. Every organization is one business with one site, so the
// site's own things sit here beside the team and the billing: Menu is the
// business's page. The settings level renders this list as its index column
// and names the open leaf from it, and the desktop slideover renders the same
// list, so a row exists in one place.
export function useOrganizationSettingsNavigation() {
  const route = useRoute()
  const router = useRouter()
  const { orgPaths, businessPaths } = useDashboardOrganizationLinks()
  const dashboard = useDashboardOrganization()

  const settingsPath = computed(() => orgPaths.value.settings)

  /**
   * Krabiclaw runs on Krabiclaw, so its own business's Menu carries the one
   * tool no tenant has: every account on the platform, and impersonation.
   * Airbnb has no equivalent — internal admin tooling is not in the host's
   * dashboard — so this row is a deliberate addition, not parity.
   */
  const isPlatformOrganization = computed(() => {
    const organization = dashboard.organization.value
    if (!organization) return false
    return resolvePublicTemplate({ themeId: organization.theme_id, vertical: organization.vertical }).slug === 'platform'
  })

  const items = computed(() => {
    const business = businessPaths.value
    return [
      ...(business
        ? [
            ...(dashboard.organization.value?.vertical === 'service'
              ? [{ id: 'products', label: requireProductPresentation('service', dashboard.organization.value.theme_id).collectionLabel, to: `${business.organization}/products` }]
              : []),
            { id: 'payments', label: 'Payments', to: `${business.organization}/payments` },
            { id: 'pages', label: 'Pages', to: business.pages },
            { id: 'blog', label: 'Blog', to: business.blog },
            { id: 'qa', label: 'Reviews and Q&A', to: business.qa },
            { id: 'brand', label: 'Brand', to: business.brand },
            { id: 'website', label: 'Website', to: `${settingsPath.value}/website` },
            { id: 'integrations', label: 'Integrations', to: `${settingsPath.value}/integrations` },
          ]
        : []),
      { id: 'members', label: 'Team', to: `${settingsPath.value}/members` },
      // "Team" is this organization's members; this is every account there is.
      ...(isPlatformOrganization.value
        ? [{ id: 'people', label: 'Platform accounts', to: `${settingsPath.value}/people` }]
        : []),
      { id: 'billing', label: 'Billing', to: `${settingsPath.value}/billing` },
      // The way to the account on a phone, where there is no header to carry an
      // avatar. Airbnb's mobile Menu lists "Account settings" in the same place,
      // second from last, above Log out (measured 2026-09-22).
      { id: 'account', label: 'Account settings', to: orgPaths.value.accountProfile },
      { id: 'log-out', label: 'Log out', action: {} },
    ]
  })

  const groups = computed<EditorNavigationGroup[]>(() => [{ id: 'business', items: items.value }])

  /** The row whose level is open, read off the matched hierarchy: Pages lives at `/pages` but is nested under Menu. */
  const activeItem = computed(() => {
    const open = new Set(route.matched.map(record => routeRecordPath(router, record, route.params)))
    return items.value.find(item => item.to && open.has(item.to))?.id ?? null
  })

  /** The open leaf's title, from the row that opened it. */
  const activeLabel = computed(() => items.value.find(item => item.id === activeItem.value)?.label)

  return { settingsPath, groups, activeItem, activeLabel }
}
