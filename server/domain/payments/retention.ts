import {executeBatch,type DbClient} from '~/server/db'
/** Called only by the existing authorized tenant deletion orchestration. */
export async function retainPaymentsForTenantDeletion(db:DbClient,organizationId:string) {
 const now=new Date().toISOString()
 await executeBatch(db,[
  {query:`INSERT INTO payment_servicing_tenants(organization_id,stripe_account_id,livemode,retained_at) SELECT DISTINCT organization_id,stripe_account_id,livemode,? FROM payments WHERE organization_id=? ON CONFLICT(stripe_account_id,livemode) DO NOTHING`,params:[now,organizationId]},
  {query:"UPDATE payment_checkout_holds SET status='released' WHERE organization_id=? AND status='active'",params:[organizationId]},
  {query:"UPDATE payment_billing_accounts SET status='servicing',updated_at=? WHERE organization_id=?",params:[now,organizationId]},
 ],{operation:'Retain minimum Payments servicing links before tenant deletion'})
}
