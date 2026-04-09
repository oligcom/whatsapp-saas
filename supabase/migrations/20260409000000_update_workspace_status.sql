-- Migration: atualiza constraint de status e adiciona colunas de controle financeiro

-- 1. Remove constraint antiga
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_status_check;

-- 2. Nova constraint com valores atualizados (mantém 'active' para compatibilidade)
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_status_check
    CHECK (status IN ('trial', 'demo', 'ativo', 'inadimplente', 'cancelado', 'inativo', 'active'));

-- 3. Coluna para créditos extras concedidos manualmente pelo gestor
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS creditos_extras INTEGER NOT NULL DEFAULT 0;

-- 4. Flag de desconto no próximo pacote (10% por indicação aprovada)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS desconto_proximo_pacote BOOLEAN NOT NULL DEFAULT false;

-- 5. Flag que indica se o gestor liberou cobrança Asaas para contas demo
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS asaas_cobranca_liberada BOOLEAN NOT NULL DEFAULT false;
