-- Migration: sistema de indicações
-- 1. Adiciona código de indicação único por workspace
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT UNIQUE;

-- Gera códigos para workspaces já existentes
UPDATE workspaces
SET codigo_indicacao = upper(left(replace(gen_random_uuid()::text, '-', ''), 8))
WHERE codigo_indicacao IS NULL;

-- Índice para busca rápida por código
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_codigo_indicacao
  ON workspaces(codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;

-- 2. Tabela de solicitações via indicação
CREATE TABLE IF NOT EXISTS solicitacoes_indicacao (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_indicante_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome_loja               TEXT        NOT NULL,
  cnpj                    TEXT        NOT NULL,
  email                   TEXT        NOT NULL,
  telefone                TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  motivo_rejeicao         TEXT,
  workspace_criado_id     UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_status
  ON solicitacoes_indicacao(status);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_indicante
  ON solicitacoes_indicacao(workspace_indicante_id);

ALTER TABLE solicitacoes_indicacao ENABLE ROW LEVEL SECURITY;
