<template>
 <div class="space-y-6">
  <UAlert v-if="error" color="error" :description="error" />
  <p class="text-sm text-muted">Changes affect future availability. Existing bookings keep their assigned person and time.</p>
  <UFormField label="Timezone"><UInput v-model="timezone" placeholder="America/New_York" class="w-full" /></UFormField>
  <section class="space-y-3"><h2 class="font-semibold">Working hours</h2>
   <div v-for="(slot,index) in weekly" :key="index" class="flex flex-wrap items-center gap-2"><USelect v-model="slot.weekday" :items="days" /><UInput v-model="slot.start" type="time" aria-label="Start time" /><UInput v-model="slot.end" type="time" aria-label="End time" /><UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove working window" @click="weekly.splice(index,1)" /></div>
   <UButton color="neutral" variant="soft" @click="weekly.push({weekday:1,start:'09:00',end:'17:00'})">Add working window</UButton>
  </section>
  <section class="space-y-3"><h2 class="font-semibold">Time off</h2><p class="text-sm text-muted">Enter dates and times in your selected timezone.</p>
   <div v-for="(interval,index) in timeOff" :key="index" class="flex flex-wrap items-center gap-2"><UInput v-model="interval.start" type="datetime-local" aria-label="Time off starts" /><UInput v-model="interval.end" type="datetime-local" aria-label="Time off ends" /><UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove time off" @click="timeOff.splice(index,1)" /></div>
   <UButton color="neutral" variant="soft" @click="timeOff.push({start:'',end:''})">Add time off</UButton>
  </section>
  <section class="space-y-3"><h2 class="font-semibold">Public profile</h2><p class="text-sm text-muted">Only approved profile content appears under Who you’ll meet with. Editing these fields removes approval.</p><UFormField label="Public name"><UInput v-model="publicName" class="w-full" /></UFormField><UFormField label="Public photo URL"><UInput v-model="publicPhoto" placeholder="https://…" class="w-full" /></UFormField><UFormField label="Public bio"><UTextarea v-model="publicBio" class="w-full" /></UFormField><UCheckbox v-if="admin" v-model="approve" label="Approve this public profile" /><p v-else class="text-sm text-muted">{{ scheduling?.public_approved ? 'Profile approved' : 'Awaiting owner/admin approval' }}</p></section>
  <UButton :loading="saving" @click="save">Save profile and availability</UButton>
  <section class="space-y-3 border-t border-default pt-6"><h2 class="font-semibold">Calendar status</h2><p>{{ scheduling?.calendar_status || 'Internal scheduling' }}</p><UAlert v-if="scheduling?.busy_error" color="warning" :description="scheduling.busy_error" /><p class="text-sm text-muted">Google conflict checking is optional. Selected stale or disconnected calendars block new availability. Booking output uses a separate calendar.</p>
   <template v-if="self"><USelect v-model="accountId" :items="accountOptions" placeholder="Select your linked Google account" class="w-full" /><UButton color="neutral" variant="soft" @click="linkGoogle">Connect Google for busy checks</UButton><UButton :disabled="!accountId" color="neutral" variant="soft" @click="loadCalendars">Choose busy calendars</UButton><UCheckbox v-for="calendar in calendars" :key="calendar.id" :model-value="calendarIds.includes(calendar.id)" :label="calendar.summary" @update:model-value="checked=>calendarIds=checked?[...calendarIds,calendar.id]:calendarIds.filter(id=>id!==calendar.id)" /><UButton :disabled="!accountId || !calendarIds.length" @click="selectCalendar">Save busy calendars</UButton></template>
   <div class="flex gap-2"><UButton v-if="scheduling?.calendar_account_id" color="neutral" variant="soft" @click="refreshCalendar">Recheck busy data</UButton><UButton v-if="scheduling?.calendar_account_id" color="neutral" variant="soft" @click="disconnectCalendar">Use internal scheduling</UButton></div>
  </section>
 </div>
