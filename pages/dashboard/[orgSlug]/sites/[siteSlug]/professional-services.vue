<template>
  <UDashboardPanel id="site-professional-services">
    <template #header>
      <UDashboardNavbar :toggle="false" title="Services">
        <template #leading><DashboardNavbarLeading /></template>
        <template #right><UButton :to="pagesPath" color="neutral" variant="soft">Pages</UButton></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-6">
        <div>
          <h1 class="text-2xl font-semibold text-highlighted">Services and practice areas</h1>
          <p class="mt-2 text-sm text-muted">Manage the structured offerings referenced by canonical tenant-page blocks.</p>
        </div>
        <UAlert v-if="error" color="error" variant="soft" title="Services unavailable" :description="error" />
        <div v-else-if="pending" class="grid gap-4 lg:grid-cols-2"><USkeleton v-for="index in 2" :key="index" class="h-56 rounded-xl" /></div>
        <div v-else class="grid gap-4 lg:grid-cols-2">
          <UCard v-for="offering in offerings" :key="offering.id">
            <template #header><div class="flex items-center justify-between gap-3"><h2 class="font-semibold text-highlighted">{{ offering.name }}</h2><USwitch v-model="offering.featured" label="Featured" /></div></template>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Name"><UInput v-model="offering.name" /></UFormField>
              <UFormField label="Slug"><UInput v-model="offering.slug" /></UFormField>
              <UFormField class="sm:col-span-2" label="Summary"><UTextarea v-model="offering.summary" :rows="3" autoresize /></UFormField>
              <UFormField class="sm:col-span-2" label="Description"><UTextarea v-model="offering.short_description" :rows="4" autoresize /></UFormField>
              <UFormField label="Sort order"><UInput v-model.number="offering.sort_order" type="number" /></UFormField>
            </div>
          </UCard>
        </div>
        <UButton v-if="!pending && offerings.length" :loading="saving" @click="save">Save services</UButton>
        <UAlert v-else-if="!pending" color="neutral" variant="soft" title="No services yet" description="Create offerings through ChowBot or MCP, then manage them here." />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.services' })
useSeoMeta({ title: 'Services | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

interface Offering { id: string; name: string; slug: string; summary: string; short_description: string; sort_order: number; featured: boolean }
interface Response { offerings: Offering[] }
const dashboardApi = useDashboardApi()
const route = useRoute()
const siteId = await useDashboardSiteId()
const offerings = ref<Offering[]>([])
const pending = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const pagesPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages`)

const isResponse = (value: unknown): value is Response => isRecord(value) && Array.isArray(value.offerings)
async function load() {
  try {
    const response = await dashboardApi<Response>(`/api/editor/sites/${siteId}/professional-services`, { validate: isResponse })
    offerings.value = response.offerings.map(item => ({ ...item, summary: item.summary ?? '', short_description: item.short_description ?? '' }))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to load services' } finally { pending.value = false }
}
async function save() {
  saving.value = true; error.value = null
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/professional-services`, {
      method: 'PATCH',
      body: { offerings: offerings.value.map(({ id, name, slug, summary, short_description, sort_order, featured }) => ({ id, name, slug, summary, short_description, sort_order, featured })) },
      validate: (value): value is Record<string, unknown> => isRecord(value),
    })
    await load()
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to save services' }
  finally { saving.value = false }
}
onMounted(load)
</script>
