<template>
  <DashboardLeafPanel id="account-calendar" title="Calendar & availability" :footer="false">
    <p class="mb-6 text-sm text-muted">Your Google connection belongs to your account. Working hours, time off and busy-calendar selection apply to the business you choose here.</p>
    <UAlert v-if="organizationsState.error" color="error" :description="getErrorMessage(organizationsState.error, 'Businesses could not be loaded')" />
    <UFormField label="Business" class="mb-6">
      <USelect v-model="selectedBusiness" :items="businessOptions" placeholder="Choose a business" class="w-full" />
    </UFormField>
    <UAlert v-if="error" color="error" :description="getErrorMessage(error, 'Your availability could not be loaded')" />
    <MemberScheduleEditor v-if="member" :key="`${businessId}:${member.id}`" :organization-id="businessId" :member-id="member.id" self />
    <p v-else-if="!businessOptions.length && !organizationsState.isPending" class="text-sm text-muted">Join a business to manage your working hours and availability.</p>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import MemberScheduleEditor from '~/components/dashboard/MemberScheduleEditor.vue'
import { authClient } from '~/lib/auth-client'

definePageMeta({ layout: 'dashboard' })
const route = useRoute()
const organizations = authClient.useListOrganizations()
const organizationsState = computed(() => unref(organizations))
const businessOptions = computed(() => (organizationsState.value.data ?? []).map(org => ({ label: org.name, value: org.id })))
const businessId = computed(() => {
  const requested = typeof route.query.organization_id === 'string' ? route.query.organization_id : ''
  if (requested) return businessOptions.value.some(org => org.value === requested) ? requested : ''
  return businessOptions.value.length === 1 ? businessOptions.value[0]!.value : ''
})
const selectedBusiness = computed({
  get: () => businessId.value,
  set: value => { void navigateTo({ path: route.path, query: { ...route.query, organization_id: value } }) },
})
const { data, error } = await useAsyncData('account-member-scheduling', async () => {
  const organizationId = businessId.value
  if (!organizationId) return { organizationId, members: [] }
  const result = await $fetch<{ members: { id: string; self: boolean }[] }>(`/api/organizations/${organizationId}/members/scheduling`)
  return { organizationId, members: result.members }
}, { server: false, watch: [businessId] })
const member = computed(() => data.value?.organizationId === businessId.value ? data.value.members.find(member => member.self) : null)
useSeoMeta({ title: 'Calendar & availability | Krabiclaw Dashboard', robots: 'noindex, nofollow' })
</script>
