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
        <p class="mb-1 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">{{ isAddingLocation ? "Let's add a location" : "Let's build your site" }}</p>
        <h1 class="text-3xl font-extrabold leading-tight tracking-tight text-highlighted">
          {{ isAddingLocation ? "Tell me about this location. I'll do the typing." : "Tell me about your business. I'll do the typing." }}
        </h1>
      </div>
      <p class="text-[14.5px] leading-relaxed text-muted">
        {{ isAddingLocation
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
        @click="advance(skipVertical ? 'source' : 'vertical')"
      >
        Start building
      </UButton>
    </div>

    <!-- Chat transcript -->
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center gap-3 border-b border-default bg-default px-3 py-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :disabled="!canGoBack"
          aria-label="Back"
          @click="goBack"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-semibold text-highlighted">{{ progressLabel }}</p>
          <div class="mt-1 flex gap-1">
            <span
              v-for="index in totalProgressSteps"
              :key="index"
              class="h-1.5 flex-1 rounded-full"
              :class="index <= progressStep ? 'bg-primary' : 'bg-muted'"
            />
          </div>
        </div>
        <UButton
          v-if="draftPreviewPayload"
          icon="i-lucide-eye"
          color="neutral"
          variant="soft"
          size="sm"
          square
          aria-label="Preview draft"
          @click="$emit('draft-saved', draftPreviewPayload)"
        />
      </div>

      <ChowBotConversation
        v-model:input="textInput"
        :messages="conversationMessages"
        :placeholder="inputPlaceholder"
        :disabled="!awaitingInput"
        :loading="typing"
        :messages-status="typing ? 'streaming' : undefined"
        :show-empty-state="false"
        :render-markdown="renderMarkdown"
        :quick-replies="importError ? [] : replies"
        :show-prompt="showComposer"
        :show-assistant-avatar="false"
        @submit="handleTextSubmit"
        @quick-reply="handleReply"
      >
      <template #message="{ index }">
        <div v-if="isWidgetMessage(messages[index])" class="px-4 py-2">
          <div v-if="messages[index]?.text" class="mb-2 max-w-[30rem] rounded-xl bg-elevated px-4 py-3 text-[14px] leading-relaxed text-highlighted">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose prose-sm dark:prose-invert max-w-none" v-html="renderMarkdown(messages[index]!.text!)" />
          </div>
          <div v-if="messages[index]?.choiceCard" class="grid gap-2">
            <button
              v-for="choice in messages[index]?.choiceCard?.choices"
              :key="choice.action"
              type="button"
              class="flex w-full items-center gap-3 rounded-lg border border-default bg-elevated px-3 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @click="handleReply(choice)"
            >
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-default bg-default text-primary">
                <UIcon :name="choice.icon || 'i-lucide-circle'" class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[13px] font-semibold leading-5 text-highlighted">{{ choice.label }}</span>
                <span v-if="choice.sub" class="mt-0.5 block text-[12px] leading-5 text-muted">{{ choice.sub }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
            </button>
          </div>
          <div
            v-if="messages[index]?.placePreview"
            class="overflow-hidden rounded-xl border border-default bg-elevated"
          >
            <div class="flex h-24 items-center justify-center border-b border-default bg-muted text-muted">
              <div class="flex items-center gap-2 text-xs font-medium">
                <UIcon name="i-lucide-map" class="size-4" />
                Map preview
              </div>
            </div>
            <div class="flex items-start gap-3 px-4 py-3">
              <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-map-pin" class="size-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-[13px] font-semibold text-highlighted">{{ messages[index]?.placePreview?.name }}</p>
                <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ messages[index]?.placePreview?.address }}</p>
                <p v-if="messages[index]?.placePreview?.phone" class="mt-0.5 text-[12px] text-muted">{{ messages[index]?.placePreview?.phone }}</p>
                <a
                  v-if="messages[index]?.placePreview?.mapsUrl"
                  :href="messages[index]?.placePreview?.mapsUrl ?? undefined"
                  target="_blank"
                  rel="noopener"
                  class="mt-1 inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
                >
                  <UIcon name="i-lucide-external-link" class="size-3" />
                  View on Google Maps
                </a>
              </div>
            </div>
          </div>
          <IntakeDetailsCard
            v-if="messages[index]?.detailsCard"
            v-model:form="detailsForm"
            :title="messages[index]!.detailsCard!.title"
            :description="messages[index]!.detailsCard!.description"
            :action-label="messages[index]!.detailsCard!.actionLabel"
            :require-location-basics="messages[index]!.detailsCard!.requireLocationBasics"
            :show-primary-toggle="messages[index]!.detailsCard!.showPrimaryToggle"
            :section="messages[index]!.detailsCard!.section"
            :loading="importing"
            :disabled="importing"
            @submit="submitDetailsCard(messages[index]!.detailsCard!.section)"
          />
          <HoursTimezoneCard
            v-if="messages[index]?.hoursCard"
            v-model:form="hoursForm"
            :title="messages[index]!.hoursCard!.title"
            :description="messages[index]!.hoursCard!.description"
            action-label="Continue"
            :loading="importing"
            :disabled="importing"
            @submit="submitHoursCard"
          />
          <DraftBrandCard
            v-if="messages[index]?.brandDraftCard"
            v-model:form="brandDraftForm"
            :title="messages[index]!.brandDraftCard!.title"
            :description="messages[index]!.brandDraftCard!.description"
            :action-label="messages[index]!.brandDraftCard!.section === 'brand' ? 'Save & continue' : 'Upload hero photo'"
            :section="messages[index]!.brandDraftCard!.section"
            :loading="importing"
            :disabled="importing"
            @submit="submitBrandDraftCard(messages[index]!.brandDraftCard!.section)"
          />
          <NotificationRoutingCard
            v-if="messages[index]?.notificationCard"
            v-model:form="notificationForm"
            title="Manager alerts"
            description="Choose where booking and message alerts should go."
            action-label="Save alerts"
            show-skip
            :loading="importing"
            :disabled="importing"
            @submit="saveNotificationRouting"
            @skip="skipNotificationRouting"
          />
          <div
            v-if="messages[index]?.handoff"
            class="flex items-start gap-3 rounded-xl border border-default bg-elevated px-4 py-3"
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
          <UCard v-if="messages[index]?.socialCard" :ui="{ body: 'px-4 py-3 space-y-3' }">
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
                :to="`/dashboard/${importedOrgSlug}/settings/billing`"
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
          <BrandEssentialsCard v-if="messages[index]?.brandCard && importedSiteId" :site-id="importedSiteId" @done="handleBrandCardDone" />
          <PolishSuggestionsCard
            v-if="messages[index]?.polishCard"
            :vertical="selectedVertical"
            :primary-to="workspaceEntryPath"
            primary-label="Open the dashboard"
            :secondary-to="brandWorkspacePath"
            secondary-label="Open brand pages"
          />
          <McpEditCard
            v-if="messages[index]?.mcpCard"
            :guide-to="chatgptGuidePath"
            guide-label="ChatGPT setup guide"
            :starter-prompt="chatgptStarterPrompt"
            :examples="quickActionExamples"
            :dashboard-to="workspaceEntryPath"
            dashboard-label="Open the dashboard"
          />
        </div>
        <UChatMessage
          v-else
          :id="String(index)"
          :role="messages[index]?.from === 'user' ? 'user' : 'assistant'"
          :parts="[{ type: 'text', text: messages[index]?.text ?? '' }]"
          :side="messages[index]?.from === 'user' ? 'right' : 'left'"
          :variant="messages[index]?.from === 'user' ? 'solid' : 'subtle'"
          :ui="messages[index]?.from === 'user' ? { content: 'bg-primary text-(--primary-foreground,#fff)' } : {}"
        >
          <template #content>
            <div v-if="messages[index]?.from === 'bot'" class="space-y-2">
              <div v-if="messages[index]?.tools?.length" class="flex flex-col gap-1">
                <UChatTool
                  v-for="(tool, toolIndex) in messages[index]?.tools"
                  :key="tool.label + index + toolIndex"
                  :text="tool.label"
                  :loading="!tool.done"
                />
              </div>
              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="messages[index]?.text"
                class="prose prose-sm dark:prose-invert max-w-none"
                v-html="renderMarkdown(messages[index]!.text!)"
              />
              <!-- eslint-enable vue/no-v-html -->
            </div>
            <div v-else class="prose prose-sm dark:prose-invert max-w-none text-(--primary-foreground,#fff)">
              {{ messages[index]?.text ?? '' }}
            </div>
          </template>
        </UChatMessage>
      </template>
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
      </ChowBotConversation>
    </div>
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
import type { SiteVertical } from '~/utils/vertical-copy'

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
  choiceCard?: { choices: QuickReply[] }
  placePreview?: { name: string; address: string; phone?: string | null; mapsUrl?: string | null }
  hoursCard?: {
    title: string
    description: string
  }
  brandDraftCard?: {
    title: string
    description: string
    section: 'brand' | 'hero'
  }
  notificationCard?: boolean
  detailsCard?: {
    title: string
    description: string
    actionLabel: string
    requireLocationBasics: boolean
    showPrimaryToggle: boolean
    section: 'location' | 'contact' | 'currency'
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

type WizardStep = 'welcome' | 'vertical' | 'source' | 'awaiting_url' | 'awaiting_manual_name' | 'confirm' | 'location' | 'contact' | 'currency' | 'hours' | 'brand' | 'hero' | 'create' | 'importing' | 'imported'
type DetailsSource = 'imported' | 'manual'

type WizardMode = 'new-site' | 'add-location'

const props = defineProps<{
  mode: WizardMode
  siteId: string | null
  existingOrgSlug?: string | null
  existingSiteSlug?: string | null
}>()

const emit = defineEmits<{
  'site-created': [orgSlug: string | null, locationSlug?: string | null]
  'draft-saved': [draft: DraftSavedPayload]
  'preview-state': [state: 'empty' | 'building']
  'vertical-selected': [vertical: SiteVertical]
}>()

const router = useRouter()
const toast = useToast()
const { trackSiteCreated, trackOnboardingCompleted } = useAnalytics()
const connectingFacebook = ref(false)
const facebookConnected = ref(false)
const hasFacebookAccess = ref(false)

const isAddingLocation = computed(() => props.mode === 'add-location')
const skipVertical = computed(() => props.mode === 'add-location')
const lookupEndpoint = computed(() => isAddingLocation.value
  ? '/api/dashboard/locations/add'
  : '/api/dashboard/onboarding/places-preview')
const addLocationEndpoint = '/api/dashboard/locations/add'

const WELCOME_POINTS: [string, string][] = isAddingLocation.value
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
  openingHours?: string[] | null
} | null>(null)
const detailsSource = ref<DetailsSource>('imported')
const selectedVertical = ref<SiteVertical>('restaurant')
const detailsForm = reactive({
  name: '',
  city: '',
  address: '',
  phone: '',
  currency: DEFAULT_CURRENCY,
  isPrimary: true,
})
const hoursForm = reactive({
  timezone: '',
  hours: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(day => ({ day, open: '09:00', close: '18:00', closed: false })),
})
const brandDraftForm = reactive({
  brandColor: '#3F3F46',
  logoNote: '',
  heroPhotoNote: '',
  heroHeadline: '',
})
const notificationForm = reactive({
  ownerPhone: '',
  channels: ['whatsapp'],
  locations: [] as { id: string; title: string; notificationPhone: string }[],
})

// Drag support
const dragCounter = ref(0)
const isDragging = computed(() => dragCounter.value > 0)

const inputPlaceholder = computed(() => {
  if (step.value === 'awaiting_manual_name') return 'Your business name…'
  return 'Paste your Google Maps link…'
})
const showComposer = computed(() => Boolean(importError.value || awaitingInput.value || replies.value.length))
const totalProgressSteps = 13
const progressStep = computed(() => {
  if (step.value === 'vertical') return 1
  if (step.value === 'source') return 2
  if (step.value === 'awaiting_url' || step.value === 'awaiting_manual_name') return 3
  if (step.value === 'confirm') return 4
  if (step.value === 'location') return 5
  if (step.value === 'contact') return 6
  if (step.value === 'currency') return 7
  if (step.value === 'hours') return 8
  if (step.value === 'brand') return 9
  if (step.value === 'hero') return 10
  if (step.value === 'create') return 11
  if (step.value === 'importing') return onboardingDraftId.value ? 12 : 11
  if (step.value === 'imported') return 13
  return 1
})
const progressLabel = computed(() => {
  if (step.value === 'vertical') return 'Choose business type'
  if (step.value === 'source') return 'Choose source'
  if (step.value === 'awaiting_url') return 'Add Maps link'
  if (step.value === 'awaiting_manual_name') return 'Add business name'
  if (step.value === 'confirm') return 'Confirm listing'
  if (step.value === 'location') return 'Location'
  if (step.value === 'contact') return 'Contact'
  if (step.value === 'currency') return 'Currency'
  if (step.value === 'hours') return 'Hours'
  if (step.value === 'brand') return 'Brand identity'
  if (step.value === 'hero') return 'Hero photo'
  if (step.value === 'create') return 'Create site'
  if (step.value === 'importing') return 'Building'
  if (step.value === 'imported') return 'Next steps'
  return 'Onboarding'
})
const canGoBack = computed(() => !importing.value && !typing.value && !['welcome', 'importing', 'imported'].includes(step.value))
const previewState = computed<'empty' | 'building'>(() => ['welcome', 'vertical'].includes(step.value) ? 'empty' : 'building')
const detailsCardDescription = computed(() => detailsSource.value === 'manual'
  ? 'Add the details guests will see first.'
  : 'Check what Google found.'
)
const detailsRequireBasics = computed(() => detailsSource.value === 'manual')

watch(previewState, state => emit('preview-state', state), { immediate: true })
watch(selectedVertical, vertical => emit('vertical-selected', vertical), { immediate: true })

const importedSiteId = ref<string | null>(props.siteId ?? null)
const importedOrgSlug = ref<string | null>(null)
const importedSiteSlug = ref<string | null>(null)
const importedLocationSlug = ref<string | null>(null)
const checklistStarterPrompt = ref<string | null>(null)
const preConfirmStep = ref<WizardStep>('awaiting_url')
const onboardingDraftId = ref<string | null>(null)
const draftPreviewPayload = ref<DraftSavedPayload | null>(null)

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

function isWidgetMessage(message: WizardMessage | undefined) {
  return Boolean(
    message?.choiceCard
    || message?.placePreview
    || message?.detailsCard
    || message?.hoursCard
    || message?.brandDraftCard
    || message?.notificationCard
    || message?.handoff
    || message?.socialCard
    || message?.brandCard
    || message?.polishCard
    || message?.mcpCard
  )
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
  return `/dashboard/${slug}/sites/${siteSlug}/content`
})

