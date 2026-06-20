<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <header class="flex h-[60px] shrink-0 items-center gap-4 border-b border-default bg-default px-5">
      <div class="flex items-center gap-2.5">
        <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="h-7 w-auto" />
      </div>
      <div class="h-[22px] w-px bg-default-200 dark:bg-default-700" />
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-[13px] font-semibold text-highlighted">Add a location</span>
        <span class="truncate font-mono text-[10.5px] text-dimmed">{{ orgSlug }}</span>
      </div>
      <div class="flex-1" />
      <UButton color="neutral" variant="ghost" size="sm" @click="router.push(`/dashboard/${orgSlug}`)">
        Back to dashboard
      </UButton>
    </header>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <div class="w-full max-w-2xl">
        <OnboardingWizard
          :site-id="null"
          :existing-org-slug="orgSlug"
          setup-endpoint="/api/dashboard/locations/add"
          setup-manual-endpoint="/api/dashboard/locations/add"
          skip-vertical
          @site-created="onLocationCreated"
        />
      </div>
    </div>

    <AppToast />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'editor', ssr: false })

const route = useRoute()
const router = useRouter()

const orgSlug = route.params.orgSlug as string

const onLocationCreated = async (_orgSlug: string | null, locationSlug: string | null | undefined) => {
  if (locationSlug) {
    await router.push(`/dashboard/${orgSlug}/${locationSlug}`)
  } else {
    await router.push(`/dashboard/${orgSlug}`)
  }
}
</script>
