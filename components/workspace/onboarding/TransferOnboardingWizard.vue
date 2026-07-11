<template>
  <div class="relative flex min-h-0 flex-col border-r border-default bg-default">

    <!-- Welcome screen -->
    <div v-if="step === 'welcome'" class="min-h-0 flex-1 overflow-y-auto p-6 pb-4">
      <div class="flex flex-col gap-[18px]">
        <div class="flex size-16 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
          <UIcon name="i-lucide-badge-check" class="size-8" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Your site is ready</p>
          <h1 class="text-3xl font-extrabold leading-tight tracking-tight text-highlighted">
            Welcome to {{ siteName }}.
          </h1>
        </div>
        <p class="text-[14.5px] leading-relaxed text-muted">
          We've built your site, set up your locations, and it's already live. Let's take two minutes to confirm your notification settings and show you how to make changes.
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
          icon="i-lucide-arrow-right"
          class="self-start"
          @click="advance('preview')"
        >
          Let's go
        </UButton>
      </div>
    </div>

    <!-- Chat transcript uses the same scroll and message layout as every ChowBot surface. -->
    <ChowBotConversation
      v-else
      :messages="messages"
      input=""
      placeholder=""
      :show-empty-state="false"
      :show-prompt="false"
      :render-markdown="renderMarkdown"
    >
      <template #assistant-after="{ message: msg }">
        <div class="space-y-3">
                <!-- Site preview card -->
                <div v-if="msg.siteCard" class="rounded-xl border border-default bg-elevated px-4 py-3 space-y-2">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-globe" class="size-4 text-primary shrink-0" />
                    <span class="text-[13px] font-semibold text-highlighted">{{ msg.siteCard.name }}</span>
                  </div>
                  <p class="text-[12px] text-muted">{{ msg.siteCard.locationCount }} location{{ msg.siteCard.locationCount === 1 ? '' : 's' }} · {{ msg.siteCard.plan }} plan</p>
                  <a
                    :href="msg.siteCard.url"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                  >
                    <UIcon name="i-lucide-external-link" class="size-3.5" />
                    Open live site
                  </a>
                </div>

                <div
                  v-if="msg.notifCard && notificationError"
                  role="alert"
                  class="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-600 dark:border-error-800 dark:bg-error-950 dark:text-error-400"
                >
                  {{ notificationError }}
                </div>

                <!-- Notification form card -->
                <NotificationRoutingCard
                  v-if="msg.notifCard"
                  v-model:form="notifForm"
                  title="Notification routing"
                  description="Your owner number gets every booking and message, and each location can have its own notification number for the person managing it."
                  action-label="Save notification settings"
                  :loading="savingNotifs"
                  :disabled="savingNotifs"
                  @submit="saveNotifications"
                />

                <!-- Team invite card -->
                <TeamInviteCard
                  v-if="msg.teamCard"
                  v-model:form="inviteForm"
                  title="Team access"
                  description="Invite anyone who helps manage the site. You can add more people later from Settings → Members."
                  action-label="Send invite"
                  skip-label="Skip for now"
                  continue-label="Continue"
                  :loading="inviting"
                  :invite-success="inviteSuccess"
                  @submit="sendInvite"
                  @skip="skipTeam"
                  @continue="advance(showSocialStep ? 'social' : showDomainStep ? 'domain' : 'done')"
                />

                <!-- Social card -->
                <div v-if="msg.socialCard" class="rounded-xl border border-default bg-elevated px-4 py-3 space-y-3">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-simple-icons-facebook" class="size-4 text-[#1877F2] shrink-0" />
                    <span class="text-[13px] font-semibold text-highlighted">Facebook & Instagram</span>
                    <UBadge v-if="facebookConnected" label="Connected" color="success" variant="soft" size="xs" />
                  </div>
                  <p class="text-[12px] text-muted leading-relaxed">
                    Connect your Facebook Page and posts you publish there will automatically sync to your site. Instagram Business accounts linked to the Page sync too.
                  </p>
                  <div class="flex gap-2 pt-1">
                    <UButton
                      v-if="!facebookConnected"
                      size="sm"
                      color="primary"
                      icon="i-simple-icons-facebook"
                      :loading="connectingFacebook"
                      @click="startFacebookConnect"
                    >
                      Connect Facebook
                    </UButton>
                    <UButton
                      size="sm"
                      color="neutral"
                      :variant="facebookConnected ? 'solid' : 'ghost'"
                      @click="advance(showDomainStep ? 'domain' : 'done')"
                    >
                      {{ facebookConnected ? 'Continue' : 'Set up later' }}
                    </UButton>
                  </div>
                </div>

                <!-- Domain card -->
                <div v-if="msg.domainCard" class="rounded-xl border border-default bg-elevated px-4 py-3 space-y-2">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-globe" class="size-4 text-primary shrink-0" />
                    <span class="text-[13px] font-semibold text-highlighted">Custom domain setup</span>
                  </div>
                  <p class="text-[12px] text-muted leading-relaxed">Point <code class="font-mono">www.yourdomain.com</code> to us with a CNAME, then add the SSL verification TXT records. Full instructions are in Settings → Domains.</p>
                  <div class="flex gap-2 pt-1">
                    <UButton size="sm" color="primary" variant="outline" :to="`/dashboard/${orgSlug}/~/settings/domains`">
                      Go to Domains settings
                    </UButton>
                    <UButton size="sm" color="neutral" variant="ghost" @click="advance('done')">
                      Set up later
                    </UButton>
                  </div>
                </div>

                <!-- Done card -->
                <div v-if="msg.doneCard" class="space-y-3">
                  <PolishSuggestionsCard
                    :vertical="siteVertical"
                    :primary-to="`/dashboard/${orgSlug}`"
                    primary-label="Open the dashboard"
                  />
                  <McpEditCard
                    guide-to="/docs/integrations/mcp-setup"
                    guide-label="Open setup docs"
                    :starter-prompt="transferStarterPrompt"
                    :dashboard-to="`/dashboard/${orgSlug}`"
                    dashboard-label="Open the dashboard"
                  />
                  <UButton color="primary" icon="i-lucide-arrow-right" @click="finish">
                    Go to my dashboard
                  </UButton>
                </div>

                <!-- Step action buttons (for non-card steps) -->
                <div v-if="msg.actions?.length" class="flex flex-wrap gap-2">
                  <UButton
                    v-for="action in msg.actions"
                    :key="action.label"
                    size="sm"
                    :color="action.primary ? 'primary' : 'neutral'"
                    :variant="action.primary ? 'solid' : 'outline'"
                    @click="action.fn()"
                  >{{ action.label }}</UButton>
                </div>
        </div>
      </template>
    </ChowBotConversation>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import ChowBotConversation from '~/components/chowbot/ChowBotConversation.vue'

interface Location {
  id: string
  title: string
  notification_phone: string | null
}

interface Props {
  siteId: string
  orgSlug: string
  siteName: string
  siteDomain: string
  locations: Location[]
  plan: string
  ownerPhone: string | null
  vertical?: 'restaurant' | 'experience' | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ done: [] }>()
const siteVertical = computed(() => props.vertical === 'experience' ? 'experience' : 'restaurant')
const transferStarterPrompt = computed(() => props.vertical === 'experience'
  ? 'Audit this imported site and help me improve it. Start with hero copy, brand story, missing photos, and any weak experience pages.'
  : 'Audit this imported site and help me improve it. Start with hero copy, brand story, missing photos, and any weak menu pages.'
)

type WizardStep = 'welcome' | 'preview' | 'notifications' | 'team' | 'social' | 'domain' | 'done'

interface BotMessage {
  id: string
  role: 'assistant'
  content: string
  siteCard?: { name: string; locationCount: number; plan: string; url: string }
  notifCard?: boolean
  teamCard?: boolean
  socialCard?: boolean
  domainCard?: boolean
  doneCard?: boolean
  actions?: Array<{ label: string; primary?: boolean; fn: () => void }>
}

const WELCOME_POINTS: [string, string][] = [
  ['i-lucide-circle-check', 'Your site is live and indexed'],
  ['i-lucide-bell', 'Confirm where operational alerts should go'],
  ['i-lucide-users', 'Invite your team to manage locations'],
  ['i-lucide-messages-square', 'Edit anything from ChatGPT'],
]

const step = ref<WizardStep>('welcome')
const messages = ref<BotMessage[]>([])
let msgSeq = 0

const notifForm = reactive({
  ownerPhone: props.ownerPhone ?? '',
  channels: ['whatsapp'] as string[],
  locations: props.locations.map(l => ({ id: l.id, title: l.title, notificationPhone: l.notification_phone ?? '' })),
})

const inviteForm = reactive({ email: '', role: 'member' })
const savingNotifs = ref(false)
const inviting = ref(false)
const inviteSuccess = ref(false)
const inviteError = ref<string | null>(null)
const notificationError = ref<string | null>(null)

const showDomainStep = computed(() => ['growth', 'managed', 'seo_accelerator'].includes(props.plan))
const showSocialStep = computed(() => ['growth', 'managed', 'seo_accelerator'].includes(props.plan))

const connectingFacebook = ref(false)
const facebookConnected = ref(false)

const { data: session } = await authClient.useSession(useFetch)
const activeOrgId = computed(() => session.value?.session?.activeOrganizationId ?? null)
const toast = useToast()

function renderMarkdown(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pushMessage(msg: Omit<BotMessage, 'id' | 'role'>) {
  messages.value.push({ id: String(++msgSeq), role: 'assistant', ...msg })
}

function advance(target: WizardStep) {
  step.value = target
  notificationError.value = null

  if (target === 'preview') {
    pushMessage({
      content: `Here's what we built for ${props.siteName}. Take a look at the live preview on the right — you can browse every page and switch locations.`,
      siteCard: {
        name: props.siteName,
        locationCount: props.locations.length,
        plan: props.plan,
        url: `https://${props.siteDomain}`,
      },
      actions: [{ label: 'Looks great, continue', primary: true, fn: () => advance('notifications') }],
    })
  }

  if (target === 'social') {
    checkFacebookConnection()
  }

  if (target === 'notifications') {
    pushMessage({
      content: `First, let's confirm where alerts should go so bookings and messages land with the right person at each location.`,
      notifCard: true,
    })
  }

  if (target === 'team') {
    pushMessage({
      content: `Would you like to invite anyone to help manage the site? You can add team members now or do it later from Settings → Members.`,
      teamCard: true,
    })
  }

  if (target === 'social') {
    pushMessage({
      content: `Your ${props.plan} plan includes Facebook and Instagram sync. Connect your Facebook Page and posts you publish there will automatically appear on your site.`,
      socialCard: true,
    })
  }

  if (target === 'domain') {
    pushMessage({
      content: `Your ${props.plan} plan includes a custom domain. If you have a domain like www.yourdomain.com you can point it to your site. Head to Settings → Domains, or skip and do it later.`,
      domainCard: true,
    })
  }

  if (target === 'done') {
    pushMessage({
      content: `You're all set. ${props.siteName} is live and your notifications are configured. Here's how to make changes whenever you need to.`,
      doneCard: true,
    })
  }
}

function notificationSaveErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const data = 'data' in error ? (error as { data?: unknown }).data : null
    if (typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
      return (data as { error: string }).error
    }
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message
    }
  }
  return 'Failed to save notification settings. Please check the numbers and try again.'
}

