-- Migration: adiciona coluna asaas_customer_id em workspaces

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT UNIQUE;

COMMENT ON COLUMN workspaces.asaas_customer_id IS 'ID do cliente no Asaas (cus_xxx)';

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_asaas_customer_id
  ON workspaces(asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;
