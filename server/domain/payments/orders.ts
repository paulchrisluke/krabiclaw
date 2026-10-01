import {HTTPError} from 'nitro'
import {execute,queryAll,queryFirst,type DbClient} from '~/server/db'
import {authorizePayments,type FinancialPrincipal} from './index'
export async function readPaymentOrder(db:DbClient,organizationId:string,paymentId:string){
 const order=await queryFirst<{id:string;fulfillment_status:string}>(db,'SELECT * FROM payment_orders WHERE organization_id=? AND payment_id=?',[organizationId,paymentId])
 return order?{...order,lines:await queryAll(db,'SELECT * FROM payment_order_lines WHERE order_id=?',[order.id])}:null
}
/** Merchant-arranged fulfillment changes no payment, refund, shipping or subscription state. */
export async function setOrderFulfillment(db:DbClient,principal:FinancialPrincipal,paymentId:string,status:string){
 await authorizePayments(principal,'create')
 if(!['fulfilled','cancelled'].includes(status))throw new HTTPError({statusCode:400,statusMessage:'Choose Fulfilled or Cancelled for merchant-arranged fulfillment'})
 const result=await execute(db,`UPDATE payment_orders SET fulfillment_status=? WHERE payment_id=? AND organization_id=? AND fulfillment_status='unfulfilled' AND EXISTS(SELECT 1 FROM payments p WHERE p.id=payment_orders.payment_id AND p.captured_amount>0)`,[status,paymentId,principal.organizationId])
 const order=await readPaymentOrder(db,principal.organizationId,paymentId)
 if(!order || (result.meta.changes!==1&&order.fulfillment_status!==status))throw new HTTPError({statusCode:409,statusMessage:'Captured order fulfillment transition unavailable'})
 return order
}
