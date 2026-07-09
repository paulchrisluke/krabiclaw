<template>
  <section class="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Contact</p>
      <h1 class="mt-4 font-display text-5xl leading-tight text-[var(--blawby-primary)]">Contact {{ siteName }}</h1>
      <p class="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
        Send a message with the issue, deadline, and best way to reach you.
      </p>

      <form class="mt-10 grid gap-5" @submit.prevent="submitContact">
        <p v-if="submitMessage" class="border border-[var(--blawby-border)] bg-white p-4 text-sm text-[var(--blawby-primary)]">{{ submitMessage }}</p>
        <input v-model="form.name" required type="text" placeholder="Name" class="border border-[var(--blawby-border)] px-4 py-3">
        <input v-model="form.email" required type="email" placeholder="Email" class="border border-[var(--blawby-border)] px-4 py-3">
        <select v-model="form.subject" class="border border-[var(--blawby-border)] px-4 py-3">
          <option value="general">General question</option>
          <option value="partnerships">Partnerships</option>
          <option value="press">Press</option>
        </select>
        <textarea v-model="form.message" required rows="7" placeholder="Message" class="border border-[var(--blawby-border)] px-4 py-3" />
        <BlawbyButton as="button" to="#" type="submit">{{ submitting ? 'Sending...' : 'Send message' }}</BlawbyButton>
      </form>
    </div>

    <aside class="h-fit border border-[var(--blawby-border)] bg-white p-7">
      <h2 class="font-display text-3xl text-[var(--blawby-primary)]">Next step</h2>
      <p class="mt-4 text-sm leading-7 text-slate-600">{{ compliance?.footer_disclaimer || compliance?.disclaimer || 'For urgent deadlines, include the date and any notice details in your message.' }}</p>
      <BlawbyButton class="mt-6" :to="consultation.external_url || consultation.schedule_path" @click="trackConsultation">{{ consultation.cta_label }}</BlawbyButton>
    </aside>
  </section>
</template>

<script setup lang="ts">
const { siteId, site } = useTenantSite()
const { compliance, consultation } = useBlawbySite()
const { trackConsultationClick, trackContactSubmit } = useBlawbyConversionTracking()
const siteName = computed(() => site?.brand_name || 'our team')
const submitting = ref(false)
const submitMessage = ref('')
const form = reactive({ name: '', email: '', subject: 'general', message: '' })

async function submitContact() {
  if (!siteId || submitting.value) return
  submitting.value = true
  submitMessage.value = ''
  try {
    const response = await $fetch<{ message?: string }>(`/api/public/sites/${siteId}/contact`, {
      method: 'POST',
      body: form,
    })
    submitMessage.value = response.message || 'Your message has been sent.'
    trackContactSubmit()
    form.name = ''
    form.email = ''
    form.subject = 'general'
    form.message = ''
  } catch (error) {
    submitMessage.value = error instanceof Error ? error.message : 'Unable to send right now.'
  } finally {
    submitting.value = false
  }
}

function trackConsultation() {
  trackConsultationClick('contact', '/contact', consultation.value.external_url || consultation.value.schedule_path)
}

useSeoMeta({
  title: computed(() => `Contact | ${siteName.value}`),
  description: computed(() => `Contact ${siteName.value}.`),
})
</script>
