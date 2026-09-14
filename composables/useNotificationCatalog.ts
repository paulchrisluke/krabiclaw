export interface CatalogPreview {
  id: string
  title: string
  audience: 'owner' | 'guest'
  subject: string
  html: string
  text: string
  channels: string[]
  whatsapp: { template: string; text: string } | null
}

/**
 * The rendered catalog, fetched once and shared by the hub and the leaf, so a
 * row's preview and the message it opens cannot disagree.
 */
export async function useNotificationCatalog() {
  const { data, error: fetchError } = await useAsyncData('notification-catalog', () =>
    $fetch<{ entries: CatalogPreview[] }>('/api/dev/notifications-preview'), { default: () => ({ entries: [] }), server: false })

  const entries = computed(() => data.value?.entries ?? [])
  const error = computed(() => (fetchError.value ? fetchError.value.message || 'Failed to load the message catalog' : null))
  return { entries, error }
}
