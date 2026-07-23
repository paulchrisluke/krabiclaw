<template>
  <UDashboardPanel id="site-professional-services">
    <template #header>
      <UDashboardNavbar title="Professional services">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-8">
        <section class="space-y-4">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">Services / practice areas</h2>
              <p class="mt-1 text-sm text-muted">Edit the published offerings used on Services, Home, About, pricing, and structured data.</p>
            </div>
            <UButton :loading="savingOfferings" :disabled="pending || !offeringsForm.length" @click="saveOfferings">Save offerings</UButton>
          </div>

          <div v-if="pending" class="grid gap-3 lg:grid-cols-2">
            <USkeleton v-for="index in 2" :key="index" class="h-72 rounded-lg" />
          </div>
          <div v-else-if="offeringsForm.length" class="grid gap-3 lg:grid-cols-2">
            <UCard v-for="offering in offeringsForm" :key="offering.id">
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h3 class="font-semibold text-highlighted">{{ offering.name || 'Untitled service' }}</h3>
                  <USwitch v-model="offering.featured" label="Featured" />
                </div>
              </template>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Name"><UInput v-model="offering.name" /></UFormField>
                <UFormField label="Slug"><UInput v-model="offering.slug" /></UFormField>
                <UFormField label="Label"><UInput v-model="offering.label" /></UFormField>
                <UFormField label="Status">
                  <USelect v-model="offering.status" :items="statusOptions" />
                </UFormField>
                <UFormField class="sm:col-span-2" label="Summary"><UTextarea v-model="offering.summary" :rows="3" autoresize :maxrows="6" /></UFormField>
                <UFormField class="sm:col-span-2" label="Short description"><UTextarea v-model="offering.short_description" :rows="3" autoresize :maxrows="8" /></UFormField>
                <UFormField class="sm:col-span-2" label="Body"><UTextarea v-model="offering.body" :rows="7" autoresize :maxrows="14" /></UFormField>
                <UFormField label="CTA label"><UInput v-model="offering.cta_label" /></UFormField>
                <UFormField label="CTA URL"><UInput v-model="offering.cta_url" /></UFormField>
                <UFormField label="Canonical path"><UInput v-model="offering.canonical_path" /></UFormField>
                <UFormField label="Sort order"><UInput v-model.number="offering.sort_order" type="number" /></UFormField>
                <UFormField class="sm:col-span-2" label="SEO title"><UInput v-model="offering.seo_title" /></UFormField>
                <UFormField class="sm:col-span-2" label="SEO description"><UTextarea v-model="offering.seo_description" :rows="3" autoresize :maxrows="6" /></UFormField>
              </div>
            </UCard>
          </div>
          <UAlert v-else color="neutral" variant="soft" title="No services yet" description="Add services through ChowBot or MCP, then refine them here." />
        </section>

        <section class="space-y-4">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">Policies & notices</h2>
              <p class="mt-1 text-sm text-muted">Edit the tenant policy and notice pages backed by tenant_pages.</p>
            </div>
            <UButton :loading="savingPages" :disabled="pending || !policyPageForms.length" @click="saveTenantPages">Save pages</UButton>
          </div>

          <div v-if="pending" class="grid gap-3 lg:grid-cols-2">
            <USkeleton v-for="index in 2" :key="index" class="h-64 rounded-lg" />
          </div>
          <div v-else-if="policyPageForms.length" class="grid gap-3 lg:grid-cols-2">
            <UCard v-for="page in policyPageForms" :key="page.id">
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h3 class="font-semibold text-highlighted">{{ page.title || page.path }}</h3>
                  <UBadge color="neutral" variant="subtle">{{ page.path }}</UBadge>
                </div>
              </template>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Title"><UInput v-model="page.title" /></UFormField>
                <UFormField label="Status">
                  <USelect v-model="page.status" :items="statusOptions" />
                </UFormField>
                <UFormField class="sm:col-span-2" label="Summary"><UTextarea v-model="page.summary" :rows="3" autoresize :maxrows="6" /></UFormField>
                <UFormField class="sm:col-span-2" label="Body"><UTextarea v-model="page.body" :rows="10" autoresize :maxrows="18" /></UFormField>
                <UFormField label="CTA label"><UInput v-model="page.cta_label" /></UFormField>
                <UFormField label="CTA URL"><UInput v-model="page.cta_url" /></UFormField>
                <UFormField class="sm:col-span-2" label="SEO title"><UInput v-model="page.seo_title" /></UFormField>
                <UFormField class="sm:col-span-2" label="SEO description"><UTextarea v-model="page.seo_description" :rows="3" autoresize :maxrows="6" /></UFormField>
                <UFormField class="sm:col-span-2" label="Robots"><UInput v-model="page.robots" /></UFormField>
              </div>
            </UCard>
          </div>
          <UAlert v-else color="neutral" variant="soft" title="No policy pages" description="No supported policy or notice pages are present for this site." />
        </section>

        <section class="space-y-4">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">Compliance & consultation</h2>
              <p class="mt-1 text-sm text-muted">Manage organization identity, schema.org data, and the consultation call to action.</p>
            </div>
            <UButton :loading="savingCompliance" :disabled="pending" @click="saveCompliance">Save organization data</UButton>
          </div>

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
              <UFormField label="Consultation CTA"><UInput v-model="consultationForm.cta_label" /></UFormField>
              <UFormField label="Consultation URL"><UInput v-model="consultationForm.external_url" type="url" /></UFormField>
              <UFormField label="Schedule path"><UInput v-model="consultationForm.schedule_path" /></UFormField>
              <UFormField label="Confirmation path"><UInput v-model="consultationForm.confirmation_path" /></UFormField>
              <UFormField class="md:col-span-2" label="Footer disclaimer"><UTextarea v-model="form.footer_disclaimer" :rows="5" /></UFormField>
            </div>
          </UCard>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.services' })
