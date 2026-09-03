import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

const servicePointObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    organization_id: { type: 'string' },
    site_id: { type: 'string' },
    location_id: { type: 'string' },
    label: { type: 'string' },
    status: { type: 'string', enum: ['active', 'paused'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    qr_credential: {
      type: ['object', 'null'],
      properties: {
        id: { type: 'string' },
        version: { type: 'number' },
        created_at: { type: 'string' },
      },
      required: ['id', 'version', 'created_at'],
    },
  },
  required: ['id', 'organization_id', 'site_id', 'location_id', 'label', 'status', 'created_at', 'updated_at', 'qr_credential'],
}

const servicePointMutationOutput = {
  type: 'object',
  properties: { service_point: servicePointObject },
  required: ['service_point'],
}

export const SERVICE_POINT_TOOLS: McpToolDefinition[] = [
  siteTool({
    name: 'list_service_points',
    description: 'List user-named ordering destinations for one location, including active, paused, and QR provisioning state.',
    domain: 'service_points',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string', description: 'Location ID.' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { service_points: { type: 'array', items: servicePointObject } },
      required: ['service_points'],
    },
  }),
  siteTool({
    name: 'create_service_point',
    description: 'Create a generic user-named ordering destination at one location. Use the venue team\'s own label without assigning a hard-coded type.',
    domain: 'service_points',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string', description: 'Location ID.' },
      label: { type: 'string', minLength: 1, maxLength: 120 },
    },
    required: ['location_id', 'label'],
    outputSchema: servicePointMutationOutput,
  }),
  siteTool({
    name: 'update_service_point',
    description: 'Rename, pause, or resume one service point. A paused service point rejects its Ordering QR code.',
    domain: 'service_points',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string', description: 'Location ID.' },
      service_point_id: { type: 'string' },
      label: { type: 'string', minLength: 1, maxLength: 120 },
      status: { type: 'string', enum: ['active', 'paused'] },
    },
    required: ['location_id', 'service_point_id'],
    outputSchema: servicePointMutationOutput,
  }),
  siteTool({
    name: 'provision_service_point_qr',
    description: 'Provision the first Ordering QR credential for a service point. The returned URL contains the credential and is shown once.',
    domain: 'service_points',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string', description: 'Location ID.' },
      service_point_id: { type: 'string' },
    },
    required: ['location_id', 'service_point_id'],
    outputSchema: {
      type: 'object',
      properties: {
        service_point: servicePointObject,
        ordering_url: { type: 'string' },
        version: { type: 'number' },
      },
      required: ['service_point', 'ordering_url', 'version'],
    },
  }),
  siteTool({
    name: 'rotate_service_point_qr',
    description: 'Revoke the current Ordering QR credential and return a replacement URL. The old QR stops working immediately.',
    domain: 'service_points',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      location_id: { type: 'string', description: 'Location ID.' },
      service_point_id: { type: 'string' },
    },
    required: ['location_id', 'service_point_id'],
    outputSchema: {
      type: 'object',
      properties: {
        service_point: servicePointObject,
        ordering_url: { type: 'string' },
        version: { type: 'number' },
      },
      required: ['service_point', 'ordering_url', 'version'],
    },
  }),
  siteTool({
    name: 'revoke_service_point_qr',
    description: 'Revoke the current Ordering QR credential for a service point.',
    domain: 'service_points',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      location_id: { type: 'string', description: 'Location ID.' },
      service_point_id: { type: 'string' },
    },
    required: ['location_id', 'service_point_id'],
    outputSchema: {
      type: 'object',
      properties: { revoked: { type: 'boolean' } },
      required: ['revoked'],
    },
  }),
]