const chatgptGuidePath = computed(() => {
  const slug = importedOrgSlug.value ?? props.existingOrgSlug ?? null
  return slug ? `/dashboard/${slug}/settings/chatgpt` : '/docs/integrations/mcp-setup'
})

const chatgptStarterPrompt = computed(() => {
  if (isAddingLocation.value) {
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
  if (!siteId || isAddingLocation.value) return
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
  choiceCard?: WizardMessage['choiceCard']
  placePreview?: WizardMessage['placePreview']
  hoursCard?: WizardMessage['hoursCard']
  brandDraftCard?: WizardMessage['brandDraftCard']
  notificationCard?: boolean
  detailsCard?: WizardMessage['detailsCard']
}) {
  typing.value = true
  await sleep(560)
  typing.value = false
  messages.value.push({ id: crypto.randomUUID(), from: 'bot', text, ...extra })
  await sleep(80)
}

async function refreshSocialStatus(siteId: string | null) {
  if (!siteId || isAddingLocation.value) return

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
    await pushBot("First — what kind of business is this?", {
      choiceCard: {
        choices: [
          { label: 'Restaurant, café or bar', icon: 'i-lucide-flame', primary: true, action: 'set_vertical_restaurant' },
          { label: 'Experience, class or activity', icon: 'i-lucide-graduation-cap', action: 'set_vertical_experience' },
          { label: 'Legal or professional services', sub: 'Law firms, consultancies, and similar practices', icon: 'i-lucide-briefcase', action: 'set_vertical_professional_service' },
        ],
      },
    })
  }

  if (target === 'source') {
    await pushBot("Got it. How would you like to add your business details?", {
      choiceCard: {
        choices: [
          { label: 'Google Maps', sub: 'Paste your Maps link', icon: 'i-lucide-globe', primary: true, action: 'ask_url' },
          { label: 'Start manually', sub: 'Type your business name', icon: 'i-lucide-pencil', action: 'ask_manual' },
        ],
      },
    })
  }

  if (target === 'awaiting_url') {
    await pushBot("Paste your Google Maps link below — the full URL from your browser or a short maps.app.goo.gl link both work.")
    awaitingInput.value = true
  }

  if (target === 'awaiting_manual_name') {
    await pushBot("What's the name of your business?")
    awaitingInput.value = true
  }

  if (target === 'location') {
    await pushBot('', {
      detailsCard: {
        title: 'Location',
        description: detailsSource.value === 'manual' ? 'Where should guests find you?' : detailsCardDescription.value,
        actionLabel: 'Continue',
        requireLocationBasics: detailsRequireBasics.value,
        showPrimaryToggle: !!isAddingLocation.value,
        section: 'location',
      },
    })
  }

  if (target === 'contact') {
    await pushBot('', {
      detailsCard: {
        title: 'Contact',
        description: 'Add the number guests should use first.',
        actionLabel: 'Continue',
        requireLocationBasics: detailsRequireBasics.value,
        showPrimaryToggle: false,
        section: 'contact',
      },
    })
  }

  if (target === 'currency') {
    await pushBot('', {
      detailsCard: {
        title: 'Currency',
        description: 'Choose how guests will see prices.',
        actionLabel: 'Continue',
        requireLocationBasics: false,
        showPrimaryToggle: false,
        section: 'currency',
      },
    })
  }

  if (target === 'hours') {
    await pushBot('', {
      hoursCard: {
        title: 'Hours & timezone',
        description: 'Add your weekly hours so bookings and visit details line up.',
      },
    })
  }

  if (target === 'brand') {
    await pushBot('', {
      brandDraftCard: {
        title: 'Brand identity',
        description: 'Choose the first color direction and note anything important about your logo.',
        section: 'brand',
      },
    })
  }

  if (target === 'hero') {
    await pushBot('', {
      brandDraftCard: {
        title: 'Hero photo',
        description: 'Add the image guests should see first.',
        section: 'hero',
      },
    })
  }

  if (target === 'create') {
    await submitDetails()
  }
}

