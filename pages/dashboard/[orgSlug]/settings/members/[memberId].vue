<template>
 <DashboardLeafPanel id="member-scheduling" title="Member profile & availability" :ready="Boolean(organizationId)" :footer="false"><MemberScheduleEditor v-if="organizationId" :organization-id="organizationId" :member-id="memberId" admin /><p class="mt-6 text-sm text-muted">Members can manage their own schedule at <NuxtLink :to="`/dashboard/account/profile/calendar?organization_id=${encodeURIComponent(organizationId)}`" class="underline">My account → Calendar &amp; availability</NuxtLink>.</p></DashboardLeafPanel>
</template>
<script setup lang="ts">
import MemberScheduleEditor from '~/components/dashboard/MemberScheduleEditor.vue'
definePageMeta({layout:'dashboard'})
const route=useRoute(),dashboard=useDashboardOrganization(),organizationId=computed(()=>dashboard.organization.value?.id??''),memberId=String(route.params.memberId)
</script>
