<template>
  <div class="relative flex min-h-0 flex-col border-r border-default bg-default">

    <!-- Pane header -->
    <div class="flex shrink-0 items-center justify-between border-b border-default px-5 py-3">
      <div class="flex items-center gap-2">
        <div class="flex size-[26px] items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-heroicons-check-badge" class="size-4" />
        </div>
        <span class="text-sm font-semibold text-highlighted">Site handoff</span>
      </div>
    </div>

    <!-- Scroll area -->
    <div ref="scrollRef" class="min-h-0 flex-1 overflow-y-auto">

      <!-- Welcome screen -->
      <div v-if="step === 'welcome'" class="flex flex-col gap-[18px] p-6 pb-4">
        <div class="flex size-16 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
          <UIcon name="i-heroicons-check-badge" class="size-8" />
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
          icon="i-heroicons-arrow-right"
          class="self-start"
          @click="advance('preview')"
        >
          Let's go
        </UButton>
      </div>

      <!-- Chat transcript -->
      <UChatMessages
        v-else
        class="p-5"
      >
        <template v-for="(msg, i) in messages" :key="msg.id">

          <!-- Bot bubble -->
          <UChatMessage
            :id="String(i)"
            role="assistant"
            :parts="[{ type: 'text', text: '' }]"
            side="left"
          >
            <template #content>
              <div class="space-y-3">
                <div
                  v-if="msg.text"
                  class="text-sm leading-relaxed"
                >{{ msg.text }}</div>

                <!-- Site preview card -->
                <div v-if="msg.siteCard" class="rounded-xl border border-default bg-elevated px-4 py-3 space-y-2">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-globe-alt" class="size-4 text-primary shrink-0" />
                    <span class="text-[13px] font-semibold text-highlighted">{{ msg.siteCard.name }}</span>
                  </div>
                  <p class="text-[12px] text-muted">{{ msg.siteCard.locationCount }} location{{ msg.siteCard.locationCount === 1 ? '' : 's' }} · {{ msg.siteCard.plan }} plan</p>
                  <a
                    :href="msg.siteCard.url"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                  >
                    <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-3.5" />
                    Open live site
                  </a>
                </div>

                <!-- Notification form card -->
                <div v-if="msg.notifCard" class="rounded-xl border border-default bg-elevated px-4 py-4 space-y-4">
                  <div>
                    <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed mb-2">Your number (gets all notifications)</p>
                    <UInput
                      v-model="notifForm.ownerPhone"
                      type="tel"
                      placeholder="+447464115465"
                      size="sm"
                    />
                  </div>
                  <div>
                    <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed mb-2">Channel</p>
                    <div class="flex gap-2">
                      <button
                        v-for="ch in CHANNEL_OPTIONS"
                        :key="ch.value"
                        :class="[
                          'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                          notifForm.channels.includes(ch.value)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-default bg-default text-muted hover:border-default/80',
                        ]"
                        @click="toggleChannel(ch.value)"
                      >{{ ch.label }}</button>
                    </div>
                  </div>
                  <div v-if="locations.length">
                    <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed mb-2">Location notification numbers</p>
                    <div class="space-y-2">
                      <div v-for="loc in notifForm.locations" :key="loc.id" class="flex items-center gap-2">
                        <span class="w-32 shrink-0 truncate text-[12px] text-muted">{{ loc.title }}</span>
                        <UInput
                          v-model="loc.notificationPhone"
                          type="tel"
                          :placeholder="loc.title"
                          size="sm"
                          class="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                  <UButton
                    size="sm"
                    color="primary"
                    :loading="savingNotifs"
                    @click="saveNotifications"
                  >
                    Save notification settings
                  </UButton>
                </div>

                <!-- Team invite card -->
                <div v-if="msg.teamCard" class="rounded-xl border border-default bg-elevated px-4 py-4 space-y-3">
                  <UForm :state="inviteForm" class="flex flex-col gap-2" @submit.prevent="sendInvite">
                    <div class="flex gap-2">
                      <UInput
                        v-model="inviteForm.email"
                        type="email"
                        placeholder="teammate@example.com"
                        size="sm"
                        class="flex-1"
                      />
                      <USelect
                        v-model="inviteForm.role"
                        :items="ROLE_OPTIONS"
                        size="sm"
                        class="w-28"
                      />
                    </div>
                    <div class="flex gap-2">
                      <UButton type="submit" size="sm" color="primary" :loading="inviting" icon="i-heroicons-paper-airplane">
                        Send invite
                      </UButton>
                      <UButton size="sm" color="neutral" variant="ghost" @click="skipTeam">
                        Skip for now
                      </UButton>
                    </div>
                  </UForm>
                  <UAlert
                    v-if="inviteSuccess"
                    color="success"
                    variant="soft"
                    icon="i-heroicons-check-circle"
                    description="Invite sent. Add another or continue."
                    :ui="{ root: 'py-2' }"
                  />
                  <UButton
                    v-if="inviteSuccess"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    @click="advance(showSocialStep ? 'social' : showDomainStep ? 'domain' : 'done')"
                  >
                    Continue
                  </UButton>
                </div>

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
                    <UIcon name="i-heroicons-globe-alt" class="size-4 text-primary shrink-0" />
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
                  <div class="rounded-xl border border-default bg-elevated px-4 py-3 space-y-1">
                    <div class="flex items-center gap-2 mb-1">
                      <UIcon name="i-simple-icons-openai" class="size-4 text-highlighted shrink-0" />
                      <span class="text-[13px] font-semibold text-highlighted">Edit with ChatGPT</span>
                    </div>
                    <p class="text-[12px] text-muted leading-relaxed">Open ChatGPT, connect the KrabiClaw tool, and type what you want to change. Example: <em>"Update the beachfront pottery price to ฿2,000"</em> or <em>"Add a new FAQ to the Krabi location."</em></p>
                  </div>
                  <div class="rounded-xl border border-default bg-elevated px-4 py-3 space-y-1">
                    <div class="flex items-center gap-2 mb-1">
                      <UIcon name="i-heroicons-squares-2x2" class="size-4 text-highlighted shrink-0" />
                      <span class="text-[13px] font-semibold text-highlighted">Edit in the dashboard</span>
                    </div>
                    <p class="text-[12px] text-muted leading-relaxed">Use the location tabs (posts, photos, menu, reviews) and Settings for team members, billing, and domain management.</p>
                  </div>
                  <UButton color="primary" icon="i-heroicons-arrow-right" @click="finish">
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
          </UChatMessage>
        </template>
      </UChatMessages>
    </div>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

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
}

