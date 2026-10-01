<template>
 <DashboardLeafPanel id="payments-checkout" title="One-time order checkout" :footer="false">
  <UAlert v-if="error" color="error" :description="error.message" /><USkeleton v-else-if="pending" class="h-32" />
  <template v-else><p class="mb-4 text-sm text-muted">Choose a priced offering to create a secure Stripe payment link. Fulfillment is arranged by your business.</p>
   <UFormField label="Offering"><USelect v-model="selected" :items="items" class="w-full" /></UFormField>
   <UFormField class="mt-4" label="Quantity"><UInput v-model="quantity" type="number" min="1" max="100" /></UFormField>
   <p v-if="offering" class="mt-4">{{ paymentMoney(offering.unit_amount*Number(quantity),offering.currency) }} before any merchant-configured Stripe tax.</p>
   <UButton class="mt-4" :loading="creating" :disabled="!offering" @click="create">Create Stripe checkout link</UButton>
   <UAlert v-if="failure" class="mt-4" color="error" :description="failure" />
   <UCard v-if="handoff" class="mt-4"><p>Share this link with the buyer. Stripe collects payment when the buyer completes checkout.</p><UInput :model-value="handoff.checkout_url" readonly class="mt-3 w-full" /><UButton class="mt-3" @click="copy">Copy payment link</UButton><p class="mt-2 text-sm text-muted">Expires {{ new Date(handoff.expires_at).toLocaleString() }}</p></UCard>
  </template>
 </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {paymentMoney} from '~/shared/payment-display'
definePageMeta({layout:'dashboard'})
type Offering={product_id:string;variant_id:string;name:string;variant_name:string;currency:string;unit_amount:number}
const route=useRoute(),api=useDashboardApi(),selected=ref(''),quantity=ref(1),creating=ref(false),failure=ref(''),key=ref(crypto.randomUUID()),handoff=ref<{checkout_url:string;expires_at:string}|null>(null)
const {data,pending,error}=await useAsyncData(()=>`payments-order-offerings:${route.params.orgSlug}`,()=>api<{offerings:Offering[]}>('/api/dashboard/payments/offerings',{validate:(v:unknown):v is {offerings:Offering[]}=>isRecord(v)&&Array.isArray(v.offerings)}),{lazy:true})
const items=computed(()=>(data.value?.offerings??[]).map(value=>({label:`${value.name} · ${value.variant_name} · ${paymentMoney(value.unit_amount,value.currency)}`,value:value.variant_id}))),offering=computed(()=>data.value?.offerings.find(value=>value.variant_id===selected.value))
watch([selected,quantity],()=>{key.value=crypto.randomUUID();handoff.value=null})
async function create(){if(!offering.value)return;creating.value=true;failure.value='';try{handoff.value=await api('/api/dashboard/payments/checkout',{method:'POST',body:{product_id:offering.value.product_id,variant_id:offering.value.variant_id,quantity:Number(quantity.value),idempotency_key:key.value},validate:(v:unknown):v is {checkout_url:string;expires_at:string}=>isRecord(v)&&typeof v.checkout_url==='string'&&typeof v.expires_at==='string'})}catch(error){failure.value=getErrorMessage(error,'Checkout could not be created')}finally{creating.value=false}}
async function copy(){if(handoff.value)await navigator.clipboard.writeText(handoff.value.checkout_url)}
</script>
