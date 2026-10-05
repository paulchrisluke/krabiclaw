import {defineHandler,HTTPError} from 'nitro'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {queryAll} from '~/server/db'
import {organizationLogo} from '~/server/notifications/hero'
/** The businesses this account can manage, each with its mark, for the Businesses list under Account settings. */
export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session)throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your businesses'})
 const rows=await queryAll<{id:string;slug:string;name:string}>(env.DB,'SELECT o.id,o.slug,o.name FROM member m JOIN organization o ON o.id=m.organizationId WHERE m.userId=? ORDER BY o.name',[session.user.id])
 const businesses=await Promise.all(rows.map(async row=>({...row,imageUrl:await organizationLogo(env.DB,row.id)})))
 return jsonResponse({businesses},{headers:{'cache-control':'private, no-store'}})
})
