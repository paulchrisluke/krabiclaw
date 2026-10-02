import { defineHandler, HTTPError } from 'nitro'
import { getQuery } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { memberSchedulingContext } from '~/server/utils/member-scheduling-context'
import { memberBusyCalendarChoices } from '~/server/domain/member-scheduling'
export default defineHandler(async event=>{const {actor,memberId}=await memberSchedulingContext(event),id=getQuery(event).account_id;if(typeof id!=='string')throw new HTTPError({statusCode:400,message:'Select a linked account'});return jsonResponse({calendars:await memberBusyCalendarChoices(actor,memberId,id)})})
