-- Migration number: 0004 	 2026-05-29T03:55:19.667Z
-- Add component field to site_content for dynamic component rendering

-- Add component field to site_content table
ALTER TABLE site_content ADD COLUMN component TEXT;

-- Add component field to site_content_drafts table
ALTER TABLE site_content_drafts ADD COLUMN component TEXT;

-- Add component field to site_content_translations table
ALTER TABLE site_content_translations ADD COLUMN component TEXT;

-- Create index on component for faster lookups
CREATE INDEX IF NOT EXISTS idx_site_content_component ON site_content(component);
