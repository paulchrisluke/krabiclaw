<template>
 <DashboardLeafPanel id="booking-team-member" title="Team member" lead="Changing the team member updates everyone in this booking." :ready="Boolean(data) || Boolean(loadError)" :saving="saving" :disabled="!selected || selected === b.booking.value?.assignedMemberId || !data?.members.length || b.booking.value?.complete || !['pending','confirmed'].includes(b.booking.value?.status ?? '')" :error="error || (loadError ? getErrorMessage(loadError,'Team members could not be loaded.') : '')" @cancel="reset" @save="save">
  <URadioGroup v-if="data?.members.length" v-model="selected" :items="data.members.map(member=>({label:member.name,value:member.id}))" variant="card" />
  <UAlert v-else-if="data" color="warning" description="Assign a team member to this service before changing this booking." />
 </DashboardLeafPanel>
</template>
<script setup lang="ts">
import {bookingEditorKey} from '~/components/dashboard/BookingDetails.vue'
definePageMeta({layout:'dashboard'})
const b=inject(bookingEditorKey)!,api=useDashboardApi(),level=useRouteLevel()
if(b.bookingType!=='booking')showError(createError({statusCode:404,statusMessage:'Page not found'}))
const selected=ref(''),saving=ref(false),error=ref(''),key=ref<string|null>(null)
function reset(){selected.value=b.booking.value?.assignedMemberId??'';key.value=null}
watch(b.booking,reset,{immediate:true});watch(selected,()=>{key.value=null})
const {data,error:loadError}=await useAsyncData(()=>`booking-team:${b.booking.value?.organizationId}:${b.booking.value?.experienceId}`,async()=>{
 const booking=b.booking.value
 if(!booking || !booking.experienceId)return null
 const product=await api(`/api/editor/organizations/${booking.organizationId}/products/${booking.experienceId}`,{validate:(v):v is {product:{booking:{assigned_member_id:string|null}|null}}=>isRecord(v)&&isRecord(v.product)&&(v.product.booking===null || isRecord(v.product.booking))})
 const result=await api(`/api/organizations/${booking.organizationId}/members/scheduling`,{validate:(v):v is {members:{id:string;name:string}[]}=>isRecord(v)&&Array.isArray(v.members)&&v.members.every(m=>isRecord(m)&&typeof m.id==='string'&&typeof m.name==='string')})
 return {members:result.members.filter(m=>m.id===product.product.booking?.assigned_member_id)}
},{server:false,watch:[b.booking]})
async function save(){const booking=b.booking.value;if(!booking)return;saving.value=true;error.value='';key.value??=crypto.randomUUID();try{await api(`/api/dashboard/bookings/booking/${booking.operationalBookingId}/provider`,{method:'POST',body:{member_id:selected.value,expected_updated_at:booking.operationalUpdatedAt,idempotency_key:key.value},validate:(v):v is {session_id:string;assigned_member_id:string}=>isRecord(v)&&typeof v.session_id==='string'&&v.assigned_member_id===selected.value});await b.refresh();await navigateTo(level.to.value??'/dashboard')}catch(cause){error.value=getErrorMessage(cause,'The team member could not be changed.')}finally{saving.value=false}}
</script>
