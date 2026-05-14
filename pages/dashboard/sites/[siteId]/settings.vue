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

        <!-- General -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">General</h2>
            <p class="mt-1 text-sm text-muted">Basic website configuration. Changing the restaurant name updates your URL.</p>
          </div>
          <div class="space-y-5">
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Subdomain">
                <UInput :model-value="previewSubdomain" readonly class="opacity-50 font-mono" />
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
            <UFormField label="Menu Currency">
              <USelect
                v-model="form.default_currency"
                :items="currencyOptions"
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
          </div>
        </div>

        <!-- Domain -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Domain</h2>
            <p class="mt-1 text-sm text-muted">Use your own web address, like restaurant.com.</p>
          </div>
          <div class="space-y-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm text-default">Your KrabiClaw address stays live. Add your own domain when you want guests to use it.</p>
                <p class="mt-1 text-xs text-muted">We set up both restaurant.com and www.restaurant.com automatically.</p>
              </div>
              <UButton icon="i-heroicons-plus" class="justify-center" @click="openAddDomainModal">
                Add domain
              </UButton>
            </div>

            <UAlert
              v-if="domainError && !showAddDomainModal"
              color="error"
              variant="soft"
              icon="i-heroicons-exclamation-triangle"
              :description="domainError"
            />

            <div v-if="domainsLoading" class="space-y-3">
              <USkeleton class="h-24 w-full" />
              <USkeleton class="h-24 w-full" />
            </div>

            <div v-else-if="domains.length === 0" class="rounded-lg border border-dashed border-default p-5 text-sm text-muted">
              Your KrabiClaw address is live. Add your own domain when you are ready.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="domain in domains"
                :key="domain.id"
                class="rounded-lg border border-default p-4"
              >
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div class="flex min-w-0 gap-3">
                    <div
                      class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                      :class="domain.status === 'active' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'"
                    >
                      <UIcon :name="domain.status === 'active' ? 'i-heroicons-check' : 'i-heroicons-clock'" class="size-4" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="break-all font-medium text-highlighted">{{ domain.domain }}</p>
                        <UBadge v-if="domain.role === 'canonical'" color="primary" variant="soft">Primary</UBadge>
                        <UBadge v-if="domain.type === 'subdomain'" color="neutral" variant="soft">KrabiClaw address</UBadge>
                      </div>
                      <p class="mt-1 text-sm text-muted">{{ domainStatusText(domain) }}</p>
                      <p v-if="domain.error_message" class="mt-1 text-xs text-error">{{ domain.error_message }}</p>
                    </div>
                  </div>
                  <div class="flex shrink-0 flex-wrap gap-2">
                    <UButton v-if="domain.type === 'custom'" size="sm" variant="soft" color="neutral" icon="i-heroicons-arrow-path" :loading="syncingDomainId === domain.id" @click="syncDomain(domain.id)">Check status</UButton>
                    <UButton v-if="domain.status === 'active' && domain.role !== 'canonical'" size="sm" variant="soft" color="neutral" icon="i-heroicons-star" @click="setPrimaryDomain(domain.id)">Make primary</UButton>
                    <UButton v-if="domain.type === 'custom'" size="sm" variant="ghost" color="neutral" icon="i-heroicons-no-symbol" @click="disableDomain(domain.id)">Disable</UButton>
                    <UButton v-if="domain.type === 'custom'" size="sm" variant="ghost" color="error" icon="i-heroicons-trash" @click="deleteDomain(domain.id)">Delete</UButton>
                  </div>
                </div>

                <div v-if="domainNeedsSetup(domain)" class="mt-4 rounded-lg bg-muted p-4">
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p class="text-sm font-medium text-highlighted">Finish setup at your domain provider</p>
                      <p class="mt-1 text-sm text-muted">Open the place where you bought your domain and add this record.</p>
                    </div>
                    <p v-if="domain.last_synced_at" class="text-xs text-muted">Last checked {{ formatDateTime(domain.last_synced_at) }}</p>
                  </div>
                  <div class="mt-4 grid gap-3 sm:grid-cols-3">
                    <div class="rounded-md border border-default bg-default p-3">
                      <p class="text-xs font-medium uppercase text-muted">Type</p>
                      <p class="mt-1 text-sm text-default">{{ domain.instructions.dns.type }}</p>
                    </div>
                    <div class="rounded-md border border-default bg-default p-3">
                      <p class="text-xs font-medium uppercase text-muted">Name</p>
                      <p class="mt-1 break-all font-mono text-sm text-default">{{ domain.instructions.dns.name }}</p>
                    </div>
                    <div class="rounded-md border border-default bg-default p-3">
                      <p class="text-xs font-medium uppercase text-muted">Points to</p>
                      <p class="mt-1 break-all font-mono text-sm text-default">{{ domain.instructions.dns.value }}</p>
                    </div>
                  </div>
                  <p class="mt-3 text-xs text-muted">After saving that record, come back and choose Check status.</p>
                </div>
              </div>
            </div>
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

    <UModal v-model:open="showAddDomainModal" :ui="{ content: 'max-w-xl' }">
      <template #content>
        <form class="p-6" @submit.prevent="addDomain">
          <div class="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-highlighted">Add domain</h2>
              <p class="mt-2 text-sm leading-6 text-muted">
                Enter the domain guests should use for your restaurant website. We will also set up the www version automatically.
              </p>
            </div>
            <UButton icon="i-heroicons-x-mark" color="neutral" variant="ghost" size="sm" aria-label="Close modal" @click="closeAddDomainModal" />
          </div>

          <UFormField label="Domain">
            <UInput
              v-model="domainForm.domain"
              icon="i-heroicons-globe-alt"
              placeholder="restaurant.com"
              :disabled="addingDomain"
              autofocus
              size="xl"
            />
          </UFormField>

          <UAlert
            v-if="domainError"
            class="mt-4"
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :description="domainError"
          />

          <div class="mt-6 flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="addingDomain" @click="closeAddDomainModal">Cancel</UButton>
            <UButton type="submit" icon="i-heroicons-plus" :loading="addingDomain" :disabled="!domainForm.domain.trim()">
              Add domain
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const siteId = route.params.siteId as string
const toast = useToast()

