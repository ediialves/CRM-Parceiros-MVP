-- 02_preview.sql
-- Mostra EXATAMENTE o que o 03_apply.sql vai fazer, sem escrever nada.
-- Rodar depois de confirmar no 01_diagnostico.sql qual e a data da importacao ruim.
--
-- >>> Ajuste a data em UM lugar: o CTE `alvo` abaixo. <<<

-- ---------------------------------------------------------------------------
-- Contexto: o que uma importacao escreve (src/pages/Importacao.tsx)
--   1. partners            -> UPSERT, sobrescreve ~20 colunas (e INSERE se o
--                             accountancy_id for novo)
--   2. partner_snapshots   -> INSERT de uma linha por parceiro
--   3. import_logs         -> INSERT de uma linha
-- Apagar snapshot NAO desfaz o passo 1. E o passo 1 e o que os dashboards leem
-- para os numeros operacionais. Por isso o rollback tem que restaurar partners.
-- ---------------------------------------------------------------------------

WITH alvo AS (
  SELECT date '2026-09-02' AS dia_ruim        -- <<< AJUSTE AQUI
),
-- Para cada parceiro tocado pela importacao ruim, qual e o snapshot mais recente
-- ANTERIOR a ela. Usamos "o mais recente antes", nao "a importacao imediatamente
-- anterior", porque um parceiro pode nao estar no arquivo anterior.
restauro AS (
  SELECT DISTINCT ON (s.partner_id)
    s.partner_id, s.imported_at, s.licencas, s.licencas_engajadas, s.estoque,
    s.percentual_engajamento, s.penetracao, s.cnpjs, s.cnpjs_livres,
    s.contas_potencial, s.ratio, s.plano, s.atribuidas, s.percentual_atribuidas
  FROM partner_snapshots s, alvo a
  WHERE s.imported_at::date < a.dia_ruim
    AND s.partner_id IN (
      SELECT partner_id FROM partner_snapshots s2, alvo a2
      WHERE s2.imported_at::date = a2.dia_ruim
    )
  ORDER BY s.partner_id, s.imported_at DESC
)

-- 1) Resumo do que sai e do que volta
SELECT
  (SELECT count(*) FROM partner_snapshots s, alvo a
     WHERE s.imported_at::date = a.dia_ruim)                        AS snapshots_a_deletar,
  (SELECT count(DISTINCT partner_id) FROM partner_snapshots s, alvo a
     WHERE s.imported_at::date = a.dia_ruim)                        AS parceiros_afetados,
  (SELECT count(*) FROM restauro)                                   AS parceiros_com_restauro,
  (SELECT count(DISTINCT partner_id) FROM partner_snapshots s, alvo a
     WHERE s.imported_at::date = a.dia_ruim)
    - (SELECT count(*) FROM restauro)                               AS parceiros_SEM_restauro,
  (SELECT max(imported_at)::date FROM partner_snapshots s, alvo a
     WHERE s.imported_at::date < a.dia_ruim)                        AS nova_ultima_importacao;

-- 2) Somas: antes (estado atual, contaminado) x depois (restaurado)
WITH alvo AS (SELECT date '2026-09-02' AS dia_ruim),               -- <<< AJUSTE AQUI
restauro AS (
  SELECT DISTINCT ON (s.partner_id)
    s.partner_id, s.licencas, s.licencas_engajadas, s.percentual_engajamento
  FROM partner_snapshots s, alvo a
  WHERE s.imported_at::date < a.dia_ruim
    AND s.partner_id IN (SELECT partner_id FROM partner_snapshots s2, alvo a2
                         WHERE s2.imported_at::date = a2.dia_ruim)
  ORDER BY s.partner_id, s.imported_at DESC
)
SELECT
  'partners AGORA (com o import ruim)' AS estado,
  sum(p.licencas) AS soma_licencas, sum(p.licencas_engajadas) AS soma_engajadas,
  round(avg(p.percentual_engajamento), 2) AS media_engajamento
FROM partners p WHERE p.id IN (SELECT partner_id FROM restauro)
UNION ALL
SELECT
  'partners DEPOIS (restaurado)',
  sum(r.licencas), sum(r.licencas_engajadas), round(avg(r.percentual_engajamento), 2)
FROM restauro r;

-- 3) Amostra parceiro a parceiro: o que muda de fato (confira 20 linhas na mao)
WITH alvo AS (SELECT date '2026-09-02' AS dia_ruim),               -- <<< AJUSTE AQUI
restauro AS (
  SELECT DISTINCT ON (s.partner_id)
    s.partner_id, s.imported_at, s.licencas, s.licencas_engajadas, s.percentual_engajamento
  FROM partner_snapshots s, alvo a
  WHERE s.imported_at::date < a.dia_ruim
    AND s.partner_id IN (SELECT partner_id FROM partner_snapshots s2, alvo a2
                         WHERE s2.imported_at::date = a2.dia_ruim)
  ORDER BY s.partner_id, s.imported_at DESC
)
SELECT
  p.accountancy_id, p.nome,
  p.licencas               AS lic_agora,   r.licencas               AS lic_depois,
  p.licencas_engajadas     AS eng_agora,   r.licencas_engajadas     AS eng_depois,
  p.percentual_engajamento AS pct_agora,   r.percentual_engajamento AS pct_depois,
  r.imported_at            AS snapshot_usado
FROM partners p
JOIN restauro r ON r.partner_id = p.id
WHERE p.licencas IS DISTINCT FROM r.licencas
   OR p.licencas_engajadas IS DISTINCT FROM r.licencas_engajadas
   OR p.percentual_engajamento IS DISTINCT FROM r.percentual_engajamento
ORDER BY abs(coalesce(p.licencas, 0) - coalesce(r.licencas, 0)) DESC
LIMIT 20;