async function goBack() {
  if (!canGoBack.value) return
  importError.value = null
  replies.value = []
  awaitingInput.value = false

  if (step.value === 'vertical') {
    messages.value = []
    await advance('welcome')
    return
  }
  if (step.value === 'source') {
    messages.value = []
    await advance(skipVertical.value ? 'welcome' : 'vertical')
    return
  }
  if (step.value === 'awaiting_url' || step.value === 'awaiting_manual_name') {
    await advance('source')
    return
  }
  if (step.value === 'confirm') {
    pendingPreview.value = null
    await advance(preConfirmStep.value)
    return
  }
  if (step.value === 'location') {
    if (pendingPreview.value) {
      showConfirm(pendingPreview.value, preConfirmStep.value)
    } else {
      await advance('awaiting_manual_name')
    }
    return
  }
  if (step.value === 'contact') {
    await advance('location')
    return
  }
  if (step.value === 'currency') {
    await advance('contact')
    return
  }
  if (step.value === 'hours') {
    await advance('currency')
    return
  }
  if (step.value === 'brand') {
    await advance('hours')
    return
  }
  if (step.value === 'hero') {
    await advance('brand')
    return
  }
  if (step.value === 'create') {
    await advance('hero')
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
      await advance('location')
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
    if (workspaceEntryPath.value) {
      await markOnboardingComplete()
      await router.push(workspaceEntryPath.value)
    }
    return
  }

  if (reply.action === 'add_location') {
    const slug = importedOrgSlug.value ?? props.existingOrgSlug
    const siteSlugForLocation = importedSiteSlug.value ?? props.existingSiteSlug
    await markOnboardingComplete()
    await router.push(slug && siteSlugForLocation ? `/dashboard/${slug}/sites/${siteSlugForLocation}/locations/new` : '/dashboard')
    return
  }

  if (reply.action === 'edit_draft') {
    pushUser(reply.label)
    await advance('location')
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
    await advance('location')
  }
}

