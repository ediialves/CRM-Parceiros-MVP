-- 03_apply.sql
-- Desfaz uma importacao com dados errados e devolve a importacao anterior ao
-- papel de "ultima".
--
-- RODAR SOMENTE depois de conferir o 01_diagnostico.sql e o 02_preview.sql.
-- >>> Ajuste a data '2026-09-02' em TODAS as ocorrencias (sao 5). <<<
--
-- O que este script faz, na ordem:
--   1. Backups das duas tabelas afetadas (falha de proposito se ja existirem,
--      para forcar intencao consciente numa segunda rodada).
--   2. Restaura em partners as 12 colunas que os snapshots guardam, usando o
--      snapshot mais recente ANTERIOR a importacao ruim.
--   3. Apaga os snapshots da importacao ruim.
--   4. Apaga a linha correspondente em import_logs.
--   5. Post-checks para revisar ANTES do COMMIT.
--
-- ATENCAO AO FUSO: `imported_at::date` e avaliado no timezone da sessao (UTC no
-- Supabase). Uma importacao feita no fim da noite no Brasil cai no dia SEGUINTE em
-- UTC. Confira no passo 1 do 01_diagnostico.sql se `primeiro_lote`/`ultimo_lote`
-- batem com a hora que voce lembra; se nao baterem, troque o filtro
-- `imported_at::date = date '...'` por um intervalo explicito, ex.:
--   imported_at >= timestamptz '2026-09-02 00:00-03'
--   AND imported_at < timestamptz '2026-09-03 00:00-03'
--
-- LIMITACAO IMPORTANTE: partner_snapshots nao guarda todas as colunas que o
-- UPSERT de partners sobrescreve. NAO da para restaurar destas 9 pelo banco:
--   nome, gerente, nivel, perfil_parceiro, perfil_servico, fila,
--   faixa_engajamento, exportacoes_90d, usa_capro
-- Se o arquivo errado tambem trouxe essas colunas erradas (atencao especial para
-- `fila`, que define Retencao x Expansao em todo o sistema), o unico conserto
-- completo e reimportar o arquivo CORRETO depois deste rollback.

-- ===========================================================================
-- 1) BACKUPS
-- ===========================================================================
CREATE TABLE partner_snapshots_bkp_rollback_20260902 AS
SELECT * FROM partner_snapshots WHERE imported_at::date = date '2026-09-02';

-- Backup do estado ATUAL (contaminado) de partners, so dos parceiros tocados.
-- Serve para poder voltar atras se o restauro sair errado.
CREATE TABLE partners_bkp_rollback_20260902 AS
SELECT p.* FROM partners p
WHERE p.id IN (
  SELECT partner_id FROM partner_snapshots
  WHERE imported_at::date = date '2026-09-02'
);

CREATE TABLE import_logs_bkp_rollback_20260902 AS
SELECT * FROM import_logs WHERE created_at::date = date '2026-09-02';

BEGIN;

-- ===========================================================================
-- 2) RESTAURA partners a partir do snapshot mais recente anterior
-- ===========================================================================
WITH restauro AS (
  SELECT DISTINCT ON (s.partner_id)
    s.partner_id, s.imported_at, s.licencas, s.licencas_engajadas, s.estoque,
    s.percentual_engajamento, s.penetracao, s.cnpjs, s.cnpjs_livres,
    s.contas_potencial, s.ratio, s.plano, s.atribuidas, s.percentual_atribuidas
  FROM partner_snapshots s
  WHERE s.imported_at::date < date '2026-09-02'
    AND s.partner_id IN (
      SELECT partner_id FROM partner_snapshots
      WHERE imported_at::date = date '2026-09-02'
    )
  ORDER BY s.partner_id, s.imported_at DESC
)
UPDATE partners p SET
  licencas              = r.licencas,
  licencas_engajadas    = r.licencas_engajadas,
  estoque               = r.estoque,
  percentual_engajamento= r.percentual_engajamento,
  penetracao            = r.penetracao,
  cnpjs                 = r.cnpjs,
  cnpjs_livres          = r.cnpjs_livres,
  contas_potencial      = r.contas_potencial,
  ratio                 = r.ratio,
  segmento              = r.plano,   -- partner_snapshots.plano == partners.segmento
  atribuidas            = r.atribuidas,
  percentual_atribuidas = r.percentual_atribuidas,
  -- volta o marcador de "ultima importacao" para a importacao que passa a valer
  last_imported_at      = r.imported_at
FROM restauro r
WHERE p.id = r.partner_id;

-- ===========================================================================
-- 3) APAGA os snapshots da importacao ruim
-- ===========================================================================
DELETE FROM partner_snapshots WHERE imported_at::date = date '2026-09-02';

-- ===========================================================================
-- 4) APAGA a linha de import_logs
--    Confirme no passo 2 do 01_diagnostico.sql o nome da coluna de data. Se nao
--    for `created_at`, ajuste abaixo. Se houve mais de um log nesse dia, use o
--    `id` exato em vez do filtro por data.
-- ===========================================================================
DELETE FROM import_logs WHERE created_at::date = date '2026-09-02';

-- ===========================================================================
-- 5) POST-CHECKS -- revise ANTES de commitar
-- ===========================================================================

-- 5a) Nao pode sobrar nenhum snapshot no dia removido, e a nova ultima
--     importacao deve ser a anterior.
SELECT imported_at::date AS dia, count(*) AS linhas, sum(licencas) AS soma_licencas
FROM partner_snapshots
GROUP BY 1 ORDER BY 1 DESC LIMIT 5;

-- 5b) partners tem que bater com o snapshot que passou a ser o ultimo.
WITH ultimo AS (
  SELECT DISTINCT ON (partner_id) partner_id, licencas, licencas_engajadas, percentual_engajamento
  FROM partner_snapshots
  ORDER BY partner_id, imported_at DESC
)
SELECT
  count(*) AS parceiros_comparados,
  count(*) FILTER (WHERE p.licencas IS DISTINCT FROM u.licencas)                         AS divergem_licencas,
  count(*) FILTER (WHERE p.licencas_engajadas IS DISTINCT FROM u.licencas_engajadas)     AS divergem_engajadas,
  count(*) FILTER (WHERE p.percentual_engajamento IS DISTINCT FROM u.percentual_engajamento) AS divergem_pct
FROM partners p JOIN ultimo u ON u.partner_id = p.id;

-- 5c) import_logs mais recentes.
SELECT * FROM import_logs ORDER BY created_at DESC LIMIT 5;

-- Revise os numeros acima.
--   Se estiver certo:  COMMIT;
--   Se estiver errado: ROLLBACK;
-- COMMIT;
-- ROLLBACK;