const props = defineProps<Props>()
const emit = defineEmits<{ done: [] }>()

type WizardStep = 'welcome' | 'preview' | 'notifications' | 'team' | 'social' | 'domain' | 'done'

interface BotMessage {
  id: string
  text?: string
  siteCard?: { name: string; locationCount: number; plan: string; url: string }
  notifCard?: boolean
  teamCard?: boolean
  socialCard?: boolean
  domainCard?: boolean
  doneCard?: boolean
  actions?: Array<{ label: string; primary?: boolean; fn: () => void }>
}

const WELCOME_POINTS: [string, string][] = [
  ['i-heroicons-check-circle', 'Your site is live and indexed'],
  ['i-heroicons-bell', 'Booking and contact notifications ready'],
  ['i-heroicons-users', 'Invite your team to manage locations'],
  ['i-heroicons-chat-bubble-left-right', 'Edit anything from ChatGPT'],
]

const CHANNEL_OPTIONS = [
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Email', value: 'email' },
]

const ROLE_OPTIONS = [
  { label: 'Member', value: 'member' },
  { label: 'Admin', value: 'admin' },
]

const scrollRef = ref<HTMLElement | null>(null)
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

const showDomainStep = computed(() => ['growth', 'managed', 'seo_accelerator'].includes(props.plan))
const showSocialStep = computed(() => ['growth', 'managed', 'seo_accelerator'].includes(props.plan))