async function saveNotifications() {
  savingNotifs.value = true
  notificationError.value = null
  try {
    const siteResult = await $fetch(`/api/editor/sites/${props.siteId}/notifications`, {
      method: 'PATCH',
      body: { whatsapp_phone: notifForm.ownerPhone, channels: notifForm.channels },
    }).catch(e => ({ error: e }))
    
    const locationResults = await Promise.allSettled(
      notifForm.locations.map(loc =>
        $fetch(`/api/dashboard/locations/${loc.id}`, {
          method: 'PATCH',
          body: { notification_phone: loc.notificationPhone || null },
        })
      )
    )

    const errors: string[] = []
    if ('error' in siteResult) {
      errors.push(`Site notifications: ${getErrorMessage(siteResult.error, 'failed to save')}`)
    }
    
    locationResults.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const locName = notifForm.locations[idx]?.title || `Location ${idx + 1}`
        errors.push(`${locName}: ${getErrorMessage(result.reason, 'failed to save')}`)
      }
    })

    if (errors.length > 0) {
      notificationError.value = errors.join('\n')
      toast.add({ title: 'Failed to save notification settings', description: notificationError.value, color: 'error' })
    } else {
      advance('team')
    }
  } catch (e) {
    console.error('save_notifications_failed', e)
    notificationError.value = notificationSaveErrorMessage(e)
    toast.add({ title: 'Failed to save notification settings', description: notificationError.value, color: 'error' })
  } finally {
    savingNotifs.value = false
  }
}

