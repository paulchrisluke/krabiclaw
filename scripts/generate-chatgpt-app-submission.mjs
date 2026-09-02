import { writeFile } from 'node:fs/promises'
import { register } from 'node:module'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)

const { MCP_PUBLIC_TOOLS } = await import('../server/utils/mcp-tools/index.ts')

function justifications(tool) {
  const annotations = tool.annotations
  const readOnly = annotations.readOnlyHint
    ? 'Retrieves data from the authenticated tenant workspace without modifying state.'
    : tool.name === 'analyze_document'
      ? 'Analyzes an attachment, consumes AI credits, and records usage in the tenant workspace.'
      : 'Creates or changes data in the authenticated tenant workspace.'
  const openWorld = annotations.openWorldHint
    ? tool.name === 'analyze_document'
      ? 'Sends the attached document to the configured AI service for analysis.'
      : tool.name === 'import_from_maps'
        ? 'Reads Google Places and writes imported content that can appear on the tenant website.'
        : 'Can change tenant content that is visible on a public website or an external service.'
    : 'Does not change public internet state or a third-party system.'
  const destructive = annotations.destructiveHint
    ? 'Can delete, replace, reorder, publish, or overwrite existing state that is not restored automatically.'
    : 'Does not delete, replace, revoke, or irreversibly overwrite existing state.'
  return {
    read_only_justification: readOnly,
    open_world_justification: openWorld,
    destructive_justification: destructive,
  }
}

const tools = Object.fromEntries(MCP_PUBLIC_TOOLS.map(tool => [tool.name, {
  annotations: {
    readOnlyHint: tool.annotations.readOnlyHint,
    openWorldHint: tool.annotations.openWorldHint,
    destructiveHint: tool.annotations.destructiveHint,
  },
  justifications: justifications(tool),
}]))

const submission = {
  $schema: 'https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json',
  schema_version: 1,
  app_info: {
    display_name: 'KrabiClaw',
    subtitle: 'Manage your business website',
    description: 'KrabiClaw helps business owners create and manage websites, locations, products, experiences, posts, media, localizations, domains, and customer inquiries through ChatGPT.',
    category: 'BUSINESS',
  },
  tools,
  test_cases: [
    {
      description: 'List the sites and locations available to the signed-in business owner.',
      user_prompt: 'Show me my business sites and the locations for my first site.',
      file_attachment_urls: null,
      tools_triggered: 'list_sites, list_locations',
      expected_output: 'Returns only the authenticated owner\'s sites and the locations for the selected site.',
      expected_output_url: null,
    },
    {
      description: 'Create a Product at an explicitly selected location.',
      user_prompt: 'At my Ao Nang location, add a Sushi product named Chef\'s Choice with no numeric price and display the exact wording “Market Price.”',
      file_attachment_urls: null,
      tools_triggered: 'create_product',
      expected_output: 'Creates the Product at Ao Nang with no fixed Price and preserves “Market Price” as the customer-facing price wording.',
      expected_output_url: null,
    },
    {
      description: 'Synchronize a complete Product list at one explicit location.',
      user_prompt: 'Replace the intended product list for my Krabi Town location with these three products, and mark omitted products unavailable.',
      file_attachment_urls: null,
      tools_triggered: 'sync_products',
      expected_output: 'Updates only the Krabi Town catalog atomically and reports the resulting Products.',
      expected_output_url: null,
    },
    {
      description: 'Create and publish a site post.',
      user_prompt: 'Create a post announcing our holiday hours, show me the draft, then publish it after I confirm.',
      file_attachment_urls: null,
      tools_triggered: 'create_post, publish_post',
      expected_output: 'Creates the draft and publishes it only after the required confirmation.',
      expected_output_url: null,
    },
    {
      description: 'Create an Experience at an explicitly selected location.',
      user_prompt: 'At my Ao Nang location, create a two-hour Thai cooking class Experience priced at 1,500 THB per person, excluding tax.',
      file_attachment_urls: null,
      tools_triggered: 'create_experience',
      expected_output: 'Creates the Experience only at the explicitly selected Ao Nang location with the supplied duration and fixed Price semantics.',
      expected_output_url: null,
    },
  ],
  negative_test_cases: [
    {
      description: 'Do not invoke the app for personal calendar requests.',
      user_prompt: 'What appointments are on my personal calendar tomorrow?',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'The app should not be invoked because it does not manage personal calendars.',
      expected_output_url: null,
    },
    {
      description: 'Do not invoke the app for medical diagnosis.',
      user_prompt: 'Diagnose this rash and tell me which medicine to take.',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'The app should not be invoked because medical diagnosis is outside its business website workflows.',
      expected_output_url: null,
    },
    {
      description: 'Do not invoke the app to execute a financial trade.',
      user_prompt: 'Buy 20 shares of a technology stock for me.',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'The app should not be invoked because it cannot trade securities or manage brokerage accounts.',
      expected_output_url: null,
    },
  ],
}

await writeFile('chatgpt-app-submission.json', `${JSON.stringify(submission, null, 2)}\n`)
