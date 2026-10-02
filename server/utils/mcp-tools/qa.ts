import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, qaItemObject, organizationTool } from './shared'

const qaScope = {
  location_id: { type: ['string', 'null'], description: 'Location scope; omit for site or page Q&A. Cannot be combined with page_path.' },
  page_path: { type: ['string', 'null'], description: 'Page scope such as /about; omit for general site Q&A.' },
} as const
const qaFields = {
  question: { type: 'string', description: 'Required non-empty question; at most 500 characters after trimming.' },
  answer: { type: ['string', 'null'] }, question_author: { type: ['string', 'null'] },
  is_owner_answer: { type: 'boolean' }, sort_order: { type: 'integer' }, status: { type: 'string', enum: ['published', 'hidden'] },
} as const

export const QA_TOOLS: McpToolDefinition[] = [
  organizationTool({ name: 'create_qa', description: 'Create authored Q&A in the explicit site, page or location scope. Omitted sort_order appends. This creates a new record on every call and is not idempotent: do not automatically retry an uncertain response. Imported Google content remains managed in Google.', domain: 'qa', minimumRole: 'admin', confirmRequired: false, inputSchema: { ...qaScope, ...qaFields }, required: ['question'], outputSchema: { type: 'object', properties: { id: { type: 'string' }, created: { type: 'boolean' } }, required: ['id', 'created'] } }),
  organizationTool({ name: 'update_qa', description: 'Update authored Q&A in its explicit scope. Omitted fields retain their values. Imported Google records and translations cannot be edited through this tool.', domain: 'qa', minimumRole: 'admin', confirmRequired: false, inputSchema: { ...qaScope, ...qaFields, qa_id: { type: 'string' } }, required: ['qa_id'], outputSchema: { type: 'object', properties: { qa_id: { type: 'string' }, updated: { type: 'boolean' } }, required: ['qa_id', 'updated'] } }),
  organizationTool({ name: 'delete_qa', description: 'Delete authored Q&A and its content document tree in its explicit scope. Imported Google records are protected.', domain: 'qa', minimumRole: 'admin', confirmRequired: true, inputSchema: { ...qaScope, qa_id: { type: 'string' } }, required: ['qa_id'], outputSchema: { type: 'object', properties: { qa_id: { type: 'string' }, deleted: { type: 'boolean' } }, required: ['qa_id', 'deleted'] } }),
  organizationTool({ name: 'reorder_qa', description: 'Set sort positions of authored Q&A records in one explicit scope. Every id must be distinct, manual and in scope; otherwise no record is reordered. Imported Google records are protected.', domain: 'qa', minimumRole: 'admin', confirmRequired: false, inputSchema: { ...qaScope, updates: { type: 'array', minItems: 1, items: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, sort_order: { type: 'integer' } }, required: ['id', 'sort_order'], additionalProperties: false } } }, required: ['updates'], outputSchema: { type: 'object', properties: { updated: { type: 'integer' } }, required: ['updated'] } }),
  organizationTool({
    name: 'list_organization_qa',
    description: 'Read general tenant Q&A, or only the specified page Q&A when page_path is provided. This tool lists authored and imported Q&A. Authored Q&A can be managed through the CMS and authored Q&A tools; imported Google question and answer content is managed in Google.',
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
      description: 'Read Q&A for an explicit location. This tool lists authored and imported Q&A. Authored Q&A can be managed through the CMS and authored Q&A tools; imported Google question and answer content is managed in Google.',
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
