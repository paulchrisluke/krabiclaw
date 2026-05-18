<template>
  <UPage>
    <UPageHeader title="Order" description="Manage delivery links and order-page content for each location.">
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
      </template>
    </UPageHeader>

    <UPageBody>
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-48 rounded-lg" />
      </div>

      <div v-else-if="locations.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
        <UIcon name="i-heroicons-map-pin" class="mx-auto size-9 text-muted" />
        <p class="mt-3 text-sm font-medium text-highlighted">Add a location before configuring orders</p>
        <UButton class="mt-5" :to="paths.locations" icon="i-heroicons-plus">Add location</UButton>
      </div>

      <div v-else class="space-y-4">
        <UCard v-for="location in locations" :key="location.id">
          <template #header>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="font-semibold text-highlighted">{{ location.title }}</h2>
                <p class="text-sm text-muted">{{ location.city || location.addressText || 'Location ordering links' }}</p>
              </div>
              <UButton size="sm" color="neutral" variant="soft" icon="i-heroicons-map-pin" :to="`${paths.locations}/${location.id}`">Location details</UButton>
            </div>
          </template>

          <div class="grid gap-4 md:grid-cols-3">
            <UFormField label="Grab" :error="urlError(location.form.grab_url)">
              <UInput v-model="location.form.grab_url" type="url" placeholder="https://grab.onelink.me/..." />
            </UFormField>
            <UFormField label="Uber Eats" :error="urlError(location.form.uber_eats_url)">
              <UInput v-model="location.form.uber_eats_url" type="url" placeholder="https://ubereats.com/..." />
            </UFormField>
            <UFormField label="Foodpanda" :error="urlError(location.form.foodpanda_url)">
              <UInput v-model="location.form.foodpanda_url" type="url" placeholder="https://foodpanda.co.th/..." />
            </UFormField>
          </div>

          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="link in previewLinks(location)"
                :key="link.label"
                :to="link.to"
                target="_blank"
                external
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-heroicons-arrow-top-right-on-square"
              >
                {{ link.label }}
              </UButton>
              <p v-if="previewLinks(location).length === 0" class="text-sm text-muted">No public ordering links configured.</p>
            </div>
            <UButton :loading="savingId === location.id" :disabled="!canSaveLocation(location)" icon="i-heroicons-check" @click="saveLocation(location)">Save links</UButton>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface LocationRow {
  id: string
  title: string
  city: string | null
  address: { addressLines?: string[] } | null
  grab_url?: string | null
  uber_eats_url?: string | null
  foodpanda_url?: string | null
}

interface OrderForm {
  grab_url: string
  uber_eats_url: string
  foodpanda_url: string
}

const route = useRoute()
const siteId = route.params.siteId as string
const toast = useToast()
const sitePublicUrl = ref<string | null>(null)
const locations = ref<Array<LocationRow & { addressText: string; form: OrderForm }>>([])
const loading = ref(true)
const savingId = ref<string | null>(null)
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const headerLinks = computed(() => buildHeaderLinks([
  { label: 'Edit order page', icon: 'i-heroicons-document-text', to: `${paths.value.content}?page=order`, color: 'primary' as const, variant: 'soft' as const }
]))

function addressText(address: LocationRow['address']) {
  return address?.addressLines?.filter(Boolean).join(', ') ?? ''
}

function normalizedUrl(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function urlError(value: string): string | undefined {
  return value.trim() && !normalizedUrl(value) ? 'Enter a valid URL' : undefined
}

function canSaveLocation(location: { form: OrderForm }) {
  return Object.values(location.form).every(value => !urlError(value))
}

function previewLinks(location: { form: OrderForm }) {
  return [
    { label: 'Grab', to: normalizedUrl(location.form.grab_url) },
    { label: 'Uber Eats', to: normalizedUrl(location.form.uber_eats_url) },
    { label: 'Foodpanda', to: normalizedUrl(location.form.foodpanda_url) }
  ].filter((link): link is { label: string; to: string } => Boolean(link.to))
}

async function loadOrder() {
  loading.value = true
  try {
    const [settingsRes, locationsRes] = await Promise.all([
      $fetch<{ settings: { public_url: string | null } }>(`/api/sites/${siteId}/settings`),
      $fetch<{ locations: LocationRow[] }>(`/api/sites/${siteId}/locations`)
    ])
    sitePublicUrl.value = settingsRes.settings.public_url
    locations.value = (locationsRes.locations ?? []).map(location => ({
      ...location,
      addressText: addressText(location.address),
      form: {
        grab_url: location.grab_url ?? '',
        uber_eats_url: location.uber_eats_url ?? '',
        foodpanda_url: location.foodpanda_url ?? ''
      }
    }))
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load ordering links', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function saveLocation(location: LocationRow & { form: OrderForm }) {
  if (!canSaveLocation(location)) return
  savingId.value = location.id
  try {
    await $fetch(`/api/sites/${siteId}/locations/${location.id}`, {
      method: 'PATCH',
      body: {
        grab_url: normalizedUrl(location.form.grab_url),
        uber_eats_url: normalizedUrl(location.form.uber_eats_url),
        foodpanda_url: normalizedUrl(location.form.foodpanda_url)
      }
    })
    toast.add({ description: 'Ordering links saved', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save ordering links', color: 'error' })
  } finally {
    savingId.value = null
  }
}

onMounted(loadOrder)
useSeoMeta({ title: 'Order | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