async function submitDetailsCard(section: 'location' | 'contact' | 'currency') {
  if (section === 'location') {
    await submitLocation()
    return
  }
  if (section === 'contact') {
    await submitContact()
    return
  }
  await advance('hours')
}

async function submitLocation() {
  const requiredFields = detailsRequireBasics.value
    ? [detailsForm.city, detailsForm.address]
    : []
  if (!requiredFields.every(value => value.trim().length > 0)) {
    importError.value = 'Add the required details before continuing.'
    return
  }
  await advance('contact')
}

async function submitContact() {
  if (detailsRequireBasics.value && !detailsForm.phone.trim()) {
    importError.value = 'Add the required details before continuing.'
    return
  }
  await advance('currency')
}

async function submitHoursCard() {
  if (!hoursForm.timezone.trim()) {
    importError.value = 'Choose a timezone before continuing.'
    return
  }
  if (!hoursForm.hours.every(day => day.closed || (day.open && day.close))) {
    importError.value = 'Add opening and closing times, or mark the day closed.'
    return
  }
  await advance('brand')
}

async function submitBrandDraftCard(section: 'brand' | 'hero') {
  await advance(section === 'brand' ? 'hero' : 'create')
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
    const res = await $fetch<{
      success: boolean
      preview?: { placeId: string; name: string; address: string; city?: string | null; phone?: string | null; mapsUrl?: string | null; openingHours?: string[] | null }
      error?: string
    }>(lookupEndpoint.value, { method: 'POST', body: { mapsUrl, previewOnly: true } })

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
  const requiredFields = [hoursForm.timezone]
  if (!requiredFields.every(value => value.trim().length > 0)) {
    importError.value = 'Add the required details before continuing.'
    return
  }

  step.value = 'importing'
  importing.value = true
  importError.value = null
  const tools = await showLookupTools(
    isAddingLocation.value
      ? 'Adding your location…'
      : 'Building your preview…'
  )

  try {
    if (!isAddingLocation.value) {
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
      draftPreviewPayload.value = {
        draftId: res.draftId,
        previewToken: res.previewToken,
        draftName: res.draftName,
        subdomainCandidate: res.subdomainCandidate,
      }
      emit('draft-saved', draftPreviewPayload.value)

      await pushBot('Preview ready. Take a look on the right, then create the site when it feels right.')
      replies.value = [
        { label: 'Create site', icon: 'i-lucide-badge-check', primary: true, action: 'commit_draft' },
        { label: 'Edit details', icon: 'i-lucide-square-pen', action: 'edit_draft' },
      ]
      step.value = 'location'
      return
    }

    const endpoint = addLocationEndpoint

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
    step.value = 'hero'
  } finally {
    importing.value = false
  }
}

