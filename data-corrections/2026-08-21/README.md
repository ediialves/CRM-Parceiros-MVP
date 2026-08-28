# Correção retroativa dos snapshots de 21/08/2026

Pacote **não-destrutivo e revisável** para corrigir os `partner_snapshots` da data
`2026-08-21`, que foram importados sem os dados corretos de licenças/engajamento.

## Fonte dos dados

- Arquivo: `04610982-21_08_2026_3.xlsx`
- Aba autoritativa escolhida: **`Página7`** (aba visível, dado fresco).
  - `ΣK (licencas) = 57.975`  ← **número que você precisa confirmar que bate com a sua planilha ajustada**
  - `Σ engajadas = 40.678`
  - `IDs únicos (dedup por coluna A) = 3.983`

### Por que `Página7` e não a aba que o app lê?

O parser do app (`src/lib/import/parsePartners.ts`) lê a aba
`"Extração  - Base final diagnóst"`. Nesse arquivo essa aba é a **cópia congelada/stale**
(`ΣK = 57.054`). A aba `base final 2` foi **descartada** porque a coluna AF dela é outro campo
(`Licenças em Estoque`, não `engajadas`). A aba `brenda` tem só 95 linhas. A `Página7` é a única
aba fresca com o cabeçalho correto (`A=nk_accountancy_id`, `K=total_customers`, `AF=engajadas`)
e o maior `ΣK` válido — por isso é a autoritativa para esta correção.

## Parsing

Reproduz **exatamente** a lógica de `parsePartners.ts` + o objeto de insert de
`Importacao.tsx`:
- Dedup por coluna A (accountancy_id), mantendo a **primeira** ocorrência; ID convertido para string e `trim()`.
- Normalização numérica idêntica (`parseNumber`, `parseNullableNumber`, `parseDecimalPercent`;
  regra de percentual: `0 < v <= 15` ⇒ `round(v*100)`; senão `round(v)`; `Math.round` = half-up).
- Colunas do snapshot preenchidas **iguais ao objeto de insert do app**
  (`licencas, licencas_engajadas, estoque, percentual_engajamento, penetracao, cnpjs,
  cnpjs_livres, contas_potencial, ratio, plano(=segmento), atribuidas, percentual_atribuidas`).
- `import_completo = true` é adicionado no apply (o app **não** grava essa coluna no insert de
  snapshot, mas ela existe na tabela e marca o snapshot como importação real/completa — ver
  CLAUDE.md). Confirme que a coluna existe antes de rodar o `02`.

## Ordem de execução

1. **`01_stage_and_preview.sql`** — cria a tabela de staging `stg_snapshot_20260821`, carrega as
   3.983 linhas e roda os SELECTs de preview (**não escreve** em `partner_snapshots`).
2. **Confira as somas e o unmatched:**
   - `staged` deve mostrar `soma_licencas = 57975`, `soma_engajadas = 40678`, `linhas = 3983`.
   - o relatório de `UNMATCHED` lista os `accountancy_id` do staging que **não** têm parceiro
     correspondente em `partners`. Esses **não** entram no apply (o INSERT usa `JOIN partners`).
     Confira se a quantidade é aceitável.
3. **`02_apply.sql`** — cria backup `partner_snapshots_bkp_20260821`, abre `BEGIN`, apaga os
   snapshots de `2026-08-21`, reinsere a partir do staging (só os que casam com `partners`) e
   roda o post-check.
4. **Confira o post-check.** Se estiver certo, rode `COMMIT;` (está comentado no fim do arquivo,
   de propósito, para você commitar conscientemente). Se algo estiver errado, `ROLLBACK;`.
5. **Valide o gráfico** ("Histórico de Licenças e Engajamento") na aplicação.
6. **`03_cleanup.sql`** — só **depois** de validar o gráfico: derruba a staging e o backup.

## Observações

- Nenhum script deste pacote deve ser rodado por uma automação — a mutação (`02`) exige
  revisão manual das somas e um `COMMIT;` explícito.
- O backup no `02` falha de propósito se `partner_snapshots_bkp_20260821` já existir — isso força
  intenção consciente e evita rodar o apply duas vezes por acidente.
