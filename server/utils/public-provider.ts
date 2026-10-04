import { HTTPError } from 'nitro'
import { sessionMemberSql } from './provider-allocation'
import { queryFirst, type DbClient } from '~/server/db'
import type { PublicProvider } from '~/shared/member-scheduling'
/** Explicit approved content only; never join Better Auth user profile fields. */
export async function publicProductProvider(db:DbClient,organizationId:string,productId:string,sessionId?:unknown):Promise<PublicProvider|null> {
 if(sessionId!==undefined && (typeof sessionId!=='string'||!sessionId.trim()))throw new HTTPError({statusCode:400,message:'Session ID must be a nonempty string'})
 const row=await queryFirst<{session_id:string|null;name:string|null;photo_url:string|null;bio:string|null}>(db,`
 SELECT selected.id session_id,ms.public_name name,ms.public_photo_url photo_url,ms.public_bio bio
 FROM product_booking_configs c
 LEFT JOIN product_sessions selected ON selected.id=? AND selected.product_id=c.product_id AND selected.organization_id=c.organization_id
 LEFT JOIN member_scheduling ms ON ms.organization_id=c.organization_id AND ms.public_approved=1 AND length(trim(ms.public_name))>0
  AND ms.member_id=CASE WHEN ? IS NULL THEN CASE WHEN c.scheduling_mode='provider' THEN c.assigned_member_id END ELSE ${sessionMemberSql('selected')} END
 WHERE c.product_id=? AND c.organization_id=?`,[sessionId??null,sessionId??null,productId,organizationId])
 if(sessionId!==undefined && !row?.session_id)throw new HTTPError({statusCode:404,message:'Session not found for this offering'})
 return row?.name?{name:row.name,photo_url:row.photo_url,bio:row.bio}:null
}
