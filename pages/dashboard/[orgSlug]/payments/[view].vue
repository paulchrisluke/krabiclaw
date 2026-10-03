<template>
  <DashboardLeafPanel :id="`payments-${view}`" :title="title" :footer="false">
    <UAlert v-if="error" color="error" :description="error.message" />
    <USkeleton v-else-if="pending" class="h-32" />
    <template v-else-if="data">
      <p class="mb-4 text-sm text-muted">{{ view==='payouts'?'Stripe balances and payouts.': 'Captured payments, refunds, and disputes are separate financial activity.' }}</p>
      <template v-if="view==='overview'">
        <UCard v-for="row in amounts" :key="String(row.currency)" class="mb-3">
          <p class="font-semibold">{{ row.currency }}</p>
          <dl class="grid grid-cols-2 gap-2 text-sm"><dt>Captured volume</dt><dd>{{ paymentMoney(row.captured_amount,row.currency) }}</dd><dt>Refunds</dt><dd>{{ paymentMoney(row.refunded_amount,row.currency) }}</dd><dt>Disputes</dt><dd>{{ paymentMoney(row.disputed_amount,row.currency) }}</dd><dt>Net payment activity</dt><dd>{{ paymentMoney(Number(row.captured_amount)-Number(row.refunded_amount)-Number(row.disputed_amount),row.currency) }}</dd></dl>
        </UCard>
        <p v-if="!amounts.length">No captured payment activity in this UTC period.</p>
        <p class="mt-4 text-sm text-muted">Payments usage: 1.337% of captured volume plus actual attributable Stripe costs. Provider costs remain unreconciled until Stripe itemization arrives.</p>
        <UButton class="mt-4" :to="`/dashboard/${route.params.orgSlug}/settings/payments-billing`" variant="outline">Payments usage billing</UButton>
      </template>
      <template v-else-if="view==='payouts'">
        <p v-if="data.configured===false">Connect Stripe in Settings → Integrations.</p>
        <template v-else><h3 class="font-semibold">Available</h3><p v-for="(row,index) in available" :key="index">{{ paymentMoney(row.amount,String(row.currency).toUpperCase()) }}</p><h3 class="mt-4 font-semibold">Pending</h3><p v-for="(row,index) in held" :key="index">{{ paymentMoney(row.amount,String(row.currency).toUpperCase()) }}</p><h3 class="mt-4 font-semibold">Payouts</h3><UCard v-for="row in payouts" :key="String(row.id)" class="mt-3">{{ paymentMoney(row.amount,String(row.currency).toUpperCase()) }} · {{ row.status }}<p class="text-sm text-muted">{{ row.id }} · {{ row.arrival_date ? new Date(Number(row.arrival_date)*1000).toISOString().slice(0,10):'' }}</p></UCard><p v-if="!payouts.length">No payouts yet.</p></template>
      </template>
      <div v-else>
        <UButton v-if="view==='transactions'" class="mb-4" :to="`/dashboard/${route.params.orgSlug}/payments/checkout`">Create one-time order checkout</UButton>
        <UButton v-if="view==='disputes'" class="mb-4" :to="`/dashboard/${route.params.orgSlug}/settings/integrations/stripe`" variant="outline">Manage disputes in Stripe</UButton>
        <p v-if="!rows.length">No {{ view }} yet.</p>
        <UCard v-for="row in rows" :key="String(row.id)" class="mb-3">
          <NuxtLink v-if="view==='transactions'" :to="`/dashboard/${route.params.orgSlug}/payments/transactions/${row.id}`" class="font-medium">{{ row.id }}</NuxtLink><p v-else class="font-medium">{{ row.stripe_refund_id ?? row.stripe_dispute_id }}</p>
          <p>{{ paymentMoney(row.amount,String(row.currency).toUpperCase()) }} · {{ row.state ?? row.status }}</p>
          <p class="text-sm text-muted">{{ row.subject_type }} {{ row.subject_id }}</p><p v-if="view==='disputes'" class="mt-2">{{ row.reason }}<span v-if="row.evidence_due_at"> · Evidence due {{ new Date(String(row.evidence_due_at)).toLocaleString() }}</span></p>
        </UCard>
      </div>
      <p class="mt-4 text-xs text-muted">UTC · {{ data.refreshed_at ?? 'Authenticated Stripe projections' }}</p>
    </template>
  </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
definePageMeta({layout:'dashboard'})
const route=useRoute(),api=useDashboardApi()
const view=computed(()=>String(route.params.view))
const title=computed(()=>view.value[0]!.toUpperCase()+view.value.slice(1))
const {data,pending,error}=await useAsyncData(()=>`payments:${route.params.orgSlug}:${view.value}`,()=>api<Record<string,unknown>>('/api/dashboard/payments',{query:{view:view.value},validate:(v:unknown):v is Record<string,unknown>=>isRecord(v)}),{lazy:true})
function records(value:unknown):Record<string,unknown>[]{return Array.isArray(value)?value.filter(isRecord):[]}
const amounts=computed(()=>records(isRecord(data.value?.summary)?data.value.summary.amounts:[]))
const rows=computed(()=>records(data.value?.payments??data.value?.rows))
const available=computed(()=>records(isRecord(data.value?.balance)?data.value.balance.available:[]))
const payouts=computed(()=>records(data.value?.payouts))
const held=computed(()=>records(isRecord(data.value?.balance)?data.value.balance.pending:[]))
</script>
