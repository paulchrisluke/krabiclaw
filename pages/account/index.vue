<template>
 <UContainer class="py-10"><h1 class="text-2xl font-semibold">Your account</h1>
  <UAlert v-if="error" class="mt-4" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="mt-6 h-40" />
  <template v-else-if="data"><h2 class="mt-8 text-lg font-semibold">Purchases and receipts</h2><p v-if="!data.payments.length" class="mt-3">You have no purchases yet.</p>
   <UCard v-for="payment in data.payments" :key="String(payment.id)" class="mt-3"><p>{{ paymentMoney(payment.captured_amount,payment.currency) }} · {{ payment.state }}</p><p>{{ payment.title || 'Purchase' }}</p><p>{{ paymentMoney(payment.refunded_amount,payment.currency) }} refunded · {{ payment.fulfillment_status }}</p><UButton v-if="payment.receipt_url" :to="String(payment.receipt_url)" target="_blank" class="mt-3" variant="outline">Stripe receipt</UButton><UButton class="mt-3 ml-2" variant="ghost" @click="claimCode(String(payment.id))">Get purchase claim code</UButton></UCard>
   <h2 v-if="data.refunds.length" class="mt-8 text-lg font-semibold">Refunds</h2><p v-for="refund in data.refunds" :key="String(refund.id)" class="mt-3">{{ paymentMoney(refund.amount,refund.currency) }} · {{ refund.status }}</p>
   <h2 class="mt-8 text-lg font-semibold">Bookings</h2><p v-for="booking in data.bookings" :key="String(booking.id)" class="mt-3">{{ booking.title || 'Appointment' }} · {{ booking.status }} · {{ booking.starts_at ? new Date(String(booking.starts_at)).toLocaleString(undefined,{timeZone:String(booking.timezone || 'UTC')}) : '' }}</p>
   <h2 class="mt-8 text-lg font-semibold">Reservations</h2><p v-for="reservation in data.reservations" :key="String(reservation.id)" class="mt-3">{{ reservation.id }} · {{ reservation.status }}</p>
  </template>
  <UFormField class="mt-8" label="Claim a purchase from another device" description="Use the one-time code from your original purchase account. Your signed-in email must be verified."><UInput v-model="code" class="w-full" /></UFormField><UButton class="mt-3" :loading="working" @click="claim">Claim purchase</UButton>
  <UAlert v-if="message" class="mt-4" :description="message" />
 </UContainer>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
useSeoMeta({title:'Your account | Krabiclaw',robots:'noindex, nofollow'})
type Records=Record<string,unknown>[]
const {data,pending,error,refresh}=await useFetch<{payments:Records;bookings:Records;reservations:Records;refunds:Records}>('/api/account',{server:false})
const route=useRoute()
onMounted(async()=>{if(typeof route.query.payment_id!=='string'||typeof route.query.purchase_claim!=='string')return;try{await $fetch('/api/account/checkout-return',{method:'POST',body:{payment_id:route.query.payment_id,purchase_claim:route.query.purchase_claim}});await navigateTo('/account',{replace:true});await refresh()}catch(error){message.value=getErrorMessage(error,'Could not verify Stripe purchase')}})
const code=ref(''),working=ref(false),message=ref('')
async function claimCode(paymentId:string){try{const result=await $fetch<{claim_code:string}>('/api/account/claim',{method:'POST',body:{payment_id:paymentId}});message.value=`One-time purchase claim code: ${result.claim_code}`}catch(error){message.value=getErrorMessage(error,'Could not create claim code')}}
async function claim(){working.value=true;try{await $fetch('/api/account/claim',{method:'POST',body:{claim_code:code.value}});message.value='Purchase claimed';await refresh()}catch(error){message.value=getErrorMessage(error,'Could not claim purchase')}finally{working.value=false}}
</script>