let committing = false

async function commitDraft() {
  if (committing) return
  if (!onboardingDraftId.value) {
    importError.value = 'No draft is ready yet. Save the preview first.'
    await advance('location')
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
    step.value = 'location'
  } finally {
    importing.value = false
    committing = false
  }
}

async function saveNotificationRouting() {
  if (!importedSiteId.value) return
  importing.value = true
  importError.value = null
  try {
    await $fetch(`/api/editor/sites/${importedSiteId.value}/notifications`, {
      method: 'PATCH',
      body: {
        whatsapp_phone: notificationForm.ownerPhone.trim() || null,
        channels: notificationForm.channels,
      },
    })
    await pushBot('Manager alerts are saved.')
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Could not save manager alerts. You can change them later from Settings.'
  } finally {
    importing.value = false
  }
}

async function skipNotificationRouting() {
  await pushBot('No problem. You can set manager alerts later from Settings.')
}

function serializeDetails() {
  return {
    name: detailsForm.name.trim(),
    city: detailsForm.city.trim() || null,
    address: detailsForm.address.trim() || null,
    phone: detailsForm.phone.trim() || null,
    openingHours: serializeOpeningHours(),
    notificationPhone: notificationForm.ownerPhone.trim() || null,
    timezone: hoursForm.timezone.trim() || null,
    currency: detailsForm.currency,
    isPrimary: isAddingLocation.value ? detailsForm.isPrimary : true,
  }
}

