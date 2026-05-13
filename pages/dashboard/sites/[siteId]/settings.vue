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
            <h2 class="font-semibold text-highlighted">Domain</h2>
            <p class="mt-1 text-sm text-muted">Connect a custom domain with Cloudflare-managed SSL.</p>
          </div>
          <div class="space-y-5">
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
              <UInput v-model="domainForm.domain" placeholder="restaurant.com" :disabled="addingDomain" class="col-span-2 lg:col-span-1" />
              <UCheckbox v-model="domainForm.include_www" label="Add www" />
              <UButton icon="i-heroicons-plus" :loading="addingDomain" class="justify-center" @click="addDomain">Add</UButton>
            </div>

            <UAlert
              v-if="domainError"
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
              Your subdomain is live. Add a Pro custom domain when you are ready.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="domain in domains"
                :key="domain.id"
                class="rounded-lg border border-default p-4"
              >
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="break-all font-medium text-highlighted">{{ domain.domain }}</p>
                      <UBadge :color="statusColor(domain.status)" variant="soft">
                        {{ domain.status }}
                      </UBadge>
                      <UBadge v-if="domain.role === 'canonical'" color="primary" variant="soft">Primary</UBadge>
                      <UBadge v-if="domain.type === 'subdomain'" color="neutral" variant="soft">Built-in</UBadge>
                    </div>
                    <dl class="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
                      <div class="rounded-md bg-muted px-3 py-2">
                        <dt class="font-medium uppercase">Cloudflare</dt>
                        <dd class="mt-1 text-default">{{ domain.cloudflare_hostname_status || (domain.type === 'subdomain' ? 'not required' : 'pending') }}</dd>
                      </div>
                      <div class="rounded-md bg-muted px-3 py-2">
                        <dt class="font-medium uppercase">SSL</dt>
                        <dd class="mt-1 text-default">{{ domain.cloudflare_ssl_status || (domain.type === 'subdomain' ? 'platform' : 'pending') }}</dd>
                      </div>
                      <div class="rounded-md bg-muted px-3 py-2">
                        <dt class="font-medium uppercase">Last checked</dt>
                        <dd class="mt-1 text-default">{{ formatDateTime(domain.last_synced_at) }}</dd>
                      </div>
                    </dl>
                    <p v-if="domain.error_message" class="mt-2 text-xs text-error">{{ domain.error_message }}</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UButton size="xs" variant="soft" color="neutral" icon="i-heroicons-arrow-path" :loading="syncingDomainId === domain.id" @click="syncDomain(domain.id)">Sync</UButton>
                    <UButton v-if="domain.status === 'active' && domain.role !== 'canonical'" size="xs" variant="soft" color="neutral" icon="i-heroicons-star" @click="setPrimaryDomain(domain.id)">Primary</UButton>
                    <UButton v-if="domain.type === 'custom'" size="xs" variant="ghost" color="neutral" icon="i-heroicons-no-symbol" @click="disableDomain(domain.id)">Disable</UButton>
                    <UButton v-if="domain.type === 'custom'" size="xs" variant="ghost" color="red" icon="i-heroicons-trash" @click="deleteDomain(domain.id)">Delete</UButton>
                  </div>
                </div>

                <div v-if="domain.type === 'subdomain'" class="mt-4 rounded-md bg-muted p-3 text-sm text-muted">
                  This built-in KrabiClaw subdomain is already routed through the platform.
                </div>

                <div v-else-if="domain.instructions" class="mt-4 grid gap-3 text-sm xl:grid-cols-2">
                  <div class="rounded-md bg-muted p-3">
                    <p class="text-xs font-medium uppercase text-muted">DNS</p>
                    <p class="mt-2 font-mono text-xs leading-5 text-default break-all">{{ domain.instructions.dns.type }} {{ domain.instructions.dns.name }} → {{ domain.instructions.dns.value }}</p>
                  </div>
                  <div v-if="domain.instructions.ssl" class="rounded-md bg-muted p-3">
                    <p class="text-xs font-medium uppercase text-muted">SSL validation</p>
                    <p class="mt-2 font-mono text-xs leading-5 text-default break-all">{{ domain.instructions.ssl.type }} {{ domain.instructions.ssl.name }} → {{ domain.instructions.ssl.value }}</p>
                  </div>
                </div>

                <details v-if="domain.type === 'custom'" class="mt-3 text-sm">
                  <summary class="cursor-pointer text-muted">Registrar guidance and audit history</summary>
                  <div class="mt-3 space-y-3">
                    <div class="grid gap-2 md:grid-cols-2">
                      <p v-for="(guide, registrar) in domain.instructions?.registrar_guides" :key="registrar" class="rounded-md bg-muted p-3 text-xs text-default">
                        <span class="font-medium capitalize">{{ String(registrar).replace('_', ' / ') }}:</span> {{ guide }}
                      </p>
                    </div>
                    <div v-if="domain.events?.length" class="space-y-2">
                      <p v-for="event in domain.events.slice(0, 5)" :key="event.id" class="text-xs text-muted">
                        {{ formatDateTime(event.created_at) }} · {{ event.event_type }} · {{ event.message }}
                      </p>
                    </div>
                  </div>
                </details>
              </div>
            </div>
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
const domains = ref<any[]>([])
const domainsLoading = ref(false)
const addingDomain = ref(false)
const syncingDomainId = ref<string | null>(null)
const domainError = ref('')
const domainForm = reactive({
  domain: '',
  include_www: true
})

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

const loadDomains = async () => {
  domainsLoading.value = true
  domainError.value = ''
  try {
    const response = await $fetch<any>(`/api/sites/${siteId}/domains`)
    domains.value = response.domains || []
  } catch (err: any) {
    domainError.value = err.data?.error || err.message || 'Failed to load domains'
  } finally {
    domainsLoading.value = false
  }
}

const addDomain = async () => {
  if (!domainForm.domain.trim()) return
  addingDomain.value = true
  domainError.value = ''
  try {
    await $fetch(`/api/sites/${siteId}/domains`, {
      method: 'POST',
      body: { domain: domainForm.domain.trim(), include_www: domainForm.include_www }
    })
    domainForm.domain = ''
    toast.add({ description: 'Domain added', color: 'success' })
    await loadDomains()
  } catch (err: any) {
    domainError.value = err.data?.error || err.message || 'Failed to add domain'
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
  } catch (err: any) {
    domainError.value = err.data?.error || err.message || 'Failed to sync domain'
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

const statusColor = (status: string) => {
  if (status === 'active') return 'success'
  if (status === 'failed' || status === 'blocked' || status === 'deleted') return 'error'
  if (status === 'disabled') return 'neutral'
  return 'warning'
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
