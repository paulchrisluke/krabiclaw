<template>
  <UPage class="h-full">
    <UPageBody class="h-[calc(100vh-4rem)] p-0 sm:p-0">
      <div v-if="dashboardError" class="p-6 flex flex-col items-center justify-center h-full gap-4 text-center">
        <UAlert
          color="error"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          title="Error Loading Dashboard"
          :description="dashboardError"
          class="max-w-md"
        />
        <UButton color="primary" :loading="loading" @click="loadDashboard">Retry</UButton>
      </div>
      <ChowBot v-else embedded :setup-mode="!hasRestaurant" />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const route = useRoute()
const dashboard = useDashboardRestaurant()
const chowBot = useChowBot()

const dashboardError = ref<string | null>(null)
const loading = ref(false)

async function loadDashboard() {
  if (!dashboard.state.value) {
    try {
      loading.value = true
      dashboardError.value = null
      await dashboard.refresh()
    } catch (error: unknown) {
      console.error('Failed to load dashboard data:', error)
      dashboardError.value = error instanceof Error ? error.message : 'Failed to load restaurant data.'
    } finally {
      loading.value = false
    }
  }
}

await loadDashboard()

const hasRestaurant = computed(() => Boolean(dashboard.restaurant.value))
const promptSent = ref(false)

async function sendRoutePrompt() {
  if (!hasRestaurant.value || promptSent.value) return
  let prompt = ''
  if (typeof route.query.prompt === 'string') {
    try {
      prompt = decodeURIComponent(route.query.prompt)
    } catch (e) {
      if (e instanceof URIError) {
        prompt = route.query.prompt || ''
      } else {
        prompt = ''
      }
    }
  }
  if (!prompt.trim()) return
  promptSent.value = true
  try {
    await chowBot.sendMessage(prompt)
  } catch (err) {
    console.error('Failed to send route prompt:', err)
    promptSent.value = false
  }
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