</template>
<script setup lang="ts">
import { MEMBER_BUSY_SCOPES, type WorkingHours } from '~/shared/member-scheduling'
import { localPartsAt, localDateTimeToInstant } from '~/utils/timezone'
import type { readMemberScheduling } from '~/server/domain/member-scheduling'
const props=defineProps<{organizationId:string;memberId:string;admin?:boolean;self?:boolean}>()
type Scheduling=Awaited<ReturnType<typeof readMemberScheduling>>
const scheduling=ref<Scheduling>(null),error=ref(''),saving=ref(false),timezone=ref(Intl.DateTimeFormat().resolvedOptions().timeZone),weekly=ref<WorkingHours[]>([]),timeOff=ref<{start:string;end:string}[]>([]),publicName=ref(''),publicPhoto=ref(''),publicBio=ref(''),approve=ref(false)
const accountId=ref(''),calendarIds=ref<string[]>([]),calendars=ref<{id:string;summary:string}[]>([])
const linked=useLinkedAccounts('google',MEMBER_BUSY_SCOPES)
const accountOptions=computed(()=>linked.data.value?.map(a=>({label:a.label,value:a.id}))??[])
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((label,value)=>({label,value}))
const base=computed(()=>`/api/organizations/${props.organizationId}/members/${props.memberId}`)
function local(instant:string,zone:string){const p=localPartsAt(new Date(instant),zone);const pad=(v:number)=>String(v).padStart(2,'0');return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`}
function apply(value:Scheduling){scheduling.value=value;if(!value)return;timezone.value=value.timezone;weekly.value=value.weekly.map(s=>({...s}));timeOff.value=value.time_off.map(i=>({start:local(i.start,value.timezone),end:local(i.end,value.timezone)}));publicName.value=value.public_name??'';publicPhoto.value=value.public_photo_url??'';publicBio.value=value.public_bio??'';approve.value=Boolean(value.public_approved);accountId.value=value.calendar_account_id??'';calendarIds.value=value.calendar_ids}
async function run(action:()=>Promise<void>){error.value='';saving.value=true;try{await action()}catch(e){error.value=getErrorMessage(e,'Schedule could not be saved')}finally{saving.value=false}}
function instant(value:string){const [date,time]=value.split('T');if(!date||!time)throw new Error('Complete the time-off interval');return localDateTimeToInstant(date,time,timezone.value,'compatible').toISOString()}
async function save(){await run(async()=>apply((await $fetch<{scheduling:Scheduling}>(`${base.value}/scheduling`,{method:'PUT',body:{timezone:timezone.value,weekly:weekly.value,time_off:timeOff.value.map(i=>({start:instant(i.start),end:instant(i.end)})),expected_updated_at:scheduling.value?.updated_at??null,public_name:publicName.value||null,public_photo_url:publicPhoto.value||null,public_bio:publicBio.value||null,...(props.admin?{public_approved:approve.value}:{})}})).scheduling))}
async function linkGoogle(){await run(async()=>{await linked.link(window.location.href)})}
async function loadCalendars(){await run(async()=>{calendars.value=(await $fetch<{calendars:typeof calendars.value}>(`${base.value}/calendars`,{query:{account_id:accountId.value}})).calendars})}
async function calendar(body:Record<string,unknown>){await run(async()=>apply((await $fetch<{scheduling:Scheduling}>(`${base.value}/calendar`,{method:'POST',body})).scheduling))}
async function selectCalendar(){await calendar({action:'select',account_id:accountId.value,calendar_ids:calendarIds.value})}
async function disconnectCalendar(){await calendar({action:'select',account_id:null,calendar_ids:[]})}
async function refreshCalendar(){await calendar({action:'refresh'})}
onMounted(()=>run(async()=>apply((await $fetch<{scheduling:Scheduling}>(`${base.value}/scheduling`)).scheduling)))
</script>
