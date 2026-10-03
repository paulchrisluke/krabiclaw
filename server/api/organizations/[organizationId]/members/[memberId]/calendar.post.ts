import { defineHandler } from 'nitro'
import { readBody } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { memberSchedulingContext } from '~/server/utils/member-scheduling-context'
import { refreshMemberBusy, readMemberScheduling, selectBusyCalendars } from '~/server/domain/member-scheduling'
export default defineHandler(async event=>{const {actor,memberId}=await memberSchedulingContext(event);const body=await readBody<{action?:string;account_id:string|null;calendar_ids:string[]}>(event);if(body?.action==='select')await selectBusyCalendars(actor,memberId,body);await refreshMemberBusy(actor.env.DB,actor.env,memberId,true);return jsonResponse({scheduling:await readMemberScheduling(actor.env.DB,actor.organizationId,memberId)})})
