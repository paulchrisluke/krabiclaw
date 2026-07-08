<template>
  <NuxtLayout name="saya">

    <!-- Brand contact page (tenant sites only — the platform marketing contact page was retired in favor of /help) -->
    <div>

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

            <form class="mt-10 space-y-7" novalidate @submit.prevent="handleTenantContact">
              <div v-if="tenantSubmitError" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                {{ tenantSubmitError }}
              </div>

              <div class="grid gap-6 sm:grid-cols-2">
                <SayaFormField
                  v-slot="{ id, describedBy, invalid }"
                  :label="t('saya.contact_page.your_name')"
                  name="name"
                  required
                  :error="tenantFieldError('name')"
                >
                  <input :id="id" v-model="tenantForm.name" type="text" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
                </SayaFormField>
                <SayaFormField
                  v-slot="{ id, describedBy, invalid }"
                  :label="t('saya.contact_page.email')"
                  name="email"
                  required
                  :error="tenantFieldError('email')"
                >
                  <input :id="id" v-model="tenantForm.email" type="email" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
                </SayaFormField>
              </div>

              <SayaFormField :label="t('saya.contact_page.what_about')" name="subject">
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
              </SayaFormField>

              <SayaFormField
                v-slot="{ id, describedBy, invalid }"
                :label="t('saya.contact_page.your_message')"
                name="message"
                required
                :error="tenantFieldError('message')"
              >
                <textarea :id="id" v-model="tenantForm.message" rows="6" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
              </SayaFormField>

              <SayaButton type="submit" :loading="tenantSubmitting">
                {{ t('saya.contact_page.send_message') }}
              </SayaButton>
            </form>
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
                  <svg v-if="social.name === 'Facebook'" viewBox="0 0 24 24" fill="currentColor" class="size-4"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  <svg v-else-if="social.name === 'Instagram'" viewBox="0 0 24 24" fill="currentColor" class="size-4"><path d="M12 0C8.74 0 8.333.014 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.014 8.333 0 8.74 0 12s.014 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.014 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.014-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.014 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227a3.81 3.81 0 01-.899 1.382 3.744 3.744 0 01-1.38.896c-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421a3.716 3.716 0 01-1.379-.899 3.644 3.644 0 01-.9-1.38c-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm7.846-10.405a1.441 1.441 0 11-2.883 0 1.441 1.441 0 012.883 0z"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor" class="size-4"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
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
                    v-if="safeUrl(loc.map_embed_url)"
                    :src="safeUrl(loc.map_embed_url)"
                    :title="`${loc.title} on Google Maps`"
                    class="h-full w-full border-0"
                    style="filter:grayscale(0.12)"
                    loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade"
                    sandbox="allow-scripts allow-same-origin"
                  />
                  <div v-else class="flex h-full w-full items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-8 text-muted">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
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

  </NuxtLayout>
</template>

<script setup>
import { setContactConfirmation } from '~/composables/useContactHandoff'

definePageMeta({ layout: false })

const { isPlatform, siteId, site } = useTenantSite()
if (isPlatform) throw createError({ statusCode: 404 })

const { locale } = useI18n()
const vertCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))
const { t } = useI18n()
const route = useRoute()
const requestURL = useRequestURL()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const tenantOgImage = useTenantOgImage()

// Plain-Tailwind form styling — replaces UInput/UTextarea's default look
// now that this page no longer depends on Nuxt UI (see SayaFormField.vue).
import { FORM_INPUT_CLASS } from '~/utils/form-constants'
const inputClass = FORM_INPUT_CLASS

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

const inquiryExperienceId = typeof route.query.experienceId === 'string' ? route.query.experienceId : null
const inquiryExperienceTitle = typeof route.query.experienceTitle === 'string' ? route.query.experienceTitle : null

const tenantForm = ref({
  name: '',
  email: '',
  subject: 'general',
  message: inquiryExperienceTitle
    ? `Interested in a group booking for "${inquiryExperienceTitle}". Please send me pricing and availability.`
    : '',
})
const tenantSubmitting = ref(false)
const tenantErrors = ref([])
const tenantSubmitError = ref(null)
const tenantFieldError = (name) => tenantErrors.value.find(e => e.name === name)?.message ?? null

const validateTenantContact = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: t('saya.contact_page.enter_name') })
  if (!state.email) errors.push({ name: 'email', message: t('saya.contact_page.enter_email') })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: t('saya.contact_page.invalid_email') })
  if (!state.message) errors.push({ name: 'message', message: t('saya.contact_page.enter_message') })
  return errors
}

const handleTenantContact = async () => {
  if (!siteId) {
    tenantSubmitError.value = t('saya.contact_page.message_failed')
    return
  }
  tenantSubmitError.value = null
  tenantErrors.value = validateTenantContact(tenantForm.value)
  if (tenantErrors.value.length > 0) return

  tenantSubmitting.value = true
  try {
    await $fetch(`/api/public/sites/${siteId}/contact`, {
      method: 'POST',
      body: { ...tenantForm.value, experienceId: inquiryExperienceId }
    })
  } catch {
    tenantSubmitError.value = t('saya.contact_page.message_failed')
    tenantSubmitting.value = false
    return
  }

  // Best-effort only — a failure here (private browsing, storage quota) must
  // never make a successful submission look like it failed.
  try {
    setContactConfirmation({
      siteId,
      siteName: businessName.value,
      guestName: tenantForm.value.name,
      subject: tenantForm.value.subject,
    })
  } catch {
    // ignore — /contact/confirmed shows a generic success state either way
  }
  await navigateTo('/contact/confirmed')
  tenantSubmitting.value = false
}

// ── SEO ──────────────────────────────────────────────────
useSeoMeta({
  title: computed(() => `Contact | ${businessName.value}`),
  description: 'Get in touch with our business.',
  ogTitle: computed(() => `Contact | ${businessName.value}`),
  ogDescription: 'Get in touch with our business.',
  ogSiteName: computed(() => businessName.value),
  twitterTitle: computed(() => `Contact | ${businessName.value}`),
  twitterDescription: 'Get in touch with our business.',
  ogImage: tenantOgImage,
  ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
})
</script>
