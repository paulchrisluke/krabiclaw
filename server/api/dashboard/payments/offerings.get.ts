import {defineHandler} from 'nitro'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse} from '~/server/utils/api-response'
import {queryAll} from '~/server/db'
import {authorizePayments} from '~/server/domain/payments'
import {selectPrice,type Price} from '~/shared/prices'
export default defineHandler(async event=>{
 const {db,organization,userId}=await getDashboardContext(event,{})
 await authorizePayments({organizationId:organization.id,userId,role:organization.role},'create')
 const variants=await queryAll<{product_id:string;variant_id:string;name:string;variant_name:string}>(db,`SELECT p.id AS product_id,v.id AS variant_id,p.name,v.name AS variant_name FROM products p JOIN product_variants v ON v.product_id=p.id AND v.organization_id=p.organization_id WHERE p.organization_id=? AND p.active=1 AND v.active=1 AND NOT EXISTS(SELECT 1 FROM product_booking_configs c WHERE c.product_id=p.id AND c.organization_id=p.organization_id) ORDER BY p.name,v.name LIMIT 100`,[organization.id])
 const prices=await queryAll<Price>(db,'SELECT * FROM prices WHERE organization_id=?',[organization.id])
 const now=new Date().toISOString()
 return jsonResponse({offerings:variants.flatMap(variant=>{const price=selectPrice(prices.filter(price=>price.product_variant_id===variant.variant_id).map(price=>({...price,active:Boolean(price.active)})),{currency:'USD',location_id:null,at:now,billing:{type:'one_time'}});return price&&price.unit_amount>0?[{...variant,currency:price.currency,unit_amount:price.unit_amount}]:[]})})
})
