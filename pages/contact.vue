<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">

    <!-- ── TENANT: Brand contact page ────────────────────────── -->
    <div v-if="!isPlatform">

      <!-- Single-location: redirect handled in setup, but show contact link as fallback -->
      <template v-if="isSingleLocation">
        <div class="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 class="saya-display-md saya-italic text-default">Get in touch.</h1>
          <p class="mt-4 text-sm text-muted">Choose a location to find hours, address and directions.</p>
          <div class="mt-12 flex justify-center gap-4 flex-wrap">
            <NuxtLink
              v-for="loc in locations"
              :key="loc.id"
              :to="`/locations/${loc.slug}/contact`"
              class="inline-flex items-center rounded-full border border-default px-6 py-3 text-sm font-medium text-default no-underline transition hover:bg-muted"
            >
              {{ loc.title }} →
            </NuxtLink>
          </div>
        </div>
      </template>

      <!-- Multi-location: full brand contact layout -->
      <template v-else>
        <!-- Page header -->
        <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
          <p class="saya-kicker mb-6">Contact</p>
          <h1 class="saya-display-md text-default">
            Get in <em class="saya-italic">touch</em>.
          </h1>
          <p class="mt-5 max-w-xl text-sm leading-relaxed text-muted">
            {{ restaurantName }} runs {{ spelledCount(locations.length) }} {{ locations.length === 2 ? 'rooms' : 'locations' }}.
            For a reservation, pick a location below — for press, partnerships, catering or anything else, use the form.
          </p>
        </header>

        <!-- Top grid: form (wide) + dark aside -->
        <div class="mx-auto grid max-w-7xl gap-6 px-4 pb-6 sm:px-6 lg:grid-cols-[1.6fr_1fr] lg:px-8">

          <!-- MESSAGE FORM -->
          <section class="border border-default bg-default p-10 lg:p-11">
            <p class="saya-eyebrow mb-4 text-muted">Send a message</p>
            <h2 class="saya-display saya-italic text-3xl text-default">Anything not <em>location-specific</em>.</h2>
            <p class="mt-4 text-sm leading-relaxed text-muted">For specific questions about hours, parking, or a reservation, the individual location pages will get you a faster answer.</p>

            <!-- Success state -->
            <div v-if="tenantSubmitted" class="mt-10 py-4">
              <UIcon name="i-heroicons-check-circle" class="size-7 text-default" />
              <div class="saya-display saya-italic mt-4 text-3xl text-default">Got it. Thank you.</div>
              <p class="mt-3 text-sm leading-relaxed text-muted">We'll reply within a working day. For anything urgent, call the room directly.</p>
              <button class="mt-6 text-xs uppercase tracking-widest text-default underline-offset-2 hover:underline" @click="tenantSubmitted = false; tenantForm = { name: '', email: '', subject: 'general', message: '' }">
                Send another →
              </button>
            </div>

            <UForm v-else :state="tenantForm" :validate="validateTenantContact" class="mt-10 space-y-7" @submit="handleTenantContact">
              <div class="grid gap-6 sm:grid-cols-2">
                <UFormField label="Your name" name="name" required>
                  <UInput v-model="tenantForm.name" size="lg" class="w-full" />
                </UFormField>
                <UFormField label="Email" name="email" required>
                  <UInput v-model="tenantForm.email" type="email" size="lg" class="w-full" />
                </UFormField>
              </div>

              <UFormField label="What's this about?" name="subject">
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    v-for="opt in subjectOptions"
                    :key="opt.key"
                    type="button"
                    :class="[
                      'rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-widest transition',
                      tenantForm.subject === opt.key
                        ? 'border-default-inverted bg-default-inverted text-inverted'
                        : 'border-default bg-default text-muted hover:border-muted hover:text-default'
                    ]"
                    @click="tenantForm.subject = opt.key"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </UFormField>

              <UFormField label="Your message" name="message" required>
                <UTextarea v-model="tenantForm.message" size="lg" :rows="6" class="w-full" />
              </UFormField>

              <UButton type="submit" color="primary" size="lg" class="rounded-full" :loading="tenantSubmitting">
                Send message
              </UButton>
            </UForm>
          </section>

          <!-- DARK ASIDE: brand contact + social -->
          <aside class="bg-default-inverted p-10 text-inverted lg:p-11">
            <p class="saya-eyebrow mb-4 text-inverted/60">Brand inquiries</p>
            <h2 class="saya-display saya-italic text-3xl text-inverted">Or reach us direct.</h2>

            <dl v-if="hasAnyBrandContact" class="mt-8 space-y-0">
              <div v-if="siteConfig.press_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">Press</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.press_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.press_email }}</a></dd>
              </div>
              <div v-if="siteConfig.partnerships_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">Partnerships</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.partnerships_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.partnerships_email }}</a></dd>
              </div>
              <div v-if="siteConfig.catering_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">Catering</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.catering_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.catering_email }}</a></dd>
              </div>
              <div v-if="siteConfig.careers_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">Careers</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.careers_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.careers_email }}</a></dd>
              </div>
            </dl>

            <!-- Social -->
            <div v-if="activeSocials.length" class="mt-10">
              <p class="saya-eyebrow mb-5 text-inverted/60">Follow along</p>
              <div class="flex gap-3">
                <a
                  v-for="social in activeSocials"
                  :key="social.name"
                  :href="social.url"
                  :aria-label="social.name"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex size-10 items-center justify-center rounded-full border border-inverted/15 text-inverted transition hover:border-inverted/50"
                >
                  <UIcon :name="`i-simple-icons-${social.name.toLowerCase()}`" class="size-4" />
                </a>
              </div>
            </div>
          </aside>
        </div>

        <!-- Per-location stack -->
        <section class="mt-24 bg-elevated">
          <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div class="mb-12 max-w-2xl">
              <p class="saya-kicker mb-6">By location</p>
              <h2 class="saya-display-md text-default">Hours, address, phone — for each room.</h2>
              <p class="mt-5 text-sm leading-relaxed text-muted">For full parking, accessibility and policy details, follow the "Plan a visit" link on each card.</p>
            </div>

            <div class="flex flex-col gap-6">
              <article
                v-for="loc in locations"
                :key="loc.id"
                class="grid overflow-hidden border border-default bg-default lg:grid-cols-[minmax(280px,360px)_1fr]"
              >
                <!-- Mini map -->
                <div class="aspect-4/3 bg-muted lg:aspect-auto lg:min-h-64">
                  <iframe
                    v-if="loc.map_embed_url"
                    :src="loc.map_embed_url"
                    :title="`${loc.title} on Google Maps`"
                    class="h-full w-full border-0"
                    style="filter:grayscale(0.12)"
                    loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade"
                  />
                  <div v-else class="flex h-full w-full items-center justify-center">
                    <UIcon name="i-heroicons-map-pin" class="size-8 text-muted" />
                  </div>
                </div>

                <!-- Details -->
                <div class="flex flex-col gap-6 p-9">
                  <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p v-if="loc.city || loc.neighborhood" class="saya-eyebrow mb-2 text-muted">{{ loc.city || loc.neighborhood }}</p>
                      <h3 class="saya-display saya-italic text-4xl text-default leading-none">{{ loc.title }}</h3>
                    </div>
                    <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-default">
                      <span class="size-1.5 rounded-full" :class="loc.is_open ? 'bg-green-400' : 'bg-zinc-400'" />
                      {{ loc.hours_today || '—' }}
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-5 border-t border-default pt-6 sm:grid-cols-4">
                    <div>
                      <p class="saya-eyebrow mb-2 text-muted">Address</p>
                      <p class="text-sm leading-relaxed text-default">{{ formatLocAddress(loc) }}</p>
                    </div>
                    <div v-if="loc.phone">
                      <p class="saya-eyebrow mb-2 text-muted">Phone</p>
                      <a :href="`tel:${loc.phone}`" class="border-b border-default pb-px text-sm text-default no-underline hover:opacity-70">{{ loc.phone }}</a>
                    </div>
                    <div v-if="loc.email">
                      <p class="saya-eyebrow mb-2 text-muted">Email</p>
                      <a :href="`mailto:${loc.email}`" class="border-b border-default pb-px text-sm text-default no-underline hover:opacity-70 break-all">{{ loc.email }}</a>
                    </div>
                    <div v-if="loc.hours_today">
                      <p class="saya-eyebrow mb-2 text-muted">Today</p>
                      <p class="text-sm text-default">{{ loc.hours_today }}</p>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-3">
                    <NuxtLink
                      :to="`/locations/${loc.slug}/contact`"
                      class="inline-flex items-center rounded-full bg-default-inverted px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-inverted no-underline transition hover:opacity-80"
                    >
                      Plan a visit →
                    </NuxtLink>
                    <NuxtLink
                      :to="`/locations/${loc.slug}`"
                      class="inline-flex items-center rounded-full border border-default px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-default no-underline transition hover:bg-muted"
                    >
                      Directions
                    </NuxtLink>
                    <NuxtLink
                      :to="`/locations/${loc.slug}/menu`"
                      class="inline-flex items-center rounded-full border border-default px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-default no-underline transition hover:bg-muted"
                    >
                      Menu
                    </NuxtLink>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- ── PLATFORM: KrabiClaw contact page ──────────────── -->
    <div v-else class="container mx-auto px-4 py-16">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-4xl font-bold text-default mb-6">Contact Us</h1>
        <p class="text-lg text-muted mb-12">Get in touch with the KrabiClaw team</p>
        <div class="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 class="text-2xl font-bold text-default mb-6">Get in Touch</h2>
            <div class="space-y-4">
              <div>
                <h3 class="font-semibold text-default mb-1">Email</h3>
                <p class="text-muted">hello@krabiclaw.com</p>
              </div>
              <div>
                <h3 class="font-semibold text-default mb-1">Location</h3>
                <p class="text-muted">Krabi, Thailand 🦀</p>
              </div>
              <div>
                <h3 class="font-semibold text-default mb-1">Support</h3>
                <p class="text-muted">support@krabiclaw.com</p>
              </div>
            </div>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-default mb-6">Send a Message</h2>
            <UCard>
              <UForm :state="platformForm" :validate="validatePlatformContact" class="space-y-4" @submit="handlePlatformContact">
                <UFormField label="Name" name="name" required>
                  <UInput v-model="platformForm.name" size="lg" placeholder="Your name" />
                </UFormField>
                <UFormField label="Email" name="email" required>
                  <UInput v-model="platformForm.email" type="email" size="lg" placeholder="you@example.com" />
                </UFormField>
                <UFormField label="Message" name="message" required>
                  <UTextarea v-model="platformForm.message" size="lg" :rows="4" placeholder="How can we help?" />
                </UFormField>
                <UButton type="submit" color="primary" size="lg" block :loading="platformSubmitting" :disabled="platformSubmitted">
                  {{ platformSubmitted ? 'Message sent!' : 'Send Message' }}
                </UButton>
              </UForm>
            </UCard>
          </div>
        </div>
      </div>
    </div>

  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false })

