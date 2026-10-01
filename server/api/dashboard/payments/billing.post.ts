import {requireFinancialBrowserOrigin} from '~/server/utils/financial-browser'
import {defineHandler,HTTPError} from 'nitro'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse,readRequiredBody} from '~/server/utils/api-response'
import {provisionPaymentsBilling,reconcileNativeBillingCredit,finalizePaymentsBilling} from '~/server/domain/payments/usage'
import {createStripeClient} from '~/server/utils/stripe-client'
export default defineHandler(async event=>{
 requireFinancialBrowserOrigin(event)
 const {db,env,organization,userId}=await getDashboardContext(event,{})
 const body=await readRequiredBody<{action?:string;event_id?:string;credit_note_id?:string}>(event)
 if(!env.STRIPE_SECRET_KEY)throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'})
 const stripe=createStripeClient(env.STRIPE_SECRET_KEY, 'payments'),principal={organizationId:organization.id,userId,role:organization.role}
 if(body.action==='finalize')return jsonResponse(await finalizePaymentsBilling(db,env,principal))
 if(body.action==='provision')return jsonResponse(await provisionPaymentsBilling(db,stripe,env,principal))
 if(body.action==='reconcile_credit'&&body.event_id&&body.credit_note_id)return jsonResponse(await reconcileNativeBillingCredit(db,stripe,principal,body.event_id,body.credit_note_id))
 throw new HTTPError({statusCode:400,statusMessage:'Explicit billing setup or native credit reconciliation action required'})
})
