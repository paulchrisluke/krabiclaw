export type UpsellType =
  | 'growth'
  | 'managed'
  | 'seo_accelerator'
  | 'translation'
  | 'seasonal'
  | 'gbp_setup'

interface ServiceUpsellState {
  isOpen: boolean
  type: UpsellType | null
  sourceContext: string
}

export const useServiceUpsell = () => {
  const state = useState<ServiceUpsellState>('service-upsell', () => ({
    isOpen: false,
    type: null,
    sourceContext: '',
  }))

  const open = (type: UpsellType, sourceContext = '') => {
    state.value.type = type
    state.value.sourceContext = sourceContext
    state.value.isOpen = true
  }

  const close = () => {
    state.value.isOpen = false
    state.value.type = null
    state.value.sourceContext = ''
  }

  return {
    isOpen: computed(() => state.value.isOpen),
    type: computed(() => state.value.type),
    sourceContext: computed(() => state.value.sourceContext),
    open,
    close,
  }
}
