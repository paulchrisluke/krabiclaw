<template>
 <DashboardLeafPanel id="earnings-checkout" title="Payment link" lead="A Stripe link to pay for one item, to send to a buyer." :footer="false">
  <UAlert v-if="error" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="h-32" />
  <template v-else-if="data">
   <UEmpty v-if="!data.offerings.length" icon="i-lucide-package" title="No priced offerings" description="Add a one-time USD price to an offering without a booking calendar." />
   <template v-else>
    <UFormField label="Offering"><USelect v-model="selected" :items="items" :disabled="creating" class="w-full" /></UFormField>
    <UFormField class="mt-4" label="Quantity"><UInput v-model="quantity" type="number" min="1" max="100" :disabled="creating" /></UFormField>
    <p v-if="offering && validQuantity" class="mt-4">{{ paymentMoney(offering.unit_amount*Number(quantity),offering.currency) }} before any tax.</p>
    <UButton class="mt-4" :loading="creating" :disabled="!offering || !validQuantity" @click="create">Create Stripe checkout link</UButton>
   </template>
   <UAlert v-if="failure" class="mt-4" color="error" :description="failure" />
   <section v-if="handoff" class="mt-6 border-t border-default pt-6"><p>Share this link with the buyer. Stripe collects payment when the buyer completes checkout.</p><UInput :model-value="handoff.checkout_url" readonly class="mt-3 w-full" /><UButton class="mt-3" @click="copy">Copy payment link</UButton><p v-if="copied" class="mt-2">Payment link copied.</p><p class="mt-2 text-sm text-muted">Expires {{ new Date(handoff.expires_at).toLocaleString() }}</p></section>
  </template>
 </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
import {isCurrencyCode} from '~/shared/currencies'
definePageMeta({layout:'dashboard'})
type Offering={product_id:string;variant_id:string;name:string;variant_name:string;currency:string;unit_amount:number}
type Handoff={checkout_url:string;expires_at:string}
const route=useRoute(),api=useDashboardApi(),selected=ref(''),quantity=ref(1),creating=ref(false),failure=ref(''),key=ref(crypto.randomUUID()),handoff=ref<Handoff|null>(null),copied=ref(false)
const {data,pending,error}=await useAsyncData(()=>`payments-order-offerings:${route.params.orgSlug}`,()=>api<{offerings:Offering[]}>('/api/dashboard/payments/offerings',{validate:(v:unknown):v is {offerings:Offering[]}=>isRecord(v)&&Array.isArray(v.offerings)&&v.offerings.every(row=>isRecord(row)&&['product_id','variant_id','name','variant_name'].every(field=>typeof row[field]==='string')&&isCurrencyCode(row.currency)&&Number.isSafeInteger(row.unit_amount)&&Number(row.unit_amount)>0)}),{lazy:true})
const items=computed(()=>(data.value?.offerings??[]).map(value=>({label:`${value.name} · ${value.variant_name} · ${paymentMoney(value.unit_amount,value.currency)}`,value:value.variant_id}))),offering=computed(()=>data.value?.offerings.find(value=>value.variant_id===selected.value)),validQuantity=computed(()=>Number.isSafeInteger(Number(quantity.value))&&Number(quantity.value)>=1&&Number(quantity.value)<=100)
watch([selected,quantity],()=>{key.value=crypto.randomUUID();handoff.value=null;copied.value=false})
async function create(){
 if(creating.value||!offering.value||!validQuantity.value)return
 creating.value=true;failure.value='';copied.value=false
 try{handoff.value=await api<Handoff>('/api/dashboard/payments/checkout',{method:'POST',body:{product_id:offering.value.product_id,variant_id:offering.value.variant_id,quantity:Number(quantity.value),idempotency_key:key.value},validate:(v:unknown):v is Handoff=>isRecord(v)&&typeof v.checkout_url==='string'&&URL.canParse(v.checkout_url)&&new URL(v.checkout_url).protocol==='https:'&&new URL(v.checkout_url).hostname==='checkout.stripe.com'&&typeof v.expires_at==='string'&&Number.isFinite(Date.parse(v.expires_at))})}
 catch(error){const payload=isRecord(error)&&isRecord(error.data)?error.data:null;if(payload?.code==='checkout_expired'||isRecord(payload?.data)&&payload.data.code==='checkout_expired'){key.value=crypto.randomUUID();handoff.value=null}failure.value=getErrorMessage(error,'Checkout could not be created')}
 finally{creating.value=false}
}
async function copy(){if(!handoff.value)return;failure.value='';try{await navigator.clipboard.writeText(handoff.value.checkout_url);copied.value=true}catch(error){failure.value=getErrorMessage(error,'Payment link could not be copied')}}
</script>
