-- Migration: Create studio_assets table
-- Purpose: Store user-uploaded model and studio photos for AI Studio Photo generation
-- Created: 2025-01-28

-- Table: studio_assets
-- Stores reusable model and studio photos uploaded by users
CREATE TABLE IF NOT EXISTS studio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('model', 'studio')),
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_studio_assets_org_id ON studio_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_studio_assets_org_type ON studio_assets(organization_id, type);
CREATE INDEX IF NOT EXISTS idx_studio_assets_user_id ON studio_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_assets_created_at ON studio_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_assets_type ON studio_assets(type);

-- Row Level Security (RLS) Policies
ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view assets from their organization
CREATE POLICY "Users can view assets from their org"
  ON studio_assets FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create assets for their organization
CREATE POLICY "Users can create assets for their org"
  ON studio_assets FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- Policy: Users can update assets from their organization
CREATE POLICY "Users can update assets from their org"
  ON studio_assets FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete assets from their organization
CREATE POLICY "Users can delete assets from their org"
  ON studio_assets FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_studio_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER studio_assets_updated_at
  BEFORE UPDATE ON studio_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_studio_assets_updated_at();
