<template>
  <div
    class="relative flex min-h-0 flex-col border-r border-default bg-default"
    @dragenter.prevent="dragCounter++"
    @dragover.prevent
    @dragleave="dragCounter = Math.max(0, dragCounter - 1)"
    @drop.prevent="onDrop"
  >
    <!-- Drag overlay -->
    <Transition name="fade">
      <div
        v-if="isDragging && step !== 'welcome'"
        class="absolute inset-0 z-10 flex items-center justify-center"
      >
        <UCard class="mx-8 border-2 border-dashed border-primary" :ui="{ body: 'px-8 py-10 sm:px-8 sm:py-10' }">
          <div class="flex flex-col items-center gap-3 text-center">
            <UIcon name="i-lucide-upload" class="size-10 text-primary" />
            <p class="font-medium text-highlighted">Drop to attach</p>
            <p class="text-xs text-muted">JPEG, PNG, WEBP, PDF — max 10 MB</p>
          </div>
        </UCard>
      </div>
    </Transition>

    <!-- Welcome screen -->
    <div v-if="step === 'welcome'" class="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-6 pb-4">
      <div class="flex size-16 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
        <UIcon name="i-lucide-sparkles" class="size-8" />
      </div>
      <div>
        <p class="mb-1 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">{{ props.isAddingLocation ? "Let's add a location" : "Let's build your site" }}</p>
        <h1 class="text-3xl font-extrabold leading-tight tracking-tight text-highlighted">
          {{ props.isAddingLocation ? "Tell me about this location. I'll do the typing." : "Tell me about your business. I'll do the typing." }}
        </h1>
      </div>
      <p class="text-[14.5px] leading-relaxed text-muted">
        {{ props.isAddingLocation
          ? "Answer a few questions and this location is added to your site — you decide what to keep."
          : "Answer a few questions and a real, SEO-ready site builds itself on the right — you decide what to keep." }}
      </p>
      <div class="flex flex-col gap-2.5">
        <div
          v-for="[icon, text] in WELCOME_POINTS"
          :key="text"
          class="flex items-center gap-3 text-sm text-highlighted"
        >
          <div class="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-default bg-elevated text-primary">
            <UIcon :name="icon" class="size-3.5" />
          </div>
          {{ text }}
        </div>
      </div>
      <UButton
        color="primary"
        size="md"
        icon="i-lucide-sparkles"
        class="self-start"
        @click="advance(props.skipVertical ? 'source' : 'vertical')"
      >
        Start building
      </UButton>
    </div>

    <!-- Chat transcript -->
    <ChowBotConversation
      v-else
      v-model:input="textInput"
      :messages="conversationMessages"
      :placeholder="inputPlaceholder"
      :disabled="!awaitingInput"
      :loading="typing"
      :messages-status="typing ? 'streaming' : undefined"
      :show-empty-state="false"
      :render-markdown="renderMarkdown"
      :quick-replies="importError ? [] : replies"
      @submit="handleTextSubmit"
      @quick-reply="handleReply"
    >
      <template #prompt-before>
        <!-- Error banner -->
        <div
          v-if="importError"
          data-testid="wizard-error-banner"
          class="mb-3 flex items-center gap-2 rounded-lg border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950 px-3 py-2 text-xs text-error-600 dark:text-error-400"
        >
          <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" />
          <span>{{ importError }}</span>
          <button class="ml-auto shrink-0 underline underline-offset-2" @click="retryImport">Try again</button>
        </div>
      </template>

      <template #assistant-after="{ index }">
        <template v-if="messages[index]">
          <!-- Place preview / confirm card -->
          <div
            v-if="messages[index].placePreview"
            class="mt-2 flex items-start gap-3 rounded-xl border border-default bg-elevated px-4 py-3"
          >
            <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-map-pin" class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-semibold text-highlighted">{{ messages[index].placePreview.name }}</p>
              <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ messages[index].placePreview.address }}</p>
              <p v-if="messages[index].placePreview.phone" class="mt-0.5 text-[12px] text-muted">{{ messages[index].placePreview.phone }}</p>
              <a
                v-if="messages[index].placePreview.mapsUrl"
                :href="messages[index].placePreview.mapsUrl"
                target="_blank"
                rel="noopener"
                class="mt-1 inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
              >
                <UIcon name="i-lucide-external-link" class="size-3" />
                View on Google Maps
              </a>
            </div>
          </div>
          <div
            v-if="messages[index].detailsCard"
            class="mt-2"
          >
            <IntakeDetailsCard
              v-model:form="detailsForm"
              :title="messages[index].detailsCard.title"
              :description="messages[index].detailsCard.description"
              :action-label="messages[index].detailsCard.actionLabel"
              :require-location-basics="messages[index].detailsCard.requireLocationBasics"
              :show-primary-toggle="messages[index].detailsCard.showPrimaryToggle"
              :loading="importing"
              :disabled="importing"
              @submit="submitDetails"
            />
          </div>
          <!-- Handoff card -->
          <div
            v-if="messages[index].handoff"
            class="mt-2 flex items-start gap-3 rounded-xl border border-default bg-elevated px-4 py-3"
          >
            <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-messages-square" class="size-4" />
            </div>
            <div>
              <p class="text-[13px] font-semibold text-highlighted">Three ways to keep building</p>
              <p class="mt-0.5 text-[12px] text-muted leading-relaxed">
                Chat with ChowBot in your dashboard, use the structured editor for precise control, or pick it back up in ChatGPT — same site, same words.
              </p>
            </div>
          </div>
          <UCard v-if="messages[index].socialCard" class="mt-2" :ui="{ body: 'px-4 py-3 space-y-3' }">
            <div class="flex items-center gap-2">
              <UIcon name="i-simple-icons-facebook" class="size-4 text-[#1877F2] shrink-0" />
              <span class="text-[13px] font-semibold text-highlighted">Facebook & Instagram</span>
              <UBadge
                :label="facebookConnected ? 'Connected' : hasFacebookAccess ? 'Ready to connect' : 'Upgrade required'"
                :color="facebookConnected ? 'success' : hasFacebookAccess ? 'info' : 'warning'"
                variant="soft"
                size="xs"
              />
            </div>
            <p class="text-[12px] text-muted leading-relaxed">
              <template v-if="hasFacebookAccess">
                Connect your Facebook Page and posts you publish there will automatically sync to your site. Instagram Business accounts linked to the Page sync too.
              </template>
              <template v-else>
                Upgrade to Growth or above to connect your Facebook Page and automatically sync Facebook and linked Instagram Business posts to your site.
              </template>
            </p>
            <div class="flex gap-2 pt-1">
              <UButton
                v-if="hasFacebookAccess && !facebookConnected"
                size="sm"
                color="primary"
                icon="i-simple-icons-facebook"
                :loading="connectingFacebook"
                @click="startFacebookConnect"
              >
                Connect Facebook
              </UButton>
              <UButton
                v-else-if="!hasFacebookAccess && importedOrgSlug"
                size="sm"
                color="primary"
                variant="outline"
                icon="i-lucide-circle-arrow-up"
                :to="`/dashboard/${importedOrgSlug}/~/settings/billing`"
              >
                Upgrade to Growth
              </UButton>
              <UButton
                v-else
                size="sm"
                color="neutral"
                :variant="facebookConnected ? 'solid' : 'ghost'"
                @click="workspaceEntryPath && router.push(workspaceEntryPath)"
              >
                {{ facebookConnected ? 'Open dashboard' : 'Set up later' }}
              </UButton>
            </div>
          </UCard>
          <div v-if="messages[index].brandCard && importedSiteId" class="mt-2">
            <BrandEssentialsCard :site-id="importedSiteId" @done="handleBrandCardDone" />
          </div>
          <div v-if="messages[index].polishCard" class="mt-2">
            <PolishSuggestionsCard
              :vertical="selectedVertical"
              :primary-to="workspaceEntryPath"
              primary-label="Open the dashboard"
              :secondary-to="brandWorkspacePath"
              secondary-label="Open brand pages"
            />
          </div>
          <div v-if="messages[index].mcpCard" class="mt-2">
            <McpEditCard
              :guide-to="chatgptGuidePath"
              guide-label="ChatGPT setup guide"
              :starter-prompt="chatgptStarterPrompt"
              :examples="quickActionExamples"
              :dashboard-to="workspaceEntryPath"
              dashboard-label="Open the dashboard"
            />
          </div>
        </template>
      </template>
    </ChowBotConversation>
  </div>
