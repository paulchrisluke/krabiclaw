<template>
  <div class="mx-auto max-w-2xl">
    <div class="mb-8 hidden items-start justify-between gap-5 lg:flex">
      <div class="min-w-0">
        <h2 class="truncate text-4xl font-bold tracking-tight text-highlighted">{{ product.name }}</h2>
        <p class="mt-2 text-sm text-muted">{{ product.category }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <UBadge :color="product.available ? 'success' : 'warning'" variant="soft">
          {{ product.available ? 'Available' : 'Unavailable' }}
        </UBadge>
        <UBadge v-if="!product.is_visible" color="neutral" variant="soft">Hidden</UBadge>
        <UBadge v-if="product.featured" color="primary" variant="soft">Featured</UBadge>
      </div>
    </div>

    <section class="border-b border-default pb-8">
      <h3 class="mb-3 text-sm font-semibold text-muted">Primary image</h3>
      <MediaPicker
        :site-id="siteId"
        :location-id="locationId"
        :model-value="product.image?.asset_id ?? null"
        :disabled="busy"
        accept="image"
        :title="`${presentation.itemLabel} primary image`"
        @update:model-value="assetId => emit('set-image', assetId)"
      >
        <div class="overflow-hidden rounded-[1.25rem] bg-elevated">
          <img v-if="representativeImage" :src="representativeImage.url" :alt="representativeImage.alt" class="aspect-[16/9] w-full object-cover">
          <div v-else class="flex aspect-[16/9] items-center justify-center text-muted">
            <span class="flex items-center gap-2 text-sm"><UIcon name="i-lucide-image" class="size-5" /> Select an image</span>
          </div>
        </div>
      </MediaPicker>
      <UAlert v-if="mediaError" class="mt-3" color="error" variant="soft" title="Image could not be updated" :description="mediaError" />
    </section>

    <section class="divide-y divide-default border-b border-default" aria-label="Product details">
      <button
        v-for="field in fields"
        :key="field.id"
        type="button"
        class="block w-full py-6 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-label="`Edit ${field.label}`"
        :disabled="busy"
        @click="emit('edit', field.id, $event.currentTarget)"
      >
        <span class="block text-sm font-semibold text-muted">{{ field.label }}</span>
        <span class="mt-2 line-clamp-4 block break-words whitespace-pre-wrap text-lg leading-7 text-highlighted">{{ field.value }}</span>
      </button>
    </section>

    <section class="py-8">
      <h3 class="text-sm font-semibold text-muted">Delete {{ presentation.itemLabel.toLowerCase() }}</h3>
      <UButton class="mt-3" color="error" variant="soft" icon="i-lucide-trash-2" :label="`Delete ${product.name}`" :disabled="busy" @click="emit('delete', $event.currentTarget)" />
    </section>
  </div>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { ProductFieldId } from '~/components/products/ProductFieldEditor.vue'
import type { Product, ProductPresentation } from '~/server/types/products'
import type { CurrencyCode } from '~/shared/currencies'
import { formatProductMoney } from '~/utils/product-money'

const props = defineProps<{
  product: Product
  siteId: string
  locationId: string
  currency: CurrencyCode
  presentation: ProductPresentation
  busy?: boolean
  mediaError?: string | null
}>()

const emit = defineEmits<{
  edit: [field: ProductFieldId, trigger: EventTarget | null]
  'set-image': [assetId: string | null]
  delete: [trigger: EventTarget | null]
}>()

const representativeImage = computed(() => {
  const image = props.product.image
  const url = image?.public_url ?? image?.thumbnail_url ?? null
  return url ? { url, alt: image?.alt_text || props.product.name } : null
})
const fields = computed<Array<{ id: ProductFieldId, label: string, value: string }>>(() => [
  { id: 'name', label: 'Name', value: props.product.name },
  { id: 'category', label: props.presentation.categoryLabel, value: props.product.category },
  { id: 'price', label: `Price (${props.product.price?.currency ?? props.currency})`, value: formatProductMoney(props.product.price) },
  { id: 'description', label: 'Description', value: props.product.description || 'Not set' },
  { id: 'order-url', label: 'Order URL', value: props.product.order_url || 'Not set' },
  { id: 'tags', label: 'Tags', value: props.product.tags.length ? props.product.tags.join(', ') : 'Not set' },
  { id: 'details', label: 'Details', value: props.product.details.length ? JSON.stringify(props.product.details, null, 2) : 'Not set' },
  {
    id: 'status',
    label: 'Availability and visibility',
    value: [props.product.available ? 'Available' : 'Unavailable', props.product.is_visible ? 'Visible' : 'Hidden', props.product.featured ? 'Featured' : null].filter(Boolean).join(' · '),
  },
])
</script>
