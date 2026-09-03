# Rollback de uma importação com dados errados

Pacote para **desfazer** uma importação e devolver a anterior ao papel de "última".
Mesma convenção dos pacotes de correção anteriores: nada é aplicado sem passar por
preview, e o `03_apply.sql` roda em transação com `COMMIT` manual.

## O ponto que não é óbvio

Uma importação escreve em **três** lugares (`src/pages/Importacao.tsx`):

| # | Tabela | Operação |
|---|--------|----------|
| 1 | `partners` | **UPSERT** — sobrescreve ~20 colunas, e **insere** linha nova se o `accountancy_id` não existia |
| 2 | `partner_snapshots` | INSERT de uma linha por parceiro |
| 3 | `import_logs` | INSERT de uma linha |

Apagar o snapshot **não desfaz o passo 1** — e o passo 1 é justamente o que os
dashboards leem para os números operacionais (`licencas`, `percentual_engajamento`,
`segmento`...). Por isso o rollback precisa **restaurar `partners`** a partir do
snapshot mais recente anterior à importação ruim, e não só deletar linhas.

## O que dá e o que não dá para restaurar

`partner_snapshots` guarda 12 das colunas que o UPSERT sobrescreve, então essas
voltam sozinhas: `licencas`, `licencas_engajadas`, `estoque`,
`percentual_engajamento`, `penetracao`, `cnpjs`, `cnpjs_livres`,
`contas_potencial`, `ratio`, `segmento` (via `plano`), `atribuidas`,
`percentual_atribuidas`.

**Não** estão no snapshot e por isso **não têm de onde ser restauradas**:
`nome`, `gerente`, `nivel`, `perfil_parceiro`, `perfil_servico`, **`fila`**,
`faixa_engajamento`, `exportacoes_90d`, `usa_capro`.

Atenção especial ao `fila` (Retenção x Expansão), que alimenta o radar de risco e
o relatório de planos por fila. Se o arquivo errado também trouxe essas colunas
erradas, o único conserto completo é **reimportar o arquivo correto** depois do
rollback.

## Parceiros criados pela importação ruim

O UPSERT usa `onConflict: accountancy_id`, então um `accountancy_id` novo cria
linha nova em `partners`. Esses parceiros não têm snapshot anterior e portanto não
são restaurados — o `01_diagnostico.sql` lista quais são, junto com quantos planos
e vínculos de campanha cada um tem. **O pacote não apaga esses parceiros**: apagar
linha de `partners` pode arrastar plano, task e vínculo de campanha. A decisão é
manual, caso a caso.

## Ordem de execução

1. `01_diagnostico.sql` — só leitura. Confirma qual é a importação ruim, mostra o
   schema real de `import_logs` e lista os parceiros criados pela importação.
2. `02_preview.sql` — só leitura. Mostra o antes/depois em soma e por parceiro.
3. `03_apply.sql` — faz backup das 3 tabelas, restaura, deleta, e abre transação
   com post-checks. Revise os números e então `COMMIT;` (ou `ROLLBACK;`).
4. `04_cleanup.sql` — só depois de conferir na aplicação. Contém também o SQL para
   **desfazer o rollback** enquanto os backups existirem.

## Cuidados

- **Ajuste a data** `2026-09-02` em todas as ocorrências de cada script.
- **Fuso**: `imported_at::date` é avaliado no timezone da sessão (UTC no Supabase).
  Importação feita no fim da noite no Brasil cai no dia seguinte em UTC — o
  diagnóstico mostra `primeiro_lote`/`ultimo_lote` para você conferir.
- **Múltiplas importações no mesmo dia**: o diagnóstico mostra
  `timestamps_distintos` e a duração. Uma importação normal grava vários lotes em
  milissegundos; se a duração for de minutos ou horas, provavelmente são duas
  importações e o filtro por data apagaria as duas.
- Depois do `COMMIT`, o cache em memória do app (`src/lib/dataCache.ts`) pode
  segurar número velho por até 5 minutos. Recarregar a aba resolve na hora.

## Validação

Os quatro scripts foram executados contra um Postgres 16 local com o schema
reproduzido e um cenário de 3 importações — incluindo dois lotes com timestamps
`.042`/`.043` na mesma importação e um parceiro criado apenas pela importação
ruim, com um plano preso nele. Confirmado: restaura as 12 colunas, devolve
`last_imported_at` para a importação anterior, apaga só os snapshots e o log do dia
alvo, não toca no parceiro sem histórico, e o caminho de desfazer volta ao estado
anterior.
