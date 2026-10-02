import { queryFirst, type DbClient } from '~/server/db'
import type { PublicProvider } from '~/shared/member-scheduling'
/** Explicit approved content only; never join Better Auth user profile fields. */
export async function publicProductProvider(db:DbClient,organizationId:string,productId:string,sessionId?:string) {
 return queryFirst<PublicProvider>(db,`SELECT ms.public_name name,ms.public_photo_url photo_url,ms.public_bio bio FROM member_scheduling ms
 JOIN product_booking_configs c ON c.organization_id=ms.organization_id
 WHERE c.product_id=? AND c.organization_id=? AND ms.public_approved=1 AND length(trim(ms.public_name))>0
 AND ms.member_id=COALESCE((SELECT assigned_member_id FROM product_sessions WHERE id=? AND product_id=c.product_id AND organization_id=c.organization_id),CASE WHEN c.scheduling_mode='provider' THEN c.assigned_member_id END)`,[productId,organizationId,sessionId??null])
}
