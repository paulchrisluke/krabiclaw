<template>
  <!-- This page immediately opens ChowBot with the ?prompt pre-seeded and
       redirects to the site overview. It exists solely so the ChowBot nudge
       button in the setup journey has a real URL to link to. -->
  <UPage>
    <UPageBody>
      <div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div class="flex size-14 items-center justify-center rounded-full bg-primary/10">
          <UIcon name="i-lucide-bot" class="size-7 text-primary animate-pulse" />
        </div>
        <p class="text-sm text-muted">Opening ChowBot…</p>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const siteId = await useDashboardSiteId()
const prompt = typeof route.query.prompt === 'string' ? decodeURIComponent(route.query.prompt) : ''
const { paths } = useDashboardSiteLinks(siteId)

onMounted(async () => {
  // Navigate to the overview first so the sidebar context is correct
  await navigateTo(paths.value.base, { replace: true })

  // Then open ChowBot with the pre-seeded prompt
  if (prompt) {
    // Small delay to let the page settle before opening the panel
    setTimeout(async () => {
      const chowBot = useChowBot()
      chowBot.open()
      if (prompt) {
        await chowBot.sendMessage(prompt)
      }
    }, 400)
  } else {
    const chowBot = useChowBot()
    chowBot.open()
  }
})

useSeoMeta({ robots: 'noindex, nofollow' })
</script>
