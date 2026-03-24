-- Migration: Create studio_master_references table
-- Purpose: Store per-org master reference images for AI Studio Photo generation.
--          Each master is keyed by (organization_id, jewelry_type, master_key) and
--          provides the style anchor image sent alongside the product photo to Gemini.
-- Created: 2026-03-24

CREATE TABLE IF NOT EXISTS studio_master_references (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jewelry_type    TEXT        NOT NULL CHECK (jewelry_type IN ('ring','bracelet','chain','pendant','earring')),
  master_key      TEXT        NOT NULL,    -- slug matching setup.masterKey in promptLibrary.ts
  public_url      TEXT        NOT NULL,    -- publicly readable R2 URL (Gemini fetches this directly)
  r2_key          TEXT        NOT NULL,    -- storage key used for deletion
  label           TEXT,                    -- optional human-readable label
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, jewelry_type, master_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_studio_master_refs_org_id
  ON studio_master_references(organization_id);

CREATE INDEX IF NOT EXISTS idx_studio_master_refs_org_type_key
  ON studio_master_references(organization_id, jewelry_type, master_key);

-- Row Level Security
ALTER TABLE studio_master_references ENABLE ROW LEVEL SECURITY;

-- Policy: org members can read their org's masters
CREATE POLICY "Users can view master refs from their org"
  ON studio_master_references FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: org members can create master refs for their org
CREATE POLICY "Users can create master refs for their org"
  ON studio_master_references FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: org members can update master refs for their org
CREATE POLICY "Users can update master refs for their org"
  ON studio_master_references FOR UPDATE
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

-- Policy: org members can delete master refs for their org
CREATE POLICY "Users can delete master refs from their org"
  ON studio_master_references FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_studio_master_references_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER studio_master_references_updated_at
  BEFORE UPDATE ON studio_master_references
  FOR EACH ROW
  EXECUTE FUNCTION update_studio_master_references_updated_at();
