<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">

    <!-- ── TENANT: Brand contact page ────────────────────────── -->
    <div v-if="!isPlatform">

      <!-- Brand contact layout — shows for all tenant shapes -->
      <div>
        <!-- Page header -->
        <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
          <p class="saya-kicker mb-6">{{ t('saya.contact_page.title') }}</p>
          <h1 class="saya-display-md text-default">
            {{ t('saya.contact_page.headline') }}
          </h1>
          <p class="mt-5 max-w-xl text-sm leading-relaxed text-muted">
            {{ vertCopy.contactSubtitle }}
          </p>
        </header>

        <!-- Top grid: form (wide) + dark aside -->
        <div
          class="mx-auto grid max-w-7xl gap-6 px-4 pb-6 sm:px-6 lg:px-8"
          :class="(hasAnyBrandContact || activeSocials.length) ? 'lg:grid-cols-[1.6fr_1fr]' : 'lg:grid-cols-1'"
        >

          <!-- MESSAGE FORM -->
          <section class="border border-default bg-default p-10 lg:p-11">
            <p class="saya-eyebrow mb-4 text-muted">{{ t('saya.contact_page.send_message') }}</p>
            <h2 class="saya-display saya-italic text-3xl text-default">{{ t('saya.contact_page.anything_not_location_specific') }}</h2>
            <p class="mt-4 text-sm leading-relaxed text-muted">{{ t('saya.contact_page.specific_questions') }}</p>

            <!-- Success state -->
            <div v-if="tenantSubmitted" class="mt-10 py-4">
              <UIcon name="i-heroicons-check-circle" class="size-7 text-default" />
              <div class="saya-display saya-italic mt-4 text-3xl text-default">{{ t('saya.contact_page.got_it') }}</div>
              <p class="mt-3 text-sm leading-relaxed text-muted">{{ t('saya.contact_page.reply_within') }}</p>
              <button class="mt-6 text-xs uppercase tracking-widest text-default underline-offset-2 hover:underline" @click="tenantSubmitted = false; tenantForm = { name: '', email: '', subject: 'general', message: '' }">
                {{ t('saya.contact_page.send_another') }}
              </button>
            </div>

            <UForm v-else :state="tenantForm" :validate="validateTenantContact" class="mt-10 space-y-7" @submit="handleTenantContact">
              <div class="grid gap-6 sm:grid-cols-2">
                <UFormField :label="t('saya.contact_page.your_name')" name="name" required>
                  <UInput v-model="tenantForm.name" size="lg" class="w-full" />
                </UFormField>
                <UFormField :label="t('saya.contact_page.email')" name="email" required>
                  <UInput v-model="tenantForm.email" type="email" size="lg" class="w-full" />
                </UFormField>
              </div>

              <UFormField :label="t('saya.contact_page.what_about')" name="subject">
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    v-for="opt in subjectOptions"
                    :key="opt.key"
                    type="button"
                    :class="[
                      'rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-widest transition',
                      tenantForm.subject === opt.key
                        ? 'border-inverted bg-inverted text-inverted'
                        : 'border-default bg-default text-muted hover:border-muted hover:text-default'
                    ]"
                    @click="tenantForm.subject = opt.key"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </UFormField>

              <UFormField :label="t('saya.contact_page.your_message')" name="message" required>
                <UTextarea v-model="tenantForm.message" size="lg" :rows="6" class="w-full" />
              </UFormField>

              <UButton type="submit" color="primary" size="lg" class="rounded-full" :loading="tenantSubmitting">
                {{ t('saya.contact_page.send_message') }}
              </UButton>
            </UForm>
          </section>

          <!-- DARK ASIDE: brand contact + social — hidden when no emails or socials configured -->
          <aside v-if="hasAnyBrandContact || activeSocials.length" class="bg-inverted p-10 text-inverted lg:p-11">
            <p class="saya-eyebrow mb-4 text-inverted/60">{{ t('saya.contact_page.brand_inquiries') }}</p>
            <h2 class="saya-display saya-italic text-3xl text-inverted">{{ t('saya.contact_page.reach_us_direct') }}</h2>

            <dl v-if="hasAnyBrandContact" class="mt-8 space-y-0">
              <div v-if="siteConfig.press_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">{{ t('saya.contact_page.press') }}</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.press_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.press_email }}</a></dd>
              </div>
              <div v-if="siteConfig.partnerships_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">{{ t('saya.contact_page.partnerships') }}</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.partnerships_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.partnerships_email }}</a></dd>
              </div>
              <div v-if="siteConfig.catering_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">{{ vertCopy.contactSubjectCatering }}</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.catering_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.catering_email }}</a></dd>
              </div>
              <div v-if="siteConfig.careers_email" class="flex justify-between gap-4 border-b border-inverted/10 py-4">
                <dt class="saya-eyebrow text-inverted/60">{{ t('saya.contact_page.careers') }}</dt>
                <dd class="m-0 font-['Instrument_Serif',serif] italic"><a :href="`mailto:${siteConfig.careers_email}`" class="border-b border-inverted/30 pb-px text-inverted no-underline">{{ siteConfig.careers_email }}</a></dd>
              </div>
            </dl>

            <!-- Social -->
            <div v-if="activeSocials.length" class="mt-10">
              <p class="saya-eyebrow mb-5 text-inverted/60">{{ t('saya.contact_page.follow_along') }}</p>
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
              <p class="saya-kicker mb-6">{{ t('saya.contact_page.by_location') }}</p>
              <h2 class="saya-display-md text-default">
                {{ vertCopy.contactLocationsByHeading }}
              </h2>
              <p class="mt-5 text-sm leading-relaxed text-muted">
                {{ vertCopy.contactLocationsByNote }}
              </p>
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
                      <p class="saya-eyebrow mb-2 text-muted">{{ t('saya.contact_page.address') }}</p>
                      <p class="text-sm leading-relaxed text-default">{{ formatLocAddress(loc) }}</p>
                    </div>
                    <div v-if="loc.phone">
                      <p class="saya-eyebrow mb-2 text-muted">{{ t('saya.contact_page.phone') }}</p>
                      <a :href="`tel:${loc.phone}`" class="border-b border-default pb-px text-sm text-default no-underline hover:opacity-70">{{ loc.phone }}</a>
                    </div>
                    <div v-if="loc.email">
                      <p class="saya-eyebrow mb-2 text-muted">{{ t('saya.contact_page.email') }}</p>
                      <a :href="`mailto:${loc.email}`" class="border-b border-default pb-px text-sm text-default no-underline hover:opacity-70 break-all">{{ loc.email }}</a>
                    </div>
                    <div v-if="loc.hours_today">
                      <p class="saya-eyebrow mb-2 text-muted">{{ t('saya.contact_page.today') }}</p>
                      <p class="text-sm text-default">{{ loc.hours_today }}</p>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-3">
                    <NuxtLink
                      :to="`/locations/${loc.slug}/contact`"
                      class="inline-flex items-center rounded-full bg-inverted px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-inverted no-underline transition hover:opacity-80"
                    >
                      {{ t('saya.contact_page.plan_visit') }}
                    </NuxtLink>
                    <NuxtLink
                      :to="`/locations/${loc.slug}`"
                      class="inline-flex items-center rounded-full border border-default px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-default no-underline transition hover:bg-muted"
                    >
                      {{ t('saya.contact_page.directions') }}
                    </NuxtLink>
                    <NuxtLink
                      :to="vertCopy.ctaRoute"
                      class="inline-flex items-center rounded-full border border-default px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-default no-underline transition hover:bg-muted"
                    >
                      {{ vertCopy.reservationExploreLabel }}
                    </NuxtLink>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>


    <!-- ── PLATFORM: KrabiClaw contact page ──────────────── -->
    <div v-else class="container mx-auto px-4 py-16">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-4xl font-bold text-default mb-6">{{ t('saya.contact_page.contact_us') }}</h1>
        <p class="text-lg text-muted mb-12">Get in touch with the KrabiClaw team</p>
        <div class="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 class="text-2xl font-bold text-default mb-6">{{ t('saya.contact_page.contact_us') }}</h2>
            <div class="space-y-4">
              <div>
                <h3 class="font-semibold text-default mb-1">{{ t('saya.contact_page.email') }}</h3>
                <p class="text-muted">hello@krabiclaw.com</p>
              </div>
              <div>
                <h3 class="font-semibold text-default mb-1">Operating Model</h3>
                <p class="text-muted">Fully Distributed & Remote 🌐</p>
              </div>
              <div>
                <h3 class="font-semibold text-default mb-1">Support</h3>
                <p class="text-muted">support@krabiclaw.com</p>
              </div>
            </div>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-default mb-6">{{ t('saya.contact_page.send_message') }}</h2>
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
                  {{ platformSubmitted ? t('saya.contact_page.message_sent') : t('saya.contact_page.send_message') }}
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
const { locale } = useI18n()
const vertCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))
const { t } = useI18n()
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const route = useRoute()
const requestURL = useRequestURL()
const toast = useToast()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const sharedOgImage = useSharedOgImage()
const tenantOgImage = useTenantOgImage()

