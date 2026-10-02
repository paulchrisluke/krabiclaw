import { readMemberScheduling, requireSchedulingAccess, writeMemberScheduling, selectBusyCalendars, refreshMemberBusy } from '~/server/domain/member-scheduling'
import { purgePublicResourceCacheNow } from '~/server/utils/public-resource-cache'
import { requiredString, NOT_HANDLED, type McpExecutorContext } from './shared'
export async function handleProvidersTools(ctx:McpExecutorContext):Promise<unknown> {
 const {organization,args,toolName}=ctx, memberId=requiredString(args,'member_id')
 const actor={env:organization.env,organizationId:organization.organizationId,userId:organization.userId}
 await requireSchedulingAccess(actor,memberId)
 if(toolName==='get_member_scheduling')return {scheduling:await readMemberScheduling(organization.db,actor.organizationId,memberId)}
 if(toolName==='set_member_scheduling') {const scheduling=await writeMemberScheduling(actor,memberId,args as unknown as Parameters<typeof writeMemberScheduling>[2]);await purgePublicResourceCacheNow(actor.env,actor.organizationId);return {scheduling}}
 if(toolName==='set_member_busy_calendars') {await selectBusyCalendars(actor,memberId,args as unknown as Parameters<typeof selectBusyCalendars>[2]);await refreshMemberBusy(organization.db,actor.env,memberId,true);return {scheduling:await readMemberScheduling(organization.db,actor.organizationId,memberId)}}
 return NOT_HANDLED
}
