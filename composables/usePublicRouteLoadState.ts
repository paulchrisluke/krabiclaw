interface PublicRouteLoadState {
  path: string
  key: string
  pending: boolean
  error: PublicRouteLoadError | null
  hasData: boolean
}

interface PublicRouteLoadError {
  name: string
  message: string
  statusCode?: number
  code?: string
  requestId?: string | null
}

const createPublicRouteLoadState = (): PublicRouteLoadState => ({
  path: '',
  key: '',
  pending: false,
  error: null,
  hasData: false,
})

const clientPublicRouteLoadState = shallowRef<PublicRouteLoadState>(createPublicRouteLoadState())
let activePublicRouteOwner: symbol | null = null

export function claimPublicRouteLoadOwner() {
  const owner = Symbol('public-route-load-owner')
  if (import.meta.client) activePublicRouteOwner = owner
  return {
    ownsState: () => import.meta.server || activePublicRouteOwner === owner,
    release: () => {
      if (activePublicRouteOwner !== owner) return
      activePublicRouteOwner = null
      // If nothing else has claimed ownership since (e.g. navigating from a
      // Saya route to a platform/non-Saya route that never creates a public
      // page owner), the previous path/error/hasData must not remain visible
      // to whatever reads this shared state next.
      if (import.meta.client) clientPublicRouteLoadState.value = createPublicRouteLoadState()
    },
  }
}

export const normalizePublicRouteLoadError = (error: unknown): PublicRouteLoadError | null => {
  if (!error) return null
  const record = isRecord(error) ? error : {}
  return {
    name: typeof record.name === 'string' ? record.name : 'Error',
    message: error instanceof Error
      ? error.message
      : typeof record.message === 'string'
        ? record.message
        : String(error),
    ...(typeof record.statusCode === 'number' ? { statusCode: record.statusCode } : {}),
    ...(typeof record.code === 'string' ? { code: record.code } : {}),
    ...(typeof record.requestId === 'string' || record.requestId === null
      ? { requestId: record.requestId }
      : {}),
  }
}

export function usePublicRouteLoadState() {
  return import.meta.client
    ? clientPublicRouteLoadState
    : useState<PublicRouteLoadState>('public-route-load-state', createPublicRouteLoadState)
}
