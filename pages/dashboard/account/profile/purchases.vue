<template>
 <DashboardLeafPanel id="account-purchases" title="Purchases & bookings" lead="Your purchases, receipts and visits across businesses." :footer="false">
  <UAlert v-if="error" class="mt-4" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="mt-6 h-40" />
  <template v-else-if="data">
   <UEmpty v-if="!data.payments.length && !data.bookings.length && !data.reservations.length && !data.refunds.length" icon="i-lucide-calendar-days" title="No purchases or bookings yet" description="Your purchases, receipts and reservations will appear here." />
   <template v-else>
   <h2 v-if="data.payments.length" class="mt-8 text-lg font-semibold">Purchases and receipts</h2>
   <UCard v-for="payment in data.payments" :key="String(payment.id)" class="mt-3"><p>{{ paymentMoney(payment.captured_amount,payment.currency) }} · {{ payment.state }}</p><p>{{ payment.title }}</p><p>{{ paymentMoney(payment.refunded_amount,payment.currency) }} refunded<span v-if="payment.fulfillment_status"> · {{ payment.fulfillment_status }}</span></p><UButton v-if="payment.receipt_url" :to="String(payment.receipt_url)" target="_blank" class="mt-3" variant="outline">Stripe receipt</UButton></UCard>
   <h2 v-if="data.refunds.length" class="mt-8 text-lg font-semibold">Refunds</h2><p v-for="refund in data.refunds" :key="String(refund.id)" class="mt-3">{{ paymentMoney(refund.amount,refund.currency) }} · {{ refund.status }}</p>
   <section v-for="group in visits.filter(group => group.records.length)" :key="group.title"><h2 class="mt-8 text-lg font-semibold">{{ group.title }}</h2>
    <UCard v-for="visit in group.records" :key="visit.id" :data-testid="`buyer-visit-${visit.id}`" class="mt-3"><p>{{ visit.title || group.singular }} · {{ visit.status }}</p><p>{{ new Date(visit.starts_at).toLocaleString(undefined,{timeZone:visit.timezone}) }}</p>
     <template v-if="visit.can_cancel"><UButton v-if="confirmRequest!==visit.request_id" class="mt-3" color="error" variant="outline" @click="confirmRequest=visit.request_id">Cancel {{ group.singular.toLowerCase() }}</UButton>
      <div v-else class="mt-3"><p>Cancel this {{ group.singular.toLowerCase() }}? Cancellation does not automatically refund a payment.</p><UButton class="mt-2" color="error" :loading="cancelling===visit.request_id" @click="cancel(visit.request_id!)">Confirm cancellation</UButton><UButton class="mt-2 ml-2" variant="ghost" :disabled="Boolean(cancelling)" @click="confirmRequest=null">Keep {{ group.singular.toLowerCase() }}</UButton></div>
     </template>
     <div class="mt-3"><p>{{ visit.can_cancel ? 'Contact the business to request a different time or discuss a refund.' : 'Contact the business about this visit or any payment or refund.' }}</p><UButton v-if="visit.contactEmail" class="mt-2" variant="outline" :to="`mailto:${visit.contactEmail}?subject=${encodeURIComponent(`${visit.can_cancel?'Change request':'Booking'} ${visit.request_id}`)}`">{{ visit.can_cancel ? 'Request a change by email' : 'Contact the business by email' }}</UButton><UButton v-if="visit.contactPhone" class="mt-2 ml-2" variant="outline" :to="`tel:${visit.contactPhone.replace(/\s/g,'')}`">Call the business</UButton><p v-if="!visit.contactEmail&&!visit.contactPhone" class="mt-2 text-muted">The business has not provided contact details.</p></div>
    </UCard>
   </section>
   </template>
  </template>
  <UAlert v-if="message" class="mt-4" :description="message" />
 </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
import {isCurrencyCode} from '~/shared/currencies'
definePageMeta({layout:'dashboard'})
useSeoMeta({title:'Purchases & bookings | Krabiclaw',robots:'noindex, nofollow'})
type Records=Record<string,unknown>[]
interface Visit {id:string;request_id:string|null;title?:string;status:string;starts_at:string;timezone:string;can_cancel:boolean;contactEmail:string|null;contactPhone:string|null}
type Purchases={payments:Records;bookings:Visit[];reservations:Visit[];refunds:Records}
const {data,pending,error,refresh}=await useAsyncData('account-purchases',()=>applicationFetch<Purchases>('/api/account',{
 validate:(value):value is Purchases=>isRecord(value)
  &&Array.isArray(value.payments)&&value.payments.every(row=>isRecord(row)&&typeof row.id==='string'&&typeof row.title==='string'&&!!row.title.trim()&&typeof row.state==='string'&&isCurrencyCode(row.currency)&&Number.isSafeInteger(row.captured_amount)&&Number.isSafeInteger(row.refunded_amount))
  &&Array.isArray(value.refunds)&&value.refunds.every(row=>isRecord(row)&&typeof row.id==='string'&&typeof row.status==='string'&&isCurrencyCode(row.currency)&&Number.isSafeInteger(row.amount))
  &&[value.bookings,value.reservations].every(rows=>Array.isArray(rows)&&rows.every(row=>isRecord(row)&&typeof row.id==='string'&&(row.request_id===null||typeof row.request_id==='string')&&typeof row.status==='string'&&typeof row.starts_at==='string'&&typeof row.timezone==='string'&&typeof row.can_cancel==='boolean'&&(row.contactEmail===null||typeof row.contactEmail==='string')&&(row.contactPhone===null||typeof row.contactPhone==='string'))),
}),{server:false})
const visits=computed(()=>[{title:'Bookings',singular:'Booking',records:data.value?.bookings??[]},{title:'Reservations',singular:'Reservation',records:data.value?.reservations??[]}])
const confirmRequest=ref<string|null>(null),cancelling=ref<string|null>(null)
const message=ref('')
async function cancel(requestId:string){if(cancelling.value)return;cancelling.value=requestId;message.value='';try{await applicationFetch('/api/account/cancel',{method:'POST',body:{request_id:requestId},validate:(value):value is Record<string,unknown>=>isRecord(value)&&value.success===true});confirmRequest.value=null;message.value='Cancelled. Contact the business about any payment or refund.';await refresh()}catch(error){message.value=getErrorMessage(error,'Could not cancel this booking')}finally{cancelling.value=null}}
</script>
