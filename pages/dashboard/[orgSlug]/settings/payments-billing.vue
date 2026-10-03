<template>
 <DashboardLeafPanel id="payments-billing" title="Payments usage billing" lead="Payments usage is billed after use: 1.337% of captured payments plus Stripe costs." :footer="false">
  <UAlert v-if="error" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="h-24" />
  <template v-else-if="data">
   <p class="text-sm text-muted">Refunds and disputes retain the captured-volume fee.</p>
   <UAlert v-if="data.configured===false" class="mt-4" color="warning" description="Payments billing is not set up. Accrued usage is retained." /><UButton v-if="data.configured===false" class="mt-4" :loading="working" @click="provision">Set up Payments billing</UButton>
   <p v-else-if="account" class="mt-4">Billing status: {{ account.status }}. Historical payment costs remain billable after downgrade.</p>
   <UButton v-if="account && ['servicing','closing'].includes(String(account.status))" class="mt-4" :loading="working" variant="outline" @click="finalize">End historical Payments usage contract</UButton>
   <h2 class="mt-6 font-semibold">Usage awaiting delivery</h2><p v-for="(row,i) in accrued" :key="i" class="mt-2">{{ paymentMoney(row.amount,row.currency) }} · {{ row.kind }} · {{ row.event_count }} events <span v-if="row.error">· {{ row.error }}</span></p><p v-if="!accrued.length">No undelivered usage.</p>
   <h2 class="mt-6 font-semibold">Invoices</h2>
   <section v-for="row in invoices" :key="row.id" class="border-b border-default py-6">
    <p>{{ row.status }} · {{ new Date(row.start_timestamp).toLocaleDateString() }} – {{ new Date(row.end_timestamp).toLocaleDateString() }}</p>
    <p class="mt-2">Rated usage before tax: {{ ratedMoney.format(row.total/100) }}</p>
    <template v-if="row.collection_invoice"><p class="mt-2">Stripe invoice: {{ paymentMoney(row.collection_invoice.total,row.collection_invoice.currency) }} · {{ row.collection_invoice.status }}</p><p class="text-sm text-muted">{{ paymentMoney(row.collection_invoice.amount_paid,row.collection_invoice.currency) }} paid · {{ paymentMoney(row.collection_invoice.amount_due,row.collection_invoice.currency) }} due</p><UButton v-if="row.collection_invoice.hosted_invoice_url" class="mt-3" :to="row.collection_invoice.hosted_invoice_url" target="_blank" variant="outline">Open Stripe invoice</UButton><UButton v-if="row.collection_invoice.invoice_pdf" class="mt-3 ml-2" :to="row.collection_invoice.invoice_pdf" target="_blank" variant="outline">Invoice PDF</UButton></template>
    <p v-else class="mt-2 text-sm text-muted">Stripe collection invoice has not been issued.</p>
   </section>
   <p v-if="!invoices.length" class="mt-2">No invoices yet.</p>
   <template v-if="credits.length"><h2 class="mt-6 font-semibold">Credits to settle</h2><p class="mt-2 text-sm text-muted">Issue the credit in Stripe, then verify its credit note here.</p><UButton class="mt-3" to="https://dashboard.stripe.com/invoices" target="_blank" variant="outline">Open Stripe billing credits</UButton><section v-for="row in credits" :key="String(row.id)" class="border-b border-default py-6"><p>{{ paymentMoney(-Number(row.amount),row.currency) }} · {{ row.source_id }}</p><UButton class="mt-3" variant="outline" :disabled="working" @click="openCredit(String(row.id))">Verify credit settlement</UButton></section></template>
  </template><UAlert v-if="failure" class="mt-4" color="error" :description="failure" />
 </DashboardLeafPanel>
 <DashboardListItemDialog v-model:open="creditOpen" title="Verify credit settlement" :saving="working" :save-disabled="!creditNote.trim()" :error="failure" save-label="Verify credit" @save="settle">
  <UFormField label="Issued Stripe credit note ID"><UInput v-model="creditNote" placeholder="cn_…" :disabled="working" /></UFormField>
 </DashboardListItemDialog>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