const urlStructureOptions = [
  { label: 'Location subdirectories', value: 'location_subdirectories' },
  { label: 'Brand pages only', value: 'brand_pages' }
]

const currencyOptions = [
  { label: 'Thai Baht (THB)', value: 'THB' },
  { label: 'US Dollar (USD)', value: 'USD' },
  { label: 'Euro (EUR)', value: 'EUR' },
  { label: 'British Pound (GBP)', value: 'GBP' },
  { label: 'Japanese Yen (JPY)', value: 'JPY' },
  { label: 'Australian Dollar (AUD)', value: 'AUD' },
  { label: 'Canadian Dollar (CAD)', value: 'CAD' },
  { label: 'Singapore Dollar (SGD)', value: 'SGD' },
  { label: 'Hong Kong Dollar (HKD)', value: 'HKD' },
  { label: 'Malaysian Ringgit (MYR)', value: 'MYR' },
  { label: 'Indonesian Rupiah (IDR)', value: 'IDR' },
  { label: 'Philippine Peso (PHP)', value: 'PHP' },
  { label: 'Vietnamese Dong (VND)', value: 'VND' },
  { label: 'Indian Rupee (INR)', value: 'INR' }
]

const loading = ref(true)
const error = ref<string | null>(null)
const saving = ref(false)
const settings = ref<ApiRecord | null>(null)
const domains = ref<ApiRecord[]>([])
const domainsLoading = ref(false)
const addingDomain = ref(false)
const syncingDomainId = ref<string | null>(null)
const domainError = ref('')
const showAddDomainModal = ref(false)
const domainForm = reactive({
  domain: ''
})

const form = reactive({
  brand_name: '',
  brand_description: '',
  logo_url: '',
  contact_email: '',
  brand_color: '',
  default_currency: 'THB',
  primary_location_id: null as string | null,
  url_structure: 'location_subdirectories'
} as {
  brand_name: string
  brand_description: string
  logo_url: string
  contact_email: string
  brand_color: string
  default_currency: string
  primary_location_id: string | null
  url_structure: string
})

const toSubdomainSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30)

const previewSubdomain = computed(() => {
  const slug = toSubdomainSlug(form.brand_name)
  return slug || (settings.value?.subdomain ?? '')
})

const isDirty = computed(() => {
  if (!settings.value) return false
  return (
    form.brand_name !== settings.value.brand_name ||
    form.brand_description !== settings.value.brand_description ||
    form.logo_url !== settings.value.logo_url ||
    form.contact_email !== settings.value.contact_email ||
    form.brand_color !== (settings.value.brand_color || '') ||
    form.default_currency !== (settings.value.default_currency || 'THB') ||
    form.url_structure !== settings.value.url_structure
  )
})

const loadSettings = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch<ApiRecord>(`/api/sites/${siteId}/settings`)
    if (!response.success) throw new Error('Failed to load settings')
    settings.value = response.settings
    resetForm()
    await loadDomains()
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
    const response = await $fetch<ApiRecord>(`/api/sites/${siteId}/settings`, {
      method: 'PATCH',
      body: { ...form }
    })

    if (!response.success) throw new Error('Failed to save settings')
    settings.value = response.settings
    resetForm()
    await loadDomains()
    const siteRefresh = useState<number>('site:refresh', () => 0)
    siteRefresh.value++
    toast.add({ description: 'Settings saved', color: 'success' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

const resetForm = () => {
  if (!settings.value) return
  form.brand_name = settings.value.brand_name || ''
  form.brand_description = settings.value.brand_description || ''
  form.logo_url = settings.value.logo_url || ''
  form.contact_email = settings.value.contact_email || ''
  form.brand_color = (settings.value as ApiValue).brand_color || ''
  form.default_currency = ((settings.value as ApiValue).default_currency as string | undefined) || 'THB'
  form.primary_location_id = settings.value.primary_location_id || null
  form.url_structure = settings.value.url_structure || 'location_subdirectories'
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ description: 'URL copied', color: 'success' })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to copy to clipboard:', error.message)
    toast.add({ description: 'Failed to copy URL', color: 'error' })
  }
}

