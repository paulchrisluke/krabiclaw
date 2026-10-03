<template>
  <DashboardLeafPanel :id="`payments-${view}`" :title="title" :lead="lead" :footer="false">
    <UAlert v-if="error" color="error" :description="error.message" />
    <USkeleton v-else-if="pending" class="h-32" />
    <template v-else-if="data">
      <template v-if="view==='overview'">
        <section v-for="row in amounts" :key="String(row.currency)" class="border-b border-default py-6">
          <h2 class="font-semibold">{{ row.currency }}</h2>
          <dl class="mt-3 grid grid-cols-2 gap-2"><dt>Captured volume</dt><dd>{{ paymentMoney(row.captured_amount,row.currency) }}</dd><dt>Refunds</dt><dd>{{ paymentMoney(row.refunded_amount,row.currency) }}</dd><dt>Disputes</dt><dd>{{ paymentMoney(row.disputed_amount,row.currency) }}</dd><dt>Net payment activity</dt><dd>{{ paymentMoney(Number(row.captured_amount)-Number(row.refunded_amount)-Number(row.disputed_amount),row.currency) }}</dd></dl>
        </section>
        <p v-if="!amounts.length">No captured payment activity in this UTC period.</p>
        <p class="mt-4 text-sm text-muted">Payments usage: 1.337% of captured volume plus attributable Stripe costs.</p>
      </template>
      <template v-else-if="view==='payouts'">
        <p v-if="data.configured===false">Connect Stripe in Settings → Integrations.</p>
        <template v-else>
          <h2 class="font-semibold">Available</h2><p v-for="(row,index) in available" :key="index">{{ paymentMoney(row.amount,String(row.currency).toUpperCase()) }}</p>
          <h2 class="mt-6 font-semibold">Pending</h2><p v-for="(row,index) in held" :key="index">{{ paymentMoney(row.amount,String(row.currency).toUpperCase()) }}</p>
          <h2 class="mt-6 font-semibold">Payouts</h2><section v-for="row in payouts" :key="String(row.id)" class="border-b border-default py-6"><p>{{ paymentMoney(row.amount,String(row.currency).toUpperCase()) }} · {{ row.status }}</p><p class="text-sm text-muted">{{ row.id }} · {{ new Date(Number(row.arrival_date)*1000).toISOString().slice(0,10) }}</p></section><p v-if="!payouts.length">No payouts yet.</p>
        </template>
      </template>
      <template v-else>
        <p v-if="!rows.length">No {{ view }} yet.</p>
        <section v-for="row in rows" :key="String(row.id)" class="border-b border-default py-6">
          <p class="font-medium">{{ row.stripe_refund_id ?? row.stripe_dispute_id ?? row.id }}</p><p>{{ paymentMoney(row.amount,row.currency) }} · {{ row.status }}</p>
          <p class="text-sm text-muted">{{ row.subject_type }} {{ row.subject_id }}</p><p v-if="row.error" class="mt-2 text-error">{{ row.error }}</p><p v-if="view==='disputes'" class="mt-2">{{ row.reason }}<span v-if="row.evidence_due_at"> · Evidence due {{ new Date(String(row.evidence_due_at)).toLocaleString() }}</span></p>
        </section>
      </template>
      <p v-if="refreshedAt" class="mt-4 text-xs text-muted">Updated {{ new Date(refreshedAt).toLocaleString() }}</p>
    </template>
  </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
import {isCurrencyCode} from '~/shared/currencies'
definePageMeta({layout:'dashboard',validate:route=>['overview','refunds','disputes','payouts'].includes(String(route.params.view))})
const route=useRoute(),api=useDashboardApi()
const view=computed(()=>String(route.params.view))
const title=computed(()=>view.value[0]!.toUpperCase()+view.value.slice(1))
const lead=computed(()=>view.value==='overview'?'Payment activity this month, using UTC.':view.value==='payouts'?'Your Stripe balances and payouts.':'Captured payments, refunds and disputes are separate activity.')
type Row=Record<string,unknown>
type ViewResponse={configured?:boolean;balance?:{available:Row[];pending:Row[]};payouts?:Row[];rows?:Row[];summary?:{amounts:Row[];refreshed_at:string};refreshed_at?:string}
const moneyRow=(value:unknown):value is Row=>isRecord(value)&&Number.isSafeInteger(value.amount)&&typeof value.currency==='string'&&isCurrencyCode(value.currency.toUpperCase())
function validResponse(value:unknown):value is ViewResponse {
 if(!isRecord(value))return false
 if(view.value==='overview')return isRecord(value.summary)&&typeof value.summary.refreshed_at==='string'&&Array.isArray(value.summary.amounts)&&value.summary.amounts.every(row=>isRecord(row)&&isCurrencyCode(row.currency)&&['captured_amount','refunded_amount','disputed_amount'].every(field=>Number.isSafeInteger(row[field])))
 if(view.value==='payouts')return typeof value.configured==='boolean'&&Array.isArray(value.payouts)&&(value.configured===false||isRecord(value.balance)&&Array.isArray(value.balance.available)&&value.balance.available.every(moneyRow)&&Array.isArray(value.balance.pending)&&value.balance.pending.every(moneyRow)&&typeof value.refreshed_at==='string'&&value.payouts.every(row=>moneyRow(row)&&typeof row.id==='string'&&typeof row.status==='string'&&Number.isSafeInteger(row.arrival_date)))
 return typeof value.refreshed_at==='string'&&Array.isArray(value.rows)&&value.rows.every(row=>moneyRow(row)&&isCurrencyCode(row.currency)&&typeof row.id==='string'&&typeof row.status==='string'&&typeof row.subject_type==='string'&&(row.subject_id===null||typeof row.subject_id==='string'))
}
const {data,pending,error}=await useAsyncData(()=>`payments:${route.params.orgSlug}:${view.value}`,()=>api<ViewResponse>('/api/dashboard/payments',{query:{view:view.value},validate:validResponse}),{lazy:true})
const amounts=computed(()=>data.value?.summary?.amounts??[]),rows=computed(()=>data.value?.rows??[]),available=computed(()=>data.value?.balance?.available??[]),payouts=computed(()=>data.value?.payouts??[]),held=computed(()=>data.value?.balance?.pending??[]),refreshedAt=computed(()=>data.value?.summary?.refreshed_at??data.value?.refreshed_at)
</script>
