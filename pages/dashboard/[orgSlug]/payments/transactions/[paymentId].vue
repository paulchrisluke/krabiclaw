<template>
 <DashboardLeafPanel id="payment-detail" title="Transaction" :footer="false">
  <UAlert v-if="error" color="error" :description="error.message" />
  <USkeleton v-else-if="pending" class="h-32" />
  <template v-else-if="payment">
   <h2 class="font-semibold">{{ purchaseTitle }}</h2><p>{{ paymentMoney(payment.captured_amount,payment.currency) }} captured · {{ paymentMoney(payment.refunded_amount,payment.currency) }} refunded</p>
   <p class="mt-2">{{ payment.subject_type === 'order' ? 'Order' : 'Booking' }} · {{ payment.state }}</p>
   <UButton v-if="data?.booking_request_id" class="mt-4" variant="outline" :to="`/dashboard/${route.params.orgSlug}/messages/${data.booking_request_id}`">Open booking request</UButton>
   <UButton v-if="payment.receipt_url" class="mt-4" :to="payment.receipt_url" target="_blank">Stripe receipt</UButton>
   <UFormField class="mt-6" :label="`Refund amount (${payment.currency})`" description="Up to the remaining captured amount"><UInput v-model="amount" inputmode="decimal" /></UFormField>
   <UButton class="mt-3" :loading="preparing" @click="prepare">Review refund</UButton>
   <template v-if="order"><h3 class="mt-6 font-semibold">Order · {{ order.fulfillment_status }}</h3><p v-for="line in orderLines" :key="String(line.id)" class="mt-2">{{ line.title }} · {{ line.quantity }} × {{ paymentMoney(line.unit_amount,line.currency) }}</p><p class="mt-2 text-sm text-muted">Fulfillment is arranged by the merchant. This status does not refund or change the payment.</p><template v-if="order.fulfillment_status==='unfulfilled'"><UButton class="mt-3" :loading="preparing" @click="fulfill('fulfilled')">Mark fulfilled</UButton><UButton class="mt-3 ml-2" variant="outline" :loading="preparing" @click="fulfill('cancelled')">Cancel fulfillment</UButton></template></template>
   <UAlert v-if="failure" class="mt-3" color="error" :description="failure" />
  </template>
 </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
import {majorAmountToMinor} from '~/shared/prices'
import {isCurrencyCode} from '~/shared/currencies'
import type {Payment} from '~/server/domain/payments'
definePageMeta({layout:'dashboard'})
const route=useRoute(),api=useDashboardApi(),amount=ref(''),preparing=ref(false),failure=ref('')
type Detail = {payment:Payment;booking_request_id?:string|null;order:(Record<string,unknown>&{lines:Record<string,unknown>[]})|null}
const {data,pending,error,refresh}=await useAsyncData(()=>`payment:${route.params.paymentId}`,async()=>{
 const detail=await api<Detail>('/api/dashboard/payments',{query:{payment_id:String(route.params.paymentId)},validate:(v:unknown):v is Detail=>
  isRecord(v)&&isRecord(v.payment)&&typeof v.payment.id==='string'&&typeof v.payment.price_snapshot_json==='string'
  &&isCurrencyCode(v.payment.currency)&&Number.isSafeInteger(v.payment.captured_amount)&&Number.isSafeInteger(v.payment.refunded_amount)
  &&typeof v.payment.subject_type==='string'&&typeof v.payment.state==='string'
  &&(v.order===null||(isRecord(v.order)&&typeof v.order.fulfillment_status==='string'&&Array.isArray(v.order.lines)&&v.order.lines.every(line=>isRecord(line)&&typeof line.id==='string'&&typeof line.title==='string'&&Number.isSafeInteger(line.quantity)&&Number.isSafeInteger(line.unit_amount)&&isCurrencyCode(line.currency))))})
 const snapshot:unknown=JSON.parse(detail.payment.price_snapshot_json)
 if(!isRecord(snapshot)||typeof snapshot.title!=='string'||!snapshot.title.trim())throw new Error('Stored payment purchase title is invalid')
 return {...detail,purchaseTitle:snapshot.title}
},{lazy:true})
const order=computed(()=>data.value?.order),orderLines=computed(()=>order.value?.lines??[])
async function fulfill(status:string){preparing.value=true;failure.value='';try{await api('/api/dashboard/payments/fulfillment',{method:'POST',body:{payment_id:String(route.params.paymentId),status},validate:(v:unknown):v is Record<string,unknown>=>isRecord(v)&&typeof v.fulfillment_status==='string'});await refresh()}catch(error){failure.value=getErrorMessage(error,'Fulfillment could not be updated')}finally{preparing.value=false}}
const payment=computed(()=>data.value?.payment)
const purchaseTitle=computed(()=>data.value?.purchaseTitle)
async function prepare(){preparing.value=true;failure.value='';try{if(!payment.value||!isCurrencyCode(payment.value.currency))throw new Error('Payment currency is invalid');const approval=await api<{authorization_id:string}>('/api/dashboard/payments/refund',{method:'POST',body:{action:'prepare',payment_id:String(route.params.paymentId),amount:majorAmountToMinor(amount.value,payment.value.currency)},validate:(v:unknown):v is {authorization_id:string}=>isRecord(v)&&typeof v.authorization_id==='string'});await navigateTo(`/dashboard/${route.params.orgSlug}/payments/refunds/approve?id=${approval.authorization_id}`)}catch(error){failure.value=getErrorMessage(error,'Refund could not be prepared')}finally{preparing.value=false}}
</script>