</template>

<script setup lang="ts">
import { getLocalTimezone } from '~/utils/timezone'
import { marked } from 'marked'
import { DEFAULT_CURRENCY } from '~/shared/currencies'
import ChowBotConversation from '~/components/chowbot/ChowBotConversation.vue'
import {
  buildOnboardingStarterPrompt,
  getQuickActionPrompts,
  type OnboardingChecklistResponse,
} from '~/composables/useOnboardingPrompts'

interface WizardMessage {
  id: string
  from: 'bot' | 'user'
  text?: string
  tools?: { label: string; done: boolean }[]
  handoff?: boolean
  socialCard?: boolean
  polishCard?: boolean
  mcpCard?: boolean
  brandCard?: boolean
  placePreview?: { name: string; address: string; phone?: string | null; mapsUrl?: string | null }
  detailsCard?: {
    title: string
    description: string
    actionLabel: string
    requireLocationBasics: boolean
    showPrimaryToggle: boolean
  }
}

interface QuickReply {
  label: string
  sub?: string
  icon?: string
  primary?: boolean
  ghost?: boolean
  action?: string
}

interface DraftSavedPayload {
  draftId: string
  previewToken: string
  draftName: string
  subdomainCandidate: string
}

type WizardStep = 'welcome' | 'vertical' | 'source' | 'awaiting_url' | 'awaiting_manual_name' | 'confirm' | 'details' | 'importing' | 'imported'
type Vertical = 'restaurant' | 'experience' | 'professional_service'
type DetailsSource = 'imported' | 'manual'

