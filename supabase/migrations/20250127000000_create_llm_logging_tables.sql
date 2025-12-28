-- Migration: Create LLM logging tables
-- Purpose: Generic logging infrastructure for all AI features
-- Created: 2025-01-27

-- Table: llm_sessions
-- Represents one full run of an AI feature (e.g., JUST_DROP_IT)
CREATE TABLE IF NOT EXISTS llm_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL, -- e.g., 'JUST_DROP_IT', 'GENERATE', etc.
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error', 'partial')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  input_summary TEXT, -- Minimized, redacted (max 500 chars)
  evidence_summary TEXT, -- Minimized, redacted (max 1KB)
  blueprint_summary TEXT, -- Minimized, redacted (max 1KB)
  total_tokens_prompt INTEGER NOT NULL DEFAULT 0,
  total_tokens_completion INTEGER NOT NULL DEFAULT 0,
  total_cost_estimate NUMERIC(10, 6), -- USD, up to 9999.999999
  error_message TEXT -- Redacted error message
);

-- Table: llm_calls
-- Represents one LLM API call within a session
CREATE TABLE IF NOT EXISTS llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES llm_sessions(id) ON DELETE CASCADE,
  step TEXT NOT NULL, -- e.g., 'classification', 'blueprint_generation'
  model TEXT NOT NULL, -- e.g., 'gpt-4o-mini'
  prompt_preview TEXT NOT NULL, -- Truncated, redacted (max 2KB)
  prompt_full TEXT, -- Optional, truncated (max 10KB)
  response_preview TEXT, -- Truncated, redacted (max 2KB)
  tokens_prompt INTEGER NOT NULL DEFAULT 0,
  tokens_completion INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: pipeline_events
-- High-level pipeline breadcrumbs
CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES llm_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g., 'INGEST_RECEIVED', 'EVIDENCE_EXTRACTED'
  payload_preview TEXT, -- Minimized, redacted (max 2KB)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_llm_sessions_org_id ON llm_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_llm_sessions_user_id ON llm_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_sessions_status ON llm_sessions(status);
CREATE INDEX IF NOT EXISTS idx_llm_sessions_started_at ON llm_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_calls_session_id ON llm_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at ON llm_calls(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_session_id ON pipeline_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_created_at ON pipeline_events(created_at DESC);

-- Row Level Security (RLS) Policies
ALTER TABLE llm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see sessions from their organization
CREATE POLICY "Users can view sessions from their org"
  ON llm_sessions FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create sessions for their org
CREATE POLICY "Users can create sessions for their org"
  ON llm_sessions FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- Policy: Users can update sessions from their org
CREATE POLICY "Users can update sessions from their org"
  ON llm_sessions FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can view calls for sessions from their org
CREATE POLICY "Users can view calls for their org sessions"
  ON llm_calls FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM llm_sessions
      WHERE org_id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: System can insert calls (server-side only, via service role)
-- Note: In production, you may want to use service role key for inserts
-- For now, we'll allow inserts if the session belongs to user's org
CREATE POLICY "Users can create calls for their org sessions"
  ON llm_calls FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM llm_sessions
      WHERE org_id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can view events for sessions from their org
CREATE POLICY "Users can view events for their org sessions"
  ON pipeline_events FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM llm_sessions
      WHERE org_id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can create events for their org sessions
CREATE POLICY "Users can create events for their org sessions"
  ON pipeline_events FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM llm_sessions
      WHERE org_id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

