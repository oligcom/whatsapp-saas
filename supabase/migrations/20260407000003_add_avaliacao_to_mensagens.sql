-- Migration: adiciona campo de avaliação nas mensagens (1 a 5)
-- 1 = ruim, 5 = ótimo; NULL = não avaliada

ALTER TABLE mensagens
  ADD COLUMN IF NOT EXISTS avaliacao SMALLINT
    CHECK (avaliacao BETWEEN 1 AND 5);

-- Índice para queries de média por workspace
CREATE INDEX IF NOT EXISTS idx_mensagens_avaliacao
  ON mensagens(workspace_id, avaliacao)
  WHERE avaliacao IS NOT NULL;
