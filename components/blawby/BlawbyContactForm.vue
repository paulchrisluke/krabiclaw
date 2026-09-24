<template>
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
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

// The Blawby contact form. It is a block so the page says where it sits: it
// used to be markup between two fixed sections, so a firm could not put its
// questions above it or its practice areas below.
defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

const { organizationId } = useTenantOrganization()
const { localePath } = useI18n()
// The same keyed request the page already made; the shell carries the firm's
// name for the confirmation and its consultation settings for the tracking.
const { shell } = await useBlawbyRoute('contact')
const identity = computed(() => shell.value.identity)
const consultation = computed(() => shell.value.consultation)
const submitting = ref(false)
const submitMessage = ref('')
const form = reactive({ name: '', email: '', subject: 'general', message: '', consent: false })
const { mirrorSubmission } = useOrganizationConversionTracking(consultation)

async function submitContact() {
  if (!organizationId || submitting.value) return
  submitting.value = true
  submitMessage.value = ''
  try {
    await publicApiMutation<{ success: true }>(`/api/public/contact`, {
      method: 'POST',
      body: form,
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    mirrorSubmission('contact_submit')
    setContactConfirmation({
      organizationId,
      organizationName: identity.value.name,
      guestName: form.name,
      subject: form.subject,
    })
    await navigateTo(localePath('/contact/confirmed'))
  } catch (error) {
    const fetchError = error as { data?: { error?: string; message?: string; statusMessage?: string } }
    submitMessage.value = fetchError.data?.error || fetchError.data?.message || fetchError.data?.statusMessage || 'Unable to send right now.'
  } finally {
    submitting.value = false
  }
}
</script>
