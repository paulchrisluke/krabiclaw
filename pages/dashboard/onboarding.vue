<template>
  <div class="flex size-full min-h-0 flex-col overflow-hidden bg-muted text-highlighted">
    <div class="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(24rem,45%)_1fr]">
      <!-- The step column. One question at a time, its own header and footer. -->
      <div class="flex min-h-0 flex-col border-r border-default bg-default">
        <div v-if="currentStep" class="flex shrink-0 items-center px-6 py-3">
          <UButton to="/dashboard" color="neutral" variant="outline" size="sm" label="Save & exit" />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <NuxtPage v-if="restored" />
          <div v-else class="flex h-full items-center justify-center py-16" aria-live="polite">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
            <span class="sr-only">Loading your answers</span>
          </div>
        </div>

        <div v-if="currentStep && restored" class="shrink-0 border-t border-default px-6 py-4">
          <p v-if="draft.error.value" class="mb-3 text-sm text-error">{{ draft.error.value }}</p>
          <div class="flex items-center justify-between gap-4">
            <UButton variant="link" color="neutral" label="Back" @click="goBack" />
            <UButton
              :label="nextLabel"
              :loading="draft.busy.value"
              :disabled="!canAdvance"
              @click="goNext"
            />
          </div>
        </div>
      </div>

      <OnboardingPreviewPane
        v-if="!isMobilePreviewViewport"
        class="hidden lg:flex"
        :iframe-src="iframeSrc"
        :site-locations="previewLocations"
        :selected-location-id="selectedLocationId"
        selected-page="home"
        :site-status="siteStatus"
        :site-domain="siteDomain"
        :vertical="state.vertical"
        :empty-visual-url="preDraftVisual.url"
        :empty-visual-alt="preDraftVisual.alt"
        home-only
        @select-location="selectedLocationId = $event"
      />
    </div>

    <USlideover
      v-if="isMobilePreviewViewport"
      v-model:open="mobilePreviewOpenForViewport"
      title="Site preview"
      description="Close to keep answering."
      side="bottom"
      :ui="{ content: 'h-[82vh] overflow-hidden rounded-t-2xl', body: 'flex min-h-0 p-0 sm:p-0' }"
    >
      <template #body>
        <OnboardingPreviewPane
          class="min-h-0 flex-1"
          :iframe-src="iframeSrc"
          :site-locations="previewLocations"
          :selected-location-id="selectedLocationId"
          selected-page="home"
          :site-status="siteStatus"
          :site-domain="siteDomain"
          :vertical="state.vertical"
          :empty-visual-url="preDraftVisual.url"
          :empty-visual-alt="preDraftVisual.alt"
          home-only
          @select-location="selectedLocationId = $event"
        />
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import { tenantSiteOrigin } from '~/utils/tenant-site-origin'
import { useDashboardTopNavAction } from '~/composables/useDashboardTopNavActions'
import {
  onboardingStep,
  onboardingStepPath,
  startOnboardingFlow,
  useOnboardingSteps,
} from '~/composables/useOnboardingFlow'
import { useOnboardingDraft } from '~/composables/useOnboardingDraft'

// This route creates a new site, so it has no org or site of its own yet: there
// is no orgSlug segment and nothing dashboard-scoped to load. The dashboard
// layout honours skipDashboardContext and renders the shared header without org
// nav; middleware/dashboard.global.ts still gates the route on a session.
definePageMeta({ layout: 'dashboard', skipDashboardContext: true })

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const toast = useToast()
const state = startOnboardingFlow('new-site')
const draft = useOnboardingDraft()
const { indexOf, nextOf, previousOf, resumeStep } = useOnboardingSteps()

const currentStep = computed(() => onboardingStep(String(route.params.step ?? ''), 'new-site'))
const previousStep = computed(() => currentStep.value ? previousOf(currentStep.value.id) : null)
const nextStep = computed(() => currentStep.value ? nextOf(currentStep.value.id) : null)
const nextLabel = computed(() => currentStep.value?.nextLabel?.(state.value)
  ?? (currentStep.value?.optional && !currentStep.value.complete(state.value) ? 'Skip for now' : 'Next'))
const canAdvance = computed(() => {
  const step = currentStep.value
  if (!step) return false
  return step.intro || step.optional || step.complete(state.value)
})

// ─── Entering the flow ────────────────────────────────────────────────────────
// The answers live in useState, which a page load starts empty, so every entry
// point reads the saved draft back before a step renders: the welcome screen, a
// step reloaded mid-flow, a step URL opened cold. This component is the parent
// route — step-to-step navigation keeps it mounted — so the draft is fetched
// once per page load and never again while the flow runs.
const restored = ref(false)

onMounted(async () => {
  const requested = currentStep.value
  await draft.restore()

  if (route.params.step && !requested) {
    // Not a step at all.
    await router.replace('/dashboard/onboarding')
  } else if (requested) {
    // A step the owner has not reached, or one that no longer applies to the
    // answers they gave, is not theirs to land on: an empty form there would
    // save blanks over the draft. Send them to the step the draft stopped at.
    // Only the requested URL is judged; once the flow is running, Next decides
    // where it goes.
    const resume = resumeStep.value
    if (indexOf(requested.id) === -1 || indexOf(requested.id) > indexOf(resume.id)) {
      await router.replace(onboardingStepPath(resume.id))
    }
  }

  restored.value = true
})

async function goBack() {
  const target = previousStep.value
  await router.push(target ? onboardingStepPath(target.id) : '/dashboard/onboarding')
}

