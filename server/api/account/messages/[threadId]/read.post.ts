import {defineHandler,HTTPError} from 'nitro'
import {getRouterParam} from 'nitro/h3'
import {cloudflareEnv,jsonResponse,readRequiredBody} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {requireFinancialBrowserOrigin} from '~/server/utils/financial-browser'
import {getGuestRequest} from '~/server/domain/requests'
import {getGuestThreadDetail} from '~/server/domain/guest-threads/detail'
import {acknowledgeBuyerThreadEntries} from '~/server/utils/notification-acknowledgement'

export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session)throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your messages'})
 requireFinancialBrowserOrigin(event)
 const id=getRouterParam(event,'threadId'),request=id?await getGuestRequest(env.DB,id):null
 const thread=request?await getGuestThreadDetail(env.DB,request.id,request.organization_id,{buyerUserId:session.user.id}):null
 if(!thread)throw new HTTPError({statusCode:404,statusMessage:'Conversation not found'})
 const body=await readRequiredBody<{entry_ids?:unknown}>(event)
 if(!Array.isArray(body.entry_ids)||body.entry_ids.length>200||body.entry_ids.some(id=>typeof id!=='string'))throw new HTTPError({statusCode:400,statusMessage:'Visible message IDs are required'})
 const visibleIds=body.entry_ids.filter((id):id is string=>typeof id==='string')
 if(visibleIds.some(id=>!thread.entries.some(entry=>entry.id===id)))throw new HTTPError({statusCode:404,statusMessage:'Message not found'})
 const acknowledged=await acknowledgeBuyerThreadEntries(env.DB,session.user.id,thread.id,visibleIds)
 return jsonResponse({acknowledged},{headers:{'cache-control':'private, no-store'}})
})
