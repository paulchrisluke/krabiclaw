import { matchedRouteKey } from 'vue-router'
import { dashboardOrganizationParentKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'

/**
 * Which level of the route tree the caller is, what is open below it, and
 * where walking up from it goes.
 *
 * The nested route tree is the one parent graph. A level's parent pane and its
 * Back are the same record: the nearest level above it in `route.matched`, found
 * from the record the `<RouterView>` rendering the caller provides through
 * `matchedRouteKey`. A level that must keep a URL its parent does not prefix —
 * Pages at `/pages` under Menu at `/settings` — is still nested as a file and
 * names its URL with an absolute `definePageMeta({ path })`, so the router keeps
 * it in `matched` beside its parent. Levels are counted in matched records, not
 * URL segments, for that reason.
 *
 * A directory's `index.vue` is a second record at the same URL — `/links/items`
 * matches both `items` and `items/index` — and it is one level, not two.
 *
 * `meta.back` exists only for a workspace root that leaves for another root
 * which is not a pane beside it — Account settings returning to Menu, a
 * location editor returning to Locations. A level with a matched parent that
 * declares one would give Back and the pane layout two different parents, so
 * it is refused.
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

type AppRouter = ReturnType<typeof useRouter>
type RouteRecord = ReturnType<AppRouter['getRoutes']>[number]

/** The matched records that are levels: each directory `index.vue` folds into the record it shares a URL with. */
function levelsOf<T extends RouteRecord>(matched: readonly T[]) {
  return matched.filter((record, at) => at === 0 || record.path !== matched[at - 1]!.path)
}

/**
 * The URL a route record renders at, with the current params its own path names.
 * A record with an `index.vue` child carries no name of its own; the child that
 * shares its URL does. The router refuses a named target handed params it has
 * no place for, so only the record's own keys are passed.
 */
export function routeRecordPath(router: AppRouter, record: RouteRecord, params: Record<string, unknown>): string {
  const name = record.name ?? record.children.find(child => child.path === '')?.name
  if (typeof name !== 'string') throw new Error(`Route record "${record.path}" has no name and no index child to resolve it by`)
  const keys = [...record.path.matchAll(/:(\w+)/g)].map(match => match[1]!)
  const own: Record<string, string | string[]> = {}
  for (const key of keys) {
    const value = params[key]
    if (typeof value !== 'string' && !Array.isArray(value)) throw new Error(`Route "${name}" needs the "${key}" param, which the current route does not carry`)
    own[key] = value
  }
  return router.resolve({ name, params: own }).path
}

export function useRouteLevel() {
  const route = useRoute()
  const router = useRouter()
  const ownRecord = inject(matchedRouteKey, null)
  // The layout's answer to "which organization" for a route that carries none, such as Account settings.
  const organizationParent = inject(dashboardOrganizationParentKey, null)

  const levels = computed(() => levelsOf(route.matched))

  /**
   * Where this level sits among the matched levels, or `-1` once it sits nowhere.
   *
   * A component whose own record has left `route.matched` is being torn down
   * after a navigation, and it is not a level any more. Answering with the
   * deepest level instead makes every question below report for somebody
   * else's level: a location index unmounting on the way to Pages read its path
   * off the new route and its `autoOpen` replaced the URL with a child of it,
   * which took the tenant to a URL nothing matches.
   *
   * A component mounted outside a page has no record to find and takes the
   * deepest level, which is the one it is drawn inside.
   */
  const index = computed(() => {
    const record = ownRecord?.value
    if (!record) return levels.value.length - 1
    return levels.value.findIndex(level => level.path === record.path)
  })

  /**
   * How much is open below this level. Two levels are on screen at once — this
   * one and its child — so anything deeper belongs to a descendant and this
   * level renders nothing but the route beneath it. That is what stops three
   * columns appearing and squeezing the leaf into a third of the width.
   */
  const mode = computed<RouteLevelMode>(() => {
    if (index.value === -1) return 'yield'
    const below = levels.value.length - 1 - index.value
    if (below === 0) return 'index'
    if (below === 1) return 'pair'
    return 'yield'
  })

  const urlOf = (record: RouteRecord) => routeRecordPath(router, record, route.params)

  /** This level's own URL, which is where dismissing what it has open leads. */
  const path = computed(() => {
    const record = levels.value[index.value]
    return record ? urlOf(record) : route.path
  })

  /** Names the open child — the last segment of the level below — for the active row and for a section that is a screen of its own. */
  const child = computed<string | null>(() => {
    const record = levels.value[index.value + 1]
    return index.value === -1 || !record ? null : urlOf(record).split('/').filter(Boolean).at(-1) ?? null
  })

  /** Where Back goes, or `null` at a tab root, which has nothing above it. */
  const to = computed<string | null>(() => {
    if (index.value === -1) return null
    const own = levels.value[index.value]!
    const parent = levels.value[index.value - 1]
    const declared = own.meta?.back
    if (parent && declared !== undefined) {
      throw new Error(`Route "${own.path}" declares meta.back but is nested under "${parent.path}"; its route parent is its Back`)
    }
    if (parent) return urlOf(parent)
    return typeof declared === 'string' ? resolveNamed(declared) : null
  })

  /** A root's declared destination, which may sit in another workspace. */
  function resolveNamed(name: string): string | null {
    const target = router.getRoutes().find(candidate => candidate.name === name)
    if (!target) throw new Error(`Route "${name}" named in meta.back does not exist`)
    const keys = [...target.path.matchAll(/:(\w+)/g)].map(match => match[1]!)
    // Account settings names Menu as its parent but carries no organization in
    // its URL; the layout knows which organization the session is in.
    if (keys.some(key => route.params[key] === undefined)) return organizationParent?.value?.to ?? null
    return routeRecordPath(router, target, route.params)
  }

  /**
   * Dismissing a child — a sheet's Close, a drawer that shuts — is the same
   * navigation as that child's own Back, so it is a push to here.
   */
  function close() {
    return navigateTo({ path: path.value, query: route.query })
  }

  return { mode, to, path, child, close }
}
