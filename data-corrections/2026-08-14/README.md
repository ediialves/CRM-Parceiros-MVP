# Correção retroativa dos snapshots de 14/08/2026

Pacote **não-destrutivo e revisável** para corrigir os `partner_snapshots` da data
`2026-08-14`. Mesma estrutura e convenções dos pacotes de `2026-08-21` e `2026-08-27`.

## Fonte dos dados

- Arquivo: `6ce0d2f5-13_08_2026_2.xlsx`
- Aba autoritativa escolhida: **`Extração  - Base final diagnóst`** (aba visível, dado fresco).
  - `ΣK (licencas) = 58.052`  ← **número que você precisa confirmar que bate com a sua planilha ajustada**
  - `Σ engajadas = 41.356`
  - `IDs únicos (dedup por coluna A) = 3.959`

### Qual aba foi usada e por quê?

Diferente do arquivo de 27/08 (onde a aba lida pelo app estava congelada/stale e foi preciso
usar a `Página7`), **neste arquivo a própria aba que o app lê — `"Extração  - Base final
diagnóst"` (`src/lib/import/parsePartners.ts`) — é a fresca e autoritativa**: é a aba de índice 0,
**visível**, com o cabeçalho correto (`A=nk_accountancy_id`, `K=total_customers`, `AF=engajadas`)
e `ΣK ≈ 58k`. Este arquivo **não** tem cópia oculta/stale dessa aba. A outra aba, `brenda`, é um
subconjunto **sem cabeçalho** e **não** deve ser usada.

### Análise de duplicados (`Extração  - Base final diagnóst`)

- Linhas válidas (A+B preenchidos), sem dedup: **3.972** | `ΣK = 58.472` | `Σ engajadas = 41.687`.
- Após dedup por coluna A (mantendo a **primeira** ocorrência): **3.959** | `ΣK = 58.052` | `Σ engajadas = 41.356`.
- Delta: **13 linhas** removidas | `ΣK -420` | `Σ engajadas -331`.
- **13** `accountancy_id` duplicados, **todos puros** (K/AF idênticos entre as ocorrências — nenhum conflito).

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

- O `00` carrega os **3.959** parceiros da aba `Extração  - Base final diagnóst` numa staging
  `stg_partners_20260814` e faz `INSERT ... ON CONFLICT (accountancy_id) DO NOTHING` — ou seja,
  **só os que faltam são inseridos; os parceiros já existentes ficam intactos** (nenhum `UPDATE` de
  `gerente_id`, `licencas`, etc.). O preview do `00` (`faltando`) informa quantos e lista quem são.
- Colunas gravadas: exatamente as do objeto de upsert do app (`src/pages/Importacao.tsx`), com o
  mesmo parsing de `src/lib/import/parsePartners.ts`.
- **`gerente_id` é inserido como `NULL`** para os parceiros novos (fiel ao app: ele só preserva
  `gerente_id` de parceiros já existentes; parceiro novo entra sem gerente). **Esses parceiros
  precisarão de vínculo de gerente depois** (linking manual). Eles **continuam contando** no
  Histórico de Licenças/Engajamento porque o texto `gerente` (coluna C = `owner_name`) **é
  populado** — os dashboards filtram parceiros por esse texto, não pelo `gerente_id`.
- `last_imported_at` usa o valor histórico fixo `'2026-08-14 12:00:00-03'` (não `now()`).

## Ordem de execução

1. **`01_stage_and_preview.sql`** — cria a tabela de staging `stg_snapshot_20260814`, carrega as
   3.959 linhas e roda os SELECTs de preview (**não escreve** em `partner_snapshots`).
   - Confira: `staged` deve mostrar `soma_licencas = 58052`, `soma_engajadas = 41356`,
     `linhas = 3959`. O relatório de `UNMATCHED` lista os `accountancy_id` do staging que **não**
     têm parceiro correspondente em `partners`.
2. **`00_insert_missing_partners.sql`** — cria a staging `stg_partners_20260814`, carrega os 3.959
   parceiros, mostra os previews (`faltando` = quantos não existem em `partners`, e lista quem
   são), abre `BEGIN`, insere os faltantes (`ON CONFLICT DO NOTHING`) e roda o pós-check.
   - **Precisa rodar DEPOIS do `01`**, porque o re-check final do `00`
     (`snapshot_unmatched_agora`) consulta `stg_snapshot_20260814`, criada no `01`.
   - Confira: `partners_depois - partners_antes` = o número de faltantes do preview **e**
     `snapshot_unmatched_agora = 0`.
   - Se estiver certo, **remova o `--` antes de `COMMIT;`** (está comentado no fim, de propósito) e
     rode. Senão, `ROLLBACK;`.
3. **`02_apply.sql`** — cria backup `partner_snapshots_bkp_20260814`, abre `BEGIN`, apaga os
   snapshots de `2026-08-14`, reinsere a partir do staging (agora **todos** casam com `partners`)
   e roda o post-check.
4. **Confira o post-check** (esperado `soma_licencas = 58052`). Se estiver certo, **remova o `--`
   antes de `COMMIT;`** (está comentado no fim do arquivo, de propósito, para você commitar
   conscientemente). Se algo estiver errado, `ROLLBACK;`.
5. **Valide o gráfico** ("Histórico de Licenças e Engajamento") na aplicação.
6. **`03_cleanup.sql`** — só **depois** de validar o gráfico: derruba as duas stagings
   (`stg_partners_20260814`, `stg_snapshot_20260814`) e o backup.

## Números esperados (confirme antes de commitar)

- `ΣK (licencas) = 58.052`
- `Σ engajadas = 41.356`
- `IDs únicos (dedup) = 3.959`

## Observações

- Nenhum script deste pacote deve ser rodado por uma automação — a mutação (`02`) exige
  revisão manual das somas e um `COMMIT;` explícito (lembre de **remover o `--` antes do `COMMIT;`**
  tanto no `00` quanto no `02` antes de rodar).
- Os parceiros inseridos pelo `00` entram com `gerente_id = NULL` e **precisam de vínculo de
  gerente manual** depois — só o texto `gerente` é populado (suficiente para os dashboards, que
  filtram por esse texto).
- O backup no `02` falha de propósito se `partner_snapshots_bkp_20260814` já existir — isso força
  intenção consciente e evita rodar o apply duas vezes por acidente.
