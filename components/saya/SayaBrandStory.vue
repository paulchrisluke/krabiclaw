<template>
  <section class="bg-inverted text-inverted">
    <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">

      <!-- Filled state -->
      <template v-if="headline || body">
        <div :class="image ? 'grid gap-16 lg:grid-cols-2 lg:items-center' : ''">
          <div>
            <p class="saya-eyebrow mb-8 text-inverted/60">Our story</p>
            <h2 class="saya-display-md text-inverted" :class="image ? '' : 'max-w-3xl'">
              {{ headline }}
            </h2>
            <p class="mt-8 text-base leading-relaxed text-inverted/60" :class="image ? '' : 'max-w-2xl'">
              {{ body }}
            </p>
            <NuxtLink
              to="/about"
              class="mt-8 inline-block border-b border-inverted pb-1 text-xs uppercase tracking-widest text-inverted no-underline transition hover:opacity-60"
            >
              Read more →
            </NuxtLink>
          </div>
          <div v-if="image" class="overflow-hidden">
            <img
              :src="image"
              alt=""
              aria-hidden="true"
              class="h-full w-full object-cover aspect-4/3"
            >
          </div>
        </div>
      </template>

      <!-- Empty state: owner hasn't added story yet -->
      <template v-else>
        <p class="saya-eyebrow mb-8 text-inverted/60">Our story</p>
        <h2 class="saya-display-md max-w-3xl text-inverted/30">Your brand story goes here.</h2>
        <p class="mt-6 max-w-lg text-sm leading-relaxed text-inverted/30">
          Two or three sentences about your brand — what you do, how you do it, why it matters.
        </p>
        <NuxtLink
          v-if="isAuthenticated"
          to="/dashboard"
          class="mt-8 inline-flex items-center gap-2 rounded-full border border-inverted/20 px-5 py-2.5 text-xs uppercase tracking-widest text-inverted/60 no-underline transition hover:border-inverted/40 hover:text-inverted/80"
        >
          Add your story in the dashboard →
        </NuxtLink>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
interface Props {
  data?: {
    headline?: string
    body?: string
    image?: string
    isAuthenticated?: boolean
  }
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const headline = computed(() => props.data?.headline || '')
const body = computed(() => props.data?.body || '')
const image = computed(() => props.data?.image || '')
const isAuthenticated = computed(() => props.data?.isAuthenticated || false)
</script>
