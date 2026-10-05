<template>
 <DashboardLeafPanel id="payment-detail" :title="purchaseTitle ?? (order ? 'Order details' : 'Payment details')" :footer="false">
  <UAlert v-if="error" color="error" :description="error.message" />
  <USkeleton v-else-if="pending" class="h-32" />
  <template v-else-if="payment">
   <div class="mx-auto max-w-md">
    <UButton v-if="data?.booking_request_id" class="mt-4" color="neutral" variant="soft" :to="`/dashboard/${route.params.orgSlug}/bookings/booking/${data.booking_request_id}`">Booking details</UButton>
    <PaymentDetails :payment="data!.displayPayment" :refunds="data!.displayRefunds" :order="order">
     <template #actions>
      <UFormField v-if="payment.captured_amount>payment.refunded_amount" class="mt-6" :label="`Refund amount (${payment.currency})`"><UInput v-model="amount" inputmode="decimal" /></UFormField>
      <UButton v-if="payment.captured_amount>payment.refunded_amount" class="mt-3" :loading="preparing" :disabled="!amount.trim()" @click="prepare">Review refund</UButton>
      <div v-if="order?.fulfillment_status==='unfulfilled' && payment.captured_amount>0" class="mt-4 flex flex-wrap gap-3">
       <UButton :loading="preparing" @click="fulfill('fulfilled')">Mark fulfilled</UButton>
       <UButton color="neutral" variant="outline" :loading="preparing" @click="fulfill('cancelled')">Cancel fulfillment</UButton>
      </div>
     </template>
    </PaymentDetails>
   </div>
   <UAlert v-if="failure" class="mt-3" color="error" :description="failure" />
  </template>
 </DashboardLeafPanel>
</template>
<script setup lang="ts">
import PaymentDetails from '~/components/dashboard/PaymentDetails.vue'
import {paymentDisplay,paymentRefundsDisplay,paymentOrderDisplay} from '~/shared/payment-display'
import {majorAmountToMinor} from '~/shared/prices'
import {isCurrencyCode} from '~/shared/currencies'
import type {Payment} from '~/server/domain/payments'
definePageMeta({layout:'dashboard'})
const route=useRoute(),api=useDashboardApi(),amount=ref(''),preparing=ref(false),failure=ref('')
type Detail = {payment:Payment;booking_request_id?:string|null;refunds:unknown[];order:unknown}
const {data,pending,error,refresh}=await useAsyncData(()=>`payment:${route.params.orgSlug}:${route.params.paymentId}`,async()=>{
 const detail=await api<Detail>('/api/dashboard/payments',{query:{payment_id:String(route.params.paymentId)},validate:(v:unknown):v is Detail=>
  isRecord(v)&&isRecord(v.payment)&&typeof v.payment.id==='string'&&typeof v.payment.price_snapshot_json==='string'
  &&isCurrencyCode(v.payment.currency)&&Number.isSafeInteger(v.payment.captured_amount)&&Number.isSafeInteger(v.payment.refunded_amount)
  &&typeof v.payment.subject_type==='string'&&typeof v.payment.state==='string'&&Array.isArray(v.refunds)&&'order' in v})
 const snapshot:unknown=JSON.parse(detail.payment.price_snapshot_json)
 if(!isRecord(snapshot)||typeof snapshot.title!=='string'||!snapshot.title.trim())throw new Error('Stored payment purchase title is invalid')
 return {...detail,purchaseTitle:snapshot.title,displayPayment:paymentDisplay(detail.payment),displayRefunds:paymentRefundsDisplay(detail.refunds),displayOrder:paymentOrderDisplay(detail.order)}
},{lazy:true})
const order=computed(()=>data.value?.displayOrder??null)
async function fulfill(status:string){preparing.value=true;failure.value='';try{await api('/api/dashboard/payments/fulfillment',{method:'POST',body:{payment_id:String(route.params.paymentId),status},validate:(v:unknown):v is Record<string,unknown>=>isRecord(v)&&typeof v.fulfillment_status==='string'});await refresh()}catch(error){failure.value=getErrorMessage(error,'Fulfillment could not be updated')}finally{preparing.value=false}}
const payment=computed(()=>data.value?.payment)
const purchaseTitle=computed(()=>data.value?.purchaseTitle)
async function prepare(){preparing.value=true;failure.value='';try{if(!payment.value||!isCurrencyCode(payment.value.currency))throw new Error('Payment currency is invalid');const approval=await api<{authorization_id:string}>('/api/dashboard/payments/refund',{method:'POST',body:{action:'prepare',payment_id:String(route.params.paymentId),amount:majorAmountToMinor(amount.value,payment.value.currency)},validate:(v:unknown):v is {authorization_id:string}=>isRecord(v)&&typeof v.authorization_id==='string'});await navigateTo(`/dashboard/${route.params.orgSlug}/payments/refunds/approve?id=${approval.authorization_id}`)}catch(error){failure.value=getErrorMessage(error,'Refund could not be prepared')}finally{preparing.value=false}}
</script>
