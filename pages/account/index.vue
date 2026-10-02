<template>
 <UContainer class="py-10"><h1 class="text-2xl font-semibold">Your account</h1>
  <UAlert v-if="error" class="mt-4" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="mt-6 h-40" />
  <template v-else-if="data"><h2 class="mt-8 text-lg font-semibold">Purchases and receipts</h2><p v-if="!data.payments.length" class="mt-3">You have no purchases yet.</p>
   <UCard v-for="payment in data.payments" :key="String(payment.id)" class="mt-3"><p>{{ paymentMoney(payment.captured_amount,payment.currency) }} · {{ payment.state }}</p><p>{{ payment.title || 'Purchase' }}</p><p>{{ paymentMoney(payment.refunded_amount,payment.currency) }} refunded · {{ payment.fulfillment_status }}</p><UButton v-if="payment.receipt_url" :to="String(payment.receipt_url)" target="_blank" class="mt-3" variant="outline">Stripe receipt</UButton><UButton class="mt-3 ml-2" variant="ghost" @click="claimCode(String(payment.id))">Get purchase claim code</UButton></UCard>
   <h2 v-if="data.refunds.length" class="mt-8 text-lg font-semibold">Refunds</h2><p v-for="refund in data.refunds" :key="String(refund.id)" class="mt-3">{{ paymentMoney(refund.amount,refund.currency) }} · {{ refund.status }}</p>
   <section v-for="group in visits" :key="group.title"><h2 class="mt-8 text-lg font-semibold">{{ group.title }}</h2>
    <UCard v-for="visit in group.records" :key="visit.id" :data-testid="`buyer-visit-${visit.id}`" class="mt-3"><p>{{ visit.title || group.singular }} · {{ visit.status }}</p><p>{{ new Date(visit.starts_at).toLocaleString(undefined,{timeZone:visit.timezone}) }}</p>
     <template v-if="visit.can_cancel"><UButton v-if="confirmRequest!==visit.request_id" class="mt-3" color="error" variant="outline" @click="confirmRequest=visit.request_id">Cancel {{ group.singular.toLowerCase() }}</UButton>
      <div v-else class="mt-3"><p>Cancel this {{ group.singular.toLowerCase() }}? Cancellation does not automatically refund a payment.</p><UButton class="mt-2" color="error" :loading="cancelling===visit.request_id" @click="cancel(visit.request_id!)">Confirm cancellation</UButton><UButton class="mt-2 ml-2" variant="ghost" :disabled="Boolean(cancelling)" @click="confirmRequest=null">Keep {{ group.singular.toLowerCase() }}</UButton></div>
     </template>
     <div class="mt-3"><p>{{ visit.can_cancel ? 'Contact the business to request a different time or discuss a refund.' : 'Contact the business about this visit or any payment or refund.' }}</p><UButton v-if="visit.contactEmail" class="mt-2" variant="outline" :to="`mailto:${visit.contactEmail}?subject=${encodeURIComponent(`${visit.can_cancel?'Change request':'Booking'} ${visit.request_id}`)}`">{{ visit.can_cancel ? 'Request a change by email' : 'Contact the business by email' }}</UButton><UButton v-if="visit.contactPhone" class="mt-2 ml-2" variant="outline" :to="`tel:${visit.contactPhone.replace(/\s/g,'')}`">Call the business</UButton><p v-if="!visit.contactEmail&&!visit.contactPhone" class="mt-2 text-muted">The business has not provided contact details.</p></div>
    </UCard>
   </section>
  </template>
  <UFormField class="mt-8" label="Claim a purchase from another device" description="Use the one-time code from your original purchase account. Your signed-in email must be verified."><UInput v-model="code" class="w-full" /></UFormField><UButton class="mt-3" :loading="working" @click="claim">Claim purchase</UButton>
  <UAlert v-if="message" class="mt-4" :description="message" />
 </UContainer>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
definePageMeta({layout:'standalone'})
useSeoMeta({title:'Your account | Krabiclaw',robots:'noindex, nofollow'})
type Records=Record<string,unknown>[]
interface Visit {id:string;request_id:string|null;title?:string;status:string;starts_at:string;timezone:string;can_cancel:boolean;contactEmail:string|null;contactPhone:string|null}
const {data,pending,error,refresh}=await useFetch<{payments:Records;bookings:Visit[];reservations:Visit[];refunds:Records}>('/api/account',{server:false})
const visits=computed(()=>[{title:'Bookings',singular:'Booking',records:data.value?.bookings??[]},{title:'Reservations',singular:'Reservation',records:data.value?.reservations??[]}])
const confirmRequest=ref<string|null>(null),cancelling=ref<string|null>(null)
const route=useRoute()
onMounted(async()=>{if(typeof route.query.payment_id!=='string'||typeof route.query.purchase_claim!=='string')return;try{await $fetch('/api/account/checkout-return',{method:'POST',body:{payment_id:route.query.payment_id,purchase_claim:route.query.purchase_claim}});await navigateTo('/account',{replace:true});await refresh()}catch(error){message.value=getErrorMessage(error,'Could not verify Stripe purchase')}})
const code=ref(''),working=ref(false),message=ref('')
async function claimCode(paymentId:string){try{const result=await $fetch<{claim_code:string}>('/api/account/claim',{method:'POST',body:{payment_id:paymentId}});message.value=`One-time purchase claim code: ${result.claim_code}`}catch(error){message.value=getErrorMessage(error,'Could not create claim code')}}
async function claim(){working.value=true;try{await $fetch('/api/account/claim',{method:'POST',body:{claim_code:code.value}});message.value='Purchase claimed';await refresh()}catch(error){message.value=getErrorMessage(error,'Could not claim purchase')}finally{working.value=false}}
async function cancel(requestId:string){if(cancelling.value)return;cancelling.value=requestId;message.value='';try{await $fetch('/api/account/cancel',{method:'POST',body:{request_id:requestId}});confirmRequest.value=null;message.value='Cancelled. Contact the business about any payment or refund.';await refresh()}catch(error){message.value=getErrorMessage(error,'Could not cancel this booking')}finally{cancelling.value=null}}
</script>
