-- Fix schema consistency issues between Better Auth and application code
-- This migration ensures table and column names match the actual schema

-- Note: The initial schema already has the correct names:
-- - Table: organization (not organizations)
-- - Table: member (not organization_members) 
-- - Columns: organizationId, userId (not organization_id, user_id)

-- No changes needed - the schema is correct
-- The issue was in the application code referencing wrong table/column names
