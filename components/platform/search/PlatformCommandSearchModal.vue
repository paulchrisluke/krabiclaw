<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[120] flex items-start justify-center bg-black/35 px-4 py-8 backdrop-blur-[2px] sm:py-12"
      @click.self="close"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="dialogTitleId"
        tabindex="-1"
        class="flex max-h-[min(80vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-default bg-default shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        @keydown.tab="onTabKeydown"
      >
        <h2 :id="dialogTitleId" class="sr-only">Search {{ surfaceLabel.toLowerCase() }}</h2>
        <div class="flex items-center gap-3 border-b border-default px-4 py-3 sm:px-5">
          <PlatformSearchGlyph name="search" class="size-4 shrink-0 text-muted" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="placeholder"
            class="min-w-0 flex-1 bg-transparent text-base text-default outline-none placeholder:text-dimmed"
            @keydown.down.prevent="moveSelection(1)"
            @keydown.up.prevent="moveSelection(-1)"
            @keydown.enter.prevent="void openSelectedResult()"
            @keydown.esc.prevent="close"
          >
          <button
            type="button"
            class="rounded-lg border border-default px-2 py-1 text-xs text-dimmed transition hover:bg-elevated hover:text-default"
            @click="close"
          >
            Esc
          </button>
        </div>

        <div class="min-h-0 overflow-y-auto">
          <div v-if="query.trim() && loading" class="px-5 py-10 text-sm text-muted">
            Searching {{ surfaceLabel.toLowerCase() }}...
          </div>

          <div v-else-if="!query.trim()" class="px-5 py-10">
            <p class="text-sm font-medium text-default">Search {{ surfaceLabel.toLowerCase() }}</p>
            <p class="mt-2 text-sm leading-6 text-muted">
              Search docs, blog posts, support answers, and{{ surface === 'dashboard' ? ' dashboard destinations.' : ' platform pages.' }}
            </p>
          </div>

          <div v-else-if="results.length === 0" class="px-5 py-10">
            <p class="text-sm font-medium text-default">No results found</p>
            <p class="mt-2 text-sm leading-6 text-muted">Try a more specific task, page, or support question.</p>
          </div>

          <div v-else class="py-3">
            <section v-for="group in groupedResults" :key="group.label" class="px-2 pb-2">
              <p class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-dimmed">
                {{ group.label }}
              </p>
              <button
                v-for="result in group.items"
                :key="result.id"
                :ref="(element) => setResultRef(result.id, element)"
                type="button"
                :class="[
                  'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition',
                  selectedIndex === flatIndexById.get(result.id)
                    ? 'bg-elevated text-default'
                    : 'hover:bg-elevated/70',
                ]"
                @mouseenter="selectedIndex = flatIndexById.get(result.id) ?? selectedIndex"
                @click="void openResult(result)"
              >
                <div class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-default bg-default text-muted">
                  <PlatformSearchGlyph :name="glyphName(result.icon)" class="size-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-default">{{ result.title }}</p>
                      <p class="mt-1 line-clamp-2 text-sm leading-6 text-muted">{{ result.snippet }}</p>
                    </div>
                    <span class="shrink-0 rounded-full border border-default px-2 py-0.5 text-[11px] font-medium text-dimmed">
                      {{ resultTypeLabel(result.type) }}
                    </span>
                  </div>
                  <p class="mt-2 truncate text-xs text-dimmed">{{ result.path }}</p>
                </div>
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import PlatformSearchGlyph, { PLATFORM_SEARCH_GLYPHS } from '~/components/platform/search/PlatformSearchGlyph.vue'
import type { PlatformSearchGlyphName } from '~/components/platform/search/PlatformSearchGlyph.vue'
import type { ComponentPublicInstance } from 'vue'
import type { PlatformSearchPaletteSurface } from '~/composables/usePlatformSearchPalette'
import type { PublicSearchResult } from '~/server/utils/public-search'

interface SearchResponse {
  results: PublicSearchResult[]
}

const props = defineProps<{
  surface: PlatformSearchPaletteSurface
}>()

const route = useRoute()
const router = useRouter()
const { isOpen, open, close } = usePlatformSearchPalette(props.surface)
const inputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const query = ref('')
const loading = ref(false)
const results = ref<PublicSearchResult[]>([])
const selectedIndex = ref(0)
const resultRefs = new Map<string, HTMLButtonElement>()
const dialogTitleId = useId()
const resultTypeMeta: Record<PublicSearchResult['type'], { badge: string, group: string }> = {
  doc: { badge: 'Doc', group: 'Documentation' },
  blog: { badge: 'Blog', group: 'Blog' },
  faq: { badge: 'FAQ', group: 'Support FAQs' },
  route: { badge: 'Route', group: 'Routes' },
  platform_page: { badge: 'Page', group: 'Platform Pages' },
  dashboard_route: { badge: 'Dashboard', group: 'Dashboard' },
}

