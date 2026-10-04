import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { serializeJsonLd } from '~/utils/json-ld'

// Composable for adding JSON-LD schema markup to pages
export function useSchemaOrg(schema: MaybeRefOrGetter<ApiRecord | null | undefined>) {
  const script = computed(() => {
    const value = toValue(schema)
    if (!value) return []

    return [
      {
        type: 'application/ld+json' as const,
        innerHTML: serializeJsonLd(value),
      },
    ]
  })

  useHead({
    script,
  })
}

