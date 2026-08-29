-- 02_apply.sql
-- Aplica a correcao dos snapshots de 2026-08-27.
-- Rodar SOMENTE apos validar as somas e o unmatched no 01_stage_and_preview.sql.

-- Backup (falha de proposito se ja existir -> forca intencao consciente):
CREATE TABLE partner_snapshots_bkp_20260827 AS
SELECT * FROM partner_snapshots WHERE imported_at::date='2026-08-27';

BEGIN;

DELETE FROM partner_snapshots WHERE imported_at::date='2026-08-27';

INSERT INTO partner_snapshots (
  partner_id, accountancy_id, imported_at, licencas, licencas_engajadas, estoque,
  percentual_engajamento, penetracao, cnpjs, cnpjs_livres, contas_potencial, ratio,
  plano, atribuidas, percentual_atribuidas, import_completo
)
SELECT p.id, s.accountancy_id, timestamptz '2026-08-27 12:00:00-03',
  s.licencas, s.licencas_engajadas, s.estoque, s.percentual_engajamento, s.penetracao,
  s.cnpjs, s.cnpjs_livres, s.contas_potencial, s.ratio, s.plano, s.atribuidas,
  s.percentual_atribuidas, true
FROM stg_snapshot_20260827 s
JOIN partners p ON trim(p.accountancy_id::text)=trim(s.accountancy_id);

-- Post-check (revise ANTES de commitar):
SELECT count(*) AS linhas, sum(licencas) AS soma_licencas, sum(licencas_engajadas) AS soma_engajadas
FROM partner_snapshots WHERE imported_at::date='2026-08-27';

-- Revise os numeros acima. Se estiver certo: COMMIT;  senao: ROLLBACK;
-- COMMIT;
-- ROLLBACK;