async function goNext() {
  const step = currentStep.value
  if (!step || !canAdvance.value) return

  if (step.action === 'lookup') {
    if (!await draft.lookup(state.value.mapsUrl)) return
  }

  if (!step.intro && !await draft.save()) return

  if (step.action === 'commit') {
    if (!await draft.activate()) return
    const created = state.value.created
    await router.push(created?.orgSlug ? `/dashboard/${created.orgSlug}` : '/dashboard')
    return
  }

  const target = nextStep.value
  if (target) await router.push(onboardingStepPath(target.id))
}

// ─── Preview ──────────────────────────────────────────────────────────────────
const selectedLocationId = ref<string | null>(null)
const previewReloadToken = ref(0)
const mobilePreviewOpen = ref(false)
const hasAutoOpenedMobilePreview = ref(false)
const isMobilePreviewViewport = ref(false)

const siteOriginFor = (subdomain: string) => tenantSiteOrigin({
  platformDomain: String(config.public.platformDomain),
  freeSiteDomain: String(config.public.freeSiteDomain),
  subdomain,
})

const previewLocations = computed(() => state.value.preview
  ? [{ id: state.value.preview.siteId, slug: state.value.preview.subdomainCandidate, title: state.value.preview.draftName }]
  : [])

const siteDomain = computed(() => {
  const slug = state.value.created?.siteSlug ?? state.value.preview?.subdomainCandidate
  return slug ? siteOriginFor(slug).replace(/^https?:\/\//, '') : ''
})

// The preview is the site itself, on its own subdomain: the same host, the same
// templates and the same navigation the public gets. Before activation the site
// is pending, so the first load carries its preview token — the tenant host
// turns that into a preview cookie for the rest of the visit.
const iframeSrc = computed(() => {
  const slug = state.value.created?.siteSlug ?? state.value.preview?.subdomainCandidate
  const origin = slug ? siteOriginFor(slug) : ''
  if (!origin) return ''
  const url = new URL(`${origin}/`)
  if (!state.value.created && state.value.preview) {
    url.searchParams.set('preview_token', state.value.preview.previewToken)
  }
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})

const PRE_DRAFT_VISUALS: Record<string, { url: string; alt: string }> = {
  type: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/9c594a4f-41c8-4c81-3545-fe08d9a70c00/w=800',
    alt: 'Choose your business type',
  },
  source: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/3c0e50cb-6390-46e9-4143-e8e68fa89900/w=800',
    alt: 'Choose how to add business details',
  },
  name: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/8be9a754-ef8f-4452-3fc0-90bfa24f2600/w=800',
    alt: 'Add your business name',
  },
  maps: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1952e5fa-e460-46f0-e50a-057dce7e8a00/w=800',
    alt: 'Add business details from Google Maps',
  },
}
// Preloading them makes each swap instant instead of a blank pane while the
// next image downloads.
useHead({
  link: Object.values(PRE_DRAFT_VISUALS).map(visual => ({ rel: 'preload', as: 'image', href: visual.url })),
})
// Until the first save there is no site to frame, so the pane carries an
// illustration rather than an empty column. The welcome screen has no step, and
// a step with no illustration of its own keeps showing the last one instead of
// blanking mid-flow.
const lastVisual = ref(PRE_DRAFT_VISUALS.type!)
watchEffect(() => {
  const visual = PRE_DRAFT_VISUALS[currentStep.value?.id ?? 'type']
  if (visual) lastVisual.value = visual
})
const preDraftVisual = computed(() => iframeSrc.value ? { url: '', alt: '' } : lastVisual.value)

const siteStatus = computed((): 'setup' | 'progress' | 'live' => {
  if (state.value.created) return 'live'
  if (state.value.preview) return 'progress'
  return 'setup'
})

const mobilePreviewOpenForViewport = computed({
  get: () => isMobilePreviewViewport.value && mobilePreviewOpen.value,
  set: value => { mobilePreviewOpen.value = value },
})

// The pane reloads whenever a save changed the site behind it, and on mobile it
// shows itself the first time there is anything to see.
watch(() => state.value.preview?.previewToken, (token) => {
  if (!token) return
  previewReloadToken.value = Date.now()
  selectedLocationId.value = state.value.preview?.siteId ?? null
  if (isMobilePreviewViewport.value && !hasAutoOpenedMobilePreview.value) {
    hasAutoOpenedMobilePreview.value = true
    mobilePreviewOpen.value = true
  }
})

useDashboardTopNavAction(() => state.value.preview
  ? {
      key: 'onboarding-preview',
      icon: 'i-lucide-eye',
      ariaLabel: 'Preview draft',
      class: 'lg:hidden',
      onSelect: () => {
        previewReloadToken.value = Date.now()
        if (isMobilePreviewViewport.value) mobilePreviewOpen.value = true
      },
    }
  : null)

let stopViewportListener: (() => void) | null = null

onMounted(() => {
  const query = window.matchMedia('(max-width: 1023.98px)')
  const update = () => {
    isMobilePreviewViewport.value = query.matches
    if (!query.matches) mobilePreviewOpen.value = false
  }
  update()
  query.addEventListener('change', update)
  stopViewportListener = () => query.removeEventListener('change', update)

  if (route.query.payment === 'cancelled') {
    toast.add({ title: 'Payment cancelled', description: 'Your subscription was not completed.', color: 'warning' })
  }
})

onUnmounted(() => {
  stopViewportListener?.()
  stopViewportListener = null
})

// Step order changes with the answers (the Maps steps do not exist for a manual
// draft), so a step that no longer applies redirects to the one that does.
watch([currentStep, () => indexOf(currentStep.value?.id ?? 'type')], async () => {
  if (route.params.step && !currentStep.value) await router.replace('/dashboard/onboarding')
})
</script>
