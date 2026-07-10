<template>
  <div data-parity-root>
    <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="contact" />
    <BlawbyShieldDivider variant="contact" />

    <section class="bg-white py-24 sm:py-32" data-parity-section="contact">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="mx-auto max-w-2xl space-y-16 divide-y divide-gray-100 lg:mx-0 lg:max-w-none">
          <div class="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-3">
            <div>
              <h2 class="blawby-display text-3xl font-bold text-[var(--blawby-primary)]">{{ contactBlock?.title || 'Get in touch' }}</h2>
              <p class="mt-4 leading-7 text-[var(--blawby-primary)]/80">{{ contactBlock?.description }}</p>
            </div>
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-1 lg:col-span-2 lg:gap-8">
              <article v-for="(content, index) in contactCards" :key="index" class="rounded-2xl bg-[var(--blawby-primary-100)] p-10 text-gray-700">
                <BlawbyRichText :content="content" />
              </article>
            </div>
          </div>

        </div>
      </div>
    </section>

    <section class="bg-white px-6 pb-24 sm:pb-32" aria-labelledby="blawby-contact-form-heading">
      <form class="mx-auto grid max-w-3xl gap-5 rounded-2xl bg-[var(--blawby-primary-100)] p-8 sm:p-10" @submit.prevent="submitContact">
        <h2 id="blawby-contact-form-heading" class="blawby-display text-3xl font-bold text-[var(--blawby-primary)]">Send a message</h2>
        <p v-if="submitMessage" role="alert" class="rounded-lg border border-[var(--blawby-border)] bg-white p-4 text-sm text-[var(--blawby-primary)]">{{ submitMessage }}</p>
        <label class="grid gap-2 text-sm font-semibold text-[var(--blawby-primary)]">Name<input v-model.trim="form.name" required maxlength="100" autocomplete="name" type="text" class="rounded-md border border-[var(--blawby-border)] bg-white px-4 py-3 font-normal"></label>
        <label class="grid gap-2 text-sm font-semibold text-[var(--blawby-primary)]">Email<input v-model.trim="form.email" required maxlength="200" autocomplete="email" type="email" class="rounded-md border border-[var(--blawby-border)] bg-white px-4 py-3 font-normal"></label>
        <label class="grid gap-2 text-sm font-semibold text-[var(--blawby-primary)]">Subject<select v-model="form.subject" class="rounded-md border border-[var(--blawby-border)] bg-white px-4 py-3 font-normal"><option value="general">General question</option><option value="partnerships">Partnerships</option><option value="press">Press</option></select></label>
        <label class="grid gap-2 text-sm font-semibold text-[var(--blawby-primary)]">Message<textarea v-model.trim="form.message" required minlength="10" maxlength="2000" rows="8" class="rounded-md border border-[var(--blawby-border)] bg-white px-4 py-3 font-normal" /></label>
        <label class="flex items-start gap-3 text-sm leading-6 text-slate-600">
          <input v-model="form.consent" required type="checkbox" class="mt-1 size-4 rounded border-gray-300 text-[var(--blawby-primary)] focus:ring-[var(--blawby-primary)]">
          <span>I understand that submitting this form does not create an attorney-client relationship and agree to be contacted about this message.</span>
        </label>
        <BlawbyButton as="button" type="submit" :disabled="submitting" class="w-full">{{ submitting ? 'Sending...' : 'Send message' }}</BlawbyButton>
      </form>
    </section>

    <BlawbyFaqSection :items="routeData.qa" :decoration-url="assetUrl(qaBlock?.decoration)" />
    <BlawbyReviewsSection :reviews="routeData.reviews" />
    <BlawbyConsultationCta
      v-if="ctaBlock"
      :title="String(ctaBlock.title || 'Get started today')"
      :description="optionalString(ctaBlock.description)"
      :label="String(ctaBlock.label || consultation.cta_label)"
      :destination="consultation.external_url || String(ctaBlock.url || consultation.schedule_path)"
      :background-url="assetUrl(ctaBlock.background)"
      :featured-url="assetUrl(ctaBlock.featured)"
      @click="trackConsultation"
    />
  </div>
</template>

<script setup lang="ts">
const { siteId } = useTenantSite()
const { data, error } = await useBlawbyRoute('contact')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Contact content not found' })
const { identity, consultation } = await useBlawbyShell()

function block(type: string) {
  return page.value?.components.find(component => component.type === type) ?? null
}
function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}

const heroBlock = computed(() => block('page_hero'))
const contactBlock = computed(() => block('contact_cards'))
const ctaBlock = computed(() => block('consultation_cta'))
const qaBlock = computed(() => block('qa'))
const heroTitle = computed(() => String(heroBlock.value?.title || page.value?.title || 'Contact Us'))
const heroDescription = computed(() => Array.isArray(heroBlock.value?.description) ? heroBlock.value.description.join('\n\n') : String(heroBlock.value?.description || page.value?.summary || ''))
const contactCards = computed(() => Array.isArray(contactBlock.value?.cardsContent) ? contactBlock.value.cardsContent.map(String) : [])
const submitting = ref(false)
const submitMessage = ref('')
const form = reactive({ name: '', email: '', subject: 'general', message: '', consent: false })
const { trackConsultationClick, trackContactSubmit } = useBlawbyConversionTracking(consultation)

async function submitContact() {
  if (!siteId || submitting.value) return
  submitting.value = true
  submitMessage.value = ''
  try {
    await $fetch(`/api/public/sites/${siteId}/contact`, { method: 'POST', body: form })
    trackContactSubmit()
    try {
      setContactConfirmation({
        siteId,
        siteName: identity.value.brand_name || 'North Carolina Legal Services',
        guestName: form.name,
        subject: form.subject,
      })
    } catch {
      // The confirmation page intentionally has a generic fallback.
    }
    await navigateTo('/contact/confirmed')
  } catch (error) {
    const fetchError = error as { data?: { error?: string; message?: string; statusMessage?: string } }
    submitMessage.value = fetchError.data?.error || fetchError.data?.message || fetchError.data?.statusMessage || 'Unable to send right now.'
  } finally {
    submitting.value = false
  }
}

function trackConsultation() {
  trackConsultationClick('contact', '/contact', consultation.value.external_url || consultation.value.schedule_path)
}

useSeoMeta({
  title: computed(() => page.value?.seo_title || `Contact | ${identity.value.brand_name || 'Professional services'}`),
  description: computed(() => page.value?.seo_description || page.value?.summary || ''),
})
const canonicalUrl = useSeoUrl(() => '/contact')
useHead(() => ({ link: [{ rel: 'canonical', href: canonicalUrl.value }] }))
</script>
