<template>
  <UDashboardPanel id="site-professional-services">
    <template #header>
      <UDashboardNavbar title="Organization and search data">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-6 text-sm text-muted">Manage the canonical organization details used by Blawby pages, ChowBot, MCP, and structured data.</p>

      <UCard>
        <div v-if="pending" class="space-y-4">
          <USkeleton class="h-10" />
          <USkeleton class="h-10" />
          <USkeleton class="h-28" />
        </div>
        <div v-else class="grid gap-5 md:grid-cols-2">
          <UFormField label="Legal entity name"><UInput v-model="form.entity_name" /></UFormField>
          <UFormField label="DBA name"><UInput v-model="form.dba_name" /></UFormField>
          <UFormField label="Schema.org organization type" description="For example LegalService or AccountingService."><UInput v-model="form.entity_type" /></UFormField>
          <UFormField label="Nonprofit status" description="For example 501(c)(3) or its schema.org URL."><UInput v-model="form.nonprofit_status" /></UFormField>
          <UFormField label="Registration number"><UInput v-model="form.registration_number" /></UFormField>
          <UFormField label="Founder"><UInput v-model="form.founder_name" /></UFormField>
          <UFormField label="Founding date"><UInput v-model="form.founding_date" type="date" /></UFormField>
          <UFormField label="Service area"><UInput v-model="form.service_area" /></UFormField>
          <UFormField label="Service area type">
            <USelect v-model="form.service_area_type" :items="serviceAreaTypes" />
          </UFormField>
          <UFormField label="Public address">
            <USelect v-model="form.address_visibility" :items="addressVisibilityOptions" />
          </UFormField>
          <UFormField class="md:col-span-2" label="Social and identity profiles" description="One absolute HTTP(S) URL per line.">
            <UTextarea v-model="form.same_as" :rows="4" />
          </UFormField>
          <UFormField label="Contact type"><UInput v-model="form.contact_type" placeholder="customer service" /></UFormField>
          <UFormField label="Contact phone"><UInput v-model="form.telephone" /></UFormField>
          <UFormField label="Contact email"><UInput v-model="form.email" type="email" /></UFormField>
          <UFormField label="Contact URL"><UInput v-model="form.contact_url" type="url" /></UFormField>
          <UFormField class="md:col-span-2" label="Footer disclaimer"><UTextarea v-model="form.footer_disclaimer" :rows="5" /></UFormField>
          <div class="md:col-span-2 flex justify-end">
            <UButton :loading="saving" @click="save">Save organization data</UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Organization and search data | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

interface ComplianceRecord extends Record<string, unknown> {
  entity_name?: string | null
  dba_name?: string | null
  entity_type?: string | null
  nonprofit_status?: string | null
  registration_number?: string | null
  founder_name?: string | null
  founding_date?: string | null
  service_area?: string | null
  service_area_type?: string | null
  address_visibility?: 'visible' | 'hidden'
  same_as?: string[]
  contact_points?: Array<Record<string, unknown>>
  footer_disclaimer?: string | null
}

const siteId = await useDashboardSiteId()
const headers = buildDashboardRequestHeaders()
const toast = useToast()
const saving = ref(false)
const serviceAreaTypes = [
  { label: 'Not specified', value: '' },
  ...['AdministrativeArea', 'City', 'Country', 'Place', 'State'].map(value => ({ label: value, value })),
]
const addressVisibilityOptions = [
  { label: 'Hidden / service-area only', value: 'hidden' },
  { label: 'Show primary active location', value: 'visible' },
]

const { data, pending, refresh } = await useAsyncData(
  `professional-service-content-${siteId}`,
  () => $fetch<{ compliance: ComplianceRecord | null }>(`/api/editor/sites/${siteId}/professional-services`, { headers }),
)
const originalCompliance = computed(() => data.value?.compliance ?? {})
const form = reactive({
  entity_name: '', dba_name: '', entity_type: '', nonprofit_status: '', registration_number: '',
  founder_name: '', founding_date: '', service_area: '', service_area_type: '', address_visibility: 'hidden' as 'visible' | 'hidden',
  same_as: '', contact_type: '', telephone: '', email: '', contact_url: '', footer_disclaimer: '',
})

watchEffect(() => {
  const compliance = data.value?.compliance
  if (!compliance) return
  const contact = compliance.contact_points?.[0] ?? {}
  Object.assign(form, {
    entity_name: compliance.entity_name ?? '', dba_name: compliance.dba_name ?? '', entity_type: compliance.entity_type ?? '',
    nonprofit_status: compliance.nonprofit_status ?? '', registration_number: compliance.registration_number ?? '',
    founder_name: compliance.founder_name ?? '', founding_date: compliance.founding_date ?? '', service_area: compliance.service_area ?? '',
    service_area_type: compliance.service_area_type ?? '', address_visibility: compliance.address_visibility ?? 'hidden',
    same_as: (compliance.same_as ?? []).join('\n'), contact_type: String(contact.contact_type ?? ''),
    telephone: String(contact.telephone ?? ''), email: String(contact.email ?? ''), contact_url: String(contact.url ?? ''),
    footer_disclaimer: compliance.footer_disclaimer ?? '',
  })
})

const nullable = (value: string) => value.trim() || null

async function save() {
  saving.value = true
  try {
    const contact = {
      contact_type: nullable(form.contact_type), telephone: nullable(form.telephone), email: nullable(form.email),
      area_served: nullable(form.service_area), available_language: null, url: nullable(form.contact_url),
    }
    const existingContacts = originalCompliance.value.contact_points ?? []
    const contactPoints = contact.telephone || contact.email || contact.url
      ? [{ ...(existingContacts[0] ?? {}), ...contact }, ...existingContacts.slice(1)]
      : existingContacts.slice(1)
    const compliance: ComplianceRecord = {
      ...originalCompliance.value,
      entity_name: nullable(form.entity_name), dba_name: nullable(form.dba_name), entity_type: nullable(form.entity_type),
      nonprofit_status: nullable(form.nonprofit_status), registration_number: nullable(form.registration_number),
      founder_name: nullable(form.founder_name), founding_date: nullable(form.founding_date), service_area: nullable(form.service_area),
      service_area_type: nullable(form.service_area_type), address_visibility: form.address_visibility,
      same_as: form.same_as.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
      contact_points: contactPoints,
      footer_disclaimer: nullable(form.footer_disclaimer),
    }
    // The shared PATCH route (server/utils/professional-services-editor.ts)
    // returns write counts, not the saved record — refetch through the same
    // GET route MCP/ChowBot read from, so the form reflects the canonical
    // persisted state rather than assuming the PATCH response shape.
    await $fetch(`/api/editor/sites/${siteId}/professional-services`, {
      method: 'PATCH', body: { compliance },
    })
    await refresh()
    toast.add({ description: 'Organization data saved', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Unable to save organization data', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>