function serializeOpeningHours() {
  const lines = hoursForm.hours.map((day) => {
    if (day.closed) return `${day.day}: Closed`
    return `${day.day}: ${formatTime(day.open)} - ${formatTime(day.close)}`
  })
  return lines.join('\n')
}

function formatTime(value: string) {
  const [hourValue, minute = '00'] = value.split(':')
  const hour = Number(hourValue)
  if (!Number.isFinite(hour)) return value
  const hour12 = hour % 12 || 12
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${hour12}:${minute} ${suffix}`
}

function guessLocalTimezone(): string {
  return getLocalTimezone()
}

function seedDetailsFromPreview(preview: NonNullable<typeof pendingPreview.value>) {
  detailsForm.name = preview.name ?? ''
  detailsForm.city = preview.city ?? ''
  detailsForm.address = preview.address ?? ''
  detailsForm.phone = preview.phone ?? ''
  detailsForm.currency = DEFAULT_CURRENCY
  seedHoursFromPreview(preview.openingHours)
  notificationForm.ownerPhone = preview.phone ?? ''
  detailsForm.isPrimary = !isAddingLocation.value
}

function seedDetailsFromManual(name: string) {
  detailsForm.name = name
  detailsForm.city = ''
  detailsForm.address = ''
  detailsForm.phone = ''
  detailsForm.currency = DEFAULT_CURRENCY
  seedHoursFromPreview(null)
  notificationForm.ownerPhone = ''
  detailsForm.isPrimary = !isAddingLocation.value
}

function seedHoursFromPreview(openingHours: string[] | null | undefined) {
  hoursForm.timezone = guessLocalTimezone()
  const byDay = new Map((openingHours ?? []).map((line) => {
    const [day, hours] = line.split(/:\s*/, 2)
    return [day, hours]
  }))
  for (const row of hoursForm.hours) {
    const value = byDay.get(row.day)
    if (!value) {
      row.open = '09:00'
      row.close = '18:00'
      row.closed = false
      continue
    }
    row.closed = /closed/i.test(value)
    const range = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
    if (range) {
      row.open = normalizeTime(range[1]!, range[2] ?? '00', range[3])
      row.close = normalizeTime(range[4]!, range[5] ?? '00', range[6])
    }
  }
}

function normalizeTime(hourInput: string, minute: string, suffix?: string) {
  let hour = Number(hourInput)
  if (suffix?.toUpperCase() === 'PM' && hour < 12) hour += 12
  if (suffix?.toUpperCase() === 'AM' && hour === 12) hour = 0
  if (!Number.isFinite(hour)) hour = 9
  return `${String(hour).padStart(2, '0')}:${minute}`
}

async function finishCreation(orgSlug: string | null | undefined, siteSlug: string | null | undefined, locationSlug?: string | null) {
  emit('site-created', orgSlug ?? null, locationSlug ?? null)
  importedLocationSlug.value = locationSlug ?? null
  
  // Track site creation
  if (importedSiteId.value && !isAddingLocation.value) {
    trackSiteCreated(importedSiteId.value)
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
  if (!isAddingLocation.value && importedSiteId.value) {
    await pushBot('', { notificationCard: true })
  }
  if (!isAddingLocation.value && importedSiteId.value) {
    await pushBot(
      'Add a logo, brand color, and hero photo before you head into the dashboard.',
      { brandCard: true },
    )
  }
  await pushBot(
    `From here, head to your dashboard to keep building — add your ${offerLabel} and story — or connect ChatGPT to manage it from there.`,
    { handoff: true, socialCard: !isAddingLocation.value, polishCard: true, mcpCard: true },
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
