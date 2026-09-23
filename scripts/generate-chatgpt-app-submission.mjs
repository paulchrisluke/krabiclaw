import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import Ajv2020 from 'ajv/dist/2020.js'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)

const { MCP_PUBLIC_TOOLS } = await import('../server/utils/mcp-tools/index.ts')
const { visibleConversationalMcpTools } = await import('../server/utils/conversational-tool-surface.ts')

const SCHEMA_URL = 'https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json'
const OUTPUT_PATH = 'chatgpt-app-submission.json'

// Reviewed effects are authored here; annotation values still come from the registry.
// A newly exposed tool must receive an explicit review before regeneration succeeds.
const effects = {
  append_content_block: 'Inserts one block into the selected blog article or tenant page after a named block, leaving every other block as it is.',
  attach_media: 'Adds an existing asset to a public content collection without replacing its existing placements.',
  batch_create_products: 'Creates products from the supplied catalog entries and records product events.',
  delete_tenant_page: 'Deletes a tenant page; deleting its source locale removes every translation with it.',
  create_blog_post: 'Creates a tenant blog article and its content document, with publication governed by its supplied status and schedule.',
  create_collection: 'Creates an empty collection for the selected organization; products are added to it separately.',
  create_metafield_definition: 'Defines a typed product attribute for the organization, which is what makes that attribute storable at all.',
  create_post: 'Creates a private website announcement draft, or schedules publication when a future date is supplied.',
  create_product: 'Creates a product with explicit variants, prices and attributes; publication and placements are assigned separately.',
  create_tenant_page: 'Creates a tenant page and its structured content document.',
  delete_blog_post: 'Deletes the selected tenant blog article and its associated content.',
  delete_content_block: 'Deletes one block, and the blocks nested under it, from the selected blog article or tenant page after a version check.',
  delete_collection: 'Deletes the selected collection and every product membership in it; the products themselves are untouched.',
  delete_media_asset: 'Removes an asset and its placements, and deletes backing Cloudflare storage when no other asset references it.',
  delete_metafield_definition: 'Deletes a typed product attribute definition and every product value stored under it.',
  delete_post: 'Deletes the selected website announcement.',
  delete_product: 'Deletes a product, its reviews and placements, and updates the remaining product order.',
  delete_resource_localization: 'Deletes the selected translated resource representation.',
  get_blog_post: 'Reads the selected tenant blog article and content for editing.',
  get_contact_inquiries: 'Reads authorized customer contact inquiries, including personal contact information.',
  get_location: 'Reads the selected location, including operational contact and notification settings.',
  get_post: 'Reads the selected website announcement.',
  get_product: 'Reads the selected product and its price and content.',
  get_product_catalog_localization: 'Reads product catalog translations for the selected organization and locale.',
  get_reservation_inquiries: 'Reads authorized reservation inquiries, including guest contact and reservation information.',
  get_reservation_policy: 'Reads the reservation policy of the selected location.',
  get_resource_localization: 'Reads a resource translation and any existing authoring document.',
  get_organization: 'Reads the selected accessible organization and workspace context.',
  get_organization_analytics: 'Reads website analytics reports from stored aggregates and retained raw events without creating aggregates.',
  get_organization_media_assets: 'Lists the selected organization media library and public asset URLs.',
  get_organization_settings: 'Reads the selected organization settings.',
  get_tenant_page: 'Reads the selected tenant page and its existing content document.',
  get_workspace_context: 'Reads the authenticated user workspace selection and available context.',
  list_blog_posts: 'Lists the selected organization blog articles.',
  list_collections: 'Lists the collections of the selected organization.',
  list_location_products: 'Lists products in the explicitly selected location.',
  list_location_qa: 'Lists questions and answers for the selected location.',
  list_location_reviews: 'Lists reviews for the selected location.',
  list_locations: 'Lists locations accessible in the selected organization.',
  list_metafield_definitions: 'Lists the organization typed product attribute definitions.',
  list_posts: 'Lists website announcements for the selected organization.',
  list_products: 'Lists the products of the selected organization.',
  list_organization_locales: 'Reads the selected organization locale records without provisioning translations.',
  list_organization_qa: 'Lists questions and answers for the selected organization.',
  list_organization_reviews: 'Lists reviews and their provenance for the selected organization.',
  list_organizations: 'Lists organizations accessible to the authenticated user without provisioning one.',
  list_tenant_pages: 'Lists tenant pages for the selected organization.',
  publish_blog_post: 'Changes the selected blog article publication state and public availability.',
  publish_post: 'Publishes the selected announcement to the website; enabled social-channel publication can also enqueue external delivery.',
  put_resource_localization: 'Creates or overwrites translated resource values and supplied translated content.',
  reconcile_products: 'Creates and updates products at one location, and marks omitted products unavailable only when explicitly requested.',
  remove_media: 'Removes an asset placement from public content while retaining the underlying media asset.',
  remove_product_location: 'Removes a product from a location, so the location no longer offers it.',
  reorder_collections: 'Overwrites the order collections are presented in on the selected organization.',
  reorder_media: 'Overwrites media placement ordering for the selected public content collection.',
  replace_content_block: 'Replaces one block\'s data and media in the selected blog article or tenant page after a version check, keeping its position.',
  replace_resource_localizations: 'Replaces the submitted translations for one resource type and locale; omitted resources remain untouched.',
  save_generated_image: 'Stores supplied image bytes as a new media asset with a public URL; it does not generate the image.',
  save_generated_image_file: 'Stores the supplied image attachment as a new media asset with a public URL; it does not generate the image.',
  set_brand_color: 'Overwrites the selected organization public brand color.',
  set_collection_products: 'Overwrites the complete membership and order of the selected collection; products left out lose their place in it.',
  set_default_currency: 'Overwrites the selected organization default currency setting.',
  set_media: 'Replaces or clears the asset assigned to a single public media placement.',
  set_product_location: 'Creates or overwrites the selected product’s location availability and publication settings.',
  set_product_publication: 'Creates or overwrites the selected product’s publication setting, including removing it from public display.',
  set_workspace_context: 'Overwrites the authenticated user selected workspace organization or location.',
  update_blog_post: 'Overwrites supplied fields of an existing tenant blog article.',
  update_collection: 'Overwrites the selected collection name, description or placement.',
  update_location: 'Overwrites location hours, contact details, capacity or notification settings supplied by the user.',
  update_media_asset: 'Overwrites media metadata such as alt text or category.',
  update_post: 'Overwrites fields of an existing website announcement.',
  update_product: 'Overwrites product fields, including public content, availability and price.',
  update_reservation_policy: 'Creates or overwrites the reservation policy of the selected location, which is what opens reservations there.',
  update_organization_settings: 'Overwrites supplied organization settings, including branding, currency, tracking, verification and indexing controls.',
  update_tenant_page: 'Overwrites tenant page metadata or supplied structured content, subject to version and removal checks.',
  upload_user_media: 'Stores a user attachment in Cloudflare media storage and returns a public URL, even before assignment to a page.',

}

