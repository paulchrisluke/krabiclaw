<template>
  <dl v-if="offers.some(variant => variant.prices.length)" class="space-y-2 tabular-nums">
    <div v-for="variant in offers" :key="variant.id" class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <dt :class="offers.length === 1 ? 'sr-only' : 'font-medium'">{{ offers.length === 1 ? product.name : variant.name }}</dt>
      <dd class="flex flex-wrap gap-x-5 gap-y-1">
        <span v-for="price in variant.prices" :key="price.id">
          <span v-if="price.compare_at_unit_amount !== null" class="mr-2 text-muted line-through">{{ formatProductMoney({ ...price, unit_amount: price.compare_at_unit_amount }) }}</span>
          {{ formatProductMoney(price) }} <span v-if="variant.prices.length > 1" class="text-xs text-muted">{{ price.currency }}</span>
        </span>
        <span v-if="!variant.prices.length" class="text-muted">{{ t('booking.price_unavailable') }}</span>
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import type { Product } from '~/server/types/products'
import type { CurrencyCode } from '~/shared/currencies'
import { selectPrice } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'

const props = defineProps<{ product: Product; locationId: string | null; currency: CurrencyCode }>()
const { t } = useI18n()
const offers = computed(() => {
  const at = new Date().toISOString()
  return props.product.variants.filter(variant => variant.active).map(variant => ({
    id: variant.id,
    name: variant.name,
    prices: [...new Set([props.currency, ...variant.prices.map(price => price.currency)])].flatMap(currency =>
      selectPrice(variant.prices, { currency, location_id: props.locationId, at }) ?? []),
  }))
})
</script>
