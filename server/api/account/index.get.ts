import {defineHandler,HTTPError} from 'nitro'
import {getQuery} from 'nitro/h3'
import {isAccountActivityKind} from '~/shared/account-activity'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {buyerActivities,buyerActivity} from '~/server/domain/payments/buyer'
export default defineHandler(async event=>{
 const query=getQuery(event)
 if(Object.keys(query).some(key=>!['kind','id'].includes(key)))throw new HTTPError({statusCode:400,statusMessage:'Unsupported activity query parameter'})
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session) throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your activity'})
 if(query.kind!==undefined||query.id!==undefined){
  if(!isAccountActivityKind(query.kind)||typeof query.id!=='string'||!query.id)throw new HTTPError({statusCode:400,statusMessage:'Activity kind and ID are required'})
  return jsonResponse({activity:await buyerActivity(env.DB,session.user.id,query.kind,query.id)},{headers:{'cache-control':'private, no-store'}})
 }
 return jsonResponse(await buyerActivities(env.DB,session.user.id),{headers:{'cache-control':'private, no-store'}})
})
