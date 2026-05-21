<template>
  <UPage class="h-full">
    <UPageBody class="h-[calc(100vh-4rem)] p-0 sm:p-0">
      <ChowBot embedded :setup-mode="!hasRestaurant" />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const route = useRoute()
const dashboard = useDashboardRestaurant()
const chowBot = useChowBot()

if (!dashboard.state.value) await dashboard.refresh()

const hasRestaurant = computed(() => Boolean(dashboard.restaurant.value))
const promptSent = ref(false)

async function sendRoutePrompt() {
  if (!hasRestaurant.value || promptSent.value) return
  const prompt = typeof route.query.prompt === 'string' ? decodeURIComponent(route.query.prompt) : ''
  if (!prompt.trim()) return
  promptSent.value = true
  await chowBot.sendMessage(prompt)
}

onMounted(async () => {
  chowBot.close()
  chowBot.currentPageOverride.value = route.query.setup === '1' ? 'setup' : null
  await sendRoutePrompt()
})

watch(hasRestaurant, async () => {
  if (hasRestaurant.value) chowBot.currentPageOverride.value = route.query.setup === '1' ? 'setup' : null
  await sendRoutePrompt()
})

watch(() => route.query.setup, (setup) => {
  chowBot.currentPageOverride.value = setup === '1' ? 'setup' : null
}, { immediate: true })

onBeforeUnmount(() => {
  if (chowBot.currentPageOverride.value === 'setup') chowBot.currentPageOverride.value = null
})

useSeoMeta({ title: 'Conversations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