const loadDomains = async () => {
  domainsLoading.value = true
  domainError.value = ''
  try {
    const response = await $fetch<ApiRecord>(`/api/sites/${siteId}/domains`)
    domains.value = response.domains || []
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : (err && typeof err === 'object' && 'data' in err && typeof err.data === 'object' && err.data && 'error' in err.data && typeof err.data.error === 'string') ? err.data.error : 'Failed to load domains'
    domainError.value = errorMessage
  } finally {
    domainsLoading.value = false
  }
}

const openAddDomainModal = () => {
  domainError.value = ''
  showAddDomainModal.value = true
}

const closeAddDomainModal = () => {
  if (addingDomain.value) return
  showAddDomainModal.value = false
  domainError.value = ''
}

const addDomain = async () => {
  if (!domainForm.domain.trim()) return
  addingDomain.value = true
  domainError.value = ''
  try {
    await $fetch(`/api/sites/${siteId}/domains`, {
      method: 'POST',
      body: { domain: domainForm.domain.trim(), include_www: true }
    })
    domainForm.domain = ''
    showAddDomainModal.value = false
    toast.add({ description: 'Domain added', color: 'success' })
    await loadDomains()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : (err && typeof err === 'object' && 'data' in err && typeof err.data === 'object' && err.data && 'error' in err.data && typeof err.data.error === 'string') ? err.data.error : 'Failed to add domain'
    domainError.value = errorMessage
  } finally {
    addingDomain.value = false
  }
}

const syncDomain = async (domainId: string) => {
  syncingDomainId.value = domainId
  domainError.value = ''
  try {
    await $fetch(`/api/sites/${siteId}/domains/${domainId}/sync`, { method: 'POST' })
    toast.add({ description: 'Domain synced', color: 'success' })
    await loadDomains()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : (err && typeof err === 'object' && 'data' in err && typeof err.data === 'object' && err.data && 'error' in err.data && typeof err.data.error === 'string') ? err.data.error : 'Failed to sync domain'
    domainError.value = errorMessage
  } finally {
    syncingDomainId.value = null
  }
}

const setPrimaryDomain = async (domainId: string) => {
  await $fetch(`/api/sites/${siteId}/domains/${domainId}`, {
    method: 'PATCH',
    body: { role: 'canonical' }
  })
  toast.add({ description: 'Primary domain updated', color: 'success' })
  await Promise.all([loadDomains(), loadSettings()])
}

const disableDomain = async (domainId: string) => {
  await $fetch(`/api/sites/${siteId}/domains/${domainId}`, {
    method: 'PATCH',
    body: { status: 'disabled' }
  })
  toast.add({ description: 'Domain disabled', color: 'success' })
  await loadDomains()
}

const deleteDomain = async (domainId: string) => {
  await $fetch(`/api/sites/${siteId}/domains/${domainId}`, { method: 'DELETE' })
  toast.add({ description: 'Domain deleted', color: 'success' })
  await Promise.all([loadDomains(), loadSettings()])
}

const domainStatusText = (domain: ApiRecord) => {
  if (domain.type === 'subdomain') return 'Your built-in KrabiClaw address is live.'
  if (domain.status === 'active') return 'Ready. Guests can use this domain.'
  if (domain.status === 'disabled') return 'Disabled. Guests are not being sent here.'
  if (domain.status === 'failed' || domain.status === 'blocked') return 'Needs attention. Check the setup details below.'
  return 'Waiting for the domain settings to update.'
}

const domainNeedsSetup = (domain: ApiRecord) => {
  return domain.type === 'custom' && domain.status !== 'active' && domain.status !== 'disabled' && domain.instructions?.dns
}

const formatDateTime = (value: string | null) => {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return date.toLocaleString()
}

// WhatsApp notification number
const whatsappPhone = ref('')
const savedWhatsappPhone = ref<string | null>(null)
const savingWhatsapp = ref(false)

const loadWhatsappPhone = async () => {
  try {
    const res = await $fetch<ApiRecord>(`/api/editor/sites/${siteId}/notifications`)
    savedWhatsappPhone.value = res.notifications?.whatsapp_phone ?? null
    whatsappPhone.value = savedWhatsappPhone.value ?? ''
  } catch {
    // WhatsApp notification settings are optional until configured.
  }
}

const saveWhatsappPhone = async () => {
  if (!whatsappPhone.value.trim()) return
  savingWhatsapp.value = true
  try {
    const res = await $fetch<ApiRecord>(`/api/editor/sites/${siteId}/notifications`, {
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
