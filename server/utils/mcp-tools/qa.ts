import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, qaItemObject, organizationTool } from './shared'

export const QA_TOOLS: McpToolDefinition[] = [
  organizationTool({
    name: 'list_organization_qa',
    description: 'Read general tenant Q&A, or only the specified page Q&A when page_path is provided. This tool lists authored and imported Q&A. Authored Q&A can be managed in the CMS; imported Google question and answer content is managed in Google.',
    domain: 'qa',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { page_path: { type: ['string', 'null'], description: 'Public route path such as /about, /pricing, or /blog. Omit for general site Q&A.' }, ...paginationInputSchema },
    outputSchema: {
      type: 'object',
      properties: { items: { type: 'array', items: qaItemObject }, page_info: pageInfoObject },
      required: ['items', 'page_info'],
    },
  }),
  organizationTool({
      name: 'list_location_qa',
      description: 'Read Q&A for an explicit location. This tool lists authored and imported Q&A. Authored Q&A can be managed in the CMS; imported Google question and answer content is managed in Google.',
      domain: 'qa',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { location_id: { type: 'string' }, ...paginationInputSchema },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: { items: { type: 'array', items: qaItemObject }, page_info: pageInfoObject },
        required: ['items', 'page_info'],
      },
    }),
]
