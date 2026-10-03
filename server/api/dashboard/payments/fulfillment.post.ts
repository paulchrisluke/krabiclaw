import {defineHandler,HTTPError} from 'nitro'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse,readRequiredBody} from '~/server/utils/api-response'
import {setOrderFulfillment} from '~/server/domain/payments/orders'
export default defineHandler(async event=>{
 const {db,organization,userId}=await getDashboardContext(event,{})
 const body=await readRequiredBody<{payment_id?:string;status?:string}>(event)
 if(!body.payment_id||!body.status)throw new HTTPError({statusCode:400,statusMessage:'Order payment and fulfillment outcome required'})
 return jsonResponse(await setOrderFulfillment(db,{organizationId:organization.id,userId,role:organization.role},body.payment_id,body.status))
})