const businessName = computed(() => site?.brand_name || 'Our Business')

// ── Bootstrap: locations + config in one call ─────────────
const { locations, config: siteConfig } = useBootstrap()

function formatLocAddress(loc) {
  if (!loc.address) return loc.city || ''
  if (typeof loc.address === 'string') return loc.address
  const a = loc.address
  return [a.addressLines?.[0], a.locality, a.administrativeArea].filter(Boolean).join(', ')
}

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
const subjectOptions = computed(() => [
  { key: 'general', label: t('saya.contact_page.general') },
  { key: 'press', label: t('saya.contact_page.press') },
  { key: 'partnerships', label: t('saya.contact_page.partnerships') },
  { key: 'catering', label: vertCopy.value.contactSubjectCatering },
  { key: 'careers', label: t('saya.contact_page.careers') }
])

const tenantForm = ref({ name: '', email: '', subject: 'general', message: '' })
const tenantSubmitting = ref(false)
const tenantSubmitted = ref(false)

const validateTenantContact = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: t('saya.contact_page.enter_name') })
  if (!state.email) errors.push({ name: 'email', message: t('saya.contact_page.enter_email') })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: t('saya.contact_page.invalid_email') })
  if (!state.message) errors.push({ name: 'message', message: t('saya.contact_page.enter_message') })
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
    toast.add({ description: t('saya.contact_page.message_sent'), color: 'success' })
  } catch {
    toast.add({ description: t('saya.contact_page.message_failed'), color: 'error' })
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
  if (!state.name) errors.push({ name: 'name', message: t('saya.contact_page.enter_name') })
  if (!state.email) errors.push({ name: 'email', message: t('saya.contact_page.enter_email') })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: t('saya.contact_page.invalid_email') })
  if (!state.message) errors.push({ name: 'message', message: t('saya.contact_page.enter_message') })
  return errors
}

