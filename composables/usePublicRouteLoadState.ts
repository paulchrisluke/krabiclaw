interface PublicRouteLoadState {
  path: string
  key: string
  pending: boolean
  error: PublicRouteLoadError | null
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
})

const clientPublicRouteLoadState = shallowRef<PublicRouteLoadState>(createPublicRouteLoadState())
let activePublicRouteOwner: symbol | null = null

export function claimPublicRouteLoadOwner() {
  const owner = Symbol('public-route-load-owner')
  if (import.meta.client) activePublicRouteOwner = owner
  return {
    ownsState: () => import.meta.server || activePublicRouteOwner === owner,
    release: () => {
      if (activePublicRouteOwner === owner) activePublicRouteOwner = null
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