const props = defineProps<{
  siteId: string | null
  existingOrgSlug?: string | null
  existingSiteSlug?: string | null
  setupEndpoint?: string
  setupManualEndpoint?: string
  skipVertical?: boolean
  isAddingLocation?: boolean
}>()

const emit = defineEmits<{
  'site-created': [orgSlug: string | null, locationSlug?: string | null]
  'draft-saved': [draft: DraftSavedPayload]
}>()

const router = useRouter()
const toast = useToast()
const { trackSiteCreated, trackOnboardingCompleted } = useAnalytics()
const connectingFacebook = ref(false)
const facebookConnected = ref(false)
const hasFacebookAccess = ref(false)

const WELCOME_POINTS: [string, string][] = props.isAddingLocation
  ? [
      ['i-lucide-globe', 'Pulls the address, hours, photos & reviews from Google'],
      ['i-lucide-sparkles', 'Adds the location to your existing site as you watch'],
      ['i-lucide-map-pin', 'Goes live on your site as soon as you save it'],
    ]
  : [
      ['i-lucide-globe', 'Pulls your address, hours, photos & reviews from Google'],
      ['i-lucide-sparkles', 'Builds your homepage and story as you watch'],
      ['i-lucide-rocket', 'Launches free on a krabiclaw.com address when you are ready'],
    ]

// ─── State ───────────────────────────────────────────────────────────────────

const step = ref<WizardStep>('welcome')
const messages = ref<WizardMessage[]>([])
const conversationMessages = computed(() => messages.value.map(msg => ({
  role: msg.from === 'user' ? 'user' as const : 'assistant' as const,
  content: msg.text ?? '',
  toolCalls: msg.tools?.map(tool => ({
    name: tool.label,
    status: tool.done ? 'completed' : 'running',
  })),
})))
const typing = ref(false)
const replies = ref<QuickReply[]>([])
const awaitingInput = ref(false)
const textInput = ref('')
const importError = ref<string | null>(null)
const importing = ref(false)
const pendingMapsUrl = ref('')
const pendingPreview = ref<{
  placeId: string
  name: string
  address: string
  city?: string | null
  phone?: string | null
  mapsUrl?: string | null
  websiteUrl?: string | null
  openingHours?: string[] | null
} | null>(null)
const detailsSource = ref<DetailsSource>('imported')
const selectedVertical = ref<Vertical>('restaurant')
const detailsForm = reactive({
  name: '',
  city: '',
  address: '',
  phone: '',
  websiteUrl: '',
  openingHours: '',
  notificationPhone: '',
  timezone: '',
  currency: DEFAULT_CURRENCY,
  isPrimary: true,
})

// Drag support
const dragCounter = ref(0)
const isDragging = computed(() => dragCounter.value > 0)

const inputPlaceholder = computed(() => {
  if (step.value === 'awaiting_manual_name') return 'Your business name…'
  return 'Paste your Google Maps link…'
})
const detailsActionLabel = computed(() => props.isAddingLocation ? 'Add location' : 'Create site')
const detailsCardTitle = computed(() => props.isAddingLocation ? 'Location details' : 'Business details')
const detailsCardDescription = computed(() => detailsSource.value === 'manual'
  ? (props.isAddingLocation
    ? 'I still need the branch basics before I can add it to your site.'
    : 'I still need the basics before I can create this site.')
  : (props.isAddingLocation
    ? 'I pulled the location data from Google. Fix anything that looks off, then add it.'
    : 'I pulled the business data from Google. Fix anything that looks off, then create it.')
)
const detailsRequireBasics = computed(() => detailsSource.value === 'manual')

