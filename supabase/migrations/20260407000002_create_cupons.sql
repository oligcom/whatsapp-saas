-- Migration: tabela de cupons de acesso

CREATE TABLE IF NOT EXISTS cupons (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT        NOT NULL UNIQUE,
  dias_acesso  INTEGER     NOT NULL CHECK (dias_acesso > 0),
  creditos     INTEGER     NOT NULL CHECK (creditos >= 0),
  usado        BOOLEAN     NOT NULL DEFAULT false,
  workspace_id UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  usado_em     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cupons_codigo      ON cupons(codigo);
CREATE INDEX IF NOT EXISTS idx_cupons_usado       ON cupons(usado);
CREATE INDEX IF NOT EXISTS idx_cupons_workspace_id ON cupons(workspace_id);

ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;
