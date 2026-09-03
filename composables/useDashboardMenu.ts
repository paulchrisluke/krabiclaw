import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'

// The one description of "what is in the menu". The desktop slideover and the
// mobile menu page are two containers for this single model — neither builds a
// list of its own, so they cannot drift apart. The admin surface swaps the
// content here rather than anywhere downstream, for the same reason.
//
// Admin keeps four links in the bar and the rest in the menu: ten will not fit a
// centred bar, and splitting them is what lets admin share the tenant chrome
// instead of earning a second layout.
const ADMIN_PRIMARY = ['/admin/clients', '/admin/users', '/admin/content', '/admin/analytics']

export function useDashboardMenu() {
  const route = useRoute()
  const dashboard = useDashboardSite()
  const scopeHeaderModel = inject(dashboardScopeHeaderModelKey, null)
  const organizationSettings = useOrganizationSettingsNavigation()

  const isAdminRoute = computed(() => typeof route.name === 'string' && route.name.startsWith('admin'))

  const orgBase = computed(() => {
    const slug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
    return slug ? `/dashboard/${encodeURIComponent(slug)}` : null
  })

  function isActivePath(path: string, exact = false) {
    return route.path === path || (!exact && route.path.startsWith(`${path}/`))
  }

  const adminItems = computed(() => [
    ...(dashboard.managedServiceEnabled.value ? [{ id: 'work', label: 'Work Queue', summary: 'Managed service queue', to: '/admin/work' }] : []),
    { id: 'clients', label: 'Clients', summary: 'Client organizations and onboarding', to: '/admin/clients' },
    { id: 'members', label: 'Members', summary: 'Platform staff access', to: '/admin/members' },
    { id: 'analytics', label: 'Analytics', summary: 'Platform-wide usage', to: '/admin/analytics' },
    { id: 'domains', label: 'Domains', summary: 'Custom domain requests', to: '/admin/domains' },
    { id: 'users', label: 'Users', summary: 'Accounts and impersonation', to: '/admin/users' },
    { id: 'content', label: 'Content', summary: 'Marketing pages', to: '/admin/content' },
    { id: 'localization', label: 'Localization', summary: 'Platform locale catalogs', to: '/admin/localization' },
    { id: 'blog', label: 'Blog', summary: 'Platform blog posts', to: '/admin/blog' },
    { id: 'docs', label: 'Docs', summary: 'Documentation pages', to: '/admin/docs' },
  ])

  /** Links shown in the top nav and the bottom bar. */
  const primaryNavItems = computed(() => {
    if (!isAdminRoute.value) return null
    return adminItems.value
      .filter(item => ADMIN_PRIMARY.includes(item.to))
      .map(item => ({ key: item.id, label: item.label, icon: 'i-lucide-square', to: item.to, active: isActivePath(item.to) }))
  })

  /** Where the bottom bar's Menu item navigates on mobile. */
  const menuPageTo = computed(() => isAdminRoute.value ? '/admin' : orgBase.value ? `${orgBase.value}/menu` : '/dashboard')

  const notificationsTo = computed(() => isAdminRoute.value || !orgBase.value ? null : `${orgBase.value}/notifications`)

  const groups = computed<EditorNavigationGroup[]>(() => {
    if (isAdminRoute.value) {
      return [{ id: 'admin', label: 'Platform admin', items: adminItems.value.filter(item => !ADMIN_PRIMARY.includes(item.to)) }]
    }
    return organizationSettings.groups.value
  })

  const activeItem = computed(() => {
    if (isAdminRoute.value) return adminItems.value.find(item => isActivePath(item.to))?.id ?? null
    return organizationSettings.activeItem.value
  })

  /** Organization/site switcher. Null on surfaces with no scope, e.g. admin. */
  const scopeModel = computed(() => isAdminRoute.value ? null : scopeHeaderModel?.value ?? null)

  return { isAdminRoute, primaryNavItems, menuPageTo, notificationsTo, groups, activeItem, scopeModel }
}
