import { matchedRouteKey } from 'vue-router'
import { dashboardOrganizationParentKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'

/**
 * Which level of the route tree the caller is, what is open below it, and
 * where walking up from it goes.
 *
 * Nested pages already say what contains what, so `route.matched` is the chain
 * and a level finds its own place in it through `matchedRouteKey` — the record
 * the `<RouterView>` rendering it provides. Nothing assembles a base path from
 * route params and slices the URL against it, and nothing counts a depth that
 * is not its own: the index column and the leaf beside it ask the same
 * composable and get two different answers.
 *
 * Depth is measured in path segments rather than records, because a directory's
 * `index.vue` is a second record at the same URL — `/links/items` matches both
 * `items` and `items/index` — and it is one level, not two.
 *
 * Back is a push to the parent, never `history.back()`. Measured on a live
 * Airbnb host account on 2026-09-21: their in-app Back went to
 * `/hosting/listings` while the previous history entry was the leaf that had
 * just been cancelled, and Cancel, Close and Back all pushed. The destination
 * is a property of where you are, so a deep link, a reload and a redirect after
 * a save all answer the same thing, and a sheet you closed can never become the
 * place Back leads.
 */
export type RouteLevelMode = 'index' | 'pair' | 'yield'

const segments = (path: string) => path.split('/').filter(Boolean).length

export function useRouteLevel() {
  const route = useRoute()
  const router = useRouter()
  const ownRecord = inject(matchedRouteKey, null)
  // The layout's answer to "which organization" for a route that carries none, such as Account settings.
  const organizationParent = inject(dashboardOrganizationParentKey, null)

  /**
   * Where this level sits in the matched chain, or `-1` once it sits nowhere.
   *
   * A component whose own record has left `route.matched` is being torn down
   * after a navigation, and it is not a level any more. Answering with the
   * deepest matched record instead — which is what a bare fallback does —
   * makes every question below report for somebody else's level: a location
   * index unmounting on the way to Pages read its path off the new route and
   * its `autoOpen` replaced the URL with a child of it, which took the tenant
   * to a URL nothing matches.
   *
   * A component mounted outside a page has no record to find and takes the
   * deepest one, which is the level it is drawn inside.
   */
  const index = computed(() => {
    const record = ownRecord?.value
    if (!record) return route.matched.length - 1
    return route.matched.findIndex(candidate => candidate === record)
  })

  const depth = computed(() => segments(route.matched[index.value]?.path ?? route.path))

  /**
   * How much is open below this level. Two levels are on screen at once — this
   * one and its child — so anything deeper belongs to a descendant and this
   * level renders nothing but the route beneath it. That is what stops three
   * columns appearing and squeezing the leaf into a third of the width.
   */
  const mode = computed<RouteLevelMode>(() => {
    // A level whose record has left the matched chain is on its way out and renders nothing.
    if (index.value === -1) return 'yield'
    const below = segments(route.path) - depth.value
    if (below <= 0) return 'index'
    if (below === 1) return 'pair'
    return 'yield'
  })

  /**
   * The nearest screen above this one. A record at the same URL is the same
   * level — a directory's `index.vue` — and a record that only carries a path
   * segment, as `sites/[siteSlug].vue` does with nothing but `<NuxtPage>`, is
   * not somewhere Back can land. Both are stepped over.
   */
  const parent = computed(() => {
    for (let at = index.value - 1; at >= 0; at--) {
      const record = route.matched[at]
      if (!record || record.meta?.passthrough === true) continue
      if (segments(record.path) >= depth.value) continue
      return record
    }
    return null as (typeof route.matched)[number] | null
  })

  /** Cut the current URL to the number of segments a record owns; its params are already filled in. */
  const cut = (count: number) => `/${route.path.split('/').filter(Boolean).slice(0, count).join('/')}`

  /**
   * Where Back goes, or `null` at a tab root, which has nothing above it.
   * Where the dashboard is walked differently from the way the URL nests — the
   * links page lives under the organization root but is reached from Pages — the
   * page names its own with `definePageMeta({ back: '<route name>' })`.
   */
  const to = computed<string | null>(() => {
    const declared = route.matched[index.value]?.meta?.back
    if (typeof declared === 'string') return resolveNamed(declared)
    const record = parent.value
    return record ? cut(segments(record.path)) : null
  })

  /**
   * A declared parent is resolved with only the params its own path names.
   * The current route carries more — a leaf under a site has `siteSlug`, `qaId`
   * — and the router refuses a named target handed params it has no place for.
   */
  function resolveNamed(name: string): string | null {
    const target = router.getRoutes().find(candidate => candidate.name === name)
    if (!target) throw new Error(`Route "${name}" named in meta.back does not exist`)
    const keys = [...target.path.matchAll(/:(\w+)/g)].map(match => match[1]!)
    // Account settings names Menu as its parent but carries no organization in
    // its URL; the layout knows which organization the session is in.
    if (keys.some(key => route.params[key] === undefined)) return organizationParent?.value?.to ?? null
    const params = Object.fromEntries(keys.map(key => [key, route.params[key]]))
    return router.resolve({ name, params }).path
  }

  /** This level's own URL, which is where dismissing what it has open leads. */
  const path = computed(() => cut(depth.value))

  /** Names the open child, for the active row and for a section that is a screen of its own. */
  const child = computed<string | null>(() => route.path.split('/').filter(Boolean)[depth.value] ?? null)

  /**
   * Dismissing a child — a sheet's Close, a drawer that shuts — is the same
   * navigation as that child's own Back, so it is a push to here.
   */
  function close() {
    return navigateTo({ path: path.value, query: route.query })
  }

  return { mode, to, path, child, close }
}
