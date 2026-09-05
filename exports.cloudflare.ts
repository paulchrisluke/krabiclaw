import { DurableObject } from 'cloudflare:workers'

export { GuestInboxHubObject } from './server/cloudflare/durable-objects/guest-inbox-hub'

// Retain the production namespace until the Epoch 4 rollback window closes.
// There is no binding or command implementation in the new Worker.
export class GuestThreadCommandObject extends DurableObject {
  override fetch(): Response {
    return new Response('Guest thread command transport retired', { status: 410 })
  }
}
