interface PublicRouteLoadState {
  path: string
  key: string
  pending: boolean
  error: PublicRouteLoadError | null
  data: ApiRecord | null
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
  data: null,
})

const clientPublicRouteLoadState = shallowRef<PublicRouteLoadState>(createPublicRouteLoadState())

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
