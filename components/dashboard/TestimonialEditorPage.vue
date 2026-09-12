<template>
  <!--
    With no section open this record is the list's detail column, so it renders
    its rows and nothing else — no panel, no second pair. It becomes the index
    column only once a section is open and the list above yields.
  -->
  <div v-if="frame.mode.value === 'index'" class="space-y-6">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="errorMessage"
    />
    <div v-if="isNew" class="flex justify-end">
      <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
    </div>
    <EditorNavigationList :groups="navigationGroups" />
  </div>

  <UDashboardPanel v-else id="site-testimonial" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="isNew ? 'New testimonial' : form.author_name || 'Testimonial'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="testimonialsPath" label="Testimonials" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        :detail-title="SECTION_LABELS[openKey]"
        :dismiss-to="recordPath"
        show-actions
        :saving="saving"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        @cancel="closeDetail"
        @save="saveOpenSection"
      >
        <template #index>
          <UAlert
            v-if="errorMessage"
            class="mb-6"
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="errorMessage"
          />


          <EditorNavigationList :groups="navigationGroups" :active-item="openKey" />
        </template>

        <template #detail>
          <UFormField v-if="openKey === 'reviewer'" label="Reviewer" required>
            <UInput v-model="form.author_name" size="xl" maxlength="120" autofocus class="w-full" />
          </UFormField>

          <UFormField v-else-if="openKey === 'rating'" label="Rating" description="A whole number from 1 through 5.">
            <UInputNumber v-model="form.rating" :min="1" :max="5" :step="1" size="xl" class="w-full" />
          </UFormField>

          <UFormField v-else-if="openKey === 'title'" label="Title" description="Optional headline shown above the quote.">
            <UInput v-model="form.title" size="xl" maxlength="160" autofocus class="w-full" />
          </UFormField>

          <UFormField v-else-if="openKey === 'content'" label="Testimonial" required>
            <UTextarea v-model="form.content" :rows="10" maxlength="4000" autofocus class="w-full" />
          </UFormField>

          <div v-else-if="openKey === 'provenance'" class="space-y-6">
            <p class="text-base text-muted">Where this testimonial came from. Kept for your records, never shown publicly.</p>
            <UFormField label="Collected through">
              <USelect v-model="form.collection_method" :items="COLLECTION_METHODS" value-key="value" label-key="label" size="xl" class="w-full" />
            </UFormField>
            <UFormField label="Original date">
              <UInput v-model="form.original_review_date" type="date" size="xl" class="w-full" />
            </UFormField>
            <UFormField label="Reference" description="Email thread, intake note, or migration source.">
              <UInput v-model="form.original_reference" maxlength="500" size="xl" class="w-full" />
            </UFormField>
          </div>

          <UFormField v-else-if="openKey === 'status'" label="Status" description="Only an approved testimonial appears on the public site.">
            <USelect v-model="form.status" :items="TESTIMONIAL_STATUSES" size="xl" class="w-full" />
          </UFormField>

          <div v-else-if="openKey === 'authorization'" class="space-y-4">
            <p class="text-base text-muted">
              A testimonial is published only once you confirm the reviewer agreed to it. This is recorded against the
              testimonial and cannot be set on their behalf.
            </p>
            <UCheckbox v-model="form.publication_authorized" label="I confirm the reviewer authorized publication" />
            <p class="text-xs text-muted">Owner-entered testimonial · Not KrabiClaw verified</p>
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { getErrorMessage } from '~/utils/errors'
import {
  COLLECTION_METHODS,
  COLLECTION_METHOD_LABELS,
  TESTIMONIAL_STATUSES,
  testimonialCreateBlockers,
  isTestimonialsResponse,
  isReviewCreatedResponse,
  isReviewUpdatedResponse,
  type CollectionMethod,
  type SiteTestimonial,
  type TestimonialStatus,
} from '~/utils/testimonials'

const route = useRoute()
const toast = useToast()
const dashboardApi = useDashboardApi()

