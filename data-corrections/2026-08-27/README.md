# Correção retroativa dos snapshots de 27/08/2026

Pacote **não-destrutivo e revisável** para corrigir os `partner_snapshots` da data
`2026-08-27`. Mesma estrutura e convenções do pacote de `2026-08-21`.

## Fonte dos dados

- Arquivo: `862f3c3a-27_08_2026.xlsx`
- Aba autoritativa escolhida: **`Página7`** (aba visível, dado fresco).
  - `ΣK (licencas) = 57.897`  ← **número que você precisa confirmar que bate com a sua planilha ajustada**
  - `Σ engajadas = 40.574`
  - `IDs únicos (dedup por coluna A) = 4.011`

### Por que `Página7` e não a aba que o app lê?

O parser do app (`src/lib/import/parsePartners.ts`) lê a aba
`"Extração  - Base final diagnóst"`. Nesse arquivo essa aba é a **cópia congelada/stale**
(`ΣK dedup = 57.054`, `Σ engajadas = 40.535`), e está marcada como **hidden**. A `Página7`
(visível) é a única aba fresca com o cabeçalho correto (`A=nk_accountancy_id`,
`K=total_customers`, `AF=engajadas`) e o maior `ΣK` válido (~58k) — por isso é a autoritativa
para esta correção. A aba `brenda` (hidden) tem só 95 linhas. **Obs.:** ao contrário do arquivo
de 21/08, este arquivo **não** possui a aba `base final 2` (só 3 abas no total).

### Análise de duplicados (Página7)

- Linhas válidas (A+B preenchidos), sem dedup: **4.025** | `ΣK = 58.297` | `Σ engajadas = 40.888`.
- Após dedup por coluna A (mantendo a **primeira** ocorrência): **4.011** | `ΣK = 57.897` | `Σ engajadas = 40.574`.
- Delta: **14 linhas** removidas | `ΣK -400` | `Σ engajadas -314`.
- **14** `accountancy_id` duplicados, **todos puros** (K/AF idênticos entre as ocorrências — nenhum conflito).

## Parsing

Reproduz **exatamente** a lógica de `parsePartners.ts` + o objeto de insert de
`Importacao.tsx`:
- Dedup por coluna A (accountancy_id), mantendo a **primeira** ocorrência; ID convertido para string e `trim()` (inteiro puro, sem `.0`).
- Normalização numérica idêntica (`parseNumber`, `parseNullableNumber`, `parseDecimalPercent`;
  regra de percentual: `0 < v <= 15` ⇒ `round(v*100)`; senão `round(v)`; `Math.round` = half-up).
- `max(0, round(...))` nas contagens, `min(100, max(0, ...))` no `percentual_engajamento`,
  `parseNullableNumber` (→ NULL) no `ratio`.
- Colunas do snapshot preenchidas **iguais ao objeto de insert do app**
  (`licencas(K), licencas_engajadas(AF), estoque(AG), percentual_engajamento(AH),
  penetracao(AZ), cnpjs(BA), cnpjs_livres(AU), contas_potencial(BB), ratio(AT),
  plano(=segmento AW), atribuidas(AI), percentual_atribuidas(AY)`).
- `import_completo = true` é adicionado no apply (o app **não** grava essa coluna no insert de
  snapshot, mas ela existe na tabela e marca o snapshot como importação real/completa — ver
  CLAUDE.md). Confirme que a coluna existe antes de rodar o `02`.

## Pré-passo: parceiros ausentes

O `LEFT JOIN` do staging de snapshots com `partners` (passo 01) pode encontrar `accountancy_id`
presentes na planilha que ainda **não existem** em `partners`. Como o INSERT de snapshots do `02`
faz `JOIN partners`, esses seriam **descartados** e o total não fecharia. Por isso o
**`00_insert_missing_partners.sql`** cadastra esses parceiros **antes** de aplicar os snapshots.

- O `00` carrega os **4.011** parceiros da aba `Página7` numa staging `stg_partners_20260827` e
  faz `INSERT ... ON CONFLICT (accountancy_id) DO NOTHING` — ou seja, **só os que faltam são
  inseridos; os parceiros já existentes ficam intactos** (nenhum `UPDATE` de `gerente_id`,
  `licencas`, etc.). O preview do `00` (`faltando`) informa quantos e lista quem são.
- Colunas gravadas: exatamente as do objeto de upsert do app (`src/pages/Importacao.tsx`), com o
  mesmo parsing de `src/lib/import/parsePartners.ts`.
- **`gerente_id` é inserido como `NULL`** para os parceiros novos (fiel ao app: ele só preserva
  `gerente_id` de parceiros já existentes; parceiro novo entra sem gerente). **Esses parceiros
  precisarão de vínculo de gerente depois** (linking manual). Eles **continuam contando** no
  Histórico de Licenças/Engajamento porque o texto `gerente` (coluna C = `owner_name`) **é
  populado** — os dashboards filtram parceiros por esse texto, não pelo `gerente_id`.
- `last_imported_at` usa o valor histórico fixo `'2026-08-27 12:00:00-03'` (não `now()`).

## Ordem de execução

1. **`01_stage_and_preview.sql`** — cria a tabela de staging `stg_snapshot_20260827`, carrega as
   4.011 linhas e roda os SELECTs de preview (**não escreve** em `partner_snapshots`).
   - Confira: `staged` deve mostrar `soma_licencas = 57897`, `soma_engajadas = 40574`,
     `linhas = 4011`. O relatório de `UNMATCHED` lista os `accountancy_id` do staging que **não**
     têm parceiro correspondente em `partners`.
2. **`00_insert_missing_partners.sql`** — cria a staging `stg_partners_20260827`, carrega os 4.011
   parceiros, mostra os previews (`faltando` = quantos não existem em `partners`, e lista quem
   são), abre `BEGIN`, insere os faltantes (`ON CONFLICT DO NOTHING`) e roda o pós-check.
   - **Precisa rodar DEPOIS do `01`**, porque o re-check final do `00`
     (`snapshot_unmatched_agora`) consulta `stg_snapshot_20260827`, criada no `01`.
   - Confira: `partners_depois - partners_antes` = o número de faltantes do preview **e**
     `snapshot_unmatched_agora = 0`.
   - Se estiver certo, rode `COMMIT;` (está comentado no fim, de propósito). Senão, `ROLLBACK;`.
3. **`02_apply.sql`** — cria backup `partner_snapshots_bkp_20260827`, abre `BEGIN`, apaga os
   snapshots de `2026-08-27`, reinsere a partir do staging (agora **todos** casam com `partners`)
   e roda o post-check.
4. **Confira o post-check** (esperado `soma_licencas = 57897`). Se estiver certo, rode `COMMIT;`
   (está comentado no fim do arquivo, de propósito, para você commitar conscientemente). Se algo
   estiver errado, `ROLLBACK;`.
5. **Valide o gráfico** ("Histórico de Licenças e Engajamento") na aplicação.
6. **`03_cleanup.sql`** — só **depois** de validar o gráfico: derruba as duas stagings
   (`stg_partners_20260827`, `stg_snapshot_20260827`) e o backup.

## Observações

- Nenhum script deste pacote deve ser rodado por uma automação — a mutação (`02`) exige
  revisão manual das somas e um `COMMIT;` explícito.
- O backup no `02` falha de propósito se `partner_snapshots_bkp_20260827` já existir — isso força
  intenção consciente e evita rodar o apply duas vezes por acidente.
