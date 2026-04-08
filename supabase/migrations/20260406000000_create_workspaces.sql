-- Migration: create workspaces table
-- Run this in the Supabase SQL Editor or via Supabase CLI: supabase db push

CREATE TABLE IF NOT EXISTS workspaces (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  TEXT        NOT NULL,
  segmento              TEXT        NOT NULL,
  contexto_marca        TEXT        NOT NULL,
  logo_url              TEXT,
  limite_mensagens_mes  INTEGER     NOT NULL DEFAULT 30,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: enabled but backend uses service role (bypasses RLS).
-- Policies below are for future direct client access if needed.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Service role has full access (implicit); no anon/user policies needed for now.