const handlePlatformContact = async () => {
  platformSubmitting.value = true
  try {
    await $fetch('/api/contact', { method: 'POST', body: platformForm.value })
    platformSubmitted.value = true
    platformForm.value = { name: '', email: '', message: '' }
    toast.add({ description: t('saya.contact_page.message_sent'), color: 'success' })
    setTimeout(() => { platformSubmitted.value = false }, 3000)
  } catch {
    toast.add({ description: t('saya.contact_page.message_failed'), color: 'error' })
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
      ogTitle: 'Contact | KrabiClaw',
      ogDescription: 'Contact the KrabiClaw team for support, questions, or partnership inquiries.',
      ogSiteName: 'KrabiClaw',
      twitterTitle: 'Contact | KrabiClaw',
      twitterDescription: 'Contact the KrabiClaw team for support, questions, or partnership inquiries.',
      ogImage: sharedOgImage,
      ogUrl: `${siteUrl}/contact`
    }
  : {
      title: computed(() => `Contact | ${businessName.value}`),
      description: 'Get in touch with our business.',
      ogTitle: computed(() => `Contact | ${businessName.value}`),
      ogDescription: 'Get in touch with our business.',
      ogSiteName: computed(() => businessName.value),
      twitterTitle: computed(() => `Contact | ${businessName.value}`),
      twitterDescription: 'Get in touch with our business.',
      ogImage: tenantOgImage,
      ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
    }
)
</script>
