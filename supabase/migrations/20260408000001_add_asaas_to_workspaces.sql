-- Migration: adiciona coluna asaas_subscription_id em workspaces
-- Usada para vincular o workspace à assinatura recorrente no Asaas

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT UNIQUE;

COMMENT ON COLUMN workspaces.asaas_subscription_id IS 'ID da assinatura recorrente no Asaas (sub_xxx)';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_asaas_subscription_id
  ON workspaces(asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;
