# Dashboard NGEL (Google Apps Script)

Código auxiliar do dashboard publicado como web app do Apps Script:

- **Projeto**: `1xoT1dB6J-9yt1IYhHxr2gtNqAndEwBcaxT8TZ3BETaov6kvhLFd7l60N`
- **Deployment**: `.../macros/s/AKfycbzOlvjq5-FSmkQwfzDxFJ7IHDJM8YzFoCgJl4efAaZ_Wr1e4kl7D1nLNF-W4i6TUbas/exec`

Este projeto **não** faz parte do app Cloud Run do CAPro. Está aqui só para versionar
alterações no dashboard; o deploy continua sendo manual, pelo editor do Apps Script.

## Estrutura do dashboard (levantada a partir do output renderizado)

Servidor: `doGet`, `toNum`, `getFridayWeekKey`, `padZ`, `dayLabel`, `getData`, `buildHTML`, `buildJS`.
Dados operacionais vêm da aba `EX_NGEL_Diario` da planilha que hospeda o script
(`getActiveSpreadsheet`); base/engajamento e planos vêm da planilha externa
"Levantamento NGEL" via `openById`.

`buildJS` gera todo o front-end (SVG escrito à mão, sem biblioteca de gráficos) e
`buildAll(ds)` compõe as seções. **`buildJS` retorna um template literal (crases)** —
todo código colado lá dentro não pode conter crase, `${` nem barra invertida sem
escape (por isso o `toggleComp(\\'...\\')` duplicado que aparece no original). Helpers disponíveis: `card`, `esc`, `uid`, `fmtN`,
`fmtK`, `fmtSigned`, `fmtSignedK`, `niceStep`, `statBox`, `sparkline`, e o array
`scripts[]` (padrão de hover: `<rect id="gid_hit">` + `<line id="gid_vl">` +
`<div class="tip" id="gid_tip">`, com o listener empurrado via `scripts.push(js)`
e avaliado no fim de `buildAll`).

## Fonte de dados da base de engajamento

Planilha **"Levantamento NGEL"** (`1vWOk-AL0Vs9zBOUc6f4jZi7kawk9-8sxPed4cPMNuEs`),
aba **`NGEL`** — não confundir com a aba `NGEL - Com Substituição`. Cabeçalho na
linha 1, dados nas linhas 2–21 (Jan/25 → Ago/26):

| Coluna | Campo | Uso |
| --- | --- | --- |
| A | `Mes` | rótulo do eixo X |
| H | `backlog_end_month` | base engajada no fim do mês |
| N | `Subscribers` | base total no fim do mês |
| O | `% engajadas` | taxa de engajamento |

`O` confere exatamente com `H ÷ N` em todos os 20 meses. A coluna vem formatada como
porcentagem, então o `getValues()` devolve fração (0,7455) — `getBaseNGEL_` normaliza.

## Achados da auditoria de dados (2026-09-01)

- **`BACKLOG_CHART` não vem dessa planilha.** Diverge da coluna H em 9 dos 19 meses
  (Jul/25 42.474 vs 42.475 · Ago/25 43.146 vs 43.148 · Out/25 44.849 vs 44.851 ·
  Nov/25 45.183 vs 45.184 · Jan/26 45.925 vs 45.926 · Fev/26 47.134 vs 47.135 ·
  Mai/26 48.404 vs 48.406 · Jun/26 49.070 vs 49.068) e **para em Jul/26**, sem Ago/26
  (50.610). Diferenças pequenas, mas indicam outra origem — vale decidir qual é a
  fonte de verdade e se `BACKLOG_CHART` ainda deve existir.
- **`BACKLOG_CHART` e `NOVAS_GEN_HIST` são enviados ao browser e nunca renderizados.**
  `NOVAS_GEN_HIST` (20 meses de nova geração) continua sem consumidor.
- **`MOM_CHART.begin` e `M12.pct_nunca` também não têm consumidor** no front-end.
- **`WATERFALL` tem `baseInicial === baseFinal` (49.638)**, e os movimentos são de
  Ago/26 (`novasGen` 874, `reeng` 2.786, `deseng` −2.011, `canceladas` −1.026)
  embora `label` diga `Jul/26`. Somando, o `baseFinal` deveria ser ~50.261 — parece
  que o campo não está sendo calculado. Não alterado aqui; precisa de decisão.
- **Os filtros de gerente/coordenador só sobrescrevem `W12`, `DAILY30` e as séries
  MTD.** Como `setFilter` faz `Object.assign({}, RAW, src, ...)`, todo o resto
  (`M12`, `MOM_CHART`, `TAXA_ENG_MENSAL`, `BACKLOG_CHART`, `WATERFALL`) continua
  global mesmo com filtro ativo — comportamento pré-existente, sem aviso na UI.
  `baseVsEngajadaChart` declara isso na legenda de rodapé.

## Arquivos

- `patch-getData.md` — a mudança no `getData` para ler a coluna N em
  `BACKLOG_CHART[].tot` (obrigatória), mais duas correções opcionais (`pct` com 2
  casas e o pareamento de mês do `WATERFALL`).
- `baseVsEngajadaChart.js` — gráfico "Base engajada x base total (fim de mês) +
  taxa de engajamento MoM", consumindo `ds.BACKLOG_CHART`. Instruções de instalação no
  topo do arquivo. O corpo da função é livre de crase/`${`/barra invertida, então
  entra no template literal do `buildJS` sem escape.
  Sem eixo Y duplo: os dois volumes dividem um eixo (mesma unidade, empilhados) e a
  taxa fica num painel abaixo com o eixo X e o crosshair compartilhados — mesma
  decisão já tomada no `PartnerHistoryChart` do CAPro (ver `CLAUDE.md`).
