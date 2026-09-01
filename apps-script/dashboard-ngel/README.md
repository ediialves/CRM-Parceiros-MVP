# Dashboard NGEL (Google Apps Script)

Código auxiliar do dashboard publicado como web app do Apps Script:

- **Projeto**: `1xoT1dB6J-9yt1IYhHxr2gtNqAndEwBcaxT8TZ3BETaov6kvhLFd7l60N`
- **Deployment**: `.../macros/s/AKfycbzOlvjq5-FSmkQwfzDxFJ7IHDJM8YzFoCgJl4efAaZ_Wr1e4kl7D1nLNF-W4i6TUbas/exec`

Este projeto **não** faz parte do app Cloud Run do CAPro. Está aqui só para versionar
alterações no dashboard; o deploy continua sendo manual, pelo editor do Apps Script.

## Estrutura do dashboard (levantada a partir do output renderizado)

Servidor: `doGet`, `toNum`, `getFridayWeekKey`, `padZ`, `dayLabel`, `getData`, `buildHTML`, `buildJS`.
`buildJS` gera todo o front-end (SVG escrito à mão, sem biblioteca de gráficos) e
`buildAll(ds)` compõe as seções. Helpers disponíveis: `card`, `esc`, `uid`, `fmtN`,
`fmtK`, `fmtSigned`, `fmtSignedK`, `niceStep`, `statBox`, `sparkline`, e o array
`scripts[]` (padrão de hover: `<rect id="gid_hit">` + `<line id="gid_vl">` +
`<div class="tip" id="gid_tip">`, com o listener empurrado via `scripts.push(js)`
e avaliado no fim de `buildAll`).

## Achados da auditoria de dados (2026-09-01)

- **`BACKLOG_CHART` e `NOVAS_GEN_HIST` são enviados ao browser e nunca renderizados.**
  `BACKLOG_CHART` tem 19 meses (Jan/25→Jul/26) com `val` (base engajada) e `pct`
  (taxa de engajamento). `NOVAS_GEN_HIST` tem 20 meses de nova geração.
- **`MOM_CHART.begin` e `M12.pct_nunca` também não têm consumidor** no front-end.
- **`BACKLOG_CHART` não tem base total.** O total só existe derivado (`val ÷ pct`), e
  como `pct` chega arredondado em 1 decimal isso erra ~±50 licenças. Correção certa:
  `getData` passar a incluir `total` em cada item. `baseVsEngajadaChart` já usa
  `x.total` quando existe e só então para de exibir o aviso de estimativa.
- **`BACKLOG_CHART` para em Jul/26**, enquanto M12/MOM_CHART/TAXA_ENG_MENSAL vão até
  Ago/26. Vale conferir se o mês corrente deveria entrar (fechado ou parcial).
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

- `baseVsEngajadaChart.js` — gráfico "Base engajada x base total (fim de mês) +
  taxa de engajamento MoM". Instruções de instalação no topo do arquivo.
  Sem eixo Y duplo: os dois volumes dividem um eixo (mesma unidade, empilhados) e a
  taxa fica num painel abaixo com o eixo X e o crosshair compartilhados — mesma
  decisão já tomada no `PartnerHistoryChart` do CAPro (ver `CLAUDE.md`).
