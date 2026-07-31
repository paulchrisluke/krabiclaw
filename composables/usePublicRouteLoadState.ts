interface PublicRouteLoadState {
  path: string
  key: string
  pending: boolean
  error: Error | null
  data: ApiRecord | null
}

const createPublicRouteLoadState = (): PublicRouteLoadState => ({
  path: '',
  key: '',
  pending: false,
  error: null,
  data: null,
})

const clientPublicRouteLoadState = shallowRef<PublicRouteLoadState>(createPublicRouteLoadState())

export function usePublicRouteLoadState() {
  // Only the persistent client layout and client page loaders share this
  // bridge. SSR page data remains request-scoped in Nuxt async data.
  return import.meta.client
    ? clientPublicRouteLoadState
    : shallowRef<PublicRouteLoadState>(createPublicRouteLoadState())
}
