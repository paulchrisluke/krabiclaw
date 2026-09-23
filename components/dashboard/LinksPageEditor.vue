<template>
  <!--
    The links page's own column: the whole screen with nothing open, the index
    column once a leaf is, and it yields both columns to a link record below
    `items`. The shell reads that from the route tree.
  -->
  <DashboardIndexPanel id="site-links" title="Links page" :auto-open="navigationGroups[0]?.items.find(item => item.to)?.to ?? null">
    <template #right>
      <UButton
        color="neutral"
        variant="ghost"
        :icon="copiedUrl ? 'i-lucide-check' : 'i-lucide-copy'"
        :disabled="!publicLinksUrl"
        @click="copyPublicUrl"
      >
        {{ copiedUrl ? 'Copied' : 'Copy URL' }}
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-external-link"
        :to="publicLinksUrl || undefined"
        target="_blank"
        :disabled="!publicLinksUrl"
      >
        Open
      </UButton>
      <DashboardResourceLocalization
        v-if="form.id"
        :organization-id="organizationId"
        resource-type="content_document"
        :resource-id="form.id"
        resource-label="links page"
        :fields="linksPageLocalizationFields"
        :load-values="loadLinksLocalization"
        :save-values="saveLinksLocalization"
        :route-path="localizedLinksPath"
        :language-settings-path="siteLocalizationSettingsPath"
      />
    </template>

    <div v-if="!editorReady" class="space-y-3">
      <USkeleton v-for="index in 5" :key="index" class="h-20 rounded-2xl" />
    </div>
    <EditorNavigationList v-else :groups="navigationGroups" :active-item="openSection" />
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { InjectionKey, Reactive, Ref } from 'vue'
import type { LinkItemStatus } from '~/server/utils/links-page'

export interface LinksPage {
  id: string
  title: string
  seo_title: string
  seo_description: string
}

export interface LinkItem {
  id: string
  label: string
  destination: string
  sort_order: number
  status: LinkItemStatus
}

/**
 * What the links page holds, for the leaves that edit one field of it each.
 * The page and its links are one document behind one endpoint, so a leaf's
 * Save sends the whole thing and the record level below `items` writes through
 * the same `persist`.
 */
export interface LinksEditor {
  form: Reactive<LinksPage>
  items: Ref<LinkItem[]>
  organizationId: string
  saving: Ref<boolean>
  errorMessage: Ref<string>
  editorReady: Ref<boolean>
  /** Sends the page and the links as they stand; returns the document as stored. */
  persist: (items: Array<Omit<LinkItem, 'id'> & { id?: string }>) => Promise<{ page: unknown; items: LinkItem[]; created_item_ids: string[] }>
  /** Saves the page and returns to it, which is what every page-level leaf does. */
  save: () => Promise<void>
  /** Puts back what was loaded, for a leaf that is cancelled. */
  revert: () => void
  loadLinksLocalization: (locale: string, linkItemId?: string) => Promise<Record<string, unknown>>
  saveLinksLocalization: (locale: string, values: Record<string, unknown>, linkItemId?: string) => Promise<void>
  siteLocalizationSettingsPath: Ref<string>
}

export const linksEditorKey = Symbol('links-editor') as InjectionKey<LinksEditor>
export const LINK_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Hidden', value: 'hidden' },
]
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'

const dashboardApi = useDashboardApi()
const route = useRoute()

interface ApiLinksPage extends Omit<LinksPage, 'seo_title' | 'seo_description'> {
  seo_title: string | null
  seo_description: string | null
}

const isLinksResponse = (
  value: unknown,
): value is { page: ApiLinksPage; items: LinkItem[] } =>
  isRecord(value)
  && isRecord(value.page)
  && typeof value.page.title === 'string'
  && Array.isArray(value.items)
  && value.items.every(item =>
    isRecord(item)
    && typeof item.id === 'string'
    && typeof item.label === 'string'
    && typeof item.destination === 'string'
    && typeof item.sort_order === 'number'
    && typeof item.status === 'string',
  )

const isLinksWriteResponse = (
  value: unknown,
): value is { page: ApiLinksPage; items: LinkItem[]; created_item_ids: string[] } =>
  isLinksResponse(value)
  && Array.isArray((value as Record<string, unknown>).created_item_ids)
  && ((value as Record<string, unknown>).created_item_ids as unknown[]).every(id => typeof id === 'string')

