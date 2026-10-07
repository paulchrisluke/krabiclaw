import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { authClient } from '~/lib/auth-client'
import { canOpenPlatformAccounts } from '~/utils/platform-admin-access'

// The rows on Menu. Every organization is one organization with one website,
// so the website, its posts and its places sit here beside the team: Menu is
// the organization's page. Every row is a destination or an action; there are
// no headings. The settings level renders this list as its index column and
// names the open leaf from it, and the desktop slideover renders the same
// list, so a row exists in one place.
//
// The organization is the shell's (useDashboardMenu): the route's, otherwise
// Better Auth's active one, so Account settings opened from inside an
// organization keeps that organization's Menu.
export function useOrganizationSettingsNavigation(organization: Ref<{ id: string; slug: string } | null>) {
  const route = useRoute()
  const router = useRouter()
  const dashboard = useDashboardOrganization()
  const session = authClient.useSession()

  const base = computed(() => organization.value ? `/dashboard/${encodeURIComponent(organization.value.slug)}` : null)
  const settingsPath = computed(() => base.value ? `${base.value}/settings` : null)

  /**
   * Every account on the platform, and impersonation: Krabiclaw runs on
   * Krabiclaw, so only its own organization's Menu carries this row, and only
   * for a Better Auth admin. The template is read off the route's loaded
   * organization context, the same reading the page itself gates on. Airbnb
   * has no equivalent; internal admin tooling is not in the host's dashboard.
   */
  const showPlatformAccounts = computed(() => {
    const loaded = dashboard.organization.value
    return Boolean(loaded && canOpenPlatformAccounts(loaded, (session.value.data?.user as { role?: string | null } | undefined)?.role))
  })

  const items = computed(() => {
    if (!base.value || !settingsPath.value) return []
    return [
      { id: 'website', label: 'Website', to: `${settingsPath.value}/website` },
      { id: 'posts', label: 'Posts', to: `${base.value}/settings/posts` },
      { id: 'locations', label: 'Locations', to: `${base.value}/settings/locations` },
      { id: 'members', label: 'Team', to: `${settingsPath.value}/members` },
      { id: 'integrations', label: 'Integrations', to: `${settingsPath.value}/integrations` },
      // "Team" is this organization's members; this is every account there is.
      ...(showPlatformAccounts.value
        ? [{ id: 'people', label: 'Platform accounts', to: `${settingsPath.value}/people` }]
        : []),
      // The way to the account on a phone, where there is no header to carry an
      // avatar. Airbnb's mobile Menu lists "Account settings" in the same place,
      // second from last, above Log out (measured 2026-09-22).
      { id: 'account', label: 'Account settings', to: '/dashboard/account/profile' },
      // Airbnb's "Switch to travelling": the last row before Log out.
      { id: 'switch-personal', label: 'Switch to Personal', action: {} },
      { id: 'log-out', label: 'Log out', action: {} },
    ]
  })

  const groups = computed<EditorNavigationGroup[]>(() => [{ id: 'organization', items: items.value }])

  /** The row whose level is open, read off the matched hierarchy: Locations lives at `/locations` but is nested under Menu. */
  const activeItem = computed(() => {
    const open = new Set(route.matched.map(record => routeRecordPath(router, record, route.params)))
    return items.value.find(item => item.to && open.has(item.to))?.id ?? null
  })

  return { groups, activeItem }
}
