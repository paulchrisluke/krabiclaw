import {defineHandler,HTTPError} from 'nitro'
import {getQuery} from 'nitro/h3'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {listGuestThreads} from '~/server/domain/guest-threads/repository'
import {parseGuestThreadListQuery} from '~/server/utils/dashboard-guest-threads'

export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session)throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your messages'})
 const supplied=getQuery(event)
 if(supplied.conversation_state!==undefined)throw new HTTPError({statusCode:400,statusMessage:'Personal messages cannot use merchant conversation state'})
 const query=parseGuestThreadListQuery(supplied)
 if('error' in query||query.organizationId||query.locationId)throw new HTTPError({statusCode:400,statusMessage:'error' in query?query.error:'Personal messages cannot use merchant scope'})
 const threads=await listGuestThreads(env.DB,null,{...query,userId:session.user.id,buyerAudience:true})
 return jsonResponse({threads},{headers:{'cache-control':'private, no-store'}})
})
