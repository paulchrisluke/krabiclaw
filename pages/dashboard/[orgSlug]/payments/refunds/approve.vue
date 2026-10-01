<template>
 <DashboardLeafPanel id="approve-refund" title="Approve refund" :footer="false">
  <UAlert v-if="error" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="h-20" />
  <template v-else-if="data"><p class="font-semibold">{{ data.action==='reject_booking'?'Reject booking and refund':'Refund' }} {{ paymentMoney(data.amount,data.currency) }}?</p><p class="mt-2">Payment {{ data.payment_id }}. Stripe debits the merchant’s connected balance. The captured-volume usage fee is retained.</p><UButton class="mt-4" color="error" :loading="working" :disabled="done" @click="approve">{{ data?.action==='reject_booking'?'Approve rejection and full refund':'Approve and issue refund' }}</UButton><p v-if="done" class="mt-3">Refund submitted to Stripe.</p></template>
  <UAlert v-if="failure" class="mt-4" color="error" :description="failure" />
 </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
definePageMeta({layout:'dashboard'})
const route=useRoute(),api=useDashboardApi(),working=ref(false),done=ref(false),failure=ref('')
const {data,pending,error}=await useAsyncData(()=>`refund-approval:${route.query.id}`,()=>api<{id:string;action:string;amount:number;currency:string;payment_id:string}>('/api/dashboard/payments/authorization',{query:{id:String(route.query.id)},validate:(v:unknown):v is {id:string;action:string;amount:number;currency:string;payment_id:string}=>isRecord(v)&&typeof v.id==='string'&&typeof v.amount==='number'&&typeof v.currency==='string'&&typeof v.payment_id==='string'}),{lazy:true})
async function approve(){working.value=true;failure.value='';try{await api('/api/dashboard/payments/refund',{method:'POST',body:{action:'approve',authorization_id:String(route.query.id)},validate:(v:unknown):v is Record<string,unknown>=>isRecord(v)&&typeof v.stripe_refund_id==='string'});done.value=true}catch(error){failure.value=getErrorMessage(error,'Refund could not be completed')}finally{working.value=false}}
</script>
