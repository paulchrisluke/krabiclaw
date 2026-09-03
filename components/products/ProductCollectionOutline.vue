<template>
  <EditorNavigationList
    :groups="navigationGroups"
    :active-item="selectedId"
    variant="cards"
    @select="forwardSelection"
  >
    <template #group-actions="{ group, index }">
      <div class="flex items-center gap-1" :aria-label="`${presentation.categoryLabel} order`">
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="`Move ${group.label} up`"
          :disabled="reordering || index === 0"
          @click="emit('move-category', index, -1, $event.currentTarget)"
        />
        <UButton
          icon="i-lucide-arrow-down"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="`Move ${group.label} down`"
          :disabled="reordering || index === navigationGroups.length - 1"
          @click="emit('move-category', index, 1, $event.currentTarget)"
        />
      </div>
    </template>

    <template #item="{ item }">
      <div v-if="productFor(item.id)" class="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:p-5">
        <img
          v-if="imageFor(productFor(item.id)!)"
          :src="imageFor(productFor(item.id)!)!.url"
          :alt="imageFor(productFor(item.id)!)!.alt"
          class="aspect-square size-full rounded-xl object-cover"
        >
        <span v-else class="flex aspect-square size-full items-center justify-center rounded-xl bg-elevated" aria-hidden="true">
          <UIcon name="i-lucide-image" class="size-6 text-muted" />
        </span>

        <span class="min-w-0 self-center">
          <span class="block truncate text-base font-semibold text-highlighted">{{ productFor(item.id)!.name }}</span>
          <span class="mt-1 block truncate text-sm text-muted">{{ productFor(item.id)!.category }}</span>
          <span class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="text-sm font-medium tabular-nums text-highlighted">{{ formatProductMoney(productFor(item.id)!.price) }}</span>
            <UBadge :color="productFor(item.id)!.available ? 'success' : 'warning'" variant="soft" size="sm">
              {{ productFor(item.id)!.available ? 'Available' : 'Unavailable' }}
            </UBadge>
            <UBadge v-if="!productFor(item.id)!.is_visible" color="neutral" variant="soft" size="sm">Hidden</UBadge>
            <UBadge v-if="productFor(item.id)!.featured" color="primary" variant="soft" size="sm">Featured</UBadge>
          </span>
        </span>
      </div>
    </template>

    <template #actions="{ item, index }">
      <UButton
        icon="i-lucide-arrow-up"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        :aria-label="`Move ${item.label} up`"
        :disabled="reordering || index === 0"
        @click="emitProductMove(item.id, index, -1, $event.currentTarget)"
      />
      <UButton
        icon="i-lucide-arrow-down"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        :aria-label="`Move ${item.label} down`"
        :disabled="reordering || isLastProduct(item.id, index)"
        @click="emitProductMove(item.id, index, 1, $event.currentTarget)"
      />
    </template>
  </EditorNavigationList>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import type { Product, ProductPresentation } from '~/server/types/products'
import { formatProductMoney } from '~/utils/product-money'

const props = defineProps<{
  groups: Array<{ category: string, products: Product[] }>
  selectedId?: string | null
  presentation: ProductPresentation
  reordering?: boolean
}>()

const emit = defineEmits<{
  select: [id: string, trigger: EventTarget | null]
  'move-category': [index: number, direction: -1 | 1, trigger: EventTarget | null]
  'move-product': [categoryIndex: number, productIndex: number, direction: -1 | 1, trigger: EventTarget | null]
}>()

const productsById = computed(() => new Map(props.groups.flatMap(group => group.products.map(product => [product.id, product]))))
const navigationGroups = computed(() => props.groups.map(group => ({
  id: group.category,
  label: group.category,
  items: group.products.map(product => ({
    id: product.id,
    label: product.name,
    ariaLabel: `Open ${product.name}, ${product.category}, ${formatProductMoney(product.price)}, ${product.available ? 'available' : 'unavailable'}${product.is_visible ? '' : ', hidden'}${product.featured ? ', featured' : ''}`,
    actions: true,
  })),
})))

function productFor(id: string): Product | null {
  return productsById.value.get(id) ?? null
}

function forwardSelection(id: string, trigger: EventTarget | null) {
  emit('select', id, trigger)
}

function imageFor(product: Product): { url: string, alt: string } | null {
  const image = product.image ?? product.gallery[0] ?? null
  const url = image?.thumbnail_url ?? image?.public_url ?? null
  return url ? { url, alt: image?.alt_text || product.name } : null
}

function emitProductMove(productId: string, productIndex: number, direction: -1 | 1, trigger: EventTarget | null) {
  const categoryIndex = props.groups.findIndex(group => group.products.some(product => product.id === productId))
  if (categoryIndex >= 0) emit('move-product', categoryIndex, productIndex, direction, trigger)
}

function isLastProduct(productId: string, productIndex: number): boolean {
  const group = props.groups.find(candidate => candidate.products.some(product => product.id === productId))
  return !group || productIndex === group.products.length - 1
}
</script>
