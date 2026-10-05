<template>
  <section v-if="order" class="mt-6 border-t border-default pt-6">
    <h2 class="text-base font-semibold text-highlighted">Order details</h2>
    <p class="mt-1 text-sm text-muted">{{ fulfillmentLabel }}</p>
    <div v-for="line in order.lines" :key="line.id" class="mt-4 flex items-start justify-between gap-4 text-sm">
      <span>{{ line.title }} <span class="text-muted">× {{ line.quantity }}</span></span>
      <span class="shrink-0">{{ paymentMoney(line.quantity * line.unit_amount, line.currency) }}</span>
    </div>
  </section>
  <section class="mt-6 border-t border-default pt-6">
    <h2 class="text-base font-semibold text-highlighted">Payment info</h2>
    <dl class="mt-4 space-y-3 text-sm">
      <div class="flex justify-between gap-4"><dt class="text-muted">Status</dt><dd>{{ paymentLabel }}</dd></div>
      <div class="flex justify-between gap-4"><dt class="text-muted">Paid</dt><dd>{{ paymentMoney(payment.captured_amount, payment.currency) }}</dd></div>
      <div v-if="payment.refunded_amount" class="flex justify-between gap-4"><dt class="text-muted">Refunded</dt><dd>{{ paymentMoney(payment.refunded_amount, payment.currency) }}</dd></div>
      <div v-for="refund in refunds" :key="refund.id" class="flex justify-between gap-4">
        <dt class="text-muted">{{ refundLabel(refund.status) }}</dt><dd>{{ paymentMoney(refund.amount, payment.currency) }}</dd>
      </div>
    </dl>
    <UButton v-if="payment.receipt_url" class="mt-5" color="neutral" variant="outline" label="Get receipt" :to="payment.receipt_url" target="_blank" rel="noopener noreferrer" />
    <slot name="actions" />
  </section>
</template>

<script setup lang="ts">
import {paymentMoney,type PaymentDisplay,type PaymentRefundDisplay,type PaymentOrderDisplay} from '~/shared/payment-display'

const props=withDefaults(defineProps<{payment:PaymentDisplay;refunds?:PaymentRefundDisplay[];order?:PaymentOrderDisplay|null}>(),{refunds:()=>[],order:null})
const paymentLabel=computed(()=>{
  if(props.payment.captured_amount>0){
    if(props.payment.refunded_amount===props.payment.captured_amount)return 'Refunded'
    if(props.payment.refunded_amount>0)return 'Partially refunded'
    return 'Paid'
  }
  return props.payment.state==='failed'?'Failed':props.payment.state==='recovery'?'Needs attention':'Pending'
})
const fulfillmentLabel=computed(()=>props.order?.fulfillment_status==='fulfilled'?'Fulfilled':props.order?.fulfillment_status==='cancelled'?'Cancelled':'Awaiting fulfillment')
function refundLabel(status:string){return status==='succeeded'?'Refund':status==='failed'?'Refund failed':status==='canceled'?'Refund cancelled':status==='queued'||status==='creating'?'Refund requested':'Refund pending'}
</script>
