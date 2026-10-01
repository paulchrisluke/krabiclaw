import {defineHandler,HTTPError} from 'nitro'
import {getQuery} from 'nitro/h3'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse} from '~/server/utils/api-response'
import {authorizePayments} from '~/server/domain/payments'
import {queryFirst} from '~/server/db'
export default defineHandler(async event=>{
 const {db,organization,userId}=await getDashboardContext(event,{})
 await authorizePayments({organizationId:organization.id,userId,role:organization.role},'refund')
 const id=getQuery(event).id
 if(typeof id!=='string') throw new HTTPError({statusCode:400,statusMessage:'Authorization ID required'})
 const approval=await queryFirst(db,`SELECT a.id,a.action,a.amount,a.payment_id,a.expires_at,p.currency,p.subject_type,p.subject_id FROM payment_authorizations a JOIN payments p ON p.id=a.payment_id WHERE a.id=? AND a.organization_id=? AND a.user_id=? AND a.expires_at>? AND a.consumed_at IS NULL`,[id,organization.id,userId,new Date().toISOString()])
 if(!approval) throw new HTTPError({statusCode:404,statusMessage:'Refund authorization is unavailable'})
 return jsonResponse(approval)
})
