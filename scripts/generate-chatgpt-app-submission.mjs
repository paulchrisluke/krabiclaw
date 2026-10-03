import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import Ajv2020 from 'ajv/dist/2020.js'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)

const { MCP_PUBLIC_TOOLS } = await import('../server/utils/mcp-tools/index.ts')

const SCHEMA_URL = 'https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json'
const OUTPUT_PATH = 'chatgpt-app-submission.json'

// Reviewed effects are authored here; annotation values still come from the registry.
// A newly exposed tool must receive an explicit review before regeneration succeeds.
const effects = {
  list_product_bookings: 'Reads operational Product bookings and guest snapshots within the selected tenant.',
  list_product_booking_sessions: 'Reads existing tenant Product sessions and canonical capacity, including the shared online calendar exclusion.',
  create_product_booking: 'Atomically creates a tenant Product booking and guest inbox thread, with caller idempotency, operator provenance and explicit guest acknowledgement choice. Uses public capacity and payment-required rules; performs no financial mutation.',
  get_product_booking: 'Reads one tenant Product booking with guest snapshot, operational status, provenance and updated timestamp.',
  confirm_product_booking: 'Confirms a pending Product review booking through the canonical inbox operation, without allocating capacity again, and sends its guest status message.',
  reject_product_booking: 'Rejects a pending Product booking through the canonical inbox operation, releasing capacity and sending its guest status message.',
  cancel_product_booking: 'Cancels a Product booking through the canonical inbox operation, releasing capacity once and sending its guest status message.',
  request_product_booking_change: 'Records an audited immutable Product session/party change proposal and emails the guest to approve. Allocation remains unchanged until guest acceptance.',
  cancel_table_reservation: 'Cancels a real restaurant table Reservation through the canonical inbox operation, releasing capacity once and sending its guest status message.',
  request_table_reservation_change: 'Records an audited immutable restaurant table location/date/time/party change proposal and emails the guest to approve. Allocation remains unchanged until guest acceptance.',
  append_content_block: 'Inserts one block into the selected blog article or tenant page after a named block, leaving every other block as it is.',
  attach_media: 'Adds an existing asset to a public content collection without replacing its existing placements.',
  batch_create_products: 'Creates products from the supplied catalog entries and records product events.',
  delete_site_page: 'Deletes a tenant page; deleting its source locale removes every translation with it.',
  create_blog_post: 'Creates a draft tenant blog article and its content document; it is not public until published.',
  create_article_category: 'Creates an empty category in the selected organization\'s blog or documentation; articles are placed in it separately.',
  create_collection: 'Creates an empty collection for the selected organization; products are added to it separately.',
  create_post: 'Creates a private draft short post with its media; nothing is public until it is published.',
  create_product: 'Creates a product with an explicit kind, variants, prices and named details; publication and placements are assigned separately.',
  create_site_page: 'Creates a tenant page and its structured content document.',
  delete_article_category: 'Deletes an empty category of the selected organization\'s blog or documentation; a category that still has articles is refused.',
  delete_blog_post: 'Deletes the selected tenant blog article and its associated content.',
  delete_content_block: 'Deletes one block, and the blocks nested under it, from the selected blog article or tenant page after a version check.',
  delete_collection: 'Deletes the selected collection and every product membership in it; the products themselves are untouched.',
  delete_media_asset: 'Removes an asset and its placements, and deletes backing Cloudflare storage when no other asset references it.',
  delete_post: 'Deletes the selected short post from the website; its Facebook and Instagram posts are left as they are.',
  delete_product: 'Deletes the selected product and its owned variants, prices, attributes and placements; booking history or a referencing site page prevents deletion.',
  delete_resource_localization: 'Deletes the selected translated resource representation.',
  get_blog_post: 'Reads the selected tenant blog article and content for editing.',
  list_contact_inquiries: 'Reads authorized customer contact inquiries, including personal contact information.',
  get_location: 'Reads the selected location, including operational contact and notification settings.',
  get_post: 'Reads the selected short post and the state of its external publications.',
  get_social_connections: 'Reads which website, Facebook Page and Instagram account the organization can publish to, and whether Meta currently accepts each connection, without returning any token.',
  get_product: 'Reads the selected product and its price and content.',
  get_product_catalog_localization: 'Reads product catalog translations for the selected organization and locale.',
  list_reservation_inquiries: 'Reads authorized reservation inquiries, including guest contact and reservation information.',
  get_reservation_policy: 'Reads the reservation policy of the selected location.',
  get_calendar: 'Reads what is on one location\'s calendar between two dates and which dates it cannot take. Nothing is written.',
  get_resource_localization: 'Reads a resource translation and any existing authoring document.',
  get_organization: 'Reads the selected accessible organization and workspace context.',
  get_organization_analytics: 'Reads website analytics reports from stored aggregates and retained raw events without creating aggregates.',
  query_organization_analytics: 'Reads individual native analytics events, retained sessions and grouped breakdowns from the selected organization\'s stored analytics without modifying them.',
  get_organization_media_assets: 'Lists the selected organization media library and public asset URLs.',
  get_organization_settings: 'Reads the selected organization settings.',
  get_site_page: 'Reads the selected tenant page and its existing content document.',
  get_workspace_context: 'Reads the authenticated user workspace selection and available context.',
  list_article_categories: 'Lists the categories of the selected organization\'s blog or documentation.',
  list_blog_posts: 'Lists the selected organization blog articles.',
  list_collections: 'Lists the collections of the selected organization.',
  list_location_products: 'Lists products in the explicitly selected location.',
  create_qa: 'Creates a new authored question and answer; retries may create duplicates.',
  update_qa: 'Overwrites selected authored Q&A fields and public visibility.',
  delete_qa: 'Deletes selected authored Q&A and its translations.',
  reorder_qa: 'Overwrites authored Q&A sort positions in one scope.',
  set_consultation_mode: 'Updates the existing site consultation mode through the shared CMS writer without provider allocation, payment capture or commercial plan changes.',
  set_product_booking_config: 'Sets inputs for new occurrences without changing omitted defaults or existing session facts.',
  delete_product_booking_config: 'Disables product booking when no booking history exists.',
  replace_product_weekly_schedule: 'Replaces weekly availability for one product and location, cancelling removed future sessions with no booking history while preserving any booked history.',
  list_location_qa: 'Lists questions and answers for the selected location.',
  list_location_reviews: 'Lists reviews for the selected location.',
  list_locations: 'Lists locations accessible in the selected organization.',
  list_posts: 'Lists short posts for the selected organization.',
  list_products: 'Lists the products of the selected organization.',
  list_organization_locales: 'Reads the selected organization locale records without provisioning translations.',
  list_organization_qa: 'Lists questions and answers for the selected organization.',
  list_organization_reviews: 'Lists reviews and their provenance for the selected organization.',
  list_organizations: 'Lists organizations accessible to the authenticated user without provisioning one.',
  list_site_pages: 'Lists tenant pages for the selected organization.',
  publish_blog_post: 'Publishes the selected draft blog article on the website.',
  publish_post: 'Publishes the selected post only to the explicitly requested website, Facebook Page or Instagram targets and records their outcomes.',
  reconcile_post_publication: 'Reads Facebook or Instagram to record the proven outcome of one publication; it never publishes.',
  put_resource_localization: 'Creates or overwrites translated resource values and supplied translated content.',
  reconcile_products: 'Creates or updates catalog products by supplied product_id; entries without an ID create new products on each call. Disables sale of omitted products only when deactivate_missing is requested.',
  remove_media: 'Removes an asset placement from public content while retaining the underlying media asset.',
  remove_product_location: 'Removes a product from a location, so the location no longer offers it.',
  reorder_article_categories: 'Overwrites the order the categories of the selected organization\'s blog or documentation are presented in.',
  reorder_blog_posts: 'Overwrites the order one of the selected organization\'s article collections (blog or documentation) is presented in.',
  reorder_collections: 'Overwrites the order collections are presented in on the selected organization.',
  reorder_media: 'Overwrites media placement ordering for the selected public content collection.',
  replace_content_block: 'Replaces one block\'s data and media in the selected blog article or tenant page after a version check, keeping its position.',
  replace_resource_localizations: 'Replaces the submitted translations for one resource type and locale; omitted resources remain untouched.',
  set_brand_color: 'Overwrites the selected organization public brand color.',
  set_collection_products: 'Overwrites the complete membership and order of the selected collection; products left out lose their place in it.',
  set_media: 'Replaces or clears the asset assigned to a single public media placement.',
  set_product_location: 'Creates or overwrites the selected product’s location availability and publication settings.',
  set_product_publication: 'Creates or overwrites the selected product’s publication setting, including removing it from public display.',
  list_channel_posts: 'Reads live posts from the explicitly selected connected channel; it does not create website content.',
  get_channel_post: 'Reads one live post belonging to the explicitly selected connected channel.',
  delete_channel_post: 'Deletes the explicitly named Facebook Page post and updates its publication receipt; website content is retained.',
  set_workspace_context: 'Overwrites the authenticated user selected workspace organization or location.',
  update_article_category: 'Overwrites the selected category\'s name, description or parent category.',
  update_blog_post: 'Overwrites supplied fields of an existing tenant blog article.',
  update_collection: 'Overwrites the selected collection name, description or placement.',
  update_location: 'Overwrites supplied location address, contact details, hours, timezone, capacity metadata or SEO fields.',
  block_dates: 'Overwrites the selected location\'s special hours with an added closure for the given days, so guests cannot book them on the public website.',
  open_dates: 'Overwrites the selected location\'s special hours with the given days reopened, so guests can book them on the public website again.',
  update_media_asset: 'Overwrites media metadata such as alt text or category.',
  update_post: 'Overwrites supplied fields of an existing short post on the website.',
  update_product: 'Overwrites product fields, including public content, availability and price.',
  update_reservation_policy: 'Creates or overwrites the reservation policy of the selected location, which is what opens reservations there.',
  update_organization_settings: 'Overwrites supplied site branding, contact email, default currency, announcement, public status or SEO fields.',
  update_site_page: 'Overwrites tenant page metadata or supplied structured content, subject to version and removal checks.',
  save_media_attachment: 'Stores a conversation file in Cloudflare media storage and returns a public URL, even before assignment to a page.',

}