const importedSiteId = ref<string | null>(props.siteId ?? null)
const importedOrgSlug = ref<string | null>(null)
const importedSiteSlug = ref<string | null>(null)
const importedLocationSlug = ref<string | null>(null)
const checklistStarterPrompt = ref<string | null>(null)
const preConfirmStep = ref<WizardStep>('awaiting_url')
const onboardingDraftId = ref<string | null>(null)

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _dompurify: { sanitize: (_s: string) => string } = { sanitize: (_s: string) => _s }
let _dompurifyLoaded = false
onMounted(async () => {
  if (import.meta.client) {
    const { default: dp } = await import('isomorphic-dompurify')
    _dompurify = dp
    _dompurifyLoaded = true
  }
  // If the user already has a site (returning to onboarding workspace), skip to imported state
  if (props.siteId && props.existingOrgSlug) {
    await refreshSocialStatus(props.siteId)
    step.value = 'imported'
    messages.value.push({
      id: crypto.randomUUID(),
      from: 'bot',
      text: "Welcome back. Your workspace is live — the preview is on the right.",
    })
    replies.value = [
      { label: 'Open my dashboard', icon: 'i-lucide-arrow-right', primary: true, action: 'dashboard' },
    ]
  }
})

function renderMarkdown(text: string): string {
  if (!_dompurifyLoaded) {
    // Return escaped text as a safe fallback until DOMPurify loads
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
  const html = marked.parse(text, { breaks: true, gfm: true }) as string
  return _dompurify.sanitize(html)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const workspaceEntryPath = computed(() => {
  const slug = importedOrgSlug.value ?? props.existingOrgSlug ?? null
  const siteSlug = importedSiteSlug.value ?? props.existingSiteSlug ?? null
  if (!slug) return null
  return siteSlug ? `/dashboard/${slug}/sites/${siteSlug}` : `/dashboard/${slug}`
})

const brandWorkspacePath = computed(() => {
  const slug = importedOrgSlug.value ?? props.existingOrgSlug ?? null
  const siteSlug = importedSiteSlug.value ?? props.existingSiteSlug ?? null
  const locationSlug = importedLocationSlug.value
  if (!slug || !siteSlug || !locationSlug) return workspaceEntryPath.value
  return `/dashboard/${slug}/sites/${siteSlug}/${locationSlug}/pages`
})

const chatgptGuidePath = computed(() => {
  const slug = importedOrgSlug.value ?? props.existingOrgSlug ?? null
  return slug ? `/dashboard/${slug}/~/settings/chatgpt` : '/docs/integrations/mcp-setup'
})

const chatgptStarterPrompt = computed(() => {
  if (props.isAddingLocation) {
    return 'Help me finish this new location. Ask me for location-specific hours, photos, FAQs, and what makes this branch different.'
  }

  if (checklistStarterPrompt.value) {
    return checklistStarterPrompt.value
  }

  if (selectedVertical.value === 'experience') {
    return 'Help me finish my experience site. First ask me for my hero headline, brand story, and signature experiences.'
  }

  if (selectedVertical.value === 'professional_service') {
    return 'Help me finish my professional-service site. First ask me for my hero headline, brand story, and core services.'
  }

  return 'Help me finish my restaurant site. First ask me for my hero headline, brand story, and top menu sections.'
})

const quickActionExamples = computed(() => getQuickActionPrompts(selectedVertical.value))

async function refreshChecklistStarterPrompt(siteId: string | null) {
  if (!siteId || props.isAddingLocation) return
  try {
    const checklist = await $fetch<OnboardingChecklistResponse>(`/api/dashboard/onboarding/checklist?siteId=${encodeURIComponent(siteId)}`)
    checklistStarterPrompt.value = buildOnboardingStarterPrompt(checklist)
  } catch (error) {
    console.error('onboarding_checklist_prompt_failed', error)
    checklistStarterPrompt.value = null
  }
}

function pushUser(text: string) {
  messages.value.push({ id: crypto.randomUUID(), from: 'user', text })
}

async function pushBot(text: string, extra?: {
  tools?: { label: string; done: boolean }[]
  handoff?: boolean
  socialCard?: boolean
  polishCard?: boolean
  mcpCard?: boolean
  brandCard?: boolean
  placePreview?: WizardMessage['placePreview']
  detailsCard?: WizardMessage['detailsCard']
}) {
  typing.value = true
  await sleep(560)
  typing.value = false
  messages.value.push({ id: crypto.randomUUID(), from: 'bot', text, ...extra })
  await sleep(80)
}

async function refreshSocialStatus(siteId: string | null) {
  if (!siteId || props.isAddingLocation) return

  try {
    const [contextRes, facebookRes] = await Promise.all([
      $fetch<{ context?: { site?: { entitlements?: Record<string, string | boolean> } } }>(`/api/editor/sites/${siteId}/context`),
      $fetch<{ connected: boolean }>(`/api/integrations/facebook-pages/connection?siteId=${encodeURIComponent(siteId)}`),
    ])

    hasFacebookAccess.value = contextRes.context?.site?.entitlements?.managed_service === true
    facebookConnected.value = facebookRes.connected === true
  } catch (error) {
    console.error('onboarding_social_status_failed', error)
    hasFacebookAccess.value = false
    facebookConnected.value = false
  }
}

async function startFacebookConnect() {
  const siteId = importedSiteId.value ?? props.siteId ?? null
  if (!siteId) return

  connectingFacebook.value = true
  try {
    const res = await $fetch<{ success: boolean; authUrl?: string; error?: string }>(
      '/api/integrations/facebook-pages/auth',
      { method: 'POST', body: { siteId } }
    )
    if (!res.authUrl) throw new Error(res.error || 'No authorization URL returned')
    window.location.href = res.authUrl
  } catch (error) {
    console.error('facebook_connect_failed', error)
    toast.add({
      title: 'Failed to connect Facebook',
      description: error instanceof Error ? error.message : 'Please try again',
      color: 'error',
    })
    connectingFacebook.value = false
  }
}

// ─── State machine ────────────────────────────────────────────────────────────

async function advance(target: WizardStep) {
  step.value = target
  replies.value = []
  awaitingInput.value = false
  importError.value = null

  if (target === 'vertical') {
    await pushBot("First — what kind of business is this?")
    replies.value = [
      { label: 'Restaurant, café or bar', icon: 'i-lucide-flame', primary: true, action: 'set_vertical_restaurant' },
      { label: 'Experience, class or activity', icon: 'i-lucide-graduation-cap', action: 'set_vertical_experience' },
      { label: 'Legal or professional services', sub: 'Law firms, consultancies, and similar practices', icon: 'i-lucide-briefcase', action: 'set_vertical_professional_service' },
    ]
  }

  if (target === 'source') {
    await pushBot("Got it. How would you like to add your business details?")
    replies.value = [
      { label: 'Google Maps', sub: 'Paste your Maps link', icon: 'i-lucide-globe', primary: true, action: 'ask_url' },
      { label: 'Start manually', sub: 'Type your business name', icon: 'i-lucide-pencil', action: 'ask_manual' },
    ]
  }

  if (target === 'awaiting_url') {
    await pushBot("Paste your Google Maps link below — the full URL from your browser or a short maps.app.goo.gl link both work.")
    awaitingInput.value = true
  }

  if (target === 'awaiting_manual_name') {
    await pushBot("What's the name of your business?")
    awaitingInput.value = true
  }

  if (target === 'details') {
    await pushBot(detailsCardDescription.value, {
        detailsCard: {
          title: detailsCardTitle.value,
          description: detailsCardDescription.value,
          actionLabel: detailsActionLabel.value,
          requireLocationBasics: detailsRequireBasics.value,
          showPrimaryToggle: !!props.isAddingLocation,
        },
      })
  }
}

function handleBrandCardDone() {
  // Advance past the brand card step regardless of save or skip
  if (workspaceEntryPath.value) {
    router.push(workspaceEntryPath.value)
  }
}

async function handleReply(reply: QuickReply) {
  if (reply.action === 'set_vertical_restaurant') {
    selectedVertical.value = 'restaurant'
    pushUser(reply.label)
    await advance('source')
    return
  }

  if (reply.action === 'set_vertical_experience') {
    selectedVertical.value = 'experience'
    pushUser(reply.label)
    await advance('source')
    return
  }

  if (reply.action === 'set_vertical_professional_service') {
    selectedVertical.value = 'professional_service'
    pushUser(reply.label)
    await advance('source')
    return
  }

  if (reply.action === 'ask_url') {
    pushUser(reply.label)
    await advance('awaiting_url')
    return
  }

  if (reply.action === 'ask_manual') {
    pushUser(reply.label)
    await advance('awaiting_manual_name')
    return
  }

  if (reply.action === 'confirm_yes') {
    pushUser("Yes, that's my place")
    if (pendingPreview.value) {
      detailsSource.value = 'imported'
      seedDetailsFromPreview(pendingPreview.value)
      await advance('details')
    }
    return
  }

  if (reply.action === 'confirm_no') {
    pushUser("That's not my place")
    pendingPreview.value = null
    await advance(preConfirmStep.value)
    return
  }

  if (reply.action === 'dashboard') {
    const slug = importedOrgSlug.value ?? props.existingOrgSlug
    if (slug) {
      await markOnboardingComplete()
      await router.push(`/dashboard/${slug}`)
    }
    return
  }

  if (reply.action === 'add_location') {
    const slug = importedOrgSlug.value ?? props.existingOrgSlug
    const siteSlugForLocation = importedSiteSlug.value ?? props.existingSiteSlug
    await markOnboardingComplete()
    await router.push(slug && siteSlugForLocation ? `/dashboard/${slug}/sites/${siteSlugForLocation}/new` : '/dashboard')
    return
  }

  if (reply.action === 'edit_draft') {
    pushUser(reply.label)
    await advance('details')
    return
  }

  if (reply.action === 'commit_draft') {
    pushUser(reply.label)
    await commitDraft()
    return
  }
}

async function handleTextSubmit() {
  const input = textInput.value.trim()
  if (!awaitingInput.value || !input) return
  textInput.value = ''
  awaitingInput.value = false
  replies.value = []
  pushUser(input)
  if (step.value === 'awaiting_url') {
    await runLookup(input)
  } else if (step.value === 'awaiting_manual_name') {
    detailsSource.value = 'manual'
    seedDetailsFromManual(input)
    await advance('details')
  }
}

// ─── Import flow ──────────────────────────────────────────────────────────────

async function showLookupTools(label: string): Promise<{ label: string; done: boolean }[]> {
  const tools = reactive([{ label, done: false }])
  typing.value = true
  await sleep(400)
  typing.value = false
  messages.value.push({ id: crypto.randomUUID(), from: 'bot', tools })
  return tools
}

function showConfirm(preview: NonNullable<typeof pendingPreview.value>, returnStep: WizardStep) {
  preConfirmStep.value = returnStep
  pendingPreview.value = preview
  step.value = 'confirm'
  replies.value = [
    { label: "Yes, that's my place", icon: 'i-lucide-check', primary: true, action: 'confirm_yes' },
    { label: "That's not my place", icon: 'i-lucide-x', action: 'confirm_no' },
  ]
}

async function runLookup(mapsUrl: string) {
  step.value = 'importing'
  importing.value = true
  pendingMapsUrl.value = mapsUrl
  importError.value = null
  const tools = await showLookupTools('Looking up your Google Maps listing…')

  try {
    const endpoint = props.setupEndpoint ?? '/api/dashboard/onboarding/setup'
    const res = await $fetch<{
      success: boolean
      preview?: { placeId: string; name: string; address: string; city?: string | null; phone?: string | null; mapsUrl?: string | null; websiteUrl?: string | null; openingHours?: string[] | null }
      error?: string
    }>(endpoint, { method: 'POST', body: { mapsUrl, previewOnly: true } })

    if (!res.success || !res.preview) {
      throw new Error(res.error ?? 'Could not find your business. Please check the Google Maps URL and try again.')
    }

    tools[0]!.done = true
    await pushBot("Found it — does this look right?", { placePreview: res.preview })
    showConfirm(res.preview, 'awaiting_url')
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    step.value = 'awaiting_url'
    awaitingInput.value = true
  } finally {
    importing.value = false
  }
}

async function submitDetails() {
  const basicRequired = detailsRequireBasics.value
  const requiredFields = basicRequired
    ? [detailsForm.name, detailsForm.city, detailsForm.address, detailsForm.phone, detailsForm.notificationPhone, detailsForm.openingHours]
    : [detailsForm.name]
  if (!requiredFields.every(value => value.trim().length > 0)) {
    importError.value = 'Please fill in the required fields before continuing.'
    return
  }

  step.value = 'importing'
  importing.value = true
  importError.value = null
  const tools = await showLookupTools(
    props.isAddingLocation
      ? 'Adding your location…'
      : 'Saving your private draft preview…'
  )

  try {
    if (!props.isAddingLocation) {
      const endpoint = pendingPreview.value
        ? '/api/dashboard/onboarding/drafts/from-place'
        : '/api/dashboard/onboarding/drafts/manual'

      const body = pendingPreview.value
        ? {
            placeId: pendingPreview.value.placeId,
            vertical: selectedVertical.value,
            details: serializeDetails(),
          }
        : {
            name: detailsForm.name.trim(),
            vertical: selectedVertical.value,
            details: serializeDetails(),
          }

      const res = await $fetch<{
        success: boolean
        draftId?: string
        previewToken?: string
        draftName?: string
        subdomainCandidate?: string
        error?: string
      }>(endpoint, { method: 'POST', body })

      if (!res.success || !res.draftId || !res.previewToken || !res.draftName || !res.subdomainCandidate) {
        throw new Error(res.error ?? 'Failed to save your preview draft. Please try again.')
      }

      tools[0]!.done = true
      onboardingDraftId.value = res.draftId
      emit('draft-saved', {
        draftId: res.draftId,
        previewToken: res.previewToken,
        draftName: res.draftName,
        subdomainCandidate: res.subdomainCandidate,
      })

      await pushBot(
        'Draft ready. The preview on the right now shows a private working copy, so you can review the site before reserving a live subdomain.'
      )
      replies.value = [
        { label: 'Create site', icon: 'i-lucide-badge-check', primary: true, action: 'commit_draft' },
        { label: 'Edit details', icon: 'i-lucide-square-pen', action: 'edit_draft' },
      ]
      step.value = 'details'
      return
    }

    const endpoint = pendingPreview.value
      ? (props.setupEndpoint ?? '/api/dashboard/onboarding/setup')
      : (props.setupManualEndpoint ?? '/api/dashboard/onboarding/setup-manual')

    const body = pendingPreview.value
      ? {
          placeId: pendingPreview.value.placeId,
          vertical: selectedVertical.value,
          details: serializeDetails(),
        }
      : {
          name: detailsForm.name.trim(),
          vertical: selectedVertical.value,
          details: serializeDetails(),
        }

    const res = await $fetch<{
      success: boolean
      siteId?: string | null
      orgSlug?: string | null
      siteSlug?: string | null
      locationSlug?: string | null
      error?: string
    }>(endpoint, { method: 'POST', body })

    if (!res.success) {
      throw new Error(res.error ?? 'Failed to create your workspace. Please try again.')
    }

    tools[0]!.done = true
    importedSiteId.value = res.siteId ?? props.siteId ?? null
    importedOrgSlug.value = res.orgSlug ?? null
    importedSiteSlug.value = res.siteSlug ?? props.existingSiteSlug ?? null
    await refreshChecklistStarterPrompt(importedSiteId.value)
    await finishCreation(res.orgSlug, res.siteSlug ?? importedSiteSlug.value ?? props.existingSiteSlug ?? null, res.locationSlug)
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    step.value = 'details'
  } finally {
    importing.value = false
  }
}

let committing = false

async function commitDraft() {
  if (committing) return
  if (!onboardingDraftId.value) {
    importError.value = 'No draft is ready yet. Save the preview first.'
    await advance('details')
    return
  }

  committing = true
  replies.value = []
  step.value = 'importing'
  importing.value = true
  importError.value = null
  const tools = await showLookupTools('Creating your site from the approved draft…')

  try {
    const res = await $fetch<{
      success: boolean
      siteId?: string | null
      orgSlug?: string | null
      siteSlug?: string | null
      locationSlug?: string | null
      error?: string
    }>(`/api/dashboard/onboarding/drafts/${onboardingDraftId.value}/commit`, {
      method: 'POST',
    })

    if (!res.success) {
      throw new Error(res.error ?? 'Failed to create your workspace. Please try again.')
    }

    tools[0]!.done = true
    importedSiteId.value = res.siteId ?? props.siteId ?? null
    importedOrgSlug.value = res.orgSlug ?? null
    importedSiteSlug.value = res.siteSlug ?? props.existingSiteSlug ?? null
    await refreshChecklistStarterPrompt(importedSiteId.value)
    await finishCreation(res.orgSlug, res.siteSlug ?? importedSiteSlug.value ?? props.existingSiteSlug ?? null, res.locationSlug)
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
    step.value = 'details'
  } finally {
    importing.value = false
    committing = false
  }
}

function serializeDetails() {
  return {
    name: detailsForm.name.trim(),
    city: detailsForm.city.trim() || null,
    address: detailsForm.address.trim() || null,
    phone: detailsForm.phone.trim() || null,
    websiteUrl: detailsForm.websiteUrl.trim() || null,
    openingHours: detailsForm.openingHours.trim() || null,
    notificationPhone: detailsForm.notificationPhone.trim() || null,
    timezone: detailsForm.timezone.trim() || null,
    isPrimary: props.isAddingLocation ? detailsForm.isPrimary : true,
  }
}

function guessLocalTimezone(): string {
  return getLocalTimezone()
}

function seedDetailsFromPreview(preview: NonNullable<typeof pendingPreview.value>) {
  detailsForm.name = preview.name ?? ''
  detailsForm.city = preview.city ?? ''
  detailsForm.address = preview.address ?? ''
  detailsForm.phone = preview.phone ?? ''
  detailsForm.websiteUrl = preview.websiteUrl ?? ''
  detailsForm.openingHours = Array.isArray(preview.openingHours) ? preview.openingHours.join('\n') : ''
  // Default the alert number to the business phone and guess the timezone from the
  // browser — both are required now (a missing notification phone silently degrades
  // booking alerts to email-only), so default them instead of leaving them blank.
  detailsForm.notificationPhone = preview.phone ?? ''
  detailsForm.timezone = guessLocalTimezone()
  detailsForm.currency = DEFAULT_CURRENCY
  detailsForm.isPrimary = !props.isAddingLocation
}

function seedDetailsFromManual(name: string) {
  detailsForm.name = name
  detailsForm.city = ''
  detailsForm.address = ''
  detailsForm.phone = ''
  detailsForm.websiteUrl = ''
  detailsForm.openingHours = ''
  detailsForm.notificationPhone = ''
  detailsForm.timezone = guessLocalTimezone()
  detailsForm.currency = DEFAULT_CURRENCY
  detailsForm.isPrimary = !props.isAddingLocation
}

async function finishCreation(orgSlug: string | null | undefined, siteSlug: string | null | undefined, locationSlug?: string | null) {
  emit('site-created', orgSlug ?? null, locationSlug ?? null)
  importedLocationSlug.value = locationSlug ?? null
  
  // Track site creation
  if (importedSiteId.value && !props.isAddingLocation) {
    trackSiteCreated(importedSiteId.value)
  }

  // Currency is site-level (not asked again on add-location) and otherwise
  // silently defaults to THB — persist the onboarding choice explicitly.
  if (importedSiteId.value && !props.isAddingLocation) {
    try {
      await $fetch(`/api/sites/${importedSiteId.value}/settings`, {
        method: 'PATCH',
        body: { default_currency: detailsForm.currency },
      })
    } catch (error) {
      console.error('onboarding_currency_save_failed', error)
      // Don't abort the onboarding flow - the site was already created successfully
      // Log the failure but continue; currency can be fixed in dashboard settings later
    }
  }

  await refreshSocialStatus(importedSiteId.value)
  await sleep(300)
  const domainSlug = siteSlug ?? orgSlug
  const domain = domainSlug ? `**${domainSlug}.krabiclaw.com**` : 'your new workspace'
  const offerLabel = selectedVertical.value === 'experience'
    ? 'experiences'
    : selectedVertical.value === 'professional_service'
      ? 'services'
      : 'menu'
  await pushBot(`Done. Your workspace is live at ${domain}.`)
  if (!props.isAddingLocation && importedSiteId.value) {
    await pushBot(
      `One last thing before you go — a logo, real photo, and brand color take this from "a template" to "your site" in under a minute.`,
      { brandCard: true },
    )
  }
  await pushBot(
    `From here, head to your dashboard to keep building — add your ${offerLabel} and story — or connect ChatGPT to manage it from there.`,
    { handoff: true, socialCard: !props.isAddingLocation, polishCard: true, mcpCard: true },
  )
  step.value = 'imported'
  replies.value = [
    { label: 'Open my dashboard', icon: 'i-lucide-arrow-right', primary: true, action: 'dashboard' },
    { label: 'Add another location', icon: 'i-lucide-map-pin', action: 'add_location' },
  ]
}

function retryImport() {
  importError.value = null
  if (step.value === 'awaiting_url' && pendingMapsUrl.value) {
    runLookup(pendingMapsUrl.value)
  }
}

async function markOnboardingComplete() {
  await $fetch('/api/dashboard/onboarding/complete', { method: 'POST' }).catch(() => {})
  if (importedSiteId.value) {
    trackOnboardingCompleted(importedSiteId.value)
  }
}

// ─── Drag & drop (no-op for now, future: attach files) ───────────────────────

const onDrop = (e: DragEvent) => {
  dragCounter.value = 0
  const file = e.dataTransfer?.files[0]
  if (!file) return
  toast.add({ description: 'File uploads are available after your site is created.', color: 'neutral' })
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
