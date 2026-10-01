<template>
  <section v-if="product && data?.currency" id="consultations" class="blawby-container pb-16">
    <OnlineProductBooking :product="product" :currency="data.currency" :organization-id="organizationId" :organization-name="organizationName" />
  </section>
</template>
<script setup lang="ts">
import OnlineProductBooking from '~/components/booking/OnlineProductBooking.vue'
const props = defineProps<{ productId: string }>()
const emit = defineEmits<{ available: [value: boolean] }>()
const { data, organizationId, organizationName } = await useOnlineConsultationProducts()
const product = computed(() => data.value?.products.find(product => product.id === props.productId) ?? null)
watch(product, value => emit('available', Boolean(value)), { immediate: true })
</script>
