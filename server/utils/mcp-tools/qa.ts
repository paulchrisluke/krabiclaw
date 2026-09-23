import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, qaItemObject, siteTool } from './shared'

export const QA_TOOLS: McpToolDefinition[] = [
  siteTool({
    name: 'list_organization_qa',
    description: 'Read general tenant Q&A, or only the specified page Q&A when page_path is provided. Q&A is read-only; manage Google questions and answers in Google.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { page_path: { type: ['string', 'null'], description: 'Public route path such as /about, /pricing, or /blog. Omit for general site Q&A.' }, ...paginationInputSchema },
    outputSchema: {
      type: 'object',
      properties: { items: { type: 'array', items: qaItemObject }, page_info: pageInfoObject },
      required: ['items', 'page_info'],
    },
  }),
  siteTool({
      name: 'list_location_qa',
      description: 'Read Q&A for an explicit location. Q&A is read-only; manage Google questions and answers in Google.',
      domain: 'qa',
      minimumRole: 'editor',
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
