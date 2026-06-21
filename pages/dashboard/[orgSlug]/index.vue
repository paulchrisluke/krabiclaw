<template>
  <UPage class="h-full">
    <UPageBody>
      <div v-if="pending" class="space-y-4">
        <USkeleton v-for="i in 3" :key="i" class="h-24 rounded-xl" />
      </div>

      <div v-else class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-highlighted">Sites</h2>
          <UButton icon="i-lucide-plus" label="Add site" size="sm" color="primary" variant="soft" :to="`/dashboard/${orgSlug}/sites/new`" />
        </div>

        <div v-if="sites.length === 0" class="py-16 text-center">
          <UIcon name="i-lucide-globe" class="size-8 text-muted mx-auto mb-3" />
          <p class="text-sm text-muted">No sites yet.</p>
          <UButton label="Add your first site" size="sm" color="primary" class="mt-4" :to="`/dashboard/${orgSlug}/sites/new`" />
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="s in sites"
            :key="s.id"
            :to="`/dashboard/${orgSlug}/sites/${s.subdomain}`"
            class="group block"
          >
            <UCard class="h-full transition-shadow group-hover:shadow-md cursor-pointer">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-highlighted truncate">{{ s.brand_name ?? s.subdomain }}</p>
                  <p class="text-xs text-muted">{{ s.subdomain }}.krabiclaw.com</p>
                </div>
                <UBadge :label="s.plan ?? 'free'" color="neutral" variant="soft" size="xs" />
              </div>
            </UCard>
          </NuxtLink>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Dashboard | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const router = useRouter()
const orgSlug = route.params.orgSlug as string
const dashboard = useDashboardSite()
const pending = ref(true)

const sites = computed(() => dashboard.sites.value)

onMounted(async () => {
  if (!dashboard.state.value) await dashboard.refresh()
  pending.value = false
  // A single-site org skips the picker entirely — go straight to that site's overview.
  if (sites.value.length === 1 && sites.value[0]!.subdomain) {
    await router.replace(`/dashboard/${orgSlug}/sites/${sites.value[0]!.subdomain}`)
  }
})
</script>
