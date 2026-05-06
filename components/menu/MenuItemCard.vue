<template>
  <UCard :to="`/menu/${item.slug}`" class="group hover:shadow-md transition-shadow cursor-pointer">
    <div class="flex gap-4 p-4">
      <!-- Image -->
      <div class="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
        <img
          v-if="item.image && !item.image.includes('PLACEHOLDER')"
          :src="item.image"
          :alt="item.name"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        <div v-else class="w-full h-full flex items-center justify-center">
          <span class="text-gray-400 text-xs text-center px-2">No image yet</span>
        </div>
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-gray-900 group-hover:text-black leading-tight">{{ item.name }}</h3>
          <UBadge color="neutral" variant="solid" size="sm">
            {{ item.price > 0 ? `฿${item.price}` : 'TBD' }}
          </UBadge>
        </div>
        <p class="text-sm text-gray-500 mt-1 line-clamp-2">{{ item.description }}</p>
        <div v-if="item.allergens?.length && !item.allergens.includes('PLACEHOLDER_ALLERGEN')" class="flex gap-1 mt-2 flex-wrap">
          <UBadge
            v-for="a in item.allergens"
            :key="a"
            color="warning"
            variant="soft"
            size="xs"
          >
            {{ a }}
          </UBadge>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup>
defineProps({
  item: { type: Object, required: true }
})
</script>
