<template>
  <DashboardLeafPanel id="account-activity-detail" :title="activity?.title ?? 'Activity'" :footer="false" :ready="!pending" :error="error ? getErrorMessage(error, 'Activity request failed.') : ''">
    <template v-if="activity">
      <img v-if="activity.imageUrl" :src="activity.imageUrl" alt="" class="mb-6 aspect-video w-full rounded-2xl object-cover">
      <p v-if="activity.organizationName" class="text-base font-semibold text-highlighted">{{ activity.organizationName }}</p>
      <p class="mt-1 text-sm text-muted">{{ accountActivityStatusLabel(activity.status) }}</p>
      <dl v-if="activity.startsAt && activity.endsAt && activity.timeZone" class="mt-6 space-y-4 text-sm">
        <div><dt class="font-semibold text-highlighted">When</dt><dd class="mt-1 text-muted">{{ formatTimestamp(activity.startsAt!, 'en', activity.timeZone!) }} – {{ formatTimestamp(activity.endsAt!, 'en', activity.timeZone!) }}</dd><dd class="mt-1 text-muted">{{ timezoneLabel(activity.timeZone!) }}</dd></div>
        <div v-if="activity.locationTitle"><dt class="font-semibold text-highlighted">Where</dt><dd class="mt-1 text-muted">{{ activity.locationTitle }}</dd></div>
        <div v-if="activity.partySize"><dt class="font-semibold text-highlighted">Guests</dt><dd class="mt-1 text-muted">{{ activity.partySize }}</dd></div>
      </dl>
      <div class="mt-6 flex flex-wrap gap-3">
        <UButton v-if="activity.threadId" :to="`/dashboard/account/messages/${encodeURIComponent(activity.threadId)}`" color="neutral" variant="outline" label="Message" />
        <UButton v-else-if="activity.contactEmail" :to="`mailto:${activity.contactEmail}`" color="neutral" variant="outline" label="Email" />
        <UButton v-if="activity.contactPhone" :to="`tel:${activity.contactPhone.replace(/\s/g, '')}`" color="neutral" variant="outline" label="Call" />
      </div>
      <section v-if="activity.policy" class="mt-6 border-t border-default pt-6">
        <h2 class="text-base font-semibold text-highlighted">{{ activity.policy.heading }}</h2>
        <p v-for="item in activity.policy.items" :key="item.id" class="mt-3 text-sm text-muted">{{ item.text }}</p>
        <!-- Canonical CMS policy writes sanitize these notes before persistence. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="activity.policy.additional_notes_html" class="mt-3 text-sm text-muted" v-html="activity.policy.additional_notes_html" />
      </section>
      <div v-if="activity.canCancel" class="mt-6 border-t border-default pt-6">
        <UButton v-if="!confirmCancel" color="error" variant="outline" label="Cancel booking" @click="confirmCancel = true" />
        <template v-else>
          <p class="text-sm text-muted">Cancel this booking? Cancellation doesn’t automatically refund a payment.</p>
          <div class="mt-3 flex gap-3"><UButton color="error" label="Confirm cancellation" :loading="cancelling" @click="cancel" /><UButton color="neutral" variant="ghost" label="Keep booking" :disabled="cancelling" @click="confirmCancel = false" /></div>
        </template>
      </div>
      <UAlert v-if="actionError" class="mt-4" color="error" :description="actionError" />
      <UAlert v-if="cancelled" class="mt-4" color="success" title="Cancelled" />
      <PaymentDetails v-for="entry in activity.payments" :key="entry.payment.id" :payment="entry.payment" :refunds="entry.refunds" :order="entry.order" />
    </template>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import PaymentDetails from '~/components/dashboard/PaymentDetails.vue'
import { accountActivityStatusLabel } from '~/components/dashboard/AccountActivityCard.vue'
import { authClient } from '~/lib/auth-client'
import { isAccountActivityKind, isAccountActivityDetailResponse, type AccountActivityDetailResponse } from '~/shared/account-activity'
import { formatTimestamp, timezoneLabel } from '~/utils/timezone'
definePageMeta({ layout: 'dashboard', key: route => `${route.params.kind}:${route.params.id}` })
useSeoMeta({ title: 'Activity details | Krabiclaw', robots: 'noindex, nofollow' })
const route = useRoute()
const kind = route.params.kind
const id = route.params.id
if (!isAccountActivityKind(kind) || typeof id !== 'string' || !id) throw createError({ statusCode: 404, statusMessage: 'Activity not found.', fatal: true })
const session = authClient.useSession()
const { data, pending, error, refresh } = await useAsyncData(
  () => `account-activity:${session.value.data?.user.id}:${kind}:${id}`,
  () => applicationFetch<AccountActivityDetailResponse>('/api/account', {
    query: { kind, id },
    validate: (value): value is AccountActivityDetailResponse => isAccountActivityDetailResponse(value) && value.activity.kind === kind && value.activity.id === id,
  }), { server: false },
)
const activity = computed(() => data.value?.activity)
const confirmCancel = ref(false)
const cancelling = ref(false)
const actionError = ref('')
const cancelled = ref(false)
async function cancel() {
  if (cancelling.value || !activity.value?.canCancel || !activity.value.requestId) return
  cancelling.value = true
  actionError.value = ''
  try {
    await applicationFetch('/api/account/cancel', {
      method: 'POST', body: { request_id: activity.value.requestId },
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    confirmCancel.value = false
    cancelled.value = true
    await refresh()
    await refreshNuxtData(`account-activity:${session.value.data?.user.id}`)
  } catch (cause) {
    actionError.value = getErrorMessage(cause, 'Could not cancel this booking.')
  } finally {
    cancelling.value = false
  }
}
</script>
