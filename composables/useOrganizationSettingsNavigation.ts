import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { authClient } from '~/lib/auth-client'
import { hasPlatformAdminPermission } from '~/utils/platform-admin-access'

// The rows on Menu. Every organization is one organization with one website,
// so the website, its posts and its places sit here beside the team: Menu is
// the organization's page. Every row is a destination or an action; there are
// no headings. The settings level renders this list as its index column and
// names the open leaf from it, and the desktop slideover renders the same
// list, so a row exists in one place.
export function useOrganizationSettingsNavigation() {
  const route = useRoute()
  const router = useRouter()
  const { orgPaths, organizationPaths } = useDashboardOrganizationLinks()
  const session = authClient.useSession()

  const settingsPath = computed(() => orgPaths.value.settings)

  /**
   * Every account on the platform, and impersonation: a tool for platform
   * admins, so the row follows the signed-in user's Better Auth role — the
   * permissions the screen itself exercises, which Better Auth enforces on
   * every call — and never the organization's template. Airbnb has no
   * equivalent; internal admin tooling is not in the host's dashboard.
   */
  const isPlatformAdmin = computed(() => hasPlatformAdminPermission(
    (session.value.data?.user as { role?: string | null } | undefined)?.role,
    { user: ['list', 'impersonate'] },
  ))

  const items = computed(() => {
    const organization = organizationPaths.value
    return [
      ...(organization
        ? [
            { id: 'website', label: 'Website', to: `${settingsPath.value}/website` },
            { id: 'posts', label: 'Posts', to: organization.posts },
            { id: 'locations', label: 'Locations', to: organization.locations },
          ]
        : []),
      { id: 'members', label: 'Team', to: `${settingsPath.value}/members` },
      ...(organization ? [{ id: 'integrations', label: 'Integrations', to: `${settingsPath.value}/integrations` }] : []),
      // "Team" is this organization's members; this is every account there is.
      ...(isPlatformAdmin.value
        ? [{ id: 'people', label: 'Platform accounts', to: `${settingsPath.value}/people` }]
        : []),
      // The way to the account on a phone, where there is no header to carry an
      // avatar. Airbnb's mobile Menu lists "Account settings" in the same place,
      // second from last, above Log out (measured 2026-09-22).
      { id: 'account', label: 'Account settings', to: orgPaths.value.accountProfile },
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

  /** The open leaf's title, from the row that opened it. */
  const activeLabel = computed(() => items.value.find(item => item.id === activeItem.value)?.label)

  return { settingsPath, groups, activeItem, activeLabel }
}
