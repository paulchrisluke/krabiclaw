export type PlatformSearchPaletteSurface = 'docs' | 'blog' | 'dashboard' | 'tenant_blog'

export const PLATFORM_SEARCH_OPEN_EVENT = 'platform-search:open'

export function requestPlatformSearchOpen(surface: PlatformSearchPaletteSurface) {
  if (import.meta.client) {
    window.dispatchEvent(new CustomEvent<PlatformSearchPaletteSurface>(PLATFORM_SEARCH_OPEN_EVENT, { detail: surface }))
  }
}

export function usePlatformSearchPalette(surface: PlatformSearchPaletteSurface) {
  const state = useState<boolean>(`platform-search:${surface}:open`, () => false)

  function open() {
    state.value = true
  }

  function close() {
    state.value = false
  }

  function toggle() {
    state.value = !state.value
  }

  return {
    isOpen: state,
    open,
    close,
    toggle,
  }
}