const testimonialId = computed(() => String(route.params.testimonialId ?? ''))
const testimonialsPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/testimonials`)
const recordPath = computed(() => `${testimonialsPath.value}/${testimonialId.value}`)
const frame = useEditorFrame(recordPath)

const siteId = await useDashboardSiteId()
const isNew = computed(() => testimonialId.value === 'new')

const SECTION_LABELS = {
  reviewer: 'Reviewer',
  rating: 'Rating',
  title: 'Title',
  content: 'Testimonial',
  provenance: 'Provenance',
  status: 'Status',
  authorization: 'Publication authorization',
} as const
type SectionKey = keyof typeof SECTION_LABELS

const detailKey = computed(() => frame.childSegment.value)
/** With nothing open the pane still shows the first section rather than empty space. */
const openKey = computed<SectionKey>(() => (detailKey.value ?? 'reviewer') as SectionKey)

watchEffect(() => {
  if (frame.rest.value.length > 1 || (detailKey.value && !(detailKey.value in SECTION_LABELS))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

/**
 * Rating and collection method have no server default: the endpoint refuses a
 * review without them, so the walk asks for both rather than pre-answering.
 */
function emptyDraft() {
  return {
    author_name: '',
    rating: null as number | null,
    title: '',
    content: '',
    collection_method: undefined as CollectionMethod | undefined,
    original_review_date: '',
    original_reference: '',
    publication_authorized: false,
    status: 'pending' as TestimonialStatus,
  }
}

// Keyed to the record so the draft survives the remount between sections.
const form = useState(`testimonial-draft-${siteId}-${testimonialId.value}`, emptyDraft).value

const saving = ref(false)
const errorMessage = ref('')

// An existing record is read from the same list endpoint the index uses, so
// opening a row costs no request the list has not already made.
const { data, refresh } = await useAsyncData(
  () => `dashboard-testimonial-${siteId}-${testimonialId.value}`,
  async () => isNew.value
    ? null
    : await dashboardApi<{ reviews: SiteTestimonial[] }>(`/api/editor/sites/${siteId}/reviews`, { validate: isTestimonialsResponse }),
  { server: false, watch: [testimonialId] },
)

const record = computed(() => data.value?.reviews.find(row => row.id === testimonialId.value) ?? null)

function loadForm(row: SiteTestimonial) {
  Object.assign(form, {
    author_name: row.author_name,
    rating: row.rating,
    title: row.title ?? '',
    content: row.content,
    collection_method: row.collection_method,
    original_review_date: row.original_review_date ?? '',
    original_reference: row.original_reference ?? '',
    publication_authorized: row.publication_authorized,
    status: row.status,
  })
}
watch(record, (row) => { if (row) loadForm(row) }, { immediate: true })

const blockers = computed(() => testimonialCreateBlockers(form))

function summary(value: string, empty: string) {
  return value.trim() || empty
}

const navigationGroups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'testimonial',
    label: 'Testimonial',
    items: [
      { id: 'reviewer', label: 'Reviewer', summary: summary(form.author_name, 'Not named yet'), icon: 'i-lucide-user', to: `${recordPath.value}/reviewer` },
      { id: 'rating', label: 'Rating', summary: form.rating === null ? 'Not rated yet' : `${form.rating} of 5`, placeholder: form.rating === null, icon: 'i-lucide-star', to: `${recordPath.value}/rating` },
      { id: 'title', label: 'Title', summary: summary(form.title, 'Not set'), icon: 'i-lucide-type', to: `${recordPath.value}/title` },
      { id: 'content', label: 'Testimonial', summary: summary(form.content, 'Nothing written yet'), icon: 'i-lucide-quote', to: `${recordPath.value}/content` },
    ],
  },
  {
    id: 'record',
    label: 'Record',
    items: [
      { id: 'provenance', label: 'Provenance', summary: form.collection_method ? COLLECTION_METHOD_LABELS[form.collection_method] : 'Not recorded yet', placeholder: !form.collection_method, icon: 'i-lucide-file-clock', to: `${recordPath.value}/provenance` },
      { id: 'status', label: 'Status', summary: form.status, icon: 'i-lucide-eye', to: `${recordPath.value}/status` },
      { id: 'authorization', label: 'Publication authorization', summary: form.publication_authorized ? 'Confirmed' : 'Not confirmed', placeholder: !form.publication_authorized, icon: 'i-lucide-shield-check', to: `${recordPath.value}/authorization` },
    ],
  },
])

const body = computed(() => ({
  author_name: form.author_name.trim(),
  rating: form.rating,
  title: form.title.trim() || null,
  content: form.content.trim(),
  collection_method: form.collection_method ?? null,
  original_review_date: form.original_review_date || null,
  original_reference: form.original_reference.trim() || null,
  publication_authorized: form.publication_authorized,
  status: form.status,
}))

const { createActionLabel, saveLabel, saveDisabled, save: saveOpenSection, startOrCreate } = useCreateWalk({
  recordPath,
  isNew,
  openKey,
  labels: SECTION_LABELS,
  order: ['reviewer', 'content', 'rating', 'provenance', 'authorization'],
  missing: key => blockers.value.includes(key),
  noun: 'testimonial',
  saving,
  commit,
})

/**
 * A new record posts once, when nothing is outstanding. An existing one patches
 * the fields of the open section only, which is what the endpoint's partial
 * update is for — saving Rating does not rewrite the quote.
 */
const SECTION_FIELDS: Record<SectionKey, Array<keyof typeof body.value>> = {
  reviewer: ['author_name'],
  rating: ['rating'],
  title: ['title'],
  content: ['content'],
  provenance: ['collection_method', 'original_review_date', 'original_reference'],
  status: ['status'],
  authorization: ['publication_authorized'],
}

async function commit() {
  // The PATCH sends the open section's fields from the form, and the form holds
  // the row it was loaded from. With no row — a load that has not arrived or
  // that failed — it holds its own blank defaults, and saving would write those
  // over the stored testimonial.
  if (!isNew.value && !record.value) {
    errorMessage.value = 'This testimonial could not be loaded, so it cannot be saved.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    if (isNew.value) {
      const created = await dashboardApi(`/api/editor/sites/${siteId}/reviews`, {
        method: 'POST',
        body: body.value,
        validate: isReviewCreatedResponse,
      })
      Object.assign(form, emptyDraft())
      toast.add({ description: 'Testimonial created', color: 'success' })
      await navigateTo(`${testimonialsPath.value}/${created.id}`)
      return
    }
    const patch: Record<string, unknown> = {}
    for (const field of SECTION_FIELDS[openKey.value]) patch[field] = body.value[field]
    await dashboardApi(`/api/editor/sites/${siteId}/reviews/${testimonialId.value}`, {
      method: 'PATCH',
      body: patch,
      validate: isReviewUpdatedResponse,
    })
    await refresh()
    toast.add({ description: `${SECTION_LABELS[openKey.value]} saved`, color: 'success' })
    await navigateTo(recordPath.value)
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Failed to save testimonial')
  } finally {
    saving.value = false
  }
}

function closeDetail() {
  if (record.value) loadForm(record.value)
  void navigateTo(recordPath.value)
}

useSeoMeta({ title: 'Testimonial | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
