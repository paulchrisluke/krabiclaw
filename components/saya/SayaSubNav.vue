<template>
  <div class="border-b border-default bg-default">
    <div class="relative mx-auto max-w-7xl">
      <div class="flex h-14 items-center gap-2 overflow-x-auto px-4 sm:px-6 lg:px-8 scrollbar-none">
        <NuxtLink
          v-for="item in items"
          :key="item.key"
          :to="item.href"
          :aria-current="active === item.key ? 'page' : undefined"
          :class="[
            'shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] transition-all',
            active === item.key
              ? 'bg-inverted text-inverted'
              : 'text-muted hover:bg-muted hover:text-default'
          ]"
        >
          {{ item.label }}
        </NuxtLink>
      </div>

      <!-- Fade indicators for mobile scroll -->
      <div class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-default to-transparent lg:hidden" />
      <div class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-default to-transparent lg:hidden" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  locationSlug: string
  active: 'overview' | 'menu' | 'reviews' | 'photos' | 'qa' | 'contact'
}>()

const items = computed(() => [
  { key: 'overview', label: 'Overview', href: `/locations/${props.locationSlug}` },
  { key: 'menu',     label: 'Menu',     href: `/locations/${props.locationSlug}/menu` },
  { key: 'reviews',  label: 'Reviews',  href: `/locations/${props.locationSlug}/reviews` },
  { key: 'photos',   label: 'Photos',   href: `/locations/${props.locationSlug}/photos` },
  { key: 'qa',       label: 'Q&A',      href: `/locations/${props.locationSlug}/qa` },
  { key: 'contact',  label: 'Visit',    href: `/locations/${props.locationSlug}/contact` }
])
</script>
