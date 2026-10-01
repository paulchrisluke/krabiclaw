import {defineHandler} from 'nitro'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse} from '~/server/utils/api-response'
import {assertRoleAllows} from '~/server/utils/member-access'
import {paymentsUsageStatus} from '~/server/domain/payments/usage'
import {queryAll} from '~/server/db'
export default defineHandler(async event=>{
 const {db,env,organization}=await getDashboardContext(event,{})
 await assertRoleAllows({organizationId:organization.id,role:organization.role,permissions:{billing:['read']}})
 return jsonResponse({...await paymentsUsageStatus(db,env,organization.id),credits:await queryAll(db,"SELECT id,source_id,currency,amount,provider_occurred_at,error FROM payment_usage_events WHERE organization_id=? AND amount<0 AND delivery_at IS NULL",[organization.id])})
})