async function sendInvite() {
  if (!activeOrgId.value || !inviteForm.email.trim()) return
  inviting.value = true
  inviteSuccess.value = false
  inviteError.value = null
  try {
    const { error } = await authClient.organization.inviteMember({
      email: inviteForm.email.trim(),
      role: inviteForm.role as 'member' | 'admin',
      organizationId: activeOrgId.value,
    })
    if (error) {
      inviteError.value = error.message || 'Failed to send invite. Please try again.'
    } else {
      inviteForm.email = ''
      inviteSuccess.value = true
    }
  } catch (e) {
    console.error('invite_member_failed', e)
    inviteError.value = 'Failed to send invite. Please try again.'
  } finally {
    inviting.value = false
  }
}

function skipTeam() {
  advance(showSocialStep.value ? 'social' : showDomainStep.value ? 'domain' : 'done')
}

async function checkFacebookConnection() {
  try {
    const res = await $fetch<{ connected: boolean }>(`/api/editor/sites/${props.siteId}/integrations/facebook-pages/status`)
    facebookConnected.value = res.connected ?? false
  } catch (e) {
    console.error('check_facebook_connection_failed', e)
    facebookConnected.value = false
  }
}

async function startFacebookConnect() {
  connectingFacebook.value = true
  try {
    const res = await $fetch<{ success: boolean; authUrl?: string; error?: string }>(
      '/api/integrations/facebook-pages/auth',
      { method: 'POST', body: { siteId: props.siteId } }
    )
    if (!res.authUrl) throw new Error(res.error || 'No authorization URL returned')
    window.location.href = res.authUrl
  } catch (e) {
    console.error('facebook_connect_failed', e)
    toast.add({ title: 'Failed to connect Facebook', description: e instanceof Error ? e.message : 'Please try again', color: 'error' })
    connectingFacebook.value = false
  }
}

function finish() {
  emit('done')
}
</script>
