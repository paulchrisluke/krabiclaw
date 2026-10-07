import {HTTPError,type H3Event} from 'nitro'
/** Financial approvals are authenticated browser actions, never model-confirm booleans. */
export function requireFinancialBrowserOrigin(event:H3Event):void {
 const origin=event.req.headers.get('origin')
 if(!origin || origin!==new URL(event.req.url).origin)throw new HTTPError({statusCode:403,statusMessage:'Financial approval requires a same-origin authenticated browser request'})
}