const openWorldEffects = {
  create_product_booking: 'Sends owner alerts and, when requested, an acknowledgement email to the supplied guest address.',
  confirm_product_booking: 'Sends a confirmation email to the booking guest.',
  reject_product_booking: 'Sends a decision email to the booking guest.',
  cancel_product_booking: 'Sends a cancellation email to the booking guest.',
  request_product_booking_change: 'Emails a change proposal to the booking guest for acceptance.',
  cancel_table_reservation: 'Sends a cancellation email to the reservation guest.',
  request_table_reservation_change: 'Emails a change proposal to the reservation guest for acceptance.',
  publish_post: 'Can send the requested caption and media to the public audience of an explicitly selected Facebook Page or Instagram account. Website-only publication remains within the selected site.',
  delete_channel_post: 'Removes a public Facebook Page post through Meta and updates its local publication receipt.',
  save_media_attachment: 'Downloads the host-supplied file URL and stores the attachment at a public Cloudflare media URL.',
  list_channel_posts: 'Reads posts from Meta for the explicitly selected connected Facebook Page or Instagram account only.',
  get_channel_post: 'Reads one post from Meta belonging to the explicitly selected connected Facebook Page or Instagram account.',
  reconcile_post_publication: 'Reads Meta for an existing publication and updates its receipt in the selected workspace; it does not publish.',
  delete_media_asset: 'Deletes the stored file from the Cloudflare media account when no other asset references it.',
  get_social_connections: 'Asks Meta whether each saved Facebook Page and Instagram connection still has access; it reads only the connected accounts.',
}

