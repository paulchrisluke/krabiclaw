<template>
  <div data-parity-root>
    <BlawbyPageHero v-if="heroTitle || heroDescription" :title="heroTitle" :description="heroDescription" variant="contact" />
    <BlawbyShieldDivider variant="contact" />

    <section class="bg-white py-24 sm:py-32" data-parity-section="contact">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="mx-auto max-w-2xl space-y-16 divide-y divide-gray-100 lg:mx-0 lg:max-w-none">
          <div class="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-3">
            <div>
              <h2 v-if="contactBlock?.title" class="blawby-display text-3xl font-bold text-[var(--blawby-primary)]">{{ contactBlock.title }}</h2>
              <p class="mt-4 leading-7 text-[var(--blawby-primary)]/80">{{ contactBlock?.description }}</p>
            </div>
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-1 lg:col-span-2 lg:gap-8">
              <article v-for="(content, index) in contactCards" :key="index" class="rounded-2xl bg-[var(--blawby-primary-100)] p-10 text-gray-700">
                <BlawbyRichText
                  :content="content"
                  unstyled
                  class="[&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-7 [&_h3]:text-[var(--blawby-primary)]"
                />
              </article>
            </div>
          </div>

        </div>
      </div>
    </section>

    <section v-if="consultation.contact_form_enabled" class="bg-white px-6 pb-24 sm:pb-32" aria-labelledby="blawby-contact-form-heading">
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

    <BlawbyFaqSection :items="routeData.qa" :decoration-url="mediaUrl(qaBlock, 'decoration')" />
    <BlawbyReviewsSection :reviews="routeData.reviews" />
    <BlawbyConsultationCta
      v-if="ctaBlock && ctaBlock.title && ctaBlock.label && ctaBlock.url"
      :title="String(ctaBlock.title || '')"
      :description="optionalString(ctaBlock.description)"
      :label="String(ctaBlock.label || '')"
      :destination="String(ctaBlock.url || '')"
      :background-url="mediaUrl(ctaBlock, 'background')"
      :featured-url="mediaUrl(ctaBlock, 'featured')"
      @click="trackConsultation"
    />
  </div>
</template>

<script setup lang="ts">
import { findTenantPageBlock } from '~/utils/tenant-page-blocks'

const { siteId } = useTenantSite()
const { data, error, shell } = await useBlawbyRoute('contact')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Contact content not found' })
const identity = computed(() => shell.value.identity)
const consultation = computed(() => shell.value.consultation)
const compliance = computed(() => shell.value.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)

function block(type: string) {
  if (!page.value) return null
  const canonicalType = type === 'page_hero' ? 'hero' : type === 'contact_cards' ? 'contact_cta' : type === 'consultation_cta' ? 'contact_cta' : type === 'qa' ? 'faq' : undefined
  return findTenantPageBlock(page.value.blocks, type, canonicalType)
}
function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function mediaUrl(value: ApiRecord | null | undefined, slot: string) {
  const media = value?.media
  const item = media?.find((candidate: unknown) => candidate && typeof candidate === 'object' && (candidate as ApiRecord).slot === slot) as ApiRecord | undefined
  return typeof item?.public_url === 'string' ? item.public_url : null
}

const heroBlock = computed(() => block('page_hero'))
const contactBlock = computed(() => block('contact_cards'))
const ctaBlock = computed(() => block('consultation_cta'))
const qaBlock = computed(() => block('qa'))
const heroTitle = computed(() => String(heroBlock.value?.title || page.value?.title || ''))
const heroDescription = computed(() => Array.isArray(heroBlock.value?.description) ? heroBlock.value.description.join('\n\n') : String(heroBlock.value?.description || page.value?.summary || ''))
const contactCards = computed(() => Array.isArray(contactBlock.value?.cardsContent) ? contactBlock.value.cardsContent.map(String) : [])
const submitting = ref(false)
const submitMessage = ref('')
const form = reactive({ name: '', email: '', subject: 'general', message: '', consent: false })
const { trackConsultationClick, mirrorSubmission } = useSiteConversionTracking(consultation)

async function submitContact() {
  if (!siteId || submitting.value) return
  submitting.value = true
  submitMessage.value = ''
  try {
    await publicApiMutation<{ success: true }>(`/api/public/sites/${siteId}/contact`, {
      method: 'POST',
      body: form,
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    mirrorSubmission('contact_submit')
    setContactConfirmation({
      siteId,
      siteName: identity.value.brand_name,
      guestName: form.name,
      subject: form.subject,
    })
    await navigateTo('/contact/confirmed')
  } catch (error) {
    const fetchError = error as { data?: { error?: string; message?: string; statusMessage?: string } }
    submitMessage.value = fetchError.data?.error || fetchError.data?.message || fetchError.data?.statusMessage || 'Unable to send right now.'
  } finally {
    submitting.value = false
  }
}

function trackConsultation() {
  trackConsultationClick('contact', '/contact', optionalString(ctaBlock.value?.url) || consultation.value.schedule_path)
}

const { canonicalUrl } = useSocialMetadata(() => ({
  path: '/contact',
  title: page.value?.seo_title || `Contact | ${identity.value.brand_name}`,
  description: page.value?.seo_description || page.value?.summary || '',
  brand: {
    siteName: identity.value.brand_name,
    logoUrl: identity.value.media.find(item => item.slot === 'logo')?.public_url || null,
    faviconUrl: identity.value.media.find(item => item.slot === 'favicon')?.public_url || null,
  },
}))
const homeUrl = useSeoUrl(() => '/')

useProfessionalServiceSchema(() => ({
  recipe: 'contact',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: page.value?.seo_title || heroTitle.value,
  pageDescription: page.value?.seo_description || page.value?.summary || null,
  breadcrumbs: [
    { name: 'Home', url: homeUrl.value },
    { name: 'Contact', url: canonicalUrl.value },
  ],
  faqs: routeData.value.qa
    .map(item => ({ question: item.question.trim(), answer: item.answer?.trim() ?? '' }))
    .filter(item => item.question && item.answer),
}))
</script>