import {isCurrencyCode} from '~/shared/currencies'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
definePageMeta({layout:'dashboard'})
const route=useRoute(),api=useDashboardApi(),working=ref(false),failure=ref(''),creditId=ref<string|null>(null),creditNote=ref('')
const creditOpen=computed({get:()=>creditId.value!==null,set:(open:boolean)=>{if(!open){creditId.value=null;creditNote.value=''}}})
const ratedMoney=new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:20})
type CollectionInvoice={id:string;status:string;currency:string;total:number;amount_due:number;amount_paid:number;hosted_invoice_url:string|null;invoice_pdf:string|null}
type Invoice={id:string;status:string;total:number;credit_type:{id:string;name:'USD (cents)'};start_timestamp:string;end_timestamp:string;collection_invoice:CollectionInvoice|null}
type Billing = {configured:boolean;account?:Record<string,unknown>;pending:Record<string,unknown>[];invoices:Invoice[];credits:Record<string,unknown>[]}
function isCollection(value:unknown):value is CollectionInvoice{return isRecord(value)&&typeof value.id==='string'&&typeof value.status==='string'&&isCurrencyCode(value.currency)&&['total','amount_due','amount_paid'].every(field=>Number.isSafeInteger(value[field]))&&['hosted_invoice_url','invoice_pdf'].every(field=>value[field]===null||typeof value[field]==='string')}
const {data,pending,error,refresh}=await useAsyncData(()=>`payments-billing:${route.params.orgSlug}`,()=>api<Billing>('/api/dashboard/payments/billing',{validate:(v:unknown):v is Billing=>
 isRecord(v)&&typeof v.configured==='boolean'
 &&(!v.configured||(isRecord(v.account)&&typeof v.account.metronome_contract_id==='string'&&!!v.account.metronome_contract_id&&typeof v.account.status==='string'))
 &&Array.isArray(v.pending)&&v.pending.every(row=>isRecord(row)&&isCurrencyCode(row.currency)&&Number.isSafeInteger(row.amount)&&typeof row.kind==='string'&&Number.isSafeInteger(row.event_count)&&(row.error===null||typeof row.error==='string'))
 &&Array.isArray(v.invoices)&&v.invoices.every(row=>isRecord(row)&&typeof row.id==='string'&&typeof row.status==='string'&&typeof row.total==='number'&&Number.isFinite(row.total)&&isRecord(row.credit_type)&&typeof row.credit_type.id==='string'&&row.credit_type.name==='USD (cents)'&&typeof row.start_timestamp==='string'&&Number.isFinite(Date.parse(row.start_timestamp))&&typeof row.end_timestamp==='string'&&Number.isFinite(Date.parse(row.end_timestamp))&&(row.collection_invoice===null||isCollection(row.collection_invoice)))
 &&Array.isArray(v.credits)&&v.credits.every(row=>isRecord(row)&&typeof row.id==='string'&&typeof row.source_id==='string'&&isCurrencyCode(row.currency)&&Number.isSafeInteger(row.amount))}),{lazy:true})
const account=computed(()=>data.value?.configured?data.value.account:null),accrued=computed(()=>data.value?.pending??[]),invoices=computed(()=>data.value?.invoices??[]),credits=computed(()=>data.value?.credits??[])
function openCredit(id:string){creditId.value=id;creditNote.value='';failure.value=''}
async function finalize(){if(working.value)return;working.value=true;failure.value='';try{await api('/api/dashboard/payments/billing',{method:'POST',body:{action:'finalize'},validate:(v:unknown):v is Record<string,unknown>=>isRecord(v)&&v.closed===true});await refresh()}catch(error){failure.value=getErrorMessage(error,'Historical contract could not be ended')}finally{working.value=false}}
async function provision(){if(working.value)return;working.value=true;failure.value='';try{await api('/api/dashboard/payments/billing',{method:'POST',body:{action:'provision'},validate:(v:unknown):v is Record<string,unknown>=>isRecord(v)&&typeof v.metronome_contract_id==='string'});await refresh()}catch(error){failure.value=getErrorMessage(error,'Payments billing setup failed')}finally{working.value=false}}
async function settle(){if(working.value||!creditId.value||!creditNote.value.trim())return;working.value=true;failure.value='';try{await api('/api/dashboard/payments/billing',{method:'POST',body:{action:'reconcile_credit',event_id:creditId.value,credit_note_id:creditNote.value.trim()},validate:(v:unknown):v is Record<string,unknown>=>isRecord(v)&&v.settled===true});await refresh();creditOpen.value=false}catch(error){failure.value=getErrorMessage(error,'Native credit could not be reconciled')}finally{working.value=false}}
</script>