const connectingFacebook = ref(false)
const facebookConnected = ref(false)

const { data: session } = await authClient.useSession(useFetch)
const activeOrgId = computed(() => session.value?.session?.activeOrganizationId ?? null)
const toast = useToast()

function pushMessage(msg: Omit<BotMessage, 'id'>) {
  messages.value.push({ id: String(++msgSeq), ...msg })
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

function toggleChannel(value: string) {
  const idx = notifForm.channels.indexOf(value)
  if (idx === -1) {
    notifForm.channels.push(value)
  } else if (notifForm.channels.length > 1) {
    notifForm.channels.splice(idx, 1)
  }
}

function advance(target: WizardStep) {
  step.value = target

  if (target === 'preview') {
    pushMessage({
      text: `Here's what we built for ${props.siteName}. Take a look at the live preview on the right — you can browse every page and switch locations.`,
      siteCard: {
        name: props.siteName,
        locationCount: props.locations.length,
        plan: props.plan,
        url: `https://${props.siteDomain}`,
      },
      actions: [{ label: 'Looks great, continue', primary: true, fn: () => advance('notifications') }],
    })
  }

  if (target === 'notifications') {
    pushMessage({
      text: `Now let's set up where you get notified. Your owner number gets every booking and message. Each location can also have its own notification number for the person managing it.`,
      notifCard: true,
    })
  }

  if (target === 'team') {
    pushMessage({
      text: `Would you like to invite anyone to help manage the site? You can add team members now or do it later from Settings → Members.`,
      teamCard: true,
    })
  }

  if (target === 'social') {
    pushMessage({
      text: `Your ${props.plan} plan includes Facebook and Instagram sync. Connect your Facebook Page and posts you publish there will automatically appear on your site.`,
      socialCard: true,
    })
  }

  if (target === 'domain') {
    pushMessage({
      text: `Your ${props.plan} plan includes a custom domain. If you have a domain like www.yourdomain.com you can point it to your site. Head to Settings → Domains, or skip and do it later.`,
      domainCard: true,
    })
  }

  if (target === 'done') {
    pushMessage({
      text: `You're all set. ${props.siteName} is live and your notifications are configured. Here's how to make changes whenever you need to.`,
      doneCard: true,
    })
  }
}

async function saveNotifications() {
  savingNotifs.value = true
  try {
    await Promise.all([
      $fetch(`/api/editor/sites/${props.siteId}/notifications`, {
        method: 'PATCH',
        body: { whatsapp_phone: notifForm.ownerPhone, channels: notifForm.channels },
      }),
      ...notifForm.locations.map(loc =>
        $fetch(`/api/dashboard/locations/${loc.id}`, {
          method: 'PATCH',
          body: { notification_phone: loc.notificationPhone || null },
        })
      ),
    ])
    advance('team')
  } catch (e) {
    console.error('save_notifications_failed', e)
    toast.add({ title: 'Failed to save notification settings', color: 'error' })
  } finally {
    savingNotifs.value = false
  }
}

async function sendInvite() {
  if (!activeOrgId.value || !inviteForm.email.trim()) return
  inviting.value = true
  inviteSuccess.value = false
  try {
    const { error } = await authClient.organization.inviteMember({
      email: inviteForm.email.trim(),
      role: inviteForm.role as 'member' | 'admin',
      organizationId: activeOrgId.value,
    })
    if (!error) {
      inviteForm.email = ''
      inviteSuccess.value = true
    }
  } catch (e) {
    console.error('invite_member_failed', e)
  } finally {
    inviting.value = false
  }
}

function skipTeam() {
  advance(showSocialStep.value ? 'social' : showDomainStep.value ? 'domain' : 'done')
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
