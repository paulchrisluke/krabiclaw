import { slugifyTitle } from '~/utils/post-slugs'
import type { TenantPageBlock, TenantPageType } from '~/utils/tenant-page-blocks'

/**
 * One page, one draft, one commit.
 *
 * A page stores its whole self in a single content document, so every level of
 * the Pages chain — the page's own fields, its sections, a section's parts, a
 * record inside one of those — edits the same snapshot and persists through the
 * same PATCH. This composable is where that snapshot lives, so no level has to
 * know how any other level saves.
 *
 * The draft is `useState` keyed to the record rather than a `reactive` here:
 * moving between levels remounts the component that was showing the draft, and
 * a plain `reactive` loses it on the way (`DESIGN.md`, Creating).
 */
export interface TenantPageDraft {
  id: string
  page_id: string
  locale: string
  path: string
  title: string
  summary: string
  seo_title: string
  seo_description: string
  canonical_url: string
  robots: string
  page_type: TenantPageType
  recipe: string
  sort_order: number
  blocks: TenantPageBlock[]
}

export interface TenantPageResponse {
  id: string
  page_id: string
  site_id: string
  organization_id: string
  locale: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  blocks: TenantPageBlock[]
  document: { updated_at: string }
  updated_at: string
}

export interface TenantPageListRow {
  id: string
  page_id: string
  locale: string
  path: string
  title: string
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  updated_at: string
}

export function isTenantPageResponse(value: unknown): value is { page: TenantPageResponse } {
  return isRecord(value) && isRecord(value.page) && typeof value.page.id === 'string'
    && isRecord(value.page.document) && Array.isArray(value.page.blocks)
}

export function isTenantPageListResponse(value: unknown): value is { pages: TenantPageListRow[] } {
  return isRecord(value) && Array.isArray(value.pages)
    && value.pages.every(page => isRecord(page) && typeof page.id === 'string'
      && typeof page.page_id === 'string' && typeof page.title === 'string' && typeof page.path === 'string')
}

function isEditorContextResponse(value: unknown): value is { context: { previewToken: string; site: { subdomain: string | null } } } {
  return isRecord(value) && isRecord(value.context) && typeof value.context.previewToken === 'string'
    && isRecord(value.context.site)
}

function emptyDraft(): TenantPageDraft {
  return {
    id: '',
    page_id: '',
    locale: 'en',
    path: '',
    title: '',
    summary: '',
    seo_title: '',
    seo_description: '',
    canonical_url: '',
    robots: '',
    page_type: 'custom',
    recipe: '',
    sort_order: 0,
    blocks: [],
  }
}

function toDraft(page: TenantPageResponse): TenantPageDraft {
  return {
    id: page.id,
    page_id: page.page_id,
    locale: page.locale,
    path: page.path,
    title: page.title,
    summary: page.summary ?? '',
    seo_title: page.seo_title ?? '',
    seo_description: page.seo_description ?? '',
    canonical_url: page.canonical_url ?? '',
    robots: page.robots ?? '',
    page_type: page.page_type,
    recipe: page.recipe ?? '',
    sort_order: page.sort_order,
    blocks: structuredClone(toRaw(page.blocks)),
  }
}

