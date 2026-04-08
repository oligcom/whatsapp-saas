-- Migration: add company/contact fields to workspaces table
-- Run: supabase db push

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS cnpj          TEXT,
  ADD COLUMN IF NOT EXISTS email_contato TEXT,
  ADD COLUMN IF NOT EXISTS telefone      TEXT,
  ADD COLUMN IF NOT EXISTS responsavel   TEXT,
  ADD COLUMN IF NOT EXISTS cidade        TEXT,
  ADD COLUMN IF NOT EXISTS estado        TEXT;

COMMENT ON COLUMN workspaces.cnpj          IS 'CNPJ formatado (XX.XXX.XXX/XXXX-XX)';
COMMENT ON COLUMN workspaces.email_contato IS 'E-mail de contato da empresa';
COMMENT ON COLUMN workspaces.telefone      IS 'Telefone de contato da empresa';
COMMENT ON COLUMN workspaces.responsavel   IS 'Nome do responsável/dono da loja';
COMMENT ON COLUMN workspaces.cidade        IS 'Cidade da loja';
COMMENT ON COLUMN workspaces.estado        IS 'UF do estado (sigla 2 letras)';
