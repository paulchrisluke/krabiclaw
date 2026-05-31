<template>
  <section v-if="items.length" class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
    <div class="mb-12 flex flex-wrap items-end justify-between gap-4">
      <div class="max-w-2xl">
        <p class="saya-kicker mb-6">{{ sectionKicker }}</p>
        <h2 class="saya-display-md text-default">{{ sectionHeading }}</h2>
      </div>
      <NuxtLink
        :to="linkTarget"
        class="border-b border-default pb-1 text-xs uppercase tracking-widest text-default no-underline transition hover:opacity-60"
      >
        View all →
      </NuxtLink>
    </div>
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <NuxtLink
        v-for="(item, i) in items"
        :key="i"
        :to="item.href || linkTarget"
        class="group block overflow-hidden bg-elevated no-underline text-default transition hover:opacity-90"
      >
        <div class="aspect-square overflow-hidden bg-muted">
          <video
            v-if="item.imageKind === 'video' && item.image && clientReady"
            :src="item.image"
            autoplay
            muted
            loop
            playsinline
            preload="none"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <img
            v-else-if="item.image"
            :src="item.image"
            :alt="item.alt"
            loading="lazy"
            sizes="(max-width:640px) 50vw, 25vw"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          >
          <div v-else class="flex h-full w-full items-center justify-center">
            <UIcon name="i-heroicons-sparkles" class="size-8 text-muted" />
          </div>
        </div>
        <div class="p-3 pt-2">
          <p class="saya-display saya-italic text-base text-default leading-snug line-clamp-2">{{ item.name }}</p>
          <p v-if="item.price" class="mt-0.5 text-xs tabular-nums text-muted">{{ item.price }}</p>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
interface Props {
  data?: {
    items?: Array<{
      name: string
      image?: string
      imageKind?: string
      alt?: string
      price?: string
      href?: string
    }>
    hasMenu?: boolean
    vertical?: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const { site } = useTenantSite()

const items = computed(() => props.data?.items || [])
const hasMenu = computed(() => props.data?.hasMenu || false)
const linkTarget = computed(() => hasMenu.value ? '/menu' : '/experiences')

const sectionKicker = computed(() => hasMenu.value ? 'The menu' : 'Experiences')
const sectionHeading = computed(() => {
  const siteRecord = site as Record<string, unknown>
  const siteTitle = typeof siteRecord?.title === 'string' ? siteRecord.title : null
  if (hasMenu.value) {
    return `What we're cooking at ${siteTitle || 'our kitchen'}.`
  }
  return `What we're offering at ${siteTitle || 'our studio'}.`
})

const clientReady = ref(false)
onMounted(() => { clientReady.value = true })
</script>
