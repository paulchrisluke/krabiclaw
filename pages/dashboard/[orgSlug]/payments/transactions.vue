<template>
  <DashboardIndexPanel id="payments-transactions" title="Transactions">
    <template #right><UButton :to="`${base}/checkout`" variant="outline">Create checkout</UButton></template>
    <div class="grid grid-cols-2 gap-4 mb-6"><UFormField label="From (UTC)"><UInput v-model="from" type="date" /></UFormField><UFormField label="Through (UTC)"><UInput v-model="through" type="date" /></UFormField></div>
    <UAlert v-if="error" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="h-32" />
    <template v-else-if="data"><p v-if="!data.payments.length">No transactions in this UTC period.</p><EditorNavigationList v-else :groups="[{id:'transactions',items}]" :active-item="level.child.value" /><div class="mt-4 flex gap-3"><UButton v-if="after" variant="outline" @click="after=''">First page</UButton><UButton v-if="data.next_cursor" variant="outline" @click="after=data.next_cursor">Next page</UButton></div></template>
  </DashboardIndexPanel>
</template>
<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import {paymentMoney} from '~/shared/payment-display'
import {isCurrencyCode} from '~/shared/currencies'
definePageMeta({layout:'dashboard'})
useSeoMeta({title:'Transactions | Krabiclaw',robots:'noindex, nofollow'})
const route=useRoute(),api=useDashboardApi(),level=useRouteLevel(),now=new Date(),from=ref(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString().slice(0,10)),through=ref(now.toISOString().slice(0,10)),after=ref('')
const base=computed(()=>`/dashboard/${String(route.params.orgSlug)}/payments`)
type Transaction={id:string;amount:number;currency:string;state:string;price_snapshot_json:string;title:string}
type Transactions={payments:Transaction[];next_cursor:string|null}
watch([from,through],()=>{after.value=''})
const {data,pending,error}=await useAsyncData(()=>`payments-transactions:${route.params.orgSlug}:${from.value}:${through.value}:${after.value}`,async()=>{
 const start=new Date(`${from.value}T00:00:00.000Z`),end=new Date(`${through.value}T00:00:00.000Z`)
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end)throw new Error('Choose a valid UTC date range')
 end.setUTCDate(end.getUTCDate()+1)
 const response=await api<Transactions>('/api/dashboard/payments',{query:{view:'transactions',from:start.toISOString(),to:end.toISOString(),...(after.value?{after:after.value}:{})},validate:(value):value is Transactions=>isRecord(value)&&Array.isArray(value.payments)&&value.payments.every(row=>isRecord(row)&&typeof row.id==='string'&&Number.isSafeInteger(row.amount)&&isCurrencyCode(row.currency)&&typeof row.state==='string'&&typeof row.price_snapshot_json==='string')&&(value.next_cursor===null||typeof value.next_cursor==='string')})
 return {...response,payments:response.payments.map(payment=>{const snapshot:unknown=JSON.parse(payment.price_snapshot_json);if(!isRecord(snapshot)||typeof snapshot.title!=='string'||!snapshot.title.trim())throw new Error('Stored purchase title is invalid');return {...payment,title:snapshot.title}})}
},{lazy:true})
const items=computed(()=>(data.value?.payments??[]).map(payment=>({id:payment.id,label:payment.title,summary:`${paymentMoney(payment.amount,payment.currency)} · ${payment.state}`,to:`${base.value}/transactions/${encodeURIComponent(payment.id)}`})))
</script>
