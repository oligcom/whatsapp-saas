ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_asaas_subscription
ON workspaces(asaas_subscription_id);