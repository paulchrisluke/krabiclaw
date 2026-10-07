import { organizationTool, type McpToolDefinition } from './shared'
import { memberSchedulingList, readMemberScheduling, requireSchedulingAccess, writeMemberScheduling, selectBusyCalendars, refreshMemberBusy } from '~/server/domain/member-scheduling'
import { purgePublicResourceCacheNow } from '~/server/utils/public-resource-cache'
import { requiredString, NOT_HANDLED, type McpExecutorContext } from './execution'
const member={member_id:{type:'string',description:'Existing Better Auth organization member ID. Ordinary members may name only themselves.'}}
const interval={type:'object',properties:{start:{type:'string'},end:{type:'string'}},required:['start','end'],additionalProperties:false}
export const PROVIDERS_TOOLS:McpToolDefinition[]=[
 organizationTool({name:'get_member_scheduling',domain:'providers',minimumRole:'member',confirmRequired:false,description:'List accessible members and their scheduling when member_id is omitted, or read one member’s hours, time off, explicitly approved public profile and Calendar status. Ordinary members can read only their own scheduling record; owners/admins can inspect their team. No Google event content or credentials are returned.',inputSchema:{...member}}),
 organizationTool({name:'set_member_scheduling',domain:'providers',minimumRole:'member',confirmRequired:false,description:'Replace a member’s own timezone, weekly working hours and UTC time-off intervals using the latest updated_at. Owner/admin may oversee any member and approve public profile. Profile edits revoke approval unless explicitly approved by an admin. Existing Booking assignments and times stay fixed. Returns the saved scheduling record; no guest messages are sent.',inputSchema:{...member,timezone:{type:'string'},weekly:{type:'array',maxItems:28,items:{type:'object',properties:{weekday:{type:'integer',minimum:0,maximum:6},start:{type:'string'},end:{type:'string'}},required:['weekday','start','end'],additionalProperties:false}},time_off:{type:'array',maxItems:100,items:interval},expected_updated_at:{type:['string','null']},public_name:{type:['string','null']},public_photo_url:{type:['string','null']},public_bio:{type:['string','null']},public_approved:{type:'boolean'}},required:['member_id','timezone','weekly','time_off','expected_updated_at']}),
 organizationTool({name:'set_member_busy_calendars',domain:'providers',minimumRole:'member',confirmRequired:false,description:'Select 1–10 Google busy-input calendars on the member’s own already-linked account with granted free/busy scopes, pause checking with an empty calendar_ids list, or disconnect with null account and empty calendar_ids. This tool never grants OAuth access. Busy input must be separate from organization booking output. Stale or disconnected selected calendars block new availability; when no calendars are selected, availability uses internal scheduling. Returns scheduling and refreshed busy-check status. Only this member’s input selection changes; Google events and existing bookings are unchanged.',inputSchema:{...member,account_id:{type:['string','null']},calendar_ids:{type:'array',maxItems:10,items:{type:'string'}}},required:['member_id','account_id','calendar_ids']}),
]
export async function handleProvidersTools(ctx:McpExecutorContext):Promise<unknown> {
 const {organization,args,toolName}=ctx
 const actor={env:organization.env,organizationId:organization.organizationId,userId:organization.userId}
 if(toolName==='get_member_scheduling' && args.member_id===undefined)return {members:await memberSchedulingList(actor)}
 const memberId=requiredString(args,'member_id')
 await requireSchedulingAccess(actor,memberId)
 if(toolName==='get_member_scheduling')return {scheduling:await readMemberScheduling(organization.db,actor.organizationId,memberId)}
 if(toolName==='set_member_scheduling') {const scheduling=await writeMemberScheduling(actor,memberId,args as unknown as Parameters<typeof writeMemberScheduling>[2]);await purgePublicResourceCacheNow(actor.env,actor.organizationId);return {scheduling}}
 if(toolName==='set_member_busy_calendars') {await selectBusyCalendars(actor,memberId,args as unknown as Parameters<typeof selectBusyCalendars>[2]);await refreshMemberBusy(organization.db,actor.env,memberId,true);return {scheduling:await readMemberScheduling(organization.db,actor.organizationId,memberId)}}
 return NOT_HANDLED
}
