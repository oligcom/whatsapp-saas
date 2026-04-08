-- Migration: adiciona campos de trial/status na tabela workspaces
-- Workspaces existentes recebem status 'active' para não serem bloqueados

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS status          TEXT        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_expira_em TIMESTAMPTZ;

-- Índice para facilitar queries de expiração
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

-- Constraint de valores válidos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'workspaces' AND constraint_name = 'workspaces_status_check'
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_status_check
      CHECK (status IN ('trial', 'active', 'demo', 'suspended'));
  END IF;
END $$;

-- Novos workspaces criados sem trial_expira_em ficam com 7 dias a partir de agora
-- (apenas para workspaces já existentes sem data de expiração definida)
UPDATE workspaces SET trial_expira_em = now() + INTERVAL '7 days' WHERE trial_expira_em IS NULL;

-- Muda o default de limite_mensagens_mes para 30 (padrão do trial)
ALTER TABLE workspaces ALTER COLUMN limite_mensagens_mes SET DEFAULT 30;
