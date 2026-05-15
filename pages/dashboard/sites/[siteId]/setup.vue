<template>
  <UPage>
    <UPageHeader
      title="Setup"
      :description="siteName"
      :links="headerLinks"
    />

    <UPageBody>
      <!-- Preview — same iframe pattern as content.vue -->
      <div class="relative mx-auto h-[70vh] max-w-7xl overflow-hidden rounded-lg border border-default bg-default shadow-sm">
        <iframe
          id="setup-preview-frame"
          ref="previewFrame"
          :src="iframeSrc"
          class="h-full w-full border-0 transition-opacity duration-300"
          :class="{ 'opacity-40': iframeLoading }"
          @load="iframeLoading = false"
        />
        <Transition
          enter-active-class="transition-opacity duration-200"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition-opacity duration-150"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div v-if="iframeLoading" class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="flex items-center gap-3 rounded-lg border border-default bg-default px-4 py-3 shadow-sm">
              <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin text-muted" />
              <p class="text-sm text-muted">Loading preview…</p>
            </div>
          </div>
        </Transition>
      </div>

    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const route = useRoute()
const config = useRuntimeConfig()
const siteId = route.params.siteId as string

// ─── Force ChowBot open in onboarding mode ────────────────────────────────
const chowBot = useChowBot()

onMounted(async () => {
  chowBot.currentPageOverride.value = 'onboarding'
  chowBot.open()

  if (!chowBot.messages.value.length) {
    setTimeout(() => {
      chowBot.sendMessage('Hi! I just created my restaurant site and I need help setting it up.')
    }, 400)
  }

  await Promise.all([loadEditorContext(), refreshProgress()])
})

onUnmounted(() => {
  chowBot.currentPageOverride.value = null
})

// ─── Preview URL (same logic as content.vue) ──────────────────────────────
const previewFrame = ref<HTMLIFrameElement>()
const iframeLoading = ref(true)
const previewReloadToken = ref(0)
const previewToken = ref('')

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  return domain.replace(/^https?:\/\//, '')
})

const subdomain = ref('')

const sitePreviewBaseUrl = computed(() => {
  if (!subdomain.value) return ''
  const base = new URL(config.public.freeSiteDomain)
  const hostname = base.hostname === 'localhost'
    ? `${subdomain.value}.localhost`
    : `${subdomain.value}.${base.hostname}`
  return `${base.protocol}//${hostname}${base.port ? `:${base.port}` : ''}`
})

const iframeSrc = computed(() => {
  if (!sitePreviewBaseUrl.value) return ''
  const url = new URL('/', sitePreviewBaseUrl.value)
  url.searchParams.set('preview', 'true')
  if (previewToken.value) url.searchParams.set('token', previewToken.value)
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})

const siteName = ref('')

const headerLinks = computed(() => {
  if (progress.value?.can_publish) {
    return [{ label: 'Go Live', to: `/dashboard/sites/${siteId}`, color: 'success' as const, icon: 'i-heroicons-rocket-launch' }]
  }
  return [{ label: 'Skip for now', to: `/dashboard/sites/${siteId}`, color: 'neutral' as const, variant: 'soft' as const }]
})

async function loadEditorContext() {
  try {
    const res = await $fetch<{ context: { site: { subdomain?: string; brand_name?: string }; previewToken?: string } }>(
      `/api/editor/sites/${siteId}/context`
    )
    subdomain.value = res.context.site?.subdomain ?? ''
    siteName.value = res.context.site?.brand_name ?? ''
    previewToken.value = res.context.previewToken ?? ''
  } catch { /* non-blocking — preview just won't load */ }
}

function reloadPreview() {
  iframeLoading.value = true
  previewReloadToken.value = Date.now()
}

// ─── Setup progress ───────────────────────────────────────────────────────
interface SetupProgress {
  required_complete: number
  required_total: number
  can_publish: boolean
}

const progress = ref<SetupProgress | null>(null)

async function refreshProgress() {
  try {
    const res = await $fetch<{ success: boolean; progress: SetupProgress }>(
      `/api/sites/${siteId}/setup-progress`
    )
    if (res.success) progress.value = res.progress
  } catch { /* non-blocking */ }
}

// Reload preview whenever ChowBot completes a tool call that changes site data
const siteRefresh = useState<number>('site:refresh', () => 0)
const menuRefresh = useState<number>('menu:refresh', () => 0)

watch([siteRefresh, menuRefresh], async () => {
  await refreshProgress()
  setTimeout(() => reloadPreview(), 1500)
})

useSeoMeta({ title: 'Set Up Your Site | KrabiClaw', robots: 'noindex, nofollow' })
</script>