const organizationId = await useDashboardOrganizationId()
const dashboard = useDashboardOrganization()
const copiedUrl = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
const saving = ref(false)
const errorMessage = ref('')

const linksPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/links`)
const itemsPath = computed(() => `${linksPath.value}/items`)

const form = reactive<LinksPage>({
  id: '',
  title: '',
  seo_title: '',
  seo_description: '',
})
const items = ref<LinkItem[]>([])

const linksPageLocalizationFields = computed(() => [
  { key: 'title', label: 'Title', source: data.value?.page.title },
  { key: 'seo_title', label: 'SEO title', source: data.value?.page.seo_title },
  { key: 'seo_description', label: 'SEO description', source: data.value?.page.seo_description, multiline: true },
])
const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/settings/localization`)
function localizedLinksPath(locale: string): string {
  return `/${locale}/links`
}

const { data, pending } = await useAsyncData(
  `links-page-editor-${organizationId}`,
  () => dashboardApi<{ page: ApiLinksPage; items: LinkItem[] }>(
    `/api/editor/organizations/${organizationId}/links-page`,
    { validate: isLinksResponse },
  ),
  { server: false },
)

interface LinksTranslation {
  title: string | null
  seo_title: string | null
  seo_description: string | null
  updated_at: string
  content_blocks: Array<{ id?: string; source_block_id: string | null; type: 'cta'; data: Record<string, unknown> }>
}
const linkLocalizationStates = new Map<string, { locale: string; translation: LinksTranslation | null }>()
const linkLocalizationGenerations = new Map<string, number>()
function isLinksTranslation(value: unknown): value is { localization: LinksTranslation } {
  return isRecord(value) && isRecord(value.localization) && typeof value.localization.updated_at === 'string' && Array.isArray(value.localization.content_blocks)
}
async function loadLinksLocalization(locale: string, linkItemId?: string): Promise<Record<string, unknown>> {
  const key = linkItemId ?? form.id
  const generation = (linkLocalizationGenerations.get(key) ?? 0) + 1
  linkLocalizationGenerations.set(key, generation)
  let translation: LinksTranslation | null = null
  try {
    const response = await dashboardApi<{ localization: LinksTranslation }>(
      `/api/editor/organizations/${organizationId}/localization/content_document/${form.id}/${encodeURIComponent(locale)}`, { validate: isLinksTranslation })
    translation = response.localization
  } catch (cause) {
    if (!isRecord(cause) || cause.statusCode !== 404) throw cause
  }
  if (generation !== linkLocalizationGenerations.get(key)) return {}
  linkLocalizationStates.set(key, { locale, translation })
  if (linkItemId) return { label: translation?.content_blocks.find(block => block.source_block_id === linkItemId)?.data.label }
  return { title: translation?.title, seo_title: translation?.seo_title, seo_description: translation?.seo_description }
}
async function saveLinksLocalization(locale: string, submitted: Record<string, unknown>, linkItemId?: string): Promise<void> {
  const key = linkItemId ?? form.id
  const state = linkLocalizationStates.get(key)
  if (!state || state.locale !== locale) throw new Error('Choose the language again before saving.')
  const values = { title: state.translation?.title ?? null, seo_title: state.translation?.seo_title ?? null, seo_description: state.translation?.seo_description ?? null }
  let blocks = structuredClone(state.translation?.content_blocks ?? [])
  if (linkItemId) {
    const existing = blocks.find(block => block.source_block_id === linkItemId)
    const label = typeof submitted.label === 'string' ? submitted.label.trim() : ''
    blocks = blocks.filter(block => block.source_block_id !== linkItemId)
    if (label) blocks.push({ id: existing?.id, source_block_id: linkItemId, type: 'cta', data: { label } })
  } else {
    for (const field of ['title', 'seo_title', 'seo_description'] as const) values[field] = typeof submitted[field] === 'string' ? submitted[field] : null
  }
  const response = await dashboardApi<{ localization: LinksTranslation }>(
    `/api/editor/organizations/${organizationId}/localization/content_document/${form.id}/${encodeURIComponent(locale)}`, {
      method: 'PUT', body: { values, route_path: `/${locale}/links`, content_blocks: blocks,
        ...(state.translation ? { expected_updated_at: state.translation.updated_at } : {}) }, validate: isLinksTranslation,
    })
  linkLocalizationStates.set(key, { locale, translation: response.localization })
}

