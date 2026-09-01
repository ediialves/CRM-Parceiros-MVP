# Patch no `getData` — ler a coluna N (Subscribers)

O `getData` já abre a planilha "Levantamento NGEL" (`EXTERNAL_ID`) e lê a aba `NGEL`.
No loop `for (var ei = 1; ei < extRows.length; ei++)` ele pega a coluna A (mes),
a B (`backlog_begin_month`), a H (`backlog_end_month`) e a O (`% engajadas`) — mas
**não lê a coluna N (`Subscribers`)**, que é a base total. É só isso que falta para
`baseVsEngajadaChart` parar de derivar o total.

## 1. Obrigatório — duas linhas

**a)** Logo depois da linha que lê a coluna H:

```js
        var backlogEnd = toNum(eRow[7]); // Coluna H = backlog_end_month
```

acrescente:

```js
        var subscribers = toNum(eRow[13]); // Coluna N = Subscribers (base total)
```

**b)** Na linha que empilha o `backlogData`, acrescente `tot`:

```js
        // antes
        if (backlogEnd > 0) backlogData.push({mes: labelDisp, val: backlogEnd, pct: pctEng});

        // depois
        if (backlogEnd > 0) backlogData.push({mes: labelDisp, val: backlogEnd, tot: subscribers, pct: pctEng});
```

Pronto. `BACKLOG_CHART` passa a carregar `{mes, val, tot, pct}` e o gráfico usa o
total real da coluna N.

---

## 2. Opcional — `pct` com 2 casas

A coluna O tem 2 casas na planilha (74,55%), mas o `getData` arredonda para 1
(74,5%). Como o `tot` agora vem da coluna N, o `pct` é só exibição — mas se quiser a
precisão da planilha:

```js
        // antes
        pctEng = pctRaw < 1 ? Math.round(pctRaw * 1000) / 10 : Math.round(pctRaw * 10) / 10;

        // depois
        pctEng = pctRaw < 1 ? Math.round(pctRaw * 10000) / 100 : Math.round(pctRaw * 100) / 100;
```

Vale para os dois ramos (`typeof pctRaw === "number"` e o ramo string).

---

## 3. Opcional — `WATERFALL` misturando dois meses

Bug real, diagnosticado no render de 01/09/2026 12:09: o card mostrava
`baseInicial === baseFinal === 49.638` com rótulo `Jul/26`, e a soma dos movimentos
não fechava com o `baseFinal`.

Causa: o waterfall pareia `momData[último]` com `backlogData[último]` sem conferir se
são o mesmo mês. Durante o fechamento, a planilha já tem a linha do mês novo com
`backlog_begin_month` (coluna B) preenchido e `backlog_end_month` (coluna H) ainda
vazio — aí `momData` já avançou para Ago/26 enquanto `backlogData` ainda parava em
Jul/26, e o card somava o begin de um mês com o end do outro.

```js
  var WATERFALL = null;
  if (momData.length > 0 && backlogData.length > 0) {
    var wBackLast = backlogData[backlogData.length - 1];
    // Casa o mês do begin com o mês do end. momData usa "AGO/2026" e backlogData usa
    // "Ago/26", então normaliza antes de comparar.
    var wMomLast = null;
    for (var wmi = momData.length - 1; wmi >= 0; wmi--) {
      var wmp = momData[wmi].mes.split("/");
      var wmLabel = wmp[0].charAt(0) + wmp[0].slice(1).toLowerCase() + "/" + wmp[1].slice(2);
      if (wmLabel === wBackLast.mes) { wMomLast = momData[wmi]; break; }
    }
    if (wMomLast) {
      var wFlow = monthlyFlows[wMomLast.mes] || {novas_gen:0, reeng:0, canceladas:0, deseng:0};
      WATERFALL = {
        label: wBackLast.mes,
        baseInicial: Math.round(wMomLast.begin),
        baseFinal: Math.round(wBackLast.val),
        novasGen: Math.round(wFlow.novas_gen),
        reeng: Math.round(wFlow.reeng),
        canceladas: Math.round(wFlow.canceladas),
        deseng: Math.round(wFlow.deseng)
      };
    }
  }
```

Com isso, no fechamento o waterfall segura o último mês completo em vez de exibir um
mês híbrido. O trade-off é que ele fica um mês "atrás" enquanto a coluna H do mês
corrente não é preenchida — que é o comportamento correto para um waterfall de mês
fechado.
