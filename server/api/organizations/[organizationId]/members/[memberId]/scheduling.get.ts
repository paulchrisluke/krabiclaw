import { defineHandler } from 'nitro'
import { jsonResponse } from '~/server/utils/api-response'
import { memberSchedulingContext } from '~/server/utils/member-scheduling-context'
import { readMemberScheduling } from '~/server/domain/member-scheduling'
export default defineHandler(async event=>{const {actor,memberId}=await memberSchedulingContext(event);return jsonResponse({scheduling:await readMemberScheduling(actor.env.DB,actor.organizationId,memberId)})})
