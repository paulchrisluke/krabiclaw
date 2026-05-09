<template>
  <UPage>
    <UPageHeader
      title="Site Settings"
      description="Manage your website configuration, brand, and appearance"
    />

    <UPageBody>
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="flex items-center gap-3 text-sm text-[var(--ui-text-muted)]">
          <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
          Loading settings...
        </div>
      </div>

      <UAlert v-else-if="error" color="error" variant="soft" icon="i-heroicons-exclamation-triangle" :description="error" />

      <div v-else-if="settings" class="space-y-6">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-[var(--ui-text-highlighted)]">General</h2>
          </template>
          <div class="grid gap-6 md:grid-cols-2">
            <UFormField label="Site Name">
              <UInput v-model="form.name" placeholder="Your restaurant name" />
            </UFormField>

            <UFormField label="Subdomain" help="Subdomain cannot be changed after creation.">
              <UInput :model-value="settings.subdomain" readonly class="opacity-50" />
            </UFormField>

            <UFormField label="Theme" help="Saya theme is currently the only option.">
              <UInput :model-value="settings.theme" readonly class="opacity-50" />
            </UFormField>

            <UFormField label="URL Structure">
              <USelect
                v-model="form.url_structure"
                :items="urlStructureOptions"
                value-key="value"
                label-key="label"
              />
            </UFormField>

            <UFormField label="Public URL">
              <div class="flex gap-2">
                <UInput :model-value="settings.public_url" readonly class="flex-1 opacity-50" />
                <UButton icon="i-heroicons-clipboard-document" variant="outline" color="neutral" aria-label="Copy URL" @click="copyToClipboard(settings.public_url)" />
              </div>
            </UFormField>

            <div>
              <p class="mb-2 block text-sm font-medium text-[var(--ui-text)]">Status</p>
              <UBadge :color="settings.status === 'active' ? 'success' : 'warning'" variant="soft">
                {{ settings.status }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Brand</h2>
          </template>
          <div class="space-y-6">
            <UFormField label="Restaurant/Brand Name" help="Displayed prominently on your website.">
              <UInput v-model="form.brand_name" placeholder="Your Restaurant Name" />
            </UFormField>

            <UFormField label="Short Description" help="Used for SEO and homepage content.">
              <UTextarea v-model="form.brand_description" :rows="3" placeholder="Authentic dining experience in your city" />
            </UFormField>

            <div class="grid gap-6 md:grid-cols-2">
              <UFormField label="Logo URL">
                <UInput v-model="form.logo_url" type="url" placeholder="https://example.com/logo.png" />
              </UFormField>

              <UFormField label="Contact Email">
                <UInput v-model="form.contact_email" type="email" placeholder="contact@yourrestaurant.com" />
              </UFormField>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Appearance</h2>
          </template>
          <div class="space-y-6">
            <UFormField label="Theme" help="Saya theme is currently the only option. More themes coming soon.">
              <UInput :model-value="settings.theme" readonly class="opacity-50" />
            </UFormField>

            <UFormField label="Brand Color" help="Primary color used for buttons and accents on your site.">
              <div class="flex items-center gap-3">
                <input type="color" v-model="form.brand_color" class="h-9 w-16 cursor-pointer rounded border border-[var(--ui-border)]" />
                <UInput v-model="form.brand_color" placeholder="#e87f67" class="w-32 font-mono text-sm" />
              </div>
            </UFormField>
          </div>
        </UCard>

        <StickySaveBar
          :visible="isDirty"
          :saving="saving"
          @save="saveSettings"
          @reset="resetForm"
        />
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const siteId = route.params.siteId as string
const toast = useToast()

const urlStructureOptions = [
  { label: 'Location subdirectories', value: 'location_subdirectories' },
  { label: 'Brand pages only', value: 'brand_pages' }
]

const loading = ref(true)
const error = ref<string | null>(null)
const saving = ref(false)
const settings = ref<any>(null)

const form = reactive({
  name: '',
  brand_name: '',
  brand_description: '',
  logo_url: '',
  contact_email: '',
  brand_color: '',
  primary_location_id: null as string | null,
  url_structure: 'location_subdirectories'
} as {
  name: string
  brand_name: string
  brand_description: string
  logo_url: string
  contact_email: string
  brand_color: string
  primary_location_id: string | null
  url_structure: string
})

const isDirty = computed(() => {
  if (!settings.value) return false
  return (
    form.name !== settings.value.name ||
    form.brand_name !== settings.value.brand_name ||
    form.brand_description !== settings.value.brand_description ||
    form.logo_url !== settings.value.logo_url ||
    form.contact_email !== settings.value.contact_email ||
    form.brand_color !== (settings.value.brand_color || '') ||
    form.url_structure !== settings.value.url_structure
  )
})

const loadSettings = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch<any>(`/api/sites/${siteId}/settings`)
    if (!response.success) throw new Error('Failed to load settings')
    settings.value = response.settings
    resetForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  saving.value = true
  error.value = null

  try {
    const response = await $fetch<any>(`/api/sites/${siteId}/settings`, {
      method: 'PATCH',
      body: { ...form }
    })

    if (!response.success) throw new Error('Failed to save settings')
    settings.value = response.settings
    toast.add({ description: 'Settings saved', color: 'success' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

const resetForm = () => {
  if (!settings.value) return
  form.name = settings.value.name || ''
  form.brand_name = settings.value.brand_name || ''
  form.brand_description = settings.value.brand_description || ''
  form.logo_url = settings.value.logo_url || ''
  form.contact_email = settings.value.contact_email || ''
  form.brand_color = (settings.value as any).brand_color || ''
  form.primary_location_id = settings.value.primary_location_id || null
  form.url_structure = settings.value.url_structure || 'location_subdirectories'
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ description: 'URL copied', color: 'success' })
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
    toast.add({ description: 'Failed to copy URL', color: 'error' })
  }
}

onMounted(() => {
  loadSettings()
})

useSeoMeta({ title: 'Site Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
