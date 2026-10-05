import {queryAll,queryFirst,type DbClient} from '~/server/db'
export async function readPaymentOrder(db:DbClient,organizationId:string,paymentId:string){
 const order=await queryFirst<{id:string}>(db,'SELECT * FROM payment_orders WHERE organization_id=? AND payment_id=?',[organizationId,paymentId])
 return order?{...order,lines:await queryAll(db,'SELECT * FROM payment_order_lines WHERE order_id=?',[order.id])}:null
}