import { useOrganizationSchema, useBreadcrumbSchema } from '~/composables/useSchemaOrg'

const { isPlatform, siteId, site } = useTenantSite()
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const route = useRoute()
const requestURL = useRequestURL()
const toast = useToast()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const restaurantName = computed(() => site?.brand_name || 'Our Restaurant')

const SPELLED = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const spelledCount = (n) => n <= 10 ? SPELLED[n] : String(n)

// ── Locations ────────────────────────────────────────────
const { data: locationsData } = !isPlatform && siteId
  ? await useFetch(`/api/public/sites/${siteId}/locations`, {
      key: `contact-locs-${siteId}`,
      default: () => ({ locations: [] })
    })
  : { data: ref({ locations: [] }) }

const locations = computed(() => locationsData.value?.locations ?? [])
const isSingleLocation = computed(() => locations.value.length === 1)

function formatLocAddress(loc) {
  if (!loc.address) return loc.city || ''
  if (typeof loc.address === 'string') return loc.address
  const a = loc.address
  return [a.addressLines?.[0], a.locality, a.administrativeArea].filter(Boolean).join(', ')
}

// ── Site config (social + brand contact emails) ──────────
const { data: siteConfigData } = !isPlatform && siteId
  ? useFetch(`/api/public/sites/${siteId}/config`, {
      key: `contact-config-${siteId}`,
      default: () => ({ config: {} })
    })
  : { data: ref({ config: {} }) }

