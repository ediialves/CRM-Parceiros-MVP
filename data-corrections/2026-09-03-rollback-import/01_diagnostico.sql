-- 01_diagnostico.sql
-- Rollback de uma importacao com dados errados.
-- ESTE SCRIPT NAO ESCREVE NADA. Serve para identificar exatamente qual importacao
-- remover e conferir se o cenario e o esperado antes de qualquer DELETE.

-- ---------------------------------------------------------------------------
-- 1) Quais importacoes existem em partner_snapshots?
--    Uma unica importacao grava em varios lotes com timestamps ligeiramente
--    diferentes (.042, .043...), por isso agrupamos por dia. Se aparecer mais de
--    uma importacao no MESMO dia, o intervalo min/max e a contagem de timestamps
--    distintos vao mostrar isso -- e nesse caso NAO use o filtro por data.
-- ---------------------------------------------------------------------------
SELECT
  imported_at::date                        AS dia,
  count(*)                                 AS linhas,
  count(DISTINCT partner_id)               AS parceiros,
  count(DISTINCT imported_at)              AS timestamps_distintos,
  min(imported_at)                         AS primeiro_lote,
  max(imported_at)                         AS ultimo_lote,
  max(imported_at) - min(imported_at)      AS duracao,
  sum(licencas)                            AS soma_licencas,
  sum(licencas_engajadas)                  AS soma_engajadas,
  bool_or(import_completo)                 AS tem_completo
FROM partner_snapshots
GROUP BY 1
ORDER BY 1 DESC
LIMIT 15;

-- ---------------------------------------------------------------------------
-- 2) Schema real de import_logs (nunca foi confirmado -- ver secao 4 do CLAUDE.md).
--    Precisamos saber o nome da coluna de data antes de filtrar por ela.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'import_logs'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 3) Os ultimos registros de import_logs (ajuste o ORDER BY para a coluna de data
--    que apareceu no passo 2, se nao for created_at).
-- ---------------------------------------------------------------------------
SELECT *
FROM import_logs
ORDER BY created_at DESC
LIMIT 15;

-- ---------------------------------------------------------------------------
-- 4) A importacao ruim criou parceiros que nao existiam antes?
--    O UPSERT usa onConflict: accountancy_id, entao accountancy_id novo INSERE
--    linha nova em partners. Esses parceiros nao tem snapshot anterior e por isso
--    NAO tem de onde ser restaurados.
--    >>> Troque a data nas duas ocorrencias de :dia_ruim <<<
-- ---------------------------------------------------------------------------
WITH dia_ruim AS (SELECT date '2026-09-02' AS d)
SELECT
  p.id, p.accountancy_id, p.nome, p.gerente, p.last_imported_at,
  (SELECT count(*) FROM plans pl WHERE pl.partner_id = p.id)              AS planos,
  (SELECT count(*) FROM campaign_partners cp WHERE cp.partner_id = p.id)  AS vinculos_campanha
FROM partners p
WHERE EXISTS (
        SELECT 1 FROM partner_snapshots s, dia_ruim
        WHERE s.partner_id = p.id AND s.imported_at::date = dia_ruim.d
      )
  AND NOT EXISTS (
        SELECT 1 FROM partner_snapshots s, dia_ruim
        WHERE s.partner_id = p.id AND s.imported_at::date < dia_ruim.d
      )
ORDER BY p.accountancy_id;
