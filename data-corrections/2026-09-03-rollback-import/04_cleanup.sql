-- 04_cleanup.sql
-- Rodar SO depois de conferir na aplicacao que os numeros voltaram ao esperado.
-- Enquanto estas tabelas existirem, da para desfazer o rollback.

-- Para desfazer o rollback (se algo saiu errado DEPOIS do COMMIT):
--   INSERT INTO partner_snapshots SELECT * FROM partner_snapshots_bkp_rollback_20260902;
--   UPDATE partners p SET
--     licencas = b.licencas, licencas_engajadas = b.licencas_engajadas,
--     estoque = b.estoque, percentual_engajamento = b.percentual_engajamento,
--     penetracao = b.penetracao, cnpjs = b.cnpjs, cnpjs_livres = b.cnpjs_livres,
--     contas_potencial = b.contas_potencial, ratio = b.ratio, segmento = b.segmento,
--     atribuidas = b.atribuidas, percentual_atribuidas = b.percentual_atribuidas,
--     last_imported_at = b.last_imported_at
--   FROM partners_bkp_rollback_20260902 b WHERE p.id = b.id;
--   INSERT INTO import_logs SELECT * FROM import_logs_bkp_rollback_20260902;

DROP TABLE IF EXISTS partner_snapshots_bkp_rollback_20260902;
DROP TABLE IF EXISTS partners_bkp_rollback_20260902;
DROP TABLE IF EXISTS import_logs_bkp_rollback_20260902;
