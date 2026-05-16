<template>
  <div class="sticky top-16 z-30 border-b border-default bg-default/80 backdrop-blur-md">
    <div class="relative mx-auto max-w-7xl">
      <div class="flex h-12 items-center gap-8 overflow-x-auto px-4 sm:px-6 lg:px-8 no-scrollbar">
        <NuxtLink
          v-for="item in items"
          :key="item.key"
          :to="item.href"
          :aria-current="active === item.key ? 'page' : undefined"
          :class="[
            'relative flex h-full shrink-0 items-center text-[11px] font-bold uppercase tracking-[0.2em] transition-all',
            active === item.key
              ? 'text-default'
              : 'text-muted hover:text-default'
          ]"
        >
          {{ item.label }}
          
          <!-- Active indicator -->
          <div 
            v-if="active === item.key"
            class="absolute bottom-0 left-0 h-0.5 w-full bg-primary"
          />
        </NuxtLink>
      </div>

      <!-- Fade indicators for mobile scroll -->
      <div class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-default to-transparent lg:hidden" />
      <div class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-default to-transparent lg:hidden" />
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