const siteConfig = computed(() => siteConfigData.value?.config ?? {})

function safeUrl(val) {
  if (!val || typeof val !== 'string') return null
  try {
    const u = new URL(val.trim())
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null
  } catch { return null }
}

const activeSocials = computed(() => [
  { name: 'Facebook', url: safeUrl(siteConfig.value.social_facebook) },
  { name: 'Instagram', url: safeUrl(siteConfig.value.social_instagram) },
  { name: 'Tiktok', url: safeUrl(siteConfig.value.social_tiktok) }
].filter(s => s.url))

const hasAnyBrandContact = computed(() =>
  siteConfig.value.press_email || siteConfig.value.partnerships_email ||
  siteConfig.value.catering_email || siteConfig.value.careers_email
)

// ── Tenant form ──────────────────────────────────────────
const subjectOptions = [
  { key: 'general', label: 'General' },
  { key: 'press', label: 'Press' },
  { key: 'partnerships', label: 'Partnerships' },
  { key: 'catering', label: 'Catering & events' },
  { key: 'careers', label: 'Careers' }
]

const tenantForm = ref({ name: '', email: '', subject: 'general', message: '' })
const tenantSubmitting = ref(false)
const tenantSubmitted = ref(false)

const validateTenantContact = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: 'Please enter your name.' })
  if (!state.email) errors.push({ name: 'email', message: 'Please enter your email.' })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: 'Please enter a valid email.' })
  if (!state.message) errors.push({ name: 'message', message: 'Please enter a message.' })
  return errors
}

