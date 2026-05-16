<template>
  <div class="border-b border-default bg-default">
    <div class="mx-auto flex h-12 max-w-7xl gap-8 overflow-x-auto px-4 sm:px-6 lg:px-8">
      <NuxtLink
        v-for="item in items"
        :key="item.key"
        :to="item.href"
        :aria-current="active === item.key ? 'page' : undefined"
        :class="[
          'relative flex shrink-0 items-center text-xs font-medium uppercase tracking-widest transition-colors',
          active === item.key
            ? 'text-default'
            : 'text-muted hover:text-default'
        ]"
      >
        {{ item.label }}
        <span
          v-if="item.count != null"
          class="ml-1.5 tabular-nums text-[10px] text-muted opacity-60"
        >{{ item.count }}</span>
        
        <!-- Active indicator -->
        <div 
          v-if="active === item.key"
          class="absolute bottom-0 left-0 h-0.5 w-full bg-primary"
        />
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  locationSlug: string
  active: 'overview' | 'menu' | 'reviews' | 'photos' | 'qa' | 'contact'
  reviewCount?: number | null
  photoCount?: number | null
  qaCount?: number | null
}>()

const items = computed(() => [
  { key: 'overview', label: 'Overview', href: `/locations/${props.locationSlug}` },
  { key: 'menu',     label: 'Menu',     href: `/locations/${props.locationSlug}/menu` },
  { key: 'reviews',  label: 'Reviews',  href: `/locations/${props.locationSlug}/reviews`, count: props.reviewCount ?? null },
  { key: 'photos',   label: 'Photos',   href: `/locations/${props.locationSlug}/photos`,  count: props.photoCount ?? null },
  { key: 'qa',       label: 'Q&A',      href: `/locations/${props.locationSlug}/qa`,      count: props.qaCount ?? null },
  { key: 'contact',  label: 'Visit',    href: `/locations/${props.locationSlug}/contact` }
])
</script>
