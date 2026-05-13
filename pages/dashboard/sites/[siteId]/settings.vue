<template>
  <UPage>
    <UPageHeader
      title="Site Settings"
      description="Manage your website configuration, brand, and appearance"
    />

    <UPageBody>
      <div v-if="loading" class="space-y-6">
        <USkeleton class="h-48 w-full" />
        <USkeleton class="h-56 w-full" />
        <USkeleton class="h-40 w-full" />
      </div>

      <UAlert v-else-if="error" color="error" variant="soft" icon="i-heroicons-exclamation-triangle" :description="error" />

      <div v-else-if="settings" class="space-y-0 divide-y divide-default rounded-lg border border-default">
        <!-- General -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">General</h2>
            <p class="mt-1 text-sm text-muted">Basic website configuration. Your subdomain is permanent and cannot be changed.</p>
          </div>
          <div class="space-y-5">
            <UFormField label="Site Name">
              <UInput v-model="form.name" placeholder="Your restaurant name" />
            </UFormField>
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Subdomain">
                <UInput :model-value="settings.subdomain" readonly class="opacity-50" />
              </UFormField>
              <UFormField label="URL Structure">
                <USelect
                  v-model="form.url_structure"
                  :items="urlStructureOptions"
                  value-key="value"
                  label-key="label"
                />
              </UFormField>
            </div>
            <UFormField label="Public URL">
              <div class="flex gap-2">
                <UInput :model-value="settings.public_url" readonly class="flex-1 opacity-50" />
                <UButton icon="i-heroicons-clipboard-document" variant="outline" color="neutral" aria-label="Copy URL" @click="copyToClipboard(settings.public_url)" />
              </div>
            </UFormField>
          </div>
        </div>

        <!-- Brand -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Brand</h2>
            <p class="mt-1 text-sm text-muted">Your restaurant's identity. This name and description appear on your public website and in search results.</p>
          </div>
          <div class="space-y-5">
            <UFormField label="Restaurant Name">
              <UInput v-model="form.brand_name" placeholder="Your Restaurant Name" />
            </UFormField>
            <UFormField label="Short Description" help="Used for SEO and homepage tagline.">
              <UTextarea v-model="form.brand_description" :rows="3" placeholder="Authentic dining experience in your city" />
            </UFormField>
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Logo URL">
                <UInput v-model="form.logo_url" type="url" placeholder="https://example.com/logo.png" />
              </UFormField>
              <UFormField label="Contact Email">
                <UInput v-model="form.contact_email" type="email" placeholder="contact@yourrestaurant.com" />
              </UFormField>
            </div>
          </div>
        </div>

        <!-- Appearance -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Appearance</h2>
            <p class="mt-1 text-sm text-muted">Control your site's color scheme. The brand color is applied to buttons, links, and accent elements.</p>
          </div>
          <div class="space-y-5">
            <UFormField label="Brand Color" help="Primary color used for buttons and accents.">
              <div class="flex items-center gap-3">
                <UInput v-model="form.brand_color" type="color" class="h-9 w-16 cursor-pointer p-1" />
                <UInput v-model="form.brand_color" placeholder="#e87f67" class="w-32 font-mono text-sm" />
              </div>
            </UFormField>
            <UFormField label="Theme">
              <UInput :model-value="settings.theme" readonly class="opacity-50" />
              <template #help>More themes coming soon.</template>
            </UFormField>
          </div>
        </div>

        <!-- Notifications -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Notifications</h2>
            <p class="mt-1 text-sm text-muted">
              Connect WhatsApp to receive alerts when content is published, new reviews come in, or your AI assistant completes a task.
            </p>
          </div>
          <div class="space-y-5">
            <UFormField
              label="WhatsApp number"
              help="Enter your WhatsApp number with country code. KrabiClaw will send you notifications here."
            >
              <div class="flex gap-2">
                <UInput
                  v-model="whatsappPhone"
                  placeholder="+1 555 000 0000"
                  class="flex-1"
                  :loading="savingWhatsapp"
                />
                <UButton
                  :loading="savingWhatsapp"
                  :disabled="!whatsappPhone.trim() || whatsappPhone === savedWhatsappPhone"
                  @click="saveWhatsappPhone"
                >
                  Save
                </UButton>
              </div>
            </UFormField>
            <div v-if="savedWhatsappPhone" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-heroicons-check-circle" class="size-4 shrink-0 text-green-500" />
              Connected: {{ savedWhatsappPhone }}
            </div>
          </div>
        </div>

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
    const response = await ($fetch as any)(`/api/sites/${siteId}/settings`, {
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

// WhatsApp notification number
const whatsappPhone = ref('')
const savedWhatsappPhone = ref<string | null>(null)
const savingWhatsapp = ref(false)

const loadWhatsappPhone = async () => {
  try {
    const res = await $fetch<any>(`/api/editor/sites/${siteId}/notifications`)
    savedWhatsappPhone.value = res.notifications?.whatsapp_phone ?? null
    whatsappPhone.value = savedWhatsappPhone.value ?? ''
  } catch {}
}

const saveWhatsappPhone = async () => {
  if (!whatsappPhone.value.trim()) return
  savingWhatsapp.value = true
  try {
    const res = await ($fetch as any)(`/api/editor/sites/${siteId}/notifications`, {
      method: 'PATCH',
      body: { whatsapp_phone: whatsappPhone.value.trim() }
    })
    savedWhatsappPhone.value = res.notifications?.whatsapp_phone ?? null
    whatsappPhone.value = savedWhatsappPhone.value ?? ''
    toast.add({ description: 'WhatsApp number saved', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to save WhatsApp number', color: 'error' })
  } finally {
    savingWhatsapp.value = false
  }
}

onMounted(() => {
  loadSettings()
  loadWhatsappPhone()
})

useSeoMeta({ title: 'Site Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