const surfaceLabel = computed(() => {
  if (props.surface === 'docs') return 'Documentation'
  if (props.surface === 'blog') return 'Blog'
  return 'Dashboard'
})

const placeholder = computed(() => {
  if (props.surface === 'dashboard') return 'Search dashboard, docs, blog, help...'
  return 'Search docs, blog, help, platform pages...'
})

const groupedResults = computed(() => {
  const groups = new Map<string, PublicSearchResult[]>()
  for (const result of results.value) {
    const label = groupLabel(result.type)
    const items = groups.get(label) ?? []
    items.push(result)
    groups.set(label, items)
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }))
})

const flatResults = computed(() => groupedResults.value.flatMap(group => group.items))
const flatIndexById = computed(() => {
  const pairs = flatResults.value.map((result, index) => [result.id, index] as const)
  return new Map<string, number>(pairs)
})

function resultTypeLabel(type: PublicSearchResult['type']) {
  return resultTypeMeta[type]?.badge ?? 'Result'
}

function groupLabel(type: PublicSearchResult['type']) {
  return resultTypeMeta[type]?.group ?? 'Results'
}

function setResultRef(resultId: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLButtonElement) {
    resultRefs.set(resultId, element)
    return
  }
  resultRefs.delete(resultId)
}

function scrollSelectedResultIntoView() {
  const selected = flatResults.value[selectedIndex.value]
  if (!selected) return
  resultRefs.get(selected.id)?.scrollIntoView({ block: 'nearest' })
}

function getFocusableElements() {
  return [...(panelRef.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? [])].filter(element => !element.hasAttribute('disabled') && element.tabIndex !== -1)
}

function onTabKeydown(event: KeyboardEvent) {
  const focusable = getFocusableElements()
  if (!focusable.length) {
    event.preventDefault()
    panelRef.value?.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  const active = document.activeElement

  if (event.shiftKey) {
    if (active === first || active === panelRef.value) {
      event.preventDefault()
      last.focus()
    }
    return
  }

  if (active === last) {
    event.preventDefault()
    first.focus()
  }
}

function glyphName(icon: string): PlatformSearchGlyphName {
  return icon in PLATFORM_SEARCH_GLYPHS ? icon as PlatformSearchGlyphName : 'search'
}

function moveSelection(delta: number) {
  if (!flatResults.value.length) return
  const next = (selectedIndex.value + delta + flatResults.value.length) % flatResults.value.length
  selectedIndex.value = next
}

async function openSelectedResult() {
  const selected = flatResults.value[selectedIndex.value]
  if (!selected) return
  await openResult(selected)
}

async function openResult(result: PublicSearchResult) {
  try {
    await router.push(result.path)
    close()
    query.value = ''
    results.value = []
    selectedIndex.value = 0
  } catch {
    // Navigation failed - keep modal open for user to try again
  }
}

let debounceHandle: ReturnType<typeof setTimeout> | null = null
let requestSequence = 0

async function runSearch() {
  const normalized = query.value.trim()
  if (!normalized) {
    requestSequence += 1
    results.value = []
    selectedIndex.value = 0
    loading.value = false
    return
  }

  const requestId = ++requestSequence
  loading.value = true
  try {
    const response = await $fetch<SearchResponse>('/api/public/search', {
      query: {
        q: normalized,
        surface: props.surface,
        orgSlug: typeof route.params.orgSlug === 'string' ? route.params.orgSlug : '',
        siteSlug: typeof route.params.siteSlug === 'string' ? route.params.siteSlug : '',
        locationSlug: typeof route.params.locationSlug === 'string' ? route.params.locationSlug : '',
      },
    })
    if (requestId !== requestSequence) return
    results.value = response.results ?? []
    selectedIndex.value = 0
  } catch (error) {
    if (requestId !== requestSequence) return
    console.error('Platform search failed:', error)
    results.value = []
    selectedIndex.value = 0
  } finally {
    if (requestId === requestSequence) {
      loading.value = false
    }
  }
}

watch(query, () => {
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => {
    void runSearch()
  }, 120)
})

watch(selectedIndex, async () => {
  await nextTick()
  scrollSelectedResultIntoView()
})

watch(isOpen, async (openNow) => {
  if (!openNow) {
    requestSequence += 1
    query.value = ''
    results.value = []
    selectedIndex.value = 0
    loading.value = false
    resultRefs.clear()
    return
  }
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
  scrollSelectedResultIntoView()
})

function onGlobalKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const tagName = target?.tagName
  const isTypingField = tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    open()
    return
  }

  if (props.surface !== 'dashboard' && !isOpen.value && event.key === '/' && !isTypingField) {
    event.preventDefault()
    open()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  if (debounceHandle) clearTimeout(debounceHandle)
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>
