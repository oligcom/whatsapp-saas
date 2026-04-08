-- Migration: create mensagens table
-- Run this in the Supabase SQL Editor or via Supabase CLI: supabase db push

CREATE TABLE IF NOT EXISTS mensagens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usuario_id    UUID        NOT NULL,
  nome_cliente  TEXT        NOT NULL,
  telefone      TEXT,
  mensagem      TEXT        NOT NULL,
  tipo_mensagem TEXT        NOT NULL DEFAULT 'geral',
  tom           TEXT        NOT NULL DEFAULT 'amigavel',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_workspace_id ON mensagens(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_usuario_id   ON mensagens(usuario_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_created_at   ON mensagens(created_at DESC);

-- RLS: enabled; backend uses service role (bypasses RLS automatically).
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;
