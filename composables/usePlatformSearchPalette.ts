export type PlatformSearchPaletteSurface = 'docs' | 'blog' | 'dashboard'

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