const handleTenantContact = async () => {
  tenantSubmitting.value = true
  try {
    await $fetch(`/api/public/sites/${siteId}/contact`, {
      method: 'POST',
      body: tenantForm.value
    })
    tenantSubmitted.value = true
    toast.add({ description: "Message sent! We'll be in touch soon.", color: 'success' })
  } catch {
    toast.add({ description: 'Failed to send message. Please try again.', color: 'error' })
  } finally {
    tenantSubmitting.value = false
  }
}

// ── Platform form ────────────────────────────────────────
const platformForm = ref({ name: '', email: '', message: '' })
const platformSubmitting = ref(false)
const platformSubmitted = ref(false)

const validatePlatformContact = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: 'Please enter your name.' })
  if (!state.email) errors.push({ name: 'email', message: 'Please enter your email.' })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: 'Please enter a valid email.' })
  if (!state.message) errors.push({ name: 'message', message: 'Please enter a message.' })
  return errors
}

const handlePlatformContact = async () => {
  platformSubmitting.value = true
  try {
    await $fetch('/api/contact', { method: 'POST', body: platformForm.value })
    platformSubmitted.value = true
    platformForm.value = { name: '', email: '', message: '' }
    toast.add({ description: "Message sent! We'll be in touch soon.", color: 'success' })
    setTimeout(() => { platformSubmitted.value = false }, 3000)
  } catch {
    toast.add({ description: 'Failed to send message. Please try again.', color: 'error' })
  } finally {
    platformSubmitting.value = false
  }
}

// ── SEO ──────────────────────────────────────────────────
if (isPlatform) {
  useOrganizationSchema()
  useBreadcrumbSchema([
    { name: 'Home', url: `${siteUrl}/` },
    { name: 'Contact', url: `${siteUrl}/contact` }
  ])
}

useSeoMeta(isPlatform
  ? {
      title: 'Contact | KrabiClaw',
      description: 'Contact the KrabiClaw team for support, questions, or partnership inquiries.',
      ogUrl: `${siteUrl}/contact`
    }
  : {
      title: computed(() => `Contact | ${restaurantName.value}`),
      description: 'Get in touch with our restaurant.',
      ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
    }
)
</script>