function loadForm(value: { page: ApiLinksPage; items: LinkItem[] }) {
  Object.assign(form, {
    ...value.page,
    seo_title: value.page.seo_title ?? '',
    seo_description: value.page.seo_description ?? '',
  })
  items.value = value.items
}

let openedLocalizationTarget = ''
watch(data, (value) => {
  if (!value) return
  loadForm(value)
  const target = typeof route.query.localize === 'string' ? route.query.localize : ''
  if (target.startsWith('content_block:') && target !== openedLocalizationTarget) {
    const item = value.items.find(row => target === `content_block:${row.id}`)
    if (item) {
      openedLocalizationTarget = target
      void navigateTo(`${itemsPath.value}/${item.id}`)
    }
  }
}, { immediate: true })

// `pending` is the only signal needed: the fetch is client-only, so it is true
// through SSR and the first paint and false once the rows have data.
const editorReady = computed(() => !pending.value)
const publicLinksUrl = computed(() => {
  const base = dashboard.organization.value?.public_url || ''
  return base ? `${base.replace(/\/+$/, '')}/links` : ''
})

async function copyPublicUrl() {
  if (!publicLinksUrl.value) return
  errorMessage.value = ''
  try {
    await navigator.clipboard.writeText(publicLinksUrl.value)
    copiedUrl.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedUrl.value = false
    }, 1500)
  } catch {
    errorMessage.value = 'Failed to copy to clipboard'
  }
}

/**
 * The page and its links are one document behind one endpoint, so a link's own
 * Save sends the page beside it. The response is the document as stored, which
 * is where a newly created link picks up its id.
 */
async function persist(nextItems: Array<Omit<LinkItem, 'id'> & { id?: string }>) {
  const response = await dashboardApi(`/api/editor/organizations/${organizationId}/links-page`, {
    method: 'PATCH',
    body: {
      page: {
        title: form.title,
        seo_title: form.seo_title,
        seo_description: form.seo_description,
      },
      items: nextItems.map((item, index) => ({
        ...(item.id ? { id: item.id } : {}),
        label: item.label,
        destination: item.destination,
        sort_order: index,
        status: item.status,
      })),
    },
    validate: isLinksWriteResponse,
  })
  data.value = { page: response.page, items: response.items }
  return response
}

/** Saving a page-level leaf writes the document and returns to the page. */
async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await persist(items.value)
    await navigateTo(linksPath.value)
  } catch (error) {
    errorMessage.value = error instanceof ApiClientError
      ? error.message
      : error instanceof Error ? error.message : 'Unable to save links page'
  } finally {
    saving.value = false
  }
}

function revert() {
  errorMessage.value = ''
  if (data.value) loadForm(data.value)
}

// ── The index ─────────────────────────────────────────────

function linksSummary(): string {
  if (!items.value.length) return 'No links yet'
  const hidden = items.value.filter(item => item.status === 'hidden').length
  const active = items.value.length - hidden
  const parts = [`${active} active`]
  if (hidden) parts.push(`${hidden} hidden`)
  return parts.join(' · ')
}

/** Which row the open leaf is, read from the route rather than tracked here. */
const openSection = computed(() => route.path.startsWith(`${itemsPath.value}`)
  ? 'items'
  : route.path.slice(linksPath.value.length).replace(/^\//, '').split('/')[0] ?? null)

const navigationGroups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'page',
    items: [
      { id: 'title', label: 'Title', summary: form.title || 'Not named yet', placeholder: !form.title, to: `${linksPath.value}/title` },
      { id: 'items', label: 'Links', summary: linksSummary(), placeholder: !items.value.length, to: `${linksPath.value}/items` },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    items: [
      { id: 'seo-title', label: 'SEO title', summary: form.seo_title || 'Falls back to the title', placeholder: !form.seo_title, to: `${linksPath.value}/seo-title` },
      {
        id: 'seo-description',
        label: 'SEO description',
        summary: form.seo_description || 'Nothing written yet',
        placeholder: !form.seo_description,
        to: `${linksPath.value}/seo-description`,
      },
    ],
  },
])

provide(linksEditorKey, {
  form,
  items,
  organizationId,
  saving,
  errorMessage,
  editorReady,
  persist,
  save,
  revert,
  loadLinksLocalization,
  saveLinksLocalization,
  siteLocalizationSettingsPath,
})

useSeoMeta({ title: 'Links page | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
