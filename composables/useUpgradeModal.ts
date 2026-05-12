export const useUpgradeModal = () => {
  const state = useState('upgrade-modal', () => ({
    isOpen: false,
    feature: '' as string
  }))

  const open = (feature: string) => {
    state.value.feature = feature
    state.value.isOpen = true
  }

  const close = () => {
    state.value.isOpen = false
    state.value.feature = ''
  }

  return {
    isOpen: computed(() => state.value.isOpen),
    feature: computed(() => state.value.feature),
    open,
    close
  }
}