function justifications(tool) {
  const effect = effects[tool.name]
  if (!effect) throw new Error(`Tool requires an implementation review: ${tool.name}`)
  const annotations = tool.annotations
  if (annotations.openWorldHint && !openWorldEffects[tool.name]) {
    throw new Error(`Open-world tool requires an explicit boundary review: ${tool.name}`)
  }
  return {
    read_only_justification: effect,
    open_world_justification: annotations.openWorldHint
      ? openWorldEffects[tool.name]
      : `${effect} Its scope is the authenticated KrabiClaw workspace, not arbitrary external entities or the public web.`,
    destructive_justification: annotations.destructiveHint
      ? `${effect} Existing state is deleted, replaced or overwritten rather than only appended.`
      : `${effect} Existing content is not deleted or overwritten.`,
  }
}

const publicTools = MCP_PUBLIC_TOOLS
const tools = Object.fromEntries(publicTools.map(tool => [tool.name, {
  annotations: {
    readOnlyHint: tool.annotations.readOnlyHint,
    openWorldHint: tool.annotations.openWorldHint,
    destructiveHint: tool.annotations.destructiveHint,
  },
  justifications: justifications(tool),
}]))

const submission = {
  $schema: SCHEMA_URL,
  schema_version: 1,
  app_info: {
    display_name: 'KrabiClaw',
    subtitle: 'Manage your business website',
    description: 'Manage your KrabiClaw business website from ChatGPT. Choose a site and location, edit products, variants and prices, publish announcements and blog articles, update page content and translations, and upload or assign media. Review contact and table reservation inquiries, create and manage Product bookings and consultations, and propose guest-approved changes from your connected workspace. Booking writes reserve real capacity and may email guests; required online payment returns a payment-required result before unpaid allocation. Publishing and content changes can appear on your public website. A KrabiClaw account with access to the selected business is required. Site and location setup and deletion are managed in the KrabiClaw CMS.',
    category: 'BUSINESS',
  },
  tools,
  test_cases: [
    {
      description: 'Add a menu item at the explicitly selected demo location.',
      user_prompt: 'Use Ember & Slice, West Village. In Drinks, add Submission Iced Coffee at 90 THB, tax-inclusive, with description “Coffee served over ice.” If that exact item already exists, update it to these values instead of creating a duplicate. Preserve existing collection members.',
      file_attachment_urls: null,
      tools_triggered: 'list_organizations, list_locations, list_collections, list_location_products, create_product, update_product, set_product_publication, set_product_location, set_collection_products',
      expected_output: 'Creates or updates the explicitly identified demo Product with a single variant priced at unit_amount 9000 THB, publishes it to the selected site, records West Village as offering it, and adds it to the Drinks collection.',
      expected_output_url: null,
    },
    {
      description: 'Update an existing menu item without changing other items.',
      user_prompt: 'After completing the preceding product-creation scenario, at Ember & Slice, West Village, update Submission Iced Coffee to 85 THB, tax-inclusive, and description “Coffee brewed fresh and served over ice.” Keep its name and availability unchanged.',
      file_attachment_urls: null,
      tools_triggered: 'list_location_products, get_product, update_product',
      expected_output: 'Updates the explicitly identified Submission Iced Coffee to a variant price of unit_amount 8500 and the supplied description; other fields and Products remain unchanged.',
      expected_output_url: null,
    },
    {
      description: 'Price a Product in words when the owner asks for it.',
      user_prompt: 'At Ember & Slice, West Village, in Drinks, add Submission Daily Catch and price it as “Market price” — it changes every day, so do not put a number on it. If that exact demo item exists, update it instead of duplicating it. Preserve existing collection members.',
      file_attachment_urls: null,
      tools_triggered: 'list_organizations, list_locations, list_collections, create_product, update_product, set_product_location, set_product_publication, set_collection_products',
      expected_output: 'Creates or updates the explicitly identified demo Product with a variant carrying no price and the named detail pricing_note set to “Market price”, and says the menu will show those words where an amount would be. It does not add a number alongside the note, which the writer rejects.',
      expected_output_url: null,
    },
    {
      description: 'Preview and save a location reservation policy without inventing other terms.',
      user_prompt: 'For Ember & Slice, West Village table reservations, show the current policy and preview a 48-hour free-cancellation window. Show the proposed result before asking me to save it; preserve all other stored terms.',
      file_attachment_urls: null,
      tools_triggered: 'list_organizations, list_locations, get_reservation_policy, update_reservation_policy',
      expected_output: 'Reads the explicit location policy and states the proposed free_cancellation_until_minutes 2880 without saving. Only after the user confirms, saves that field and reads it back; unspecified terms stay unspecified.',
      expected_output_url: null,
    },
    {
      description: 'Publish a website announcement and return its canonical public URL.',
      user_prompt: 'On Ember & Slice, publish a website-only announcement titled Submission Welcome with text “Welcome to our updated website.” Show me the final public link. If that exact announcement exists, update and publish it instead of creating another.',
      file_attachment_urls: null,
      tools_triggered: 'list_organizations, get_organization, list_posts, create_post, update_post, publish_post',
      expected_output: 'Creates or updates the requested announcement and publishes it to the site channel after any required confirmation; returns the public URL supplied by the tool and does not claim Facebook or Instagram publication.',
      expected_output_url: null,
    }
],
  negative_test_cases: [
    {
      description: 'Site provisioning belongs in the CMS.',
      user_prompt: 'Create a new business website for me.',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'Explain that site creation must be completed in the KrabiClaw CMS; do not attempt to provision a site through MCP.',
      expected_output_url: null,
    },
    {
      description: 'Location creation and copying belong in the CMS.',
      user_prompt: 'Duplicate my location into a new branch, including all its products.',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'Direct the user to location setup in the CMS; do not invoke a content tool to create or duplicate a location.',
      expected_output_url: null,
    },
    {
      description: 'Maps import and domain management belong in the CMS.',
      user_prompt: 'Import my business from Google Maps and configure its custom domain DNS.',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'Direct the user to Maps import and domain management in the CMS; do not invoke unrelated content tools to approximate these operations.',
      expected_output_url: null,
    },
  ],
}

const mode = process.argv[2] ?? '--write'
if (mode !== '--write' && mode !== '--check') {
  throw new Error('Usage: generate-chatgpt-app-submission.mjs [--write|--check]')
}

const response = await fetch(SCHEMA_URL)
if (!response.ok) {
  throw new Error(`Unable to fetch ChatGPT submission schema: ${response.status} ${response.statusText}`)
}

const schema = await response.json()
const validate = new Ajv2020({ allErrors: true }).compile(schema)
if (!validate(submission)) {
  throw new Error(`ChatGPT submission is invalid: ${JSON.stringify(validate.errors)}`)
}

const serialized = `${JSON.stringify(submission, null, 2)}\n`
if (mode === '--check') {
  const committed = await readFile(OUTPUT_PATH, 'utf8')
  if (committed !== serialized) {
    throw new Error(`ChatGPT submission is stale. Run yarn chatgpt:submission:write and commit ${OUTPUT_PATH}.`)
  }
} else {
  await writeFile(OUTPUT_PATH, serialized)
}