useSeoMeta({ title: 'Professional services | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

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

interface ConsultationRecord extends Record<string, unknown> {
  id?: string | null
  mode?: 'external_url' | 'native_disabled'
  cta_label?: string | null
  external_url?: string | null
  schedule_path?: string | null
  confirmation_path?: string | null
  tracking_enabled?: boolean
  metadata?: Record<string, unknown>
}

interface OfferingForm extends Record<string, unknown> {
  id: string
  name: string
  slug: string
  label: string
  summary: string
  short_description: string
  body: string
  cta_label: string
  cta_url: string
  canonical_path: string
  status: string
  sort_order: number
  featured: boolean
  seo_title: string
  seo_description: string
}

interface TenantPageForm extends Record<string, unknown> {
  id: string
  path: string
  title: string
  slug: string
  page_type: string
  summary: string
  body: string
  cta_label: string
  cta_url: string
  seo_title: string
  seo_description: string
  canonical_url: string
  robots: string
  status: string
  sort_order: number
  components: ApiRecord[]
}

type ProfessionalServiceEditorResponse = {
  success?: boolean
  offerings: ApiRecord[]
  tenantPages: ApiRecord[]
  compliance: ComplianceRecord | null
  consultation: ConsultationRecord | null
}

const siteId = await useDashboardSiteId()
const headers = buildDashboardRequestHeaders()
const requestEvent = useRequestEvent()
const toast = useToast()
const savingOfferings = ref(false)
const savingPages = ref(false)
const savingCompliance = ref(false)
const statusOptions = ['published', 'draft', 'archived'].map(value => ({ label: value, value }))
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
  async (): Promise<ProfessionalServiceEditorResponse> => {
    if (import.meta.server) {
      if (!requestEvent) {
        throw createError({ statusCode: 500, statusMessage: 'Request event not available' })
      }
      const [
        { cloudflareEnv },
        { getAuthSession },
        { loadMemberSiteRow },
        { assertSiteWideAccess },
        { getProfessionalServiceContent },
      ] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/auth'),
        import('~/server/utils/location-access'),
        import('~/server/utils/member-access'),
        import('~/server/utils/professional-services-editor'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.DB || env.db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const session = await getAuthSession(requestEvent, env)
      if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
      const site = await loadMemberSiteRow(db, siteId, session.user.id)
      if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
      await assertSiteWideAccess(db, {
        memberId: site.member_id,
        role: site.member_role,
        organizationId: site.organization_id,
        siteId,
      })
      return { success: true, ...(await getProfessionalServiceContent(db, siteId)) } as unknown as ProfessionalServiceEditorResponse
    }
    return await $fetch<ProfessionalServiceEditorResponse>(`/api/editor/sites/${siteId}/professional-services`, { headers })
  },
)

const originalCompliance = computed(() => data.value?.compliance ?? {})
const originalConsultation = computed(() => data.value?.consultation ?? {})
const offeringsForm = ref<OfferingForm[]>([])
const tenantPagesForm = ref<TenantPageForm[]>([])
const policyPagePaths = new Set(['/policies/privacy', '/policies/terms', '/third-party-notices'])
const policyPageForms = computed(() => tenantPagesForm.value.filter(page => policyPagePaths.has(page.path)))
const form = reactive({
  entity_name: '', dba_name: '', entity_type: '', nonprofit_status: '', registration_number: '',
  founder_name: '', founding_date: '', service_area: '', service_area_type: '', address_visibility: 'hidden' as 'visible' | 'hidden',
  same_as: '', contact_type: '', telephone: '', email: '', contact_url: '', footer_disclaimer: '',
})
const consultationForm = reactive({
  cta_label: '', external_url: '', schedule_path: '', confirmation_path: '',
})
const syncedOfferingsSnapshot = ref('')
const syncedPagesSnapshot = ref('')
const syncedComplianceSnapshot = ref('')

const asString = (value: unknown) => typeof value === 'string' ? value : ''
const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const nullable = (value: string) => value.trim() || null
const formSnapshot = (value: unknown) => JSON.stringify(value)

function normalizeOffering(item: ApiRecord): OfferingForm {
  return {
    ...item,
    id: asString(item.id),
    name: asString(item.name),
    slug: asString(item.slug),
    label: asString(item.label),
    summary: asString(item.summary),
    short_description: asString(item.short_description),
    body: asString(item.body),
    cta_label: asString(item.cta_label),
    cta_url: asString(item.cta_url),
    canonical_path: asString(item.canonical_path),
    status: asString(item.status) || 'published',
    sort_order: asNumber(item.sort_order),
    featured: item.featured === true || item.featured === 1,
    seo_title: asString(item.seo_title),
    seo_description: asString(item.seo_description),
  }
}

function normalizeTenantPage(item: ApiRecord): TenantPageForm {
  return {
    ...item,
    id: asString(item.id),
    path: asString(item.path),
    title: asString(item.title),
    slug: asString(item.slug),
    page_type: asString(item.page_type) || 'standard',
    summary: asString(item.summary),
    body: asString(item.body),
    cta_label: asString(item.cta_label),
    cta_url: asString(item.cta_url),
    seo_title: asString(item.seo_title),
    seo_description: asString(item.seo_description),
    canonical_url: asString(item.canonical_url),
    robots: asString(item.robots),
    status: asString(item.status) || 'published',
    sort_order: asNumber(item.sort_order),
    components: Array.isArray(item.components) ? item.components as ApiRecord[] : [],
  }
}

function complianceFormSnapshot() {
  return formSnapshot({
    form: { ...form },
    consultation: { ...consultationForm },
  })
}

function syncOfferingsFromData() {
  const normalized = (data.value?.offerings ?? []).map(normalizeOffering)
  offeringsForm.value = normalized
  syncedOfferingsSnapshot.value = formSnapshot(normalized)
}

function syncTenantPagesFromData() {
  const normalized = (data.value?.tenantPages ?? []).map(normalizeTenantPage)
  tenantPagesForm.value = normalized
  syncedPagesSnapshot.value = formSnapshot(normalized)
}

function syncComplianceFromData() {
  const compliance = data.value?.compliance
  if (compliance) {
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
  }
  const consultation = data.value?.consultation
  if (consultation) {
    Object.assign(consultationForm, {
      cta_label: consultation.cta_label ?? '',
      external_url: consultation.external_url ?? '',
      schedule_path: consultation.schedule_path ?? '/schedule',
      confirmation_path: consultation.confirmation_path ?? '/contact/confirmed',
    })
  }
  syncedComplianceSnapshot.value = complianceFormSnapshot()
}

const offeringsDirty = computed(() => formSnapshot(offeringsForm.value) !== syncedOfferingsSnapshot.value)
const pagesDirty = computed(() => formSnapshot(tenantPagesForm.value) !== syncedPagesSnapshot.value)
const complianceDirty = computed(() => complianceFormSnapshot() !== syncedComplianceSnapshot.value)

watch(() => data.value, () => {
  if (!syncedOfferingsSnapshot.value || !offeringsDirty.value) syncOfferingsFromData()
  if (!syncedPagesSnapshot.value || !pagesDirty.value) syncTenantPagesFromData()
  if (!syncedComplianceSnapshot.value || !complianceDirty.value) syncComplianceFromData()
}, {
  immediate: true,
})

async function patchProfessionalServiceContent(body: ApiRecord, successMessage: string) {
  await $fetch(`/api/editor/sites/${siteId}/professional-services`, {
    method: 'PATCH',
    headers,
    body,
  })
  toast.add({ description: successMessage, color: 'success' })
}

async function saveOfferings() {
  savingOfferings.value = true
  try {
    await patchProfessionalServiceContent({ offerings: offeringsForm.value }, 'Offerings saved')
    await refresh()
    syncOfferingsFromData()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Unable to save offerings', color: 'error' })
  } finally {
    savingOfferings.value = false
  }
}

async function saveTenantPages() {
  savingPages.value = true
  try {
    await patchProfessionalServiceContent({ tenantPages: policyPageForms.value }, 'Policy pages saved')
    await refresh()
    syncTenantPagesFromData()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Unable to save policy pages', color: 'error' })
  } finally {
    savingPages.value = false
  }
}

async function saveCompliance() {
  savingCompliance.value = true
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
    const consultation: ConsultationRecord = {
      ...originalConsultation.value,
      mode: 'external_url',
      cta_label: nullable(consultationForm.cta_label) || 'Book a consultation',
      external_url: nullable(consultationForm.external_url),
      schedule_path: nullable(consultationForm.schedule_path) || '/schedule',
      confirmation_path: nullable(consultationForm.confirmation_path) || '/contact/confirmed',
    }
    await patchProfessionalServiceContent({ compliance, consultation }, 'Organization data saved')
    await refresh()
    syncComplianceFromData()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Unable to save organization data', color: 'error' })
  } finally {
    savingCompliance.value = false
  }
}
</script>