export function useTenantPageDraft(siteId: string, pageId: string) {
  const dashboardApi = useDashboardApi()
  const runtimeConfig = useRuntimeConfig()
  const isNew = computed(() => pageId === 'new')
  const key = `tenant-page-${siteId}-${pageId}`

  // Every level calls this, and Nuxt shares one request and one state per key,
  // so opening a leaf four levels down costs no fetch the page has not made.
  //
  // It renders on the server, reading D1 directly the way the Blog chain does.
  // Every level below the page — a section, one of its parts, a record inside
  // one — decides whether it exists by looking at this page, so a draft that is
  // still empty during the first render is a page that answers "not found" to a
  // direct load or a refresh of its own URL.
  const requestEvent = useRequestEvent()
  const load = useAsyncData(
    key,
    async () => {
      if (import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const { loadDashboardEditorContext, loadDashboardTenantPage } = await import('~/server/utils/dashboard-editor-resources')
        const [context, page] = await Promise.all([
          loadDashboardEditorContext(requestEvent, siteId),
          pageId === 'new' ? Promise.resolve(null) : loadDashboardTenantPage(requestEvent, siteId, pageId),
        ])
        return {
          context: context.context as unknown as { previewToken: string; site: { subdomain: string | null } },
          page: (page?.page ?? null) as TenantPageResponse | null,
        }
      }
      const [context, page] = await Promise.all([
        dashboardApi<{ context: { previewToken: string; site: { subdomain: string | null } } }>(
          `/api/editor/sites/${siteId}/context`,
          { validate: isEditorContextResponse },
        ),
        pageId === 'new'
          ? Promise.resolve(null)
          : dashboardApi<{ page: TenantPageResponse }>(`/api/editor/sites/${siteId}/pages/${pageId}`, { validate: isTenantPageResponse }),
      ])
      return { context: context.context, page: page?.page ?? null }
    },
    { lazy: import.meta.client },
  )
  const { data, error, pending, refresh } = load

  const draft = useState<TenantPageDraft>(`${key}-draft`, emptyDraft)
  /** The draft as it was last seeded or committed, so Save knows there is something to save. */
  const baseline = useState<string>(`${key}-baseline`, () => JSON.stringify(emptyDraft()))
  /** Which loaded document the draft was seeded from, so a re-read does not discard an edit. */
  const seededFrom = useState<string>(`${key}-seeded-from`, () => '')

  function seed(page: TenantPageResponse | null) {
    draft.value = page ? toDraft(page) : emptyDraft()
    baseline.value = JSON.stringify(draft.value)
    seededFrom.value = page?.document.updated_at ?? 'new'
  }

  watch(data, (value) => {
    if (!value) return
    const stamp = value.page?.document.updated_at ?? 'new'
    if (seededFrom.value === stamp) return
    // Every level that opens re-reads this key, so a read can still be in
    // flight when the level above it writes. Landing afterwards, that read is
    // not an update — it is the page as it was before the write, and seeding it
    // put the editor back a step: a section created a moment ago was gone from
    // the draft while its row existed in D1, and the route that had just been
    // sent to it answered "not found".
    if (stamp !== 'new' && seededFrom.value && seededFrom.value !== 'new' && stamp < seededFrom.value) return
    seed(value.page)
    // `flush: 'sync'`, because a queued watcher never runs during the server
    // render: the read above resolves after this composable's setup, and a
    // deferred seed left every level rendering the empty draft server-side —
    // hydration mismatches, and controls that came back disabled because the
    // page they describe was not there yet when the markup was made.
  }, { immediate: true, flush: 'sync' })

  const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)

  /**
   * Whether the draft is the loaded page rather than the empty one it starts
   * as. Every level below the page decides whether its section, part or record
   * exists by looking into this draft, and "not loaded yet" is not "not there".
   */
  const ready = computed(() => seededFrom.value !== '')

  /** Discards the draft and returns to the values the page was loaded with. */
  function revert() {
    seed(data.value?.page ?? null)
  }

  /**
   * A block exists as a `content_blocks` row only once the page has been saved
   * with it present. Before that its gallery has nothing to attach to, so the
   * gallery leaf edits media locally instead of calling the placement routes.
   */
  const savedBlockIds = computed(() => new Set((data.value?.page?.blocks ?? []).map(block => block.id)))

  /**
   * The preview is the site on its own host, never a platform-hosted copy, so
   * links, navigation and templates are exactly the public ones.
   */
  const previewUrl = computed(() => {
    const page = data.value?.page
    const token = data.value?.context.previewToken
    const subdomain = data.value?.context.site.subdomain
    if (!page || !token || !subdomain) return ''
    const path = page.path === '/' ? '' : page.path
    const localizedPath = page.locale === 'en' ? path : `/${page.locale}${path}`
    const origin = tenantSiteOrigin({
      platformDomain: String(runtimeConfig.public.platformDomain),
      freeSiteDomain: String(runtimeConfig.public.freeSiteDomain),
      subdomain,
    })
    if (!origin) return ''
    const url = new URL(`${origin}${localizedPath || '/'}`)
    url.searchParams.set('preview_token', token)
    return url.toString()
  })

  /**
   * The whole page, every time. Adding a section, renaming it, reordering the
   * list and editing a button four levels down are all this one write, which is
   * what keeps a single snapshot the source of truth at every depth.
   */
  async function commit(): Promise<TenantPageResponse> {
    const title = draft.value.title.trim()
    if (!title) throw new Error('Add a page title before saving.')
    const blocks = draft.value.blocks.map((block, position) => ({ ...block, position }))
    // The server takes the path as given; deriving it from the title is the
    // editor's job, and only while the page does not exist yet.
    const path = draft.value.id ? draft.value.path : `/${slugifyTitle(title)}`
    if (!draft.value.id && path === '/') throw new Error('Choose a more specific page title.')
    const body = {
      id: draft.value.id || undefined,
      pageId: draft.value.page_id || undefined,
      locale: draft.value.locale,
      path,
      title,
      summary: draft.value.summary,
      seoTitle: draft.value.seo_title || null,
      seoDescription: draft.value.seo_description || null,
      canonicalUrl: draft.value.canonical_url || null,
      robots: draft.value.robots || null,
      pageType: draft.value.page_type,
      recipe: draft.value.recipe || null,
      sortOrder: draft.value.sort_order,
      blocks,
      // Optimistic concurrency: a page another writer changed under us comes
      // back 409, which stays on screen as an error the tenant can retry.
      // The stamp the draft was seeded from, not whatever the last read left
      // in `data`: those are the same page except when a straggler read is
      // ignored above, and then only this one describes what is being edited.
      expectedUpdatedAt: draft.value.id ? seededFrom.value : undefined,
    }
    const response = draft.value.id
      ? await dashboardApi<{ page: TenantPageResponse }>(`/api/editor/sites/${siteId}/pages/${draft.value.id}`, { method: 'PATCH', body, validate: isTenantPageResponse })
      : await dashboardApi<{ page: TenantPageResponse }>(`/api/editor/sites/${siteId}/pages`, { method: 'POST', body, validate: isTenantPageResponse })
    if (data.value) data.value = { ...data.value, page: response.page }
    seed(response.page)
    return response.page
  }

  return { load, data, error, pending, refresh, draft, dirty, ready, revert, commit, isNew, savedBlockIds, previewUrl }
}

/**
 * The section being added, before the page has one.
 *
 * It lives beside the page draft rather than in the component that started it:
 * choosing a type and filling in what the type needs are two levels, and the
 * level that owns the commit bar changes between them.
 */
export function useTenantPageNewBlock(siteId: string, pageId: string) {
  return useState<TenantPageBlock | null>(`tenant-page-new-block-${siteId}-${pageId}`, () => null)
}
