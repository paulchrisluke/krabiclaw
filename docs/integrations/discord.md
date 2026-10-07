# Discord channel publishing

Each organization can connect one Discord channel through an incoming webhook
and publish its short posts there, from the dashboard or MCP, alongside or
instead of the website, Facebook and Instagram. It requires the Growth plan.
Basic webhook publishing has no Discord fee and needs no Nitro or bot.

## Connect

1. In Discord, open the channel's **Edit Channel → Integrations → Webhooks**
   (requires Manage Webhooks in that server) and create a webhook, or choose an
   existing one.
2. Set the webhook's name and avatar there. Every published message is sent
   under that identity.
3. **Copy Webhook URL**, then in KrabiClaw open **Integrations → Discord**,
   paste it, and name the channel. Discord does not report a channel's name to
   a webhook, so the name is yours.

Connecting asks Discord about the webhook with its own token and posts nothing.
Only an incoming webhook of a server channel is accepted. KrabiClaw keeps the
webhook, guild and channel ids Discord reported and the token encrypted with
Better Auth's secret (`BETTER_AUTH_SECRET`, or the versioned
`BETTER_AUTH_SECRETS` Better Auth uses for rotation). The token never appears in
a response, MCP schema, log or error. Rotating the secret follows Better Auth's
procedure for its encrypted OAuth tokens; a webhook URL reset in Discord is
replaced by pasting the new one.

Replacing the webhook keeps the connection's place; **Disconnect** deletes the
stored token and stops publishing. Messages already in Discord stay.

Before every send KrabiClaw asks Discord again: a deleted or reset webhook, or
one moved to another channel, is reported as a connection problem and nothing is
sent until it is connected again.

## What is sent

- The post's text and call to action, exactly as on other channels, up to 2000
  characters. Longer posts are refused, never truncated or split.
- Its images and videos as attachments, in order, with their alt text as
  descriptions: JPEG, PNG, GIF, WebP, MP4, MOV and WebM, at most ten, 20 MiB
  each and 25 MiB together, checked against the bytes actually sent.
- Mentions in the text are never pinged.
- Ordinary text channels only. A forum or media channel needs
  a thread and is refused.

If Discord rate limits the send, KrabiClaw waits Discord's delay within the
request; past that, the publication stays ready and publishing again sends it.

## Receipts, reading and deleting

A published message's receipt holds its id and its Discord link. The link opens
only for people who can see that channel, so the public website does not show
Discord the way it shows Facebook and Instagram posts.

A webhook can read and delete only messages it sent, by id. `get_channel_post`
and `delete_channel_post` take a receipt's `provider_post_id`; there is no
channel listing.

## An unknown outcome

Discord's Execute Webhook has no idempotency key. If its answer is lost after
the send began, the publication is **unknown** and is never sent again
automatically. Find the message in the channel, copy its id (Developer Mode →
Copy Message ID), and check it from the post's Publishing page or with
`reconcile_post_publication`. It is attached only if the connected webhook sent
it to the connected channel with this post's exact text and media during the
attempt; otherwise the outcome stays unknown.
