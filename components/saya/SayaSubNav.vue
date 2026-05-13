<template>
  <div class="border-b border-default bg-default">
    <div class="mx-auto flex max-w-7xl gap-3 overflow-x-auto px-4 py-5 sm:px-6 lg:px-8">
      <NuxtLink
        v-for="item in items"
        :key="item.key"
        :to="item.href"
        :aria-current="active === item.key ? 'page' : undefined"
        :class="[
          'inline-flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium tracking-wide transition-colors',
          active === item.key
            ? 'border-inverted bg-inverted text-inverted'
            : 'border-default bg-default text-default hover:border-muted'
        ]"
      >
        {{ item.label }}
        <span
          v-if="item.count != null"
          :class="[
            'rounded-full px-2 py-0.5 text-xs tabular-nums',
            active === item.key
              ? 'bg-white/20 text-white/90'
              : 'bg-muted text-muted'
          ]"
        >{{ item.count }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  locationSlug: string
  active: 'menu' | 'reviews' | 'photos' | 'qa' | 'contact'
  reviewCount?: number | null
  photoCount?: number | null
  qaCount?: number | null
}>()

const items = computed(() => [
  { key: 'menu',    label: 'Menu',    href: `/locations/${props.locationSlug}/menu` },
  { key: 'reviews', label: 'Reviews', href: `/locations/${props.locationSlug}/reviews`, count: props.reviewCount ?? null },
  { key: 'photos',  label: 'Photos',  href: `/locations/${props.locationSlug}/photos`,  count: props.photoCount ?? null },
  { key: 'qa',      label: 'Q&A',     href: `/locations/${props.locationSlug}/qa`,      count: props.qaCount ?? null },
  { key: 'contact', label: 'Visit',   href: `/locations/${props.locationSlug}/contact` }
])
</script>