const externalProcessing = {
  upload_user_media: 'The attachment is stored in Cloudflare storage at a public media URL.',
  save_generated_image: 'The supplied image bytes are stored in Cloudflare storage at a public media URL.',
  save_generated_image_file: 'The supplied image attachment is stored in Cloudflare storage at a public media URL.',
}

function justifications(tool) {
  const effect = effects[tool.name]
  if (!effect) throw new Error(`Tool requires an implementation review: ${tool.name}`)
  const annotations = tool.annotations
  return {
    read_only_justification: effect,
    open_world_justification: externalProcessing[tool.name] ?? (annotations.openWorldHint
      ? `${effect} Its effects can change content or behavior on the public website.`
      : `${effect} It does not publish content or write to an external service.`),
    destructive_justification: annotations.destructiveHint
      ? `${effect} Existing state is deleted, replaced or overwritten rather than only appended.`
      : `${effect} Existing content is not deleted or overwritten.`,
  }
}

const publicTools = visibleConversationalMcpTools(MCP_PUBLIC_TOOLS)
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
    description: 'Manage your KrabiClaw business website from ChatGPT. Choose a site and location, edit products, variants and prices, publish announcements and blog articles, update page content and translations, and upload or assign media. Review contact and reservation inquiries from your connected workspace. Publishing and content changes can appear on your public website. A KrabiClaw account with access to the selected business is required. Site and location setup and deletion are managed in the KrabiClaw CMS.',
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
      tools_triggered: 'list_organizations, list_locations, list_collections, list_metafield_definitions, create_metafield_definition, create_product, update_product, set_product_location, set_product_publication, set_collection_products',
      expected_output: 'Creates or updates the explicitly identified demo Product with a variant carrying no price and the metafield pricing.note set to “Market price”, defining that attribute first if the tenant has not, and says the menu will show those words where an amount would be. It does not add a number alongside the note, which the writer rejects.',
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
