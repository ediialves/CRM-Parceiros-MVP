// ═══════════════════════════════════════════════════════════════════
// DASHBOARD NGEL WOW — Apps Script
// Mantenha suas funções existentes e adicione este código abaixo
// Implante como Web App: Executar como "Eu", Acesso "Qualquer pessoa em ContaAzul"
// ═══════════════════════════════════════════════════════════════════

var SHEET_NAME = "EX_NGEL_Diario";

function doGet() {
  var data = getData();
  var html = buildHTML(data);
  return HtmlService.createHtmlOutput(html)
    .setTitle("Dashboard NGEL WoW")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function toNum(v) {
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// Semana fecha na sexta-feira: sábado/domingo contam para a semana que termina na
// sexta-feira SEGUINTE (evita que o pico de desengajamento de fim de semana caia
// misturado numa semana já "fechada").
function getFridayWeekKey(dateStr) {
  var d = new Date(dateStr + "T00:00:00");
  var dow = d.getDay(); // 0=dom ... 5=sex ... 6=sáb
  var diffToFriday = (5 - dow + 7) % 7;
  d.setDate(d.getDate() + diffToFriday);
  return Utilities.formatDate(d, "America/Sao_Paulo", "yyyy-MM-dd");
}

function padZ(n) {
  return String(n).padStart(2, "0");
}

function dayLabel(dt) {
  return padZ(dt.getDate()) + "/" + padZ(dt.getMonth() + 1);
}

function getData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(SHEET_NAME);
  var rows = ws.getDataRange().getValues();

  var COORDS = ["Lilian Regina Santi", "Paola Pagangrizo", "Greiciane Fagundes", "João Vitor"];

  var dayMap = {};
  var dayMapGerentes = {};
  var dayMapCoords = {};
  COORDS.forEach(function(c){ dayMapCoords[c] = {}; });

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[1]) continue;
    var dia = new Date(row[1]);
    if (isNaN(dia.getTime())) continue;

    var team = String(row[2] || "").trim();
    var dateStr = Utilities.formatDate(dia, "America/Sao_Paulo", "yyyy-MM-dd");

    var addToMap = function(map, ds, d) {
      if (!map[ds]) {
        map[ds] = {
          date: ds, month: d.getMonth()+1, year: d.getFullYear(), day: d.getDate(),
          novas:0, novas_gen:0, reeng:0, canceladas:0, deseng:0, ngel:0, nunca:0
        };
      }
      var dm = map[ds];
      dm.novas      += toNum(row[3]);
      dm.novas_gen  += toNum(row[4]);
      dm.reeng      += toNum(row[5]);
      dm.canceladas += toNum(row[6]);
      dm.deseng     += toNum(row[7]);
      dm.ngel       += toNum(row[8]);
      dm.nunca      += toNum(row[9]);
    };

    // Todos
    addToMap(dayMap, dateStr, dia);

    // Gerentes = soma dos 4 coordenadores
    var isCoord = COORDS.indexOf(team) !== -1;
    if (isCoord) {
      addToMap(dayMapGerentes, dateStr, dia);
      addToMap(dayMapCoords[team], dateStr, dia);
    }
  }

  var mapToSortedArray = function(map) {
    var arr = [];
    var keys = Object.keys(map).sort();
    for (var ki = 0; ki < keys.length; ki++) arr.push(map[keys[ki]]);
    return arr;
  };

  var parsed          = mapToSortedArray(dayMap);
  var parsedGerentes  = mapToSortedArray(dayMapGerentes);
  var parsedCoords    = {};
  COORDS.forEach(function(c){ parsedCoords[c] = mapToSortedArray(dayMapCoords[c]); });

  var buildMetrics = function(parsedArr) {
    var wkMap = {};
    for (var pi = 0; pi < parsedArr.length; pi++) {
      var r = parsedArr[pi];
      var fri = getFridayWeekKey(r.date);
      if (!wkMap[fri]) wkMap[fri] = {novas:0,novas_gen:0,reeng:0,nunca:0,canceladas:0,deseng:0,ngel:0,days:0};
      var w = wkMap[fri];
      w.novas+=r.novas; w.novas_gen+=r.novas_gen; w.reeng+=r.reeng;
      w.nunca+=r.nunca; w.canceladas+=r.canceladas; w.deseng+=r.deseng;
      w.ngel+=r.ngel; w.days++;
    }
    var wkKeys = Object.keys(wkMap).sort().slice(-12);
    var W12out = [];
    for (var wi = 0; wi < wkKeys.length; wi++) {
      var k = wkKeys[wi];
      var v = wkMap[k];
      var d = new Date(k + "T00:00:00"); // sexta-feira (fechamento da semana)
      var start = new Date(d); start.setDate(start.getDate() - 6); // sábado anterior
      var tn = (v.novas_gen + v.reeng + v.nunca) || 1;
      var td = (Math.abs(v.deseng) + Math.abs(v.canceladas)) || 1;
      var pn = Math.round(v.novas_gen / tn * 100);
      var pr = Math.round(v.reeng / tn * 100);
      var pd = Math.round(Math.abs(v.deseng) / td * 100);
      W12out.push({
        novas: Math.round(v.novas), novas_gen: Math.round(v.novas_gen),
        reeng: Math.round(v.reeng), nunca: Math.round(v.nunca),
        canceladas: Math.round(v.canceladas), desengajadas: Math.round(v.deseng),
        ngel: Math.round(v.ngel), days: v.days,
        label: dayLabel(d),
        label_full: dayLabel(start) + "–" + dayLabel(d),
        reeng_rate: Math.round(Math.abs(v.reeng) / (v.novas || 1) * 100),
        total_detrat: Math.round(v.deseng + v.canceladas),
        pct_gen: pn, pct_reeng: pr, pct_nunca: 100 - pn - pr,
        pct_deseng: pd, pct_cancel: 100 - pd,
        deseng: Math.round(Math.abs(v.deseng)), cancel: Math.round(Math.abs(v.canceladas))
      });
    }

    var last30 = parsedArr.slice(-30);
    var D30 = [];
    for (var di = 0; di < last30.length; di++) {
      var rd = last30[di];
      var dd = new Date(rd.date + "T00:00:00");
      D30.push({d: dayLabel(dd), v: Math.round(rd.ngel)});
    }

    var last = parsedArr[parsedArr.length - 1] || {month:1,year:2026};
    var curM = last.month, curY = last.year;
    Logger.log("buildMetrics curM=" + curM + " curY=" + curY + " parsedArr.length=" + parsedArr.length);
    var prevM = curM > 1 ? curM-1 : 12;
    var prevY = curM > 1 ? curY : curY-1;

    var mtdCumLocal = function(field, month, year, useDes) {
      var acc = 0, res = [];
      for (var mi = 0; mi < parsedArr.length; mi++) {
        var mr = parsedArr[mi];
        if (mr.month !== month || mr.year !== year) continue;
        acc += useDes ? (Math.abs(mr.deseng) + Math.abs(mr.canceladas)) : mr[field];
        res.push({day: mr.day, cum: Math.round(acc)});
      }
      return res;
    }

    var curNgelMtd = [];
    var acc2 = 0;
    for (var ni = 0; ni < parsedArr.length; ni++) {
      var nr = parsedArr[ni];
      if (nr.month !== curM || nr.year !== curY) continue;
      acc2 += nr.ngel;
      curNgelMtd.push({day: nr.day, cum: Math.round(acc2)});
    }

    // Helper: get NGEL MTD cumulative for any month/year
    var getNgelMtd = function(month, year) {
      var acc = 0, res = [];
      for (var xi = 0; xi < parsedArr.length; xi++) {
        var xr = parsedArr[xi];
        if (xr.month !== month || xr.year !== year) continue;
        acc += xr.ngel;
        res.push({day: xr.day, cum: Math.round(acc)});
      }
      return res;
    };

    // Helper: offset month back by N
    var offsetMonth = function(m, y, n) {
      var dm = m - n; var dy = y;
      while (dm <= 0) { dm += 12; dy--; }
      return {m: dm, y: dy};
    };

    var m1 = offsetMonth(curM, curY, 1);
    var m2 = offsetMonth(curM, curY, 2);
    var m3 = offsetMonth(curM, curY, 3);

    return {
      W12: W12out,
      DAILY30: D30,
      CUR_NOVAS:    mtdCumLocal("novas", curM,    curY,    false),
      PREV_NOVAS:   mtdCumLocal("novas", m1["m"], m1["y"], false),
      PREV2_NOVAS:  mtdCumLocal("novas", m2["m"], m2["y"], false),
      PREV3_NOVAS:  mtdCumLocal("novas", m3["m"], m3["y"], false),
      CUR_DESEN:    mtdCumLocal(null,    curM,    curY,    true),
      PREV_DESEN:   mtdCumLocal(null,    m1["m"], m1["y"], true),
      PREV2_DESEN:  mtdCumLocal(null,    m2["m"], m2["y"], true),
      PREV3_DESEN:  mtdCumLocal(null,    m3["m"], m3["y"], true),
      CUR_NGEL_MTD:   curNgelMtd,
      PREV_NGEL_MTD:  getNgelMtd(m1["m"], m1["y"]),
      PREV2_NGEL_MTD: getNgelMtd(m2["m"], m2["y"]),
      PREV3_NGEL_MTD: getNgelMtd(m3["m"], m3["y"]),
    };
  }

  var metricsTodos    = buildMetrics(parsed);
  var metricsGerentes = buildMetrics(parsedGerentes);
  var metricsCoords   = {};
  COORDS.forEach(function(c){ metricsCoords[c] = buildMetrics(parsedCoords[c]); });

  // Ranking de coordenadores — última semana (W12) e último mês (agregado direto dos dados diários)
  var lastMonthTotals = function(parsedArr) {
    var last = parsedArr[parsedArr.length - 1];
    var totals = {novas_gen:0, reeng:0, deseng:0, canceladas:0, ngel:0};
    if (!last) return totals;
    for (var lmi = 0; lmi < parsedArr.length; lmi++) {
      var lmr = parsedArr[lmi];
      if (lmr.month !== last.month || lmr.year !== last.year) continue;
      totals.novas_gen += lmr.novas_gen; totals.reeng += lmr.reeng;
      totals.deseng += lmr.deseng; totals.canceladas += lmr.canceladas; totals.ngel += lmr.ngel;
    }
    return totals;
  };
  var COORD_RANKING = COORDS.map(function(c){
    var w = metricsCoords[c].W12;
    var lastW = w[w.length - 1] || {novas_gen:0, reeng:0, deseng:0, cancel:0, ngel:0};
    return {
      name: c,
      engajadas: Math.round(lastW.novas_gen + lastW.reeng),
      desengajadas: Math.round(lastW.deseng + lastW.cancel),
      ngel: Math.round(lastW.ngel)
    };
  });
  var COORD_RANKING_M = COORDS.map(function(c){
    var t = lastMonthTotals(parsedCoords[c]);
    return {
      name: c,
      engajadas: Math.round(t.novas_gen + t.reeng),
      desengajadas: Math.round(Math.abs(t.deseng) + Math.abs(t.canceladas)),
      ngel: Math.round(t.ngel)
    };
  });

  // Weekly last 12 (keep for compatibility)
  var W12 = metricsTodos.W12;

  var monthNames = ["","JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

  // Meta NGEL MTD — 1010 / 30 dias corridos
  var META_NGEL = 1010;
  var DIAS_MES = 30;
  var metaNgel = [];
  for (var md = 1; md <= DIAS_MES; md++) {
    metaNgel.push({day: md, cum: Math.round(META_NGEL / DIAS_MES * md)});
  }

  // Leitura da planilha externa — aba NGEL
  var EXTERNAL_ID = "1vWOk-AL0Vs9zBOUc6f4jZi7kawk9-8sxPed4cPMNuEs";
  var momData = [];
  var backlogData = [];
  try {
    var extSS = SpreadsheetApp.openById(EXTERNAL_ID);
    Logger.log("Planilha aberta: " + extSS.getName());
    var extWS = extSS.getSheetByName("NGEL");
    if (!extWS) {
      Logger.log("Aba NGEL nao encontrada. Abas: " + extSS.getSheets().map(function(s){return s.getName();}).join(", "));
    } else {
      Logger.log("Aba encontrada. Lendo dados...");
      var extRows = extWS.getDataRange().getValues();
      Logger.log("Total de linhas: " + extRows.length);
      // Aba NGEL: Col A(0)=mes, Col B(1)=backlog_begin_month, Col H(7)=backlog_end_month
      // Header na linha 1 (index 0), dados a partir linha 2 (index 1)
      var monthNamesExt = ["","JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
      for (var ei = 1; ei < extRows.length; ei++) {
        var eRow = extRows[ei];
        var mesRaw = eRow[0];          // Coluna A = mes
        var beginMonth = toNum(eRow[1]); // Coluna B = backlog_begin_month
        var backlogEnd = toNum(eRow[7]); // Coluna H = backlog_end_month
        var subscribers = toNum(eRow[13]); // Coluna N = Subscribers (base total)
        if (!mesRaw) continue;
        var mesNome, anoStr;
        if (mesRaw instanceof Date) {
          mesNome = monthNamesExt[mesRaw.getMonth() + 1];
          anoStr  = String(mesRaw.getFullYear());
        } else {
          var mesStr = String(mesRaw).trim().toLowerCase();
          var cleaned = mesStr.replace(/\./g, "");
          var parts = cleaned.split("/");
          if (parts.length < 2) continue;
          mesNome = parts[0].trim().toUpperCase();
          anoStr  = parts[1].trim().length === 2 ? "20" + parts[1].trim() : parts[1].trim();
        }
        var mesKey = mesNome + "/" + anoStr;
        var partsDisp = mesKey.split("/");
        var labelDisp = partsDisp[0].charAt(0).toUpperCase() + partsDisp[0].slice(1).toLowerCase() + "/" + partsDisp[1].slice(2);
        var anoNum = parseInt(anoStr);
        if (anoNum < 2025) continue;
        // Col O (index 14) = % engajadas — pode vir como "71,46%" ou 0.7146
        var pctRaw = eRow[14];
        var pctEng = 0;
        if (pctRaw !== null && pctRaw !== undefined && pctRaw !== "" &&
            String(pctRaw).indexOf("#") === -1) {
          if (typeof pctRaw === "number") {
            pctEng = pctRaw < 1 ? Math.round(pctRaw * 1000) / 10 : Math.round(pctRaw * 10) / 10;
          } else {
            var pctStr = String(pctRaw).replace(",", ".").replace("%", "").trim();
            var parsed = parseFloat(pctStr);
            if (!isNaN(parsed)) {
              pctEng = parsed < 1 ? Math.round(parsed * 1000) / 10 : Math.round(parsed * 10) / 10;
            }
          }
        }
        pctEng = pctEng || 0;
        if (beginMonth > 0) momData.push({mes: mesKey, begin: beginMonth});
        if (backlogEnd > 0) backlogData.push({mes: labelDisp, val: backlogEnd, tot: subscribers, pct: pctEng});
      }
      momData = momData.slice(-12);
      Logger.log("momData: " + JSON.stringify(momData));
      Logger.log("backlogData: " + JSON.stringify(backlogData));
    }

    // Leitura da aba EX_NGEL por Plano
    var planoWS = extSS.getSheetByName("EX_NGEL por Plano");
    var planoData = {};
    var planoList = [];
    if (planoWS) {
      var planoRows = planoWS.getDataRange().getValues();
      // Col A(0)=mes, B(1)=plano_code, C(2)=grupo_resumo, D(3)=parceiros
      // H(7)=entradas_ativas, J(9)=ngaa
      // Header linha 1 (index 0), dados a partir linha 2 (index 1)
      var planoSet = {};
      for (var pi4 = 1; pi4 < planoRows.length; pi4++) {
        var pr = planoRows[pi4];
        var mesRawP = pr[0];
        if (!mesRawP) continue;
        // Parse date
        var mesLblP;
        if (mesRawP instanceof Date) {
          var mn = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
          mesLblP = mn[mesRawP.getMonth()+1] + "/" + String(mesRawP.getFullYear()).slice(2);
          // Filter from Jan/2026
          if (mesRawP.getFullYear() < 2026) continue;
        } else {
          mesLblP = String(mesRawP).trim();
          // Try to filter by year
          if (mesLblP.indexOf("25") !== -1 || mesLblP.indexOf("2025") !== -1) continue;
        }
        var plano = String(pr[1]).trim();
        var grupo = String(pr[2]).trim();
        var parceiros = toNum(pr[3]);
        var engajadas = toNum(pr[7]);
        var ngaa = toNum(pr[9]);
        if (!plano) continue;
        if (!planoSet[plano]) { planoSet[plano] = true; planoList.push(plano); }
        var key = plano + "||" + grupo;
        if (!planoData[key]) planoData[key] = [];
        planoData[key].push({mes: mesLblP, parceiros: parceiros, engajadas: engajadas, ngaa: ngaa});
      }
      Logger.log("Planos encontrados: " + planoList.join(", "));
    }
  } catch(e) {
    Logger.log("ERRO: " + e.toString());
    momData = [];
  }

  // Desengajadas totais por mês — apenas coluna H (deseng), sem canceladas
  var monthlyDeseng = {};
  for (var pi2 = 0; pi2 < parsed.length; pi2++) {
    var rr = parsed[pi2];
    var mk = monthNames[rr.month] + "/" + rr.year;
    if (!monthlyDeseng[mk]) monthlyDeseng[mk] = 0;
    monthlyDeseng[mk] += Math.abs(rr.deseng);
  }

  // Calcular taxa: desengajadas / begin_month * 100
  var momChart = [];
  for (var mi2 = 0; mi2 < momData.length; mi2++) {
    var md2 = momData[mi2];
    var desTotal = monthlyDeseng[md2.mes] || 0;
    var taxa = md2.begin > 0 ? Math.round((desTotal / md2.begin) * 1000) / 10 : 0;
    var partsDisp = md2.mes.split("/");
    var labelDisp = partsDisp[0].charAt(0) + partsDisp[0].slice(1).toLowerCase() + "/" + partsDisp[1].slice(2);
    momChart.push({mes: labelDisp, begin: md2.begin, deseng: Math.round(desTotal), taxa: taxa});
  }

  // Fluxos mensais completos (novas genuínas, reengajamento, canceladas, desengajadas), mesma chave de mês
  // usada acima — alimentam o waterfall e a taxa de engajamento mensal.
  var monthlyFlows = {};
  for (var pfi = 0; pfi < parsed.length; pfi++) {
    var pfr = parsed[pfi];
    var pfk = monthNames[pfr.month] + "/" + pfr.year;
    if (!monthlyFlows[pfk]) monthlyFlows[pfk] = {novas_gen:0, reeng:0, canceladas:0, deseng:0};
    monthlyFlows[pfk].novas_gen += pfr.novas_gen;
    monthlyFlows[pfk].reeng += pfr.reeng;
    monthlyFlows[pfk].canceladas += pfr.canceladas;
    monthlyFlows[pfk].deseng += pfr.deseng;
  }

  var TAXA_ENG_MENSAL = [];
  for (var tei = 0; tei < momData.length; tei++) {
    var tmd = momData[tei];
    var tflow = monthlyFlows[tmd.mes] || {novas_gen:0};
    var tTaxa = tmd.begin > 0 ? Math.round((tflow.novas_gen / tmd.begin) * 1000) / 10 : 0;
    var tParts = tmd.mes.split("/");
    var tLabel = tParts[0].charAt(0) + tParts[0].slice(1).toLowerCase() + "/" + tParts[1].slice(2);
    TAXA_ENG_MENSAL.push({mes: tLabel, taxa: tTaxa});
  }

  var WATERFALL = null;
  if (momData.length > 0 && backlogData.length > 0) {
    var wMomLast = momData[momData.length - 1];
    var wBackLast = backlogData[backlogData.length - 1];
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

  // Novas genuínas MoM desde Jan/2025
  var novGenMap = {};
  for (var ngi = 0; ngi < parsed.length; ngi++) {
    var ngr = parsed[ngi];
    if (ngr.year < 2025) continue;
    var ngk = ngr.year + "-" + (ngr.month < 10 ? "0"+ngr.month : ngr.month);
    if (!novGenMap[ngk]) novGenMap[ngk] = {month:ngr.month, year:ngr.year, val:0};
    novGenMap[ngk].val += ngr.novas_gen;
  }
  var novGenKeys = Object.keys(novGenMap).sort();
  var NOVAS_GEN_HIST = novGenKeys.map(function(k){
    var v = novGenMap[k];
    var lbl = monthNames[v.month].charAt(0)+monthNames[v.month].slice(1).toLowerCase()+"/"+String(v.year).slice(2);
    return {mes: lbl, val: Math.round(v.val)};
  });

  var last = parsed[parsed.length-1] || {month:1,year:2026};
  var curM = last.month, curY = last.year;
  var prevM = curM > 1 ? curM-1 : 12;
  var prevY = curM > 1 ? curY : curY-1;
  var m2m = prevM > 1 ? prevM-1 : 12; var m2y = prevM > 1 ? prevY : prevY-1;
  var m3m = m2m > 1 ? m2m-1 : 12;    var m3y = m2m > 1 ? m2y : m2y-1;

  var lastMtdDay = metricsTodos.CUR_NGEL_MTD.length
    ? metricsTodos.CUR_NGEL_MTD[metricsTodos.CUR_NGEL_MTD.length - 1].day
    : new Date().getDate();
  var periodLabel = "01/" + padZ(curM) + "/" + String(curY).slice(2) + " – " + padZ(lastMtdDay) + "/" + padZ(curM) + "/" + String(curY).slice(2);
  var generatedAt = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");

  // Monthly aggregation — last 12 months
  var mthMap = {};
  for (var mi3 = 0; mi3 < parsed.length; mi3++) {
    var mr3 = parsed[mi3];
    var mk3 = mr3.year + "-" + (mr3.month < 10 ? "0"+mr3.month : mr3.month);
    if (!mthMap[mk3]) mthMap[mk3] = {
      key:mk3, month:mr3.month, year:mr3.year,
      novas:0, novas_gen:0, reeng:0, nunca:0,
      canceladas:0, deseng:0, ngel:0
    };
    var mm = mthMap[mk3];
    mm.novas+=mr3.novas; mm.novas_gen+=mr3.novas_gen; mm.reeng+=mr3.reeng;
    mm.nunca+=mr3.nunca; mm.canceladas+=mr3.canceladas;
    mm.deseng+=mr3.deseng; mm.ngel+=mr3.ngel;
  }
  var mthKeys = Object.keys(mthMap).sort().slice(-12);
  var M12 = mthKeys.map(function(k){
    var v = mthMap[k];
    var tn = (v.novas_gen+v.reeng+v.nunca)||1;
    var td = (Math.abs(v.deseng)+Math.abs(v.canceladas))||1;
    var pn=Math.round(v.novas_gen/tn*100), pr=Math.round(v.reeng/tn*100);
    var pd=Math.round(Math.abs(v.deseng)/td*100);
    var lbl = monthNames[v.month].charAt(0)+monthNames[v.month].slice(1).toLowerCase()+"/"+String(v.year).slice(2);
    return {
      label: lbl,
      novas: Math.round(v.novas), novas_gen: Math.round(v.novas_gen),
      reeng: Math.round(v.reeng), nunca: Math.round(v.nunca),
      canceladas: Math.round(v.canceladas), desengajadas: Math.round(v.deseng),
      ngel: Math.round(v.ngel),
      total_detrat: Math.round(v.deseng+v.canceladas),
      pct_gen:pn, pct_reeng:pr, pct_nunca:100-pn-pr,
      pct_deseng:pd, pct_cancel:100-pd,
      deseng: Math.round(Math.abs(v.deseng)), cancel: Math.round(Math.abs(v.canceladas))
    };
  });

  return {
    W12:          metricsTodos.W12,
    DAILY30:      metricsTodos.DAILY30,
    CUR_NOVAS:    metricsTodos.CUR_NOVAS,
    PREV_NOVAS:   metricsTodos.PREV_NOVAS,
    PREV2_NOVAS:  metricsTodos.PREV2_NOVAS,
    PREV3_NOVAS:  metricsTodos.PREV3_NOVAS,
    CUR_DESEN:    metricsTodos.CUR_DESEN,
    PREV_DESEN:   metricsTodos.PREV_DESEN,
    PREV2_DESEN:  metricsTodos.PREV2_DESEN,
    PREV3_DESEN:  metricsTodos.PREV3_DESEN,
    CUR_NGEL_MTD:   metricsTodos.CUR_NGEL_MTD,
    PREV_NGEL_MTD:  metricsTodos.PREV_NGEL_MTD,
    PREV2_NGEL_MTD: metricsTodos.PREV2_NGEL_MTD,
    PREV3_NGEL_MTD: metricsTodos.PREV3_NGEL_MTD,
    M12: M12,
    GERENTES: {
      W12:            metricsGerentes.W12,
      DAILY30:        metricsGerentes.DAILY30,
      CUR_NOVAS:      metricsGerentes.CUR_NOVAS,
      PREV_NOVAS:     metricsGerentes.PREV_NOVAS,
      PREV2_NOVAS:    metricsGerentes.PREV2_NOVAS,
      PREV3_NOVAS:    metricsGerentes.PREV3_NOVAS,
      CUR_DESEN:      metricsGerentes.CUR_DESEN,
      PREV_DESEN:     metricsGerentes.PREV_DESEN,
      PREV2_DESEN:    metricsGerentes.PREV2_DESEN,
      PREV3_DESEN:    metricsGerentes.PREV3_DESEN,
      CUR_NGEL_MTD:   metricsGerentes.CUR_NGEL_MTD,
      PREV_NGEL_MTD:  metricsGerentes.PREV_NGEL_MTD,
      PREV2_NGEL_MTD: metricsGerentes.PREV2_NGEL_MTD,
      PREV3_NGEL_MTD: metricsGerentes.PREV3_NGEL_MTD,
    },
    META_NGEL:       metaNgel,
    META_NGEL_TOTAL: META_NGEL,
    MOM_CHART:       momChart,
    BACKLOG_CHART:   backlogData || [],
    TAXA_ENG_MENSAL: TAXA_ENG_MENSAL || [],
    WATERFALL:       WATERFALL,
    COORD_RANKING:   COORD_RANKING,
    COORD_RANKING_M: COORD_RANKING_M,
    COORDS:          COORDS,
    COORD_METRICS:   metricsCoords,
    PLANO_DATA:      planoData || {},
    PLANO_LIST:      planoList || [],
    NOVAS_GEN_HIST:  NOVAS_GEN_HIST || [],
    curLabel:  monthNames[curM]  + "/" + curY,
    prevLabel: monthNames[prevM] + "/" + prevY,
    prev2Label: monthNames[m2m] + "/" + m2y,
    prev3Label: monthNames[m3m] + "/" + m3y,
    periodLabel: periodLabel,
    generatedAt: generatedAt
  };
}

function buildHTML(data) {
  var jsonStr = JSON.stringify(data);
  var css = `
:root{
  --blue-dark:#0050CC; --blue:#1671F5; --blue-pale:#6EB3FF; --blue-tint:#EAF1FB;
  --red:#F04438; --red-tint:#FDEBEA; --red-pale:rgba(240,68,56,0.45);
  --green:#00875A; --green-tint:rgba(0,179,126,0.12);
  --ink:#101828; --ink2:#344054; --ink3:#475467; --muted:#98A2B3; --border:#E4E7EC; --page:#F6F8FB; --surface:#fff;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--page);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased;color:var(--ink);}
.app{display:flex;min-height:100vh;}
.sidebar{width:148px;flex-shrink:0;background:var(--blue-dark);color:#fff;display:flex;flex-direction:column;padding:20px 14px;position:sticky;top:0;height:100vh;}
.logo{font-size:16px;font-weight:800;letter-spacing:-.01em;margin-bottom:28px;}
.navitem{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:8px;font-size:12.5px;font-weight:600;color:rgba(255,255,255,.75);cursor:pointer;margin-bottom:2px;}
.navitem .ic{width:15px;text-align:center;font-size:12px;}
.navitem.active{background:rgba(255,255,255,.16);color:#fff;}
.navitem:hover{color:#fff;}
.sidebar-foot{margin-top:auto;font-size:10.5px;color:rgba(255,255,255,.65);}
.sidebar-foot .lbl{text-transform:uppercase;letter-spacing:.05em;font-size:9px;margin-bottom:4px;color:rgba(255,255,255,.5);}
.sidebar-foot .val{color:#fff;font-weight:600;margin-bottom:14px;}
.main{flex:1;padding:26px 30px 60px;min-width:0;}

.pageheader{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;flex-wrap:wrap;gap:14px;}
.h1{font-size:23px;font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.h1sub{font-size:12.5px;color:var(--ink3);margin-top:2px;}
.hdr-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.daterange{font-size:11.5px;font-weight:600;color:var(--ink2);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 12px;}
.livepill{font-size:10.5px;color:var(--muted);display:flex;align-items:center;gap:5px;}
.livedot{width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;}
.filtersrow{display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap;}
.filterlbl{font-size:10.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;}
.fbtn{padding:6px 14px;font-size:11.5px;font-weight:600;border-radius:20px;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--ink3);}
.fbtn.active{background:var(--blue);color:#fff;border-color:var(--blue);}

.kpirow{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:26px;}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:13px 14px;}
.kpi-lbl{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;}
.kpi-row2{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;}
.kpi-val{font-size:25px;font-weight:800;color:var(--ink);letter-spacing:-.02em;}
.kpi-delta{font-size:11px;font-weight:600;display:flex;align-items:center;gap:3px;margin-top:6px;}
.kpi-delta.up{color:var(--green);} .kpi-delta.down{color:var(--red);} .kpi-delta.flat{color:var(--muted);}

.section{margin-bottom:30px;}
.section-hd{margin-bottom:12px;}
.section-title{font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.07em;}
.section-sub{font-size:11.5px;color:var(--muted);margin-top:2px;}

.row-60-40{display:grid;grid-template-columns:1.6fr 1fr;gap:14px;align-items:stretch;}
.row-50-50{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;}
.row-comp{display:grid;grid-template-columns:1fr 1fr 0.62fr;gap:14px;align-items:stretch;}
.row-33{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
.row-70-30{display:grid;grid-template-columns:1.7fr 1fr;gap:0;height:100%;}

.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;position:relative;display:flex;flex-direction:column;}
.card-hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;}
.card-title{font-size:14px;font-weight:700;color:var(--ink);letter-spacing:-.005em;}
.card-sub{font-size:11px;color:var(--muted);margin-top:1px;}
.legrow{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:10.5px;color:var(--ink3);margin:8px 0 6px;}
.legitem{display:flex;align-items:center;gap:5px;}
.legitem .sw{width:9px;height:9px;border-radius:2px;display:inline-block;flex-shrink:0;}
.legitem .swline{width:12px;height:2px;border-radius:1px;display:inline-block;flex-shrink:0;}
.legcheck{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:11.5px;color:var(--ink2);font-weight:500;}
.legcheck input{accent-color:var(--blue);width:13px;height:13px;cursor:pointer;}
.statrow{display:flex;gap:22px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);}
.stat-lbl{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.stat-val{font-size:17px;font-weight:800;margin-top:2px;}
.stat-delta{font-size:10.5px;font-weight:600;margin-top:2px;}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:#fff;border-radius:8px;padding:8px 11px;font-size:11px;line-height:1.6;box-shadow:0 4px 14px rgba(0,0,0,.2);white-space:nowrap;z-index:50;display:none;}
.footer{margin-top:8px;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px;}
`;
  var bodyShell = `<div class="app">
  <aside class="sidebar">
    <div class="logo">ContaAzul</div>
    <div class="navitem active" onclick="scrollToId('top')"><span class="ic">&#9679;</span>Visão geral</div>
    <div class="navitem" onclick="scrollToId('sec-composicao')"><span class="ic">&#9632;</span>Composição</div>
    <div class="navitem" onclick="scrollToId('sec-coordenadores')"><span class="ic">&#9737;</span>Coordenadores</div>
    <div class="navitem"><span class="ic">&#9888;</span>Alertas</div>
    <div class="navitem"><span class="ic">&#8681;</span>Exportar</div>
    <div class="sidebar-foot">
      <div class="lbl">Período</div>
      <div class="val" id="sf-period">—</div>
      <div class="lbl">Última atualização</div>
      <div class="val" id="sf-updated">—</div>
    </div>
  </aside>
  <main class="main" id="top">
    <div class="pageheader">
      <div><div class="h1">Dashboard NGEL</div><div class="h1sub">Visão geral de engajamento e desengajamento</div></div>
      <div class="hdr-right">
        <div class="daterange" id="hdr-period">__PERIOD__</div>
        <div class="livepill"><span class="livedot"></span><span id="hdr-updated">Atualizado em __GENAT__</span></div>
      </div>
    </div>
    <div class="filtersrow">
      <span class="filterlbl">Filtros rápidos:</span>
      <div class="fbtn active" data-f="todos" onclick="setFilter('todos',this)">Todos</div>
      <div class="fbtn" data-f="gerentes" onclick="setFilter('gerentes',this)">Gerentes</div>
      <div class="fbtn" data-f="coord_0" onclick="setFilter('coord_0',this)">Lilian</div>
      <div class="fbtn" data-f="coord_1" onclick="setFilter('coord_1',this)">Paola</div>
      <div class="fbtn" data-f="coord_2" onclick="setFilter('coord_2',this)">Greiciane</div>
      <div class="fbtn" data-f="coord_3" onclick="setFilter('coord_3',this)">João Vitor</div>
    </div>

    <div id="content"></div>

    <div class="footer">Dados atualizados até __GENAT__ (sua conta pode ter atualização agendada).</div>
  </main>
</div>`
    .replace('__PERIOD__', data.periodLabel || '')
    .replace(/__GENAT__/g, data.generatedAt || '');

  var html = '<!DOCTYPE html><html lang="pt-BR"><head>'
    + '<meta charset="UTF-8"/>'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
    + '<title>Dashboard NGEL</title>'
    + '<style>' + css + '</style></head><body>'
    + bodyShell
    + '<script>'
    + 'var RAW=' + jsonStr + ';'
    + buildJS()
    + '<\/script>'
    + '</body></html>';

  return html;
}

function buildJS() {
  return `function scrollToId(id){ var el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); }
function fmtN(n){return Math.round(Math.abs(n)).toLocaleString("pt-BR");}
function fmtSigned(n){return (n>0?"+":n<0?"−":"")+fmtN(n);}
function fmtK(n){var a=Math.abs(n);var s=n<0?"−":"";return a>=1000?s+(a/1000).toFixed(1).replace(".",",")+"k":s+fmtN(a);}
function esc(s){return String(s==null?"":s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];});}
function uid(){return "u"+Math.random().toString(36).slice(2,8);}
var scripts=[];
function card(inner,extra){ extra=extra||""; return '<div class="card" '+extra+'>'+inner+'</div>'; }




function sparkline(vals,color){
  if(!vals||vals.length<2) return "";
  var w=54,h=22,pad=2;
  var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals);
  var range=(max-min)||1;
  var xOf=function(i){return pad+(i/(vals.length-1))*(w-2*pad);};
  var yOf=function(v){return pad+(1-(v-min)/range)*(h-2*pad);};
  var d=vals.map(function(v,i){return(i===0?"M":"L")+xOf(i).toFixed(1)+","+yOf(v).toFixed(1);}).join(" ");
  var last=vals.length-1;
  var s='<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>';
  s+='<circle cx="'+xOf(last).toFixed(1)+'" cy="'+yOf(vals[last]).toFixed(1)+'" r="2.2" fill="'+color+'"/>';
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+s+'</svg>';
}
function kpiTile(label,value,delta,isPct,upIsGood,trend,statusText){
  var good = delta==null ? null : ((delta>0)===upIsGood);
  var cls = delta==null ? "flat" : (delta===0?"flat":(good?"up":"down"));
  var color = cls==="up"?"var(--green)":cls==="down"?"var(--red)":"var(--muted)";
  var arrow = cls==="up"?"▲":cls==="down"?"▼":"→";
  var html='<div class="kpi"><div class="kpi-lbl">'+esc(label)+'</div>';
  html+='<div class="kpi-row2"><div class="kpi-val">'+value+'</div>'+(trend?sparkline(trend,color):"")+'</div>';
  if(statusText){
    html+='<div class="kpi-delta '+cls+'">'+arrow+' '+esc(statusText)+'</div>';
  } else if(delta!=null){
    html+='<div class="kpi-delta '+cls+'">'+arrow+' '+fmtSigned(delta)+(isPct?"p.p.":"")+' vs sem. ant.</div>';
  }
  html+='</div>';
  return html;
}
function buildKpiRow(ds){
  var w=ds.W12, n=w.length, last=w[n-1], prev=n>=2?w[n-2]:null;
  var d=function(f){return prev?last[f]-prev[f]:null;};
  var hist=w.slice(-8);
  var pctMeta=null;
  if(ds.CUR_NGEL_MTD&&ds.CUR_NGEL_MTD.length&&ds.META_NGEL&&ds.META_NGEL.length){
    var curLast=ds.CUR_NGEL_MTD[ds.CUR_NGEL_MTD.length-1];
    var mAt=ds.META_NGEL.filter(function(m){return m.day===curLast.day;})[0];
    if(mAt&&mAt.cum>0) pctMeta=Math.round(curLast.cum/mAt.cum*100);
  }
  var h='<div class="kpirow">';
  h+=kpiTile("NGEL da semana",fmtN(last.ngel),d("ngel"),false,true,hist.map(function(x){return x.ngel;}));
  h+=kpiTile("Novas engajadas",fmtN(last.novas_gen),d("novas_gen"),false,true,hist.map(function(x){return x.novas_gen;}));
  h+=kpiTile("Desengajadas",fmtN(last.deseng),d("deseng"),false,false,hist.map(function(x){return x.deseng;}));
  h+=kpiTile("Taxa reengajamento",last.reeng_rate+"%",prev?last.reeng_rate-prev.reeng_rate:null,true,true,hist.map(function(x){return x.reeng_rate;}));
  h+=kpiTile("% Genuínas",last.pct_gen+"%",prev?last.pct_gen-prev.pct_gen:null,true,true,hist.map(function(x){return x.pct_gen;}));
  if(pctMeta!=null){
    h+=kpiTile("NGEL MTD vs Meta",pctMeta+"%",pctMeta-100,false,true,null,pctMeta>=100?"Acima da meta":"Abaixo da meta");
  } else { h+=kpiTile("NGEL MTD vs Meta","—",null,false,true); }
  h+='</div>';
  return h;
}




function fmtSignedK(n){ var sgn=n>0?"+":n<0?"−":""; return sgn+fmtK(Math.abs(n)); }
function mtdChart(ds){
  var cur=ds.CUR_NGEL_MTD, meta=ds.META_NGEL;
  if(!cur||!cur.length||!meta||!meta.length){
    return card('<div class="card-title">Previsto x Realizado (MTD)</div><p style="font-size:12px;color:var(--muted);padding:20px 0;">Sem dados suficientes.</p>','style="height:100%;"');
  }
  var refs=[
    {data:ds.PREV_NGEL_MTD||[], label:ds.prevLabel, color:"#AFB7C4", w:1.3},
    {data:ds.PREV2_NGEL_MTD||[], label:ds.prev2Label, color:"#C7CDD6", w:1.15},
    {data:ds.PREV3_NGEL_MTD||[], label:ds.prev3Label, color:"#DEE1E7", w:1}
  ];
  var W=640,H=250,pL=42,pR=64,pT=16,pB=26,iW=W-pL-pR,iH=H-pT-pB,DIAS=31;
  var allV=cur.map(function(d){return d.cum;}).concat(meta.map(function(d){return d.cum;}));
  refs.forEach(function(r){ if(r.data.length) allV=allV.concat(r.data.map(function(d){return d.cum;})); });
  
  
  var rawMin=Math.min.apply(null,allV.concat([0])), rawMax=Math.max.apply(null,allV.concat([100]));
  var pad=(rawMax-rawMin)*0.08||10;
  var maxV=rawMax+pad;
  var minV=rawMin<0?rawMin-pad:0;
  var range=(maxV-minV)||1;
  var xOf=function(day){return pL+((day-1)/(DIAS-1))*iW;};
  var yOf=function(v){return pT+(1-(v-minV)/range)*iH;};
  var lp=function(a){return a.map(function(d,i){return(i===0?"M":"L")+xOf(d.day).toFixed(1)+","+yOf(d.cum).toFixed(1);}).join(" ");};
  var gid=uid();

  
  var cLast=cur[cur.length-1];
  var metaLast=meta[meta.length-1];
  var pctMeta=metaLast.cum>0?Math.round(cLast.cum/metaLast.cum*100):null;
  var prevRef=refs[0].data.length?refs[0]:null;
  var prevLast=prevRef?prevRef.data[prevRef.data.length-1]:null;
  var deltaPrev=prevLast?cLast.cum-prevLast.cum:null;

  var s="";
  
  var tickVals=minV<0?[minV,0,maxV]:[minV,(minV+maxV)/2,maxV];
  tickVals.forEach(function(v){
    s+='<text x="'+(pL-8)+'" y="'+(yOf(v)+3).toFixed(1)+'" text-anchor="end" font-size="10" fill="var(--muted)">'+fmtK(v)+'</text>';
  });
  s+='<line x1="'+pL+'" y1="'+yOf(0).toFixed(1)+'" x2="'+(pL+iW)+'" y2="'+yOf(0).toFixed(1)+'" stroke="var(--ink3)" stroke-width="1" opacity="'+(minV<0?0.22:0.12)+'"/>';
  
  var dayTicks=[1,4,7,10,13,16,19,22,25,28,31].filter(function(d){return d<=DIAS;});
  dayTicks.forEach(function(d){ s+='<text x="'+xOf(d).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" font-size="9.5" fill="var(--muted)">'+String(d).padStart(2,"0")+'</text>'; });
  
  refs.forEach(function(r,ri){
    if(!r.data.length) return;
    s+='<path id="'+gid+'_ref'+ri+'" d="'+lp(r.data)+'" fill="none" stroke="'+r.color+'" stroke-width="'+r.w+'"/>';
    var last=r.data[r.data.length-1];
    s+='<text x="'+(pL+iW+6)+'" y="'+(yOf(last.cum)+3).toFixed(1)+'" font-size="10" font-weight="600" fill="'+r.color+'">'+fmtK(last.cum)+'</text>';
  });
  
  s+='<path d="'+lp(meta)+'" fill="none" stroke="var(--blue-pale)" stroke-width="1.5" stroke-dasharray="5,4"/>';
  s+='<text x="'+(pL+iW+6)+'" y="'+(yOf(metaLast.cum)+3).toFixed(1)+'" font-size="10.5" font-weight="700" fill="var(--blue-pale)">'+fmtK(metaLast.cum)+'</text>';
  
  var areaD=lp(cur)+' L'+xOf(cLast.day).toFixed(1)+","+yOf(0).toFixed(1)+' L'+xOf(cur[0].day).toFixed(1)+","+yOf(0).toFixed(1)+' Z';
  s+='<path d="'+areaD+'" fill="var(--blue)" fill-opacity="0.035"/>';
  s+='<path id="'+gid+'_cur" d="'+lp(cur)+'" fill="none" stroke="var(--blue)" stroke-width="2.8" stroke-linecap="round"/>';
  var n=cur.length, minIdx=0, maxIdx=0;
  cur.forEach(function(d,i){ if(d.cum<cur[minIdx].cum) minIdx=i; if(d.cum>cur[maxIdx].cum) maxIdx=i; });
  var labelIdx={}; labelIdx[0]=true; labelIdx[n-1]=true;
  if(minIdx>0&&minIdx<n-1) labelIdx[minIdx]=true;
  if(maxIdx>0&&maxIdx<n-1) labelIdx[maxIdx]=true;
  cur.forEach(function(d,i){
    var isLast=i===n-1;
    s+='<circle cx="'+xOf(d.day).toFixed(1)+'" cy="'+yOf(d.cum).toFixed(1)+'" r="'+(isLast?4.5:2)+'" fill="var(--blue)" stroke="#fff" stroke-width="'+(isLast?1.8:0.8)+'"/>';
    if(labelIdx[i]){
      var nearBottom=(d.cum-minV)<range*0.14;
      var dy=(nearBottom&&!isLast)?16:-9;
      s+='<text x="'+xOf(d.day).toFixed(1)+'" y="'+(yOf(d.cum)+dy).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?13:10)+'" font-weight="'+(isLast?800:650)+'" fill="var(--blue)">'+fmtK(d.cum)+'</text>';
    }
  });
  
  s+='<line id="'+gid+'_vl" x1="0" y1="'+pT+'" x2="0" y2="'+(pT+iH)+'" stroke="var(--muted)" stroke-width="1" opacity="0"/>';
  s+='<rect id="'+gid+'_hit" x="'+pL+'" y="'+pT+'" width="'+iW+'" height="'+iH+'" fill="transparent"/>';

  var kpiRow='<div style="display:flex;gap:22px;flex-wrap:wrap;margin:8px 0 14px;padding-bottom:12px;border-bottom:1px solid var(--border);">'+
    '<div style="min-width:88px;"><div class="stat-lbl">Realizado</div><div style="font-size:21px;font-weight:800;color:var(--blue);letter-spacing:-.01em;margin-top:2px;">'+fmtK(cLast.cum)+'</div><div style="font-size:10.5px;color:var(--muted);margin-top:1px;">Realizado ('+esc(ds.curLabel)+')</div></div>'+
    (pctMeta!=null?'<div style="min-width:70px;"><div class="stat-lbl">% da meta</div><div style="font-size:21px;font-weight:800;color:var(--ink);letter-spacing:-.01em;margin-top:2px;">'+pctMeta+'%</div><div style="font-size:10.5px;color:var(--muted);margin-top:1px;">da meta</div></div>':"")+
    '<div style="min-width:80px;"><div class="stat-lbl">Meta</div><div style="font-size:21px;font-weight:800;color:var(--ink2);letter-spacing:-.01em;margin-top:2px;">'+fmtK(metaLast.cum)+'</div><div style="font-size:10.5px;color:var(--muted);margin-top:1px;">Meta ('+esc(ds.curLabel)+')</div></div>'+
    (deltaPrev!=null?'<div style="min-width:110px;"><div class="stat-lbl">Vs. mês anterior</div><div style="font-size:21px;font-weight:800;color:'+(deltaPrev>=0?"var(--green)":"var(--red)")+';letter-spacing:-.01em;margin-top:2px;">'+fmtSignedK(deltaPrev)+'</div><div style="font-size:10.5px;color:var(--muted);margin-top:1px;">vs '+esc(prevRef.label)+' ('+fmtK(prevLast.cum)+')</div></div>':"")+
    '</div>';

  var legend='<div class="legrow">'+
    '<span class="legitem"><span class="swline" style="background:var(--blue)"></span>Realizado ('+esc(ds.curLabel)+')</span>'+
    '<span class="legitem"><span class="swline" style="background:var(--blue-pale);border-top:2px dashed var(--blue-pale);height:0;"></span>Meta ('+esc(ds.curLabel)+')</span>'+
    refs.filter(function(r){return r.data.length;}).map(function(r){var lv=r.data[r.data.length-1].cum;return '<span class="legitem"><span class="swline" style="background:'+r.color+'"></span>'+esc(r.label)+' · '+fmtK(lv)+'</span>';}).join("")+
    '</div>';

  var monthAbbr=(ds.curLabel||"").split("/")[0].toUpperCase();
  var tipHtml=cur.map(function(d,i){
    var parts=['<div style="font-weight:700;margin-bottom:4px;">'+d.day+' '+esc(monthAbbr)+'</div>'];
    parts.push('<div>'+esc(ds.curLabel)+' — Realizado: <b>'+d.cum.toLocaleString("pt-BR")+'</b></div>');
    var mAt=meta.filter(function(m){return m.day===d.day;})[0];
    if(mAt) parts.push('<div>'+esc(ds.curLabel)+' — Meta: <b>'+mAt.cum.toLocaleString("pt-BR")+'</b></div>');
    refs.forEach(function(r){
      if(!r.data.length) return;
      var rAt=r.data.filter(function(x){return x.day===d.day;})[0];
      if(rAt) parts.push('<div>'+esc(r.label)+': <b>'+rAt.cum.toLocaleString("pt-BR")+'</b></div>');
    });
    return parts.join("");
  });
  var js="(function(){"+
    "var svg=document.getElementById('"+gid+"_hit');"+
    "var vl=document.getElementById('"+gid+"_vl');"+
    "var tip=document.getElementById('"+gid+"_tip');"+
    "var cur="+JSON.stringify(cur)+";"+
    "var tips="+JSON.stringify(tipHtml)+";"+
    "var pL="+pL+",iW="+iW+",DIAS="+DIAS+",W="+W+";"+
    "function xOf(d){return pL+((d-1)/(DIAS-1))*iW;}"+
    "svg.addEventListener('mousemove',function(e){"+
    "  var rect=svg.closest('svg').getBoundingClientRect();"+
    "  var px=(e.clientX-rect.left)*(W/rect.width);"+
    "  var day=Math.round(1+(px-pL)/(iW/(DIAS-1)));day=Math.max(1,Math.min(DIAS,day));"+
    "  var idx=cur.findIndex(function(d){return d.day===day;}); if(idx<0) return;"+
    "  vl.setAttribute('x1',xOf(day));vl.setAttribute('x2',xOf(day));vl.setAttribute('opacity','1');"+
    "  tip.innerHTML=tips[idx];tip.style.display='block';"+
    "  var pct=(xOf(day)-pL)/iW;"+
    "  tip.style.left=Math.min(85,Math.max(0,pct*100))+'%';tip.style.top='10px';"+
    "});"+
    "svg.addEventListener('mouseleave',function(){vl.setAttribute('opacity','0');tip.style.display='none';});"+
    "})();";
  scripts.push(js);
  var hdr='<div class="card-hd"><div><div class="card-title">Previsto x Realizado (MTD)</div><div class="card-sub">Engajadas acumuladas no mês</div></div></div>';
  var body='<svg width="100%" viewBox="0 0 '+W+' '+H+'" style="overflow:visible">'+s+'</svg><div class="tip" id="'+gid+'_tip"></div>';
  var cap='<div style="font-size:10.5px;color:var(--muted);margin-top:8px;">Passe o mouse sobre o gráfico para comparar com o mesmo dia dos últimos 3 meses.</div>';
  return card(hdr+kpiRow+legend+body+cap,'style="height:100%;"');
}




function niceStep(rawStep){
  rawStep=Math.abs(rawStep)||1;
  var exp=Math.pow(10,Math.floor(Math.log(rawStep)/Math.LN10));
  var f=rawStep/exp;
  var nf=f<=1?1:f<=2?2:f<=5?5:10;
  return nf*exp;
}
function statBox(lbl,val,color,bg){
  return '<div style="flex:1;min-width:0;background:'+bg+';border-radius:10px;padding:8px 10px;text-align:center;">'+
    '<div class="stat-lbl">'+esc(lbl)+'</div><div class="stat-val" style="color:'+color+';font-size:16px;margin-top:2px;">'+val+'</div></div>';
}




function ngelWowChart(ds){
  var w=ds.W12, n=w.length;
  var gain=w.map(function(x){return x.novas_gen+x.reeng;});
  var loss=w.map(function(x){return -(x.deseng+x.cancel);});
  var net=w.map(function(x){return x.ngel;});
  var W=440,H=270,pL=32,pR=8,pT=16,pB=28,iW=W-pL-pR,iH=H-pT-pB;
  var absMax=Math.max.apply(null,gain.concat(loss.map(Math.abs)).concat([1]));
  var midY=pT+iH/2;
  var gap=3,bW=Math.floor((iW-(n-1)*gap)/n);
  var xOf=function(i){return pL+i*(bW+gap);};
  var yOfBar=function(v){return midY-(v/absMax)*(iH/2-14);};
  var s="";
  
  
  
  var step=niceStep(absMax/3);
  for(var tk=-3;tk<=3;tk++){
    var tv=tk*step; if(Math.abs(tv)>absMax*1.2) continue;
    var ty=yOfBar(tv);
    if(tk!==0) s+='<line x1="'+pL+'" y1="'+ty.toFixed(1)+'" x2="'+(pL+iW)+'" y2="'+ty.toFixed(1)+'" stroke="var(--border)" stroke-width="1" opacity="0.55"/>';
    s+='<text x="'+(pL-6)+'" y="'+(ty+3).toFixed(1)+'" text-anchor="end" font-size="8.5" fill="var(--muted)">'+fmtK(tv)+'</text>';
  }
  s+='<line x1="'+pL+'" y1="'+midY+'" x2="'+(pL+iW)+'" y2="'+midY+'" stroke="var(--ink3)" stroke-width="1" opacity="0.4"/>';
  var netMax=Math.max.apply(null,net.map(Math.abs).concat([1]));
  var yOfNet=function(v){return midY-(v/netMax)*(iH/2-30);};
  var netPath=net.map(function(v,i){return(i===0?"M":"L")+(xOf(i)+bW/2).toFixed(1)+","+yOfNet(v).toFixed(1);}).join(" ");
  for(var i=0;i<n;i++){
    var isLast=i===n-1,cx=xOf(i)+bW/2;
    var gY=yOfBar(gain[i]), gH=midY-gY;
    var lY=midY, lH=yOfBar(loss[i])-midY;
    s+='<rect x="'+xOf(i)+'" y="'+gY.toFixed(1)+'" width="'+bW+'" height="'+Math.max(1,gH).toFixed(1)+'" rx="2" fill="var(--blue)"'+(isLast?' stroke="var(--blue-dark)" stroke-width="1.4"':'')+'/>';
    s+='<rect x="'+xOf(i)+'" y="'+lY.toFixed(1)+'" width="'+bW+'" height="'+Math.max(1,lH).toFixed(1)+'" rx="2" fill="var(--red)"'+(isLast?' stroke="#B42318" stroke-width="1.4"':'')+'/>';
    s+='<text x="'+cx+'" y="'+(gY-4).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?9.5:7.8)+'" font-weight="700" fill="var(--blue)">'+fmtSigned(gain[i])+'</text>';
    s+='<text x="'+cx+'" y="'+(lY+lH+11).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?9.5:7.8)+'" font-weight="700" fill="var(--red)">'+fmtSigned(loss[i])+'</text>';
    s+='<text x="'+cx+'" y="'+(H-6)+'" text-anchor="middle" font-size="7.4" font-weight="'+(isLast?700:500)+'" fill="'+(isLast?"var(--ink2)":"var(--muted)")+'">'+esc(w[i].label)+'</text>';
  }
  s+='<path d="'+netPath+'" fill="none" stroke="var(--ink)" stroke-width="1.8"/>';
  net.forEach(function(v,i){
    var isLast=i===n-1,cx=xOf(i)+bW/2;
    s+='<circle cx="'+cx+'" cy="'+yOfNet(v).toFixed(1)+'" r="'+(isLast?3.5:2)+'" fill="var(--ink)" stroke="#fff" stroke-width="1"/>';
    s+='<text x="'+cx+'" y="'+(yOfNet(v)+(isLast?15:11)).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?10:7.5)+'" font-weight="800" fill="var(--ink)" paint-order="stroke" stroke="#fff" stroke-width="2.5">'+fmtSigned(v)+'</text>';
  });
  var gainTot=gain.reduce(function(a,b){return a+b;},0), lossTot=loss.reduce(function(a,b){return a+b;},0), netTot=net.reduce(function(a,b){return a+b;},0);
  var legend='<div class="legrow">'+
    '<span class="legitem"><span class="sw" style="background:var(--blue)"></span>Ganho</span>'+
    '<span class="legitem"><span class="sw" style="background:var(--red)"></span>Perda</span>'+
    '<span class="legitem"><span class="swline" style="background:var(--ink)"></span>Líquido</span></div>';
  var stats='<div style="display:flex;gap:8px;margin-top:10px;">'+
    statBox("Ganho",fmtN(gainTot),"var(--blue)","var(--blue-tint)")+
    statBox("Perda",fmtSigned(lossTot),"var(--red)","var(--red-tint)")+
    statBox("Líquido",fmtSigned(netTot),netTot>=0?"var(--green)":"var(--red)",netTot>=0?"var(--green-tint)":"var(--red-tint)")+
    '</div>';
  var hdr='<div class="card-hd"><div class="card-title">NGEL WoW — '+n+' semanas</div></div>'+legend;
  return card(hdr+'<svg width="100%" viewBox="0 0 '+W+' '+H+'">'+s+'</svg>'+stats,'style="height:100%;"');
}




function engVsDesengChart(ds,title,items,fEng,fDes,fLabel){
  var n=items.length;
  var eng=items.map(fEng), des=items.map(fDes);
  var W=560,H=220,pL=6,pR=6,pT=20,pB=42,iW=W-pL-pR,iH=H-pT-pB;
  var absMax=Math.max.apply(null,eng.concat(des).concat([1]));
  var gap=5,pairGap=1.5;
  var slot=(iW-(n-1)*gap)/n, bW=(slot-pairGap)/2;
  var baseY=pT+iH;
  var s="";
  var netVals=[];
  for(var i=0;i<n;i++){
    var x=pL+i*(slot+gap), isLast=i===n-1;
    var he=(eng[i]/absMax)*iH, hd=(des[i]/absMax)*iH;
    s+='<rect x="'+x+'" y="'+(baseY-he).toFixed(1)+'" width="'+bW+'" height="'+Math.max(1,he).toFixed(1)+'" rx="2" fill="var(--blue)"'+(isLast?' stroke="var(--blue-dark)" stroke-width="1.3"':'')+'/>';
    s+='<rect x="'+(x+bW+pairGap)+'" y="'+(baseY-hd).toFixed(1)+'" width="'+bW+'" height="'+Math.max(1,hd).toFixed(1)+'" rx="2" fill="var(--red)"'+(isLast?' stroke="#B42318" stroke-width="1.3"':'')+'/>';
    s+='<text x="'+(x+bW/2)+'" y="'+(baseY-he-4).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?10:7.6)+'" font-weight="700" fill="var(--blue)">'+fmtN(eng[i])+'</text>';
    s+='<text x="'+(x+bW+pairGap+bW/2)+'" y="'+(baseY-hd-4).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?10:7.6)+'" font-weight="700" fill="var(--red)">'+fmtN(des[i])+'</text>';
    var lc=isLast?"var(--ink2)":"var(--muted)";
    s+='<text x="'+(x+slot/2-pairGap/2)+'" y="'+(baseY+14)+'" text-anchor="middle" font-size="7.8" font-weight="'+(isLast?700:400)+'" fill="'+lc+'">'+esc(fLabel(items[i]))+'</text>';
    var net=eng[i]-des[i];
    netVals.push('<text x="'+(x+slot/2-pairGap/2)+'" y="'+(baseY+28)+'" text-anchor="middle" font-size="7.5" font-weight="700" fill="'+(net>=0?"var(--green)":"var(--red)")+'">'+fmtSigned(net)+'</text>');
  }
  s+=netVals.join("");
  var legend='<div class="legrow">'+
    '<span class="legitem"><span class="sw" style="background:var(--blue)"></span>Engajadas</span>'+
    '<span class="legitem"><span class="sw" style="background:var(--red)"></span>Desengajadas</span></div>';
  var cap='<div style="font-size:9.5px;color:var(--muted);margin-top:2px;">Linha inferior: saldo líquido por período.</div>';
  var hdr='<div class="card-hd"><div class="card-title">'+esc(title)+'</div></div>'+legend;
  return card(hdr+'<svg width="100%" viewBox="0 0 '+W+' '+H+'">'+s+'</svg>'+cap,'style="height:100%;"');
}




function dailyChart(ds){
  var d=ds.DAILY30, n=d.length;
  var vals=d.map(function(x){return x.v;});
  var gain=vals.reduce(function(a,b){return a+(b>0?b:0);},0);
  var loss=vals.reduce(function(a,b){return a+(b<0?b:0);},0);
  var tot=gain+loss;
  var media=n?Math.round(tot/n):0;
  var W=440,H=220,pL=28,pR=90,pT=20,pB=22,iW=W-pL-pR,iH=H-pT-pB;
  var absMax=Math.max.apply(null,vals.map(Math.abs).concat([1]));
  var gap=1.3,bW=Math.floor((iW-(n-1)*gap)/n);
  var midY=pT+iH/2;
  var s="";
  var step=niceStep(absMax/3);
  for(var tk=-3;tk<=3;tk++){
    var tv=tk*step; if(Math.abs(tv)>absMax*1.2) continue;
    var ty=midY-(tv/absMax)*(iH/2-6);
    if(tk!==0) s+='<line x1="'+pL+'" y1="'+ty.toFixed(1)+'" x2="'+(pL+iW)+'" y2="'+ty.toFixed(1)+'" stroke="var(--border)" stroke-width="1" opacity="0.5"/>';
    s+='<text x="'+(pL-5)+'" y="'+(ty+3).toFixed(1)+'" text-anchor="end" font-size="7.8" fill="var(--muted)">'+fmtK(tv)+'</text>';
  }
  s+='<line x1="'+pL+'" y1="'+midY+'" x2="'+(pL+iW)+'" y2="'+midY+'" stroke="var(--ink3)" stroke-width="1" opacity="0.4"/>';
  for(var i=0;i<n;i++){
    var x=pL+i*(bW+gap), isLast=i===n-1, pos=vals[i]>=0;
    var h=(Math.abs(vals[i])/absMax)*(iH/2-6);
    var y=pos?midY-h:midY;
    s+='<rect x="'+x+'" y="'+y.toFixed(1)+'" width="'+Math.max(0.8,bW)+'" height="'+Math.max(1,h).toFixed(1)+'" fill="'+(pos?"var(--blue)":"var(--red)")+'"'+(isLast?' stroke="'+(pos?"var(--blue-dark)":"#B42318")+'" stroke-width="1"':'')+'/>';
    s+='<text x="'+(x+bW/2)+'" y="'+(pos?y-3:y+h+8)+'" text-anchor="middle" font-size="'+(isLast?7.6:5.6)+'" font-weight="700" fill="'+(pos?"var(--blue)":"var(--red)")+'">'+fmtSigned(vals[i])+'</text>';
  }
  [0,Math.floor(n/2),n-1].forEach(function(i){ s+='<text x="'+(pL+i*(bW+gap)+bW/2)+'" y="'+(H-4)+'" text-anchor="middle" font-size="8.5" fill="var(--muted)">'+esc(d[i].d)+'</text>'; });
  var stats='<div style="position:absolute;right:14px;top:48px;text-align:right;">'+
    '<div class="stat-lbl">Total</div><div class="stat-val" style="color:'+(tot>=0?"var(--green)":"var(--red)")+';font-size:17px;">'+fmtSigned(tot)+'</div>'+
    '<div class="stat-lbl" style="margin-top:9px;">Ganho</div><div class="stat-val" style="color:var(--blue);font-size:14px;">'+fmtSigned(gain)+'</div>'+
    '<div class="stat-lbl" style="margin-top:9px;">Perda</div><div class="stat-val" style="color:var(--red);font-size:14px;">'+fmtSigned(loss)+'</div>'+
    '<div class="stat-lbl" style="margin-top:9px;">Média diária</div><div class="stat-val" style="color:'+(media>=0?"var(--green)":"var(--red)")+';font-size:14px;">'+fmtSigned(media)+'</div>'+
    '</div>';
  var hdr='<div class="card-hd"><div class="card-title">NGEL diário — últimos '+n+' dias</div></div>';
  return card(hdr+'<svg width="100%" viewBox="0 0 '+W+' '+H+'">'+s+'</svg>'+stats,'style="height:100%;"');
}




var COMP_STATE={novas:true,reeng:true,nunca:true,deseng:true,cancel:true};
function stackedTypeChart(ds,title,items,fLabel,segments){
  
  var n=items.length;
  var W=430,H=230,pL=8,pR=8,pT=20,pB=26,iW=W-pL-pR,iH=H-pT-pB;
  var totals=items.map(function(it){ return segments.reduce(function(s,sg){return s+(COMP_STATE[sg.key]?sg.valFn(it):0);},0); });
  var absMax=Math.max.apply(null,totals.concat([1]));
  var gap=3,bW=Math.floor((iW-(n-1)*gap)/n);
  var baseY=pT+iH;
  var s="";
  for(var i=0;i<n;i++){
    var x=pL+i*(bW+gap), isLast=i===n-1, yOff=baseY;
    segments.forEach(function(sg){
      if(!COMP_STATE[sg.key]) return;
      var v=sg.valFn(items[i]);
      var h=(v/absMax)*iH;
      yOff-=h;
      s+='<rect class="seg-'+sg.key+'" x="'+x+'" y="'+yOff.toFixed(1)+'" width="'+bW+'" height="'+Math.max(0.5,h).toFixed(1)+'" fill="'+(isLast?sg.color:sg.colorLight)+'"/>';
      if(isLast && h>16){
        s+='<text x="'+(x+bW/2)+'" y="'+(yOff+h/2+3).toFixed(1)+'" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff">'+fmtN(v)+'</text>';
      } else if(isLast){
        s+='<text x="'+(x+bW+6)+'" y="'+(yOff+h/2+3).toFixed(1)+'" text-anchor="start" font-size="8" font-weight="700" fill="'+sg.color+'">'+fmtN(v)+'</text>';
      }
    });
    var lc=isLast?"var(--ink2)":"var(--muted)";
    s+='<text x="'+(x+bW/2)+'" y="'+(yOff-5).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?9.5:7.5)+'" font-weight="'+(isLast?700:500)+'" fill="'+(isLast?"var(--ink)":"var(--muted)")+'">'+fmtN(totals[i])+'</text>';
    if(isLast||i%2===0) s+='<text x="'+(x+bW/2)+'" y="'+(baseY+13)+'" text-anchor="middle" font-size="8" font-weight="'+(isLast?600:400)+'" fill="'+lc+'">'+esc(fLabel(items[i]))+'</text>';
  }
  var legend='<div class="legrow">'+segments.map(function(sg){
    return '<label class="legcheck"><input type="checkbox" '+(COMP_STATE[sg.key]?"checked":"")+' onclick="toggleComp(\\''+sg.key+'\\')"><span class="sw" style="background:'+sg.color+'"></span>'+esc(sg.label)+'</label>';
  }).join("")+'</div>';
  var hdr='<div class="card-hd"><div class="card-title">'+esc(title)+'</div></div>'+legend;
  return card(hdr+'<svg width="100%" viewBox="0 0 '+W+' '+H+'" id="chart-'+title.replace(/[^a-z]/gi,"")+'">'+s+'</svg>','style="height:100%;"');
}
function compLegendPanel(ds){
  var last=ds.W12[ds.W12.length-1];
  var items=[
    {key:"novas",label:"Novas",color:"var(--blue)",val:last.novas_gen},
    {key:"reeng",label:"Reengajadas",color:"var(--blue-pale)",val:last.reeng},
    {key:"nunca",label:"Nunca usaram",color:"#C7D8F2",val:last.nunca},
    {key:"deseng",label:"Desengajadas",color:"var(--red)",val:last.deseng},
    {key:"cancel",label:"Canceladas",color:"var(--red-pale)",val:last.cancel}
  ];
  var rows=items.map(function(it,i){
    var isDeseng=i>=3;
    return '<label class="legcheck" style="display:flex;justify-content:space-between;padding:6px 0;'+(i===3?"border-top:1px solid var(--border);margin-top:4px;padding-top:10px;":"")+'">'+
      '<span style="display:flex;align-items:center;gap:7px;"><input type="checkbox" '+(COMP_STATE[it.key]?"checked":"")+' onclick="toggleComp(\\''+it.key+'\\')"><span class="sw" style="background:'+it.color+'"></span>'+esc(it.label)+'</span>'+
      '<b style="font-size:12.5px;">'+fmtN(it.val)+'</b></label>';
  }).join("");
  var hdr='<div class="card-hd"><div class="card-title" style="font-size:12.5px;">Legenda interativa</div></div><div class="card-sub" style="margin-bottom:6px;">Clique para filtrar o dashboard.</div>';
  return card(hdr+rows+'<div style="font-size:10px;color:var(--muted);margin-top:8px;">Selecione uma categoria para filtrar.</div>','style="height:100%;"');
}
function toggleComp(key){
  COMP_STATE[key]=!COMP_STATE[key];
  document.getElementById("sec-composicao-inner").innerHTML=buildComposicao(CURRENT_DS);
}
function buildComposicao(ds){
  var w=ds.W12;
  var h='<div class="row-comp">';
  h+=stackedTypeChart(ds,"Engajadas WoW — por tipo",w,function(x){return x.label;},[
    {key:"novas",label:"Novas",color:"var(--blue)",colorLight:"var(--blue-tint)",valFn:function(x){return x.novas_gen;}},
    {key:"reeng",label:"Reengajadas",color:"var(--blue-pale)",colorLight:"#EEF3FC",valFn:function(x){return x.reeng;}},
    {key:"nunca",label:"Nunca usaram",color:"#7C93B8",colorLight:"#EEF1F6",valFn:function(x){return x.nunca;}}
  ]);
  h+=stackedTypeChart(ds,"Desengajadas WoW — por tipo",w,function(x){return x.label;},[
    {key:"deseng",label:"Desengajadas",color:"var(--red)",colorLight:"var(--red-tint)",valFn:function(x){return x.deseng;}},
    {key:"cancel",label:"Canceladas",color:"var(--red-pale)",colorLight:"#FDF3F2",valFn:function(x){return x.cancel;}}
  ]);
  h+=compLegendPanel(ds);
  h+='</div>';
  return h;
}




function waterfallCard(ds){
  var wf=ds.WATERFALL;
  var right='';
  if(!wf){
    var body=card('<div class="card-title">Detalhamento net engajadas — mês atual</div><p style="font-size:12px;color:var(--muted);padding:20px 0;">Sem dados suficientes.</p>');
    return body;
  }
  var steps=[
    {label:"Base inicial",type:"start",value:wf.baseInicial},
    {label:"Novas gen.",type:"pos",value:wf.novasGen},
    {label:"Reengaj.",type:"pos",value:wf.reeng},
    {label:"Canceladas",type:"neg",value:-Math.abs(wf.canceladas)},
    {label:"Desengaj.",type:"neg",value:-Math.abs(wf.deseng)},
    {label:"Base final",type:"end",value:wf.baseFinal}
  ];
  var flows=steps.filter(function(st){return st.type==="pos"||st.type==="neg";});
  var W=460,H=230,pL=10,pR=10,pT=22,pB=34,iW=W-pL-pR,iH=H-pT-pB;
  var totalSlots=steps.length, gap=8, bW=Math.floor((iW-(totalSlots-1)*gap)/totalSlots);
  var running=wf.baseInicial, cum=[{from:wf.baseInicial,to:wf.baseInicial,anchor:true}];
  flows.forEach(function(st){ var from=running; running+=st.value; cum.push({from:from,to:running}); });
  cum.push({from:wf.baseFinal,to:wf.baseFinal,anchor:true});
  var boundary=[wf.baseInicial,wf.baseFinal].concat(cum.map(function(c){return c.to;}));
  var minV=Math.min.apply(null,boundary), maxV=Math.max.apply(null,boundary);
  var pad=(maxV-minV)*0.15||Math.abs(maxV)*0.05||1;
  minV-=pad; maxV+=pad;
  var range=(maxV-minV)||1;
  function yOf(v){return pT+iH-((v-minV)/range)*iH;}
  var s="";
  for(var i=0;i<steps.length;i++){
    var st=steps[i], x=pL+i*(bW+gap), cx=x+bW/2, c=cum[i];
    var top=c.anchor?Math.max(c.to,minV):Math.max(c.from,c.to);
    var bot=c.anchor?minV:Math.min(c.from,c.to);
    var color = st.type==="start"||st.type==="end" ? "var(--ink)" : (st.value>=0?"var(--blue)":"var(--red)");
    var y1=yOf(top), y2=yOf(bot), h=Math.max(2,y2-y1);
    s+='<rect x="'+x+'" y="'+y1.toFixed(1)+'" width="'+bW+'" height="'+h.toFixed(1)+'" rx="3" fill="'+color+'"/>';
    if(i>0){
      var prevY=yOf(cum[i-1].to);
      s+='<line x1="'+(x-gap)+'" y1="'+prevY.toFixed(1)+'" x2="'+x+'" y2="'+prevY.toFixed(1)+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>';
    }
    var lbl = (st.type==="start"||st.type==="end") ? fmtK(st.value) : (fmtSigned(st.value));
    s+='<text x="'+cx+'" y="'+(y1-7).toFixed(1)+'" text-anchor="middle" font-size="10.5" font-weight="800" fill="'+color+'">'+lbl+'</text>';
    s+='<text x="'+cx+'" y="'+(H-10)+'" text-anchor="middle" font-size="8.5" fill="var(--ink3)">'+esc(st.label)+'</text>';
  }
  var netVar=wf.baseFinal-wf.baseInicial;
  var netPct=wf.baseInicial>0?Math.round(netVar/wf.baseInicial*1000)/10:0;
  var summary='<div style="min-width:0;display:flex;flex-direction:column;justify-content:center;gap:22px;padding-left:18px;border-left:1px solid var(--border);">'+
    '<div><div class="stat-lbl">Variação líquida</div><div class="stat-val" style="font-size:22px;color:'+(netVar>=0?"var(--green)":"var(--red)")+';">'+fmtSigned(netVar)+'</div></div>'+
    '<div><div class="stat-lbl">Variação %</div><div class="stat-val" style="font-size:22px;color:'+(netVar>=0?"var(--green)":"var(--red)")+';">'+(netPct>=0?"+":"")+netPct+'%</div></div>'+
    '</div>';
  var hdr='<div class="card-hd"><div class="card-title">Detalhamento net engajadas — mês atual</div></div>';
  var left='<div style="min-width:0;height:'+H+'px;">'+'<svg width="100%" height="100%" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" style="display:block;">'+s+'</svg></div>';
  return card(hdr+'<div style="display:grid;grid-template-columns:1.7fr 1fr;gap:18px;flex:1;align-items:center;">'+left+summary+'</div>','style="height:100%;"');
}




function coordTable(ds){
  var items=(ds.COORD_RANKING_M||[]).slice().sort(function(a,b){return b.ngel-a.ngel;});
  var maxEng=Math.max.apply(null,items.map(function(x){return x.engajadas;}).concat([1]));
  var maxDes=Math.max.apply(null,items.map(function(x){return x.desengajadas;}).concat([1]));
  var rows=items.map(function(it,i){
    return '<div style="display:grid;grid-template-columns:20px 1fr 110px 110px 60px 60px;align-items:center;gap:10px;padding:8px 0;'+(i>0?"border-top:1px solid var(--border);":"")+'">'+
      '<div style="font-size:11px;color:var(--muted);font-weight:700;">'+(i+1)+'</div>'+
      '<div style="font-size:12.5px;font-weight:600;color:var(--ink);">'+esc(it.name)+'</div>'+
      '<div><div style="height:6px;border-radius:3px;background:var(--blue-tint);"><div style="height:6px;border-radius:3px;background:var(--blue);width:'+Math.max(4,it.engajadas/maxEng*100)+'%;"></div></div><div style="font-size:10.5px;color:var(--blue);font-weight:700;margin-top:2px;">'+fmtN(it.engajadas)+'</div></div>'+
      '<div><div style="height:6px;border-radius:3px;background:var(--red-tint);"><div style="height:6px;border-radius:3px;background:var(--red);width:'+Math.max(4,it.desengajadas/maxDes*100)+'%;"></div></div><div style="font-size:10.5px;color:var(--red);font-weight:700;margin-top:2px;">'+fmtN(it.desengajadas)+'</div></div>'+
      '<div style="font-size:13px;font-weight:800;color:var(--ink);text-align:right;">'+fmtSigned(it.ngel)+'</div>'+
      '<div style="font-size:11.5px;font-weight:700;text-align:right;color:'+(it.ngel>=0?"var(--green)":"var(--red)")+';">'+fmtSigned(it.ngel)+'</div>'+
    '</div>';
  }).join("");
  var head='<div style="display:grid;grid-template-columns:20px 1fr 110px 110px 60px 60px;gap:10px;padding-bottom:6px;border-bottom:1px solid var(--border);">'+
    '<div></div><div class="stat-lbl">Coordenador</div><div class="stat-lbl">Engajadas</div><div class="stat-lbl">Desengajadas</div><div class="stat-lbl" style="text-align:right;">NGEL</div><div class="stat-lbl" style="text-align:right;">Variação</div></div>';
  var hdr='<div class="card-hd"><div class="card-title">Coordenadores — mês atual</div></div>';
  var cap='<div style="font-size:10px;color:var(--muted);margin-top:8px;">Ranking ordenado por NGEL (maior para menor).</div>';
  return card(hdr+'<div style="max-height:230px;overflow-y:auto;">'+head+rows+'</div>'+cap,'style="height:100%;"');
}




function rateLineChart(title,periods,vals,color,fmtPct){
  var W=340,H=190,pL=8,pR=8,pT=18,pB=22,iW=W-pL-pR,iH=H-pT-pB;
  if(!vals||vals.length<2) return card('<div class="card-title">'+esc(title)+'</div><p style="font-size:11px;color:var(--muted);padding:16px 0;">Sem dados suficientes.</p>','style="height:100%;"');
  var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals);
  var range=(max-min)||1, padv=range*0.25||1;
  var yOf=function(v){return pT+iH-((v-(min-padv))/(range+2*padv))*iH;};
  var xOf=function(i){return pL+(i/(vals.length-1))*iW;};
  var last=vals.length-1;
  var avg=vals.reduce(function(a,b){return a+b;},0)/vals.length;
  var d=vals.map(function(v,i){return(i===0?"M":"L")+xOf(i).toFixed(1)+","+yOf(v).toFixed(1);}).join(" ");
  var s='<path d="'+d+' L'+xOf(last).toFixed(1)+","+(pT+iH)+' L'+xOf(0).toFixed(1)+","+(pT+iH)+' Z" fill="'+color+'" fill-opacity="0.06"/>';
  s+='<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2"/>';
  var step=Math.max(1,Math.round(vals.length/6));
  vals.forEach(function(v,i){
    var isLast=i===last, showLbl=isLast||i%step===0;
    s+='<circle cx="'+xOf(i).toFixed(1)+'" cy="'+yOf(v).toFixed(1)+'" r="'+(isLast?3.5:2)+'" fill="'+color+'"/>';
    if(showLbl) s+='<text x="'+xOf(i).toFixed(1)+'" y="'+(yOf(v)-7).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?10.5:8)+'" font-weight="'+(isLast?800:600)+'" fill="'+color+'">'+fmtPct(v)+'</text>';
  });
  s+='<line x1="'+pL+'" y1="'+yOf(avg).toFixed(1)+'" x2="'+(pL+iW)+'" y2="'+yOf(avg).toFixed(1)+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,3"/>';
  [0,Math.floor(last/2),last].forEach(function(i){ s+='<text x="'+xOf(i).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle" font-size="8" fill="var(--muted)">'+esc(periods[i])+'</text>'; });
  var legend='<div class="legrow"><span class="legitem"><span class="sw" style="background:'+color+'"></span>'+esc(periods[last])+'</span><span class="legitem" style="color:var(--muted);">Média histórica: '+fmtPct(avg)+'</span></div>';
  var hdr='<div class="card-title">'+esc(title)+'</div>'+legend;
  return card(hdr+'<svg width="100%" viewBox="0 0 '+W+' '+H+'" style="overflow:visible">'+s+'</svg>','style="height:100%;"');
}
function baseVsEngajadaChart(ds){
  /* Fonte: ds.BACKLOG_CHART — val = coluna H, tot = coluna N, pct = coluna O.
     tot só existe depois do patch-getData.md; sem ele, deriva de val/pct. */
  var src=(ds && ds.BACKLOG_CHART) || [];
  var derived=false;
  var rows=[];
  for(var r=0;r<src.length;r++){
    var x=src[r];
    var pct=(x.pct==null)?null:Number(x.pct);
    var eng=Number(x.val)||0;
    var tot=(x.tot!=null&&Number(x.tot))?Number(x.tot):null;
    if(tot==null&&pct){ tot=eng/(pct/100); derived=true; }
    if(tot==null||pct==null||!isFinite(tot)||!eng) continue;
    rows.push({mes:String(x.mes||""),eng:eng,tot:tot,pct:pct});
  }
  if(rows.length<2){
    return card('<div class="card-title">Base engajada x base total</div>'+
      '<p style="font-size:11px;color:var(--muted);padding:16px 0;">Sem dados suficientes.</p>');
  }

  var n=rows.length, last=n-1, gid=uid();
  var W=760, pL=44, pR=56, pT=22, hA=200, gap=26, hB=78, xLbl=18;
  var yB0=pT+hA+gap;
  var H=yB0+hB+xLbl;
  var iW=W-pL-pR;
  var xAt=function(i){ return pL+(n===1?iW/2:(i/last)*iW); };

  /* ---------- painel A: volumes (eixo único, base zero, empilhado) ---------- */
  var maxTot=0;
  rows.forEach(function(d){ if(d.tot>maxTot) maxTot=d.tot; });
  var stepA=niceStep(maxTot/5);
  var maxA=maxTot*1.10;
  var yA=function(v){ return pT+hA-(v/maxA)*hA; };

  var s="";
  for(var g=0;g<=maxA;g+=stepA){
    var gy=yA(g).toFixed(1);
    s+='<line x1="'+pL+'" y1="'+gy+'" x2="'+(pL+iW)+'" y2="'+gy+'" stroke="var(--border)" stroke-width="1" '+(g===0?'':'stroke-dasharray="3,4"')+'/>';
    s+='<text x="'+(pL-8)+'" y="'+(yA(g)+3).toFixed(1)+'" text-anchor="end" font-size="8.5" fill="var(--muted)">'+fmtK(g)+'</text>';
  }

  var pathOf=function(get,dy){
    return rows.map(function(d,i){
      return (i===0?"M":"L")+xAt(i).toFixed(1)+","+(yA(get(d))+(dy||0)).toFixed(1);
    }).join(" ");
  };
  var engTop=pathOf(function(d){return d.eng;},0);
  var totTop=pathOf(function(d){return d.tot;},0);
  /* faixa superior (não engajadas): do topo do total até 2px acima do topo da engajada
     — os 2px são o spacer de superfície entre os dois preenchimentos */
  var engTopGap=rows.map(function(d,i){
    return xAt(last-i).toFixed(1)+","+(yA(rows[last-i].eng)-2).toFixed(1);
  }).join(" L");
  s+='<path d="'+totTop+' L'+engTopGap+' Z" fill="var(--blue-pale)" fill-opacity="0.14"/>';
  s+='<path d="'+engTop+' L'+xAt(last).toFixed(1)+","+yA(0).toFixed(1)+' L'+xAt(0).toFixed(1)+","+yA(0).toFixed(1)+' Z" fill="var(--blue)" fill-opacity="0.34"/>';
  s+='<path d="'+totTop+'" fill="none" stroke="var(--blue-pale)" stroke-width="2" stroke-linecap="round"/>';
  s+='<path d="'+engTop+'" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round"/>';

  [0,last].forEach(function(i){
    var d=rows[i], isLast=i===last, anchor=isLast?"end":"start", lx=xAt(i)+(isLast?0:4);
    s+='<circle cx="'+xAt(i).toFixed(1)+'" cy="'+yA(d.tot).toFixed(1)+'" r="'+(isLast?4:2.6)+'" fill="var(--blue-pale)" stroke="#fff" stroke-width="1.6"/>';
    s+='<circle cx="'+xAt(i).toFixed(1)+'" cy="'+yA(d.eng).toFixed(1)+'" r="'+(isLast?4:2.6)+'" fill="var(--blue)" stroke="#fff" stroke-width="1.6"/>';
    s+='<text x="'+lx.toFixed(1)+'" y="'+(yA(d.tot)-9).toFixed(1)+'" text-anchor="'+anchor+'" font-size="'+(isLast?12:9.5)+'" font-weight="'+(isLast?800:650)+'" fill="var(--ink2)">'+fmtK(d.tot)+'</text>';
    s+='<text x="'+lx.toFixed(1)+'" y="'+(yA(d.eng)-9).toFixed(1)+'" text-anchor="'+anchor+'" font-size="'+(isLast?12:9.5)+'" font-weight="'+(isLast?800:650)+'" fill="var(--blue)">'+fmtK(d.eng)+'</text>';
  });

  /* ---------- painel B: taxa de engajamento (escala própria, painel próprio) ---------- */
  var pcts=rows.map(function(d){return d.pct;});
  var pMin=Math.min.apply(null,pcts), pMax=Math.max.apply(null,pcts);
  var pRange=(pMax-pMin)||1, pPad=pRange*0.28;
  var yBf=function(v){ return yB0+hB-((v-(pMin-pPad))/(pRange+2*pPad))*hB; };
  var pAvg=pcts.reduce(function(a,b){return a+b;},0)/n;
  var fmtPct=function(v){ return v.toFixed(1).replace(".",",")+"%"; };

  var pPath=rows.map(function(d,i){ return (i===0?"M":"L")+xAt(i).toFixed(1)+","+yBf(d.pct).toFixed(1); }).join(" ");
  s+='<path d="'+pPath+' L'+xAt(last).toFixed(1)+","+(yB0+hB)+' L'+xAt(0).toFixed(1)+","+(yB0+hB)+' Z" fill="var(--green)" fill-opacity="0.06"/>';
  s+='<line x1="'+pL+'" y1="'+yBf(pAvg).toFixed(1)+'" x2="'+(pL+iW)+'" y2="'+yBf(pAvg).toFixed(1)+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,3"/>';
  s+='<text x="'+(pL+iW+6)+'" y="'+(yBf(pAvg)+3).toFixed(1)+'" font-size="8.5" fill="var(--muted)">méd '+fmtPct(pAvg)+'</text>';
  s+='<path d="'+pPath+'" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round"/>';

  var iMin=0, iMax=0;
  rows.forEach(function(d,i){ if(d.pct<rows[iMin].pct) iMin=i; if(d.pct>rows[iMax].pct) iMax=i; });
  var pLabel={}; pLabel[0]=true; pLabel[last]=true; pLabel[iMin]=true; pLabel[iMax]=true;
  rows.forEach(function(d,i){
    var isLast=i===last;
    if(!pLabel[i] && !isLast) return;
    s+='<circle cx="'+xAt(i).toFixed(1)+'" cy="'+yBf(d.pct).toFixed(1)+'" r="'+(isLast?3.8:2.4)+'" fill="var(--green)" stroke="#fff" stroke-width="1.4"/>';
    s+='<text x="'+xAt(i).toFixed(1)+'" y="'+(yBf(d.pct)-8).toFixed(1)+'" text-anchor="'+(i===0?"start":isLast?"end":"middle")+'" font-size="'+(isLast?11:9)+'" font-weight="'+(isLast?800:650)+'" fill="var(--green)">'+fmtPct(d.pct)+'</text>';
  });
  s+='<text x="'+(pL-8)+'" y="'+(yB0+12)+'" text-anchor="end" font-size="8" fill="var(--muted)">taxa</text>';

  /* ---------- eixo X compartilhado ---------- */
  var xStep=Math.max(1,Math.round(n/6));
  var minGap=48; /* largura do rótulo final (~22u) + meia largura do tick (~11u) + folga; evita o último rótulo colidir com o penúltimo tick */
  rows.forEach(function(d,i){
    if(i!==last && (i%xStep!==0 || (xAt(last)-xAt(i))<minGap)) return;
    s+='<text x="'+xAt(i).toFixed(1)+'" y="'+(H-4)+'" text-anchor="'+(i===0?"start":i===last?"end":"middle")+'" font-size="8" fill="var(--muted)">'+esc(d.mes)+'</text>';
  });

  /* ---------- crosshair cobrindo os dois painéis ---------- */
  s+='<line id="'+gid+'_vl" x1="0" y1="'+pT+'" x2="0" y2="'+(yB0+hB)+'" stroke="var(--muted)" stroke-width="1" opacity="0"/>';
  s+='<rect id="'+gid+'_hit" x="'+pL+'" y="'+pT+'" width="'+iW+'" height="'+(yB0+hB-pT)+'" fill="transparent"/>';

  /* ---------- cabeçalho, KPIs, legenda ---------- */
  var cur=rows[last], prev=rows[last-1];
  var dPp=cur.pct-prev.pct;
  var dEng=cur.eng-prev.eng;
  var dTot=cur.tot-prev.tot;
  var naoEng=cur.tot-cur.eng;

  var kpi=function(lbl,val,color,sub){
    return '<div style="min-width:104px;"><div class="stat-lbl">'+esc(lbl)+'</div>'+
      '<div style="font-size:21px;font-weight:800;color:'+color+';letter-spacing:-.01em;margin-top:2px;">'+val+'</div>'+
      '<div style="font-size:10.5px;color:var(--muted);margin-top:1px;">'+sub+'</div></div>';
  };
  var kpiRow='<div style="display:flex;gap:22px;flex-wrap:wrap;margin:8px 0 14px;padding-bottom:12px;border-bottom:1px solid var(--border);">'+
    kpi("Base total",fmtN(cur.tot),"var(--ink)",esc(cur.mes)+" · "+fmtSigned(dTot)+" vs "+esc(prev.mes))+
    kpi("Base engajada",fmtN(cur.eng),"var(--blue)",esc(cur.mes)+" · "+fmtSigned(dEng)+" vs "+esc(prev.mes))+
    kpi("Não engajadas",fmtN(naoEng),"var(--ink2)",(100-cur.pct).toFixed(1).replace(".",",")+"% da base")+
    kpi("Taxa de engajamento",fmtPct(cur.pct),dPp>=0?"var(--green)":"var(--red)",
        (dPp>0?"+":dPp<0?"−":"")+Math.abs(dPp).toFixed(1).replace(".",",")+" p.p. vs "+esc(prev.mes))+
    '</div>';

  var legend='<div class="legrow">'+
    '<span class="legitem"><span class="sw" style="background:var(--blue)"></span>Base engajada</span>'+
    '<span class="legitem"><span class="sw" style="background:var(--blue-pale);opacity:.55"></span>Não engajadas</span>'+
    '<span class="legitem"><span class="swline" style="background:var(--blue-pale)"></span>Base total (topo da pilha)</span>'+
    '<span class="legitem"><span class="swline" style="background:var(--green)"></span>Taxa de engajamento (painel inferior)</span>'+
    '</div>';

  var tipHtml=rows.map(function(d){
    return '<div style="font-weight:700;margin-bottom:4px;">'+esc(d.mes)+'</div>'+
      '<div>Base total: <b>'+Math.round(d.tot).toLocaleString("pt-BR")+'</b></div>'+
      '<div>Base engajada: <b>'+Math.round(d.eng).toLocaleString("pt-BR")+'</b></div>'+
      '<div>Não engajadas: <b>'+Math.round(d.tot-d.eng).toLocaleString("pt-BR")+'</b></div>'+
      '<div>Taxa: <b>'+d.pct.toFixed(2).replace(".",",")+'%</b></div>';
  });

  scripts.push("(function(){"+
    "var hit=document.getElementById('"+gid+"_hit');"+
    "var vl=document.getElementById('"+gid+"_vl');"+
    "var tip=document.getElementById('"+gid+"_tip');"+
    "if(!hit||!vl||!tip) return;"+
    "var tips="+JSON.stringify(tipHtml)+";"+
    "var pL="+pL+",iW="+iW+",n="+n+",W="+W+";"+
    "function xAt(i){return pL+(n===1?iW/2:(i/(n-1))*iW);}"+
    "hit.addEventListener('mousemove',function(e){"+
    "  var rect=hit.closest('svg').getBoundingClientRect();"+
    "  var px=(e.clientX-rect.left)*(W/rect.width);"+
    "  var i=Math.round(((px-pL)/iW)*(n-1)); i=Math.max(0,Math.min(n-1,i));"+
    "  vl.setAttribute('x1',xAt(i));vl.setAttribute('x2',xAt(i));vl.setAttribute('opacity','1');"+
    "  tip.innerHTML=tips[i];tip.style.display='block';"+
    "  var pct=(xAt(i)-pL)/iW;"+
    "  tip.style.left=Math.min(80,Math.max(0,pct*100))+'%';tip.style.top='10px';"+
    "});"+
    "hit.addEventListener('mouseleave',function(){vl.setAttribute('opacity','0');tip.style.display='none';});"+
    "})();");

  var hdr='<div class="card-hd"><div>'+
    '<div class="card-title">Base engajada x base total — fim de mês</div>'+
    '<div class="card-sub">'+esc(rows[0].mes)+' – '+esc(cur.mes)+' · empilhado: engajadas + não engajadas = base total</div>'+
    '</div></div>';
  var body='<svg width="100%" viewBox="0 0 '+W+' '+H+'" style="overflow:visible">'+s+'</svg>'+
    '<div class="tip" id="'+gid+'_tip"></div>';
  var cap='<div style="font-size:10.5px;color:var(--muted);margin-top:8px;">'+
    'Passe o mouse para ver base, não engajadas e taxa do mês. Base consolidada — não muda com o filtro de gerente/coordenador.'+
    (derived?' Base total estimada a partir de engajadas ÷ taxa (±~50 licenças por arredondamento da taxa).':'')+
    '</div>';

  return card(hdr+kpiRow+legend+body+cap);
}
function dualLineMomChart(ds){
  var m=ds.M12;
  var eng=m.map(function(x){return x.novas_gen+x.reeng;});
  var des=m.map(function(x){return x.deseng+x.cancel;});
  var periods=m.map(function(x){return x.label;});
  var W=340,H=190,pL=8,pR=8,pT=18,pB=22,iW=W-pL-pR,iH=H-pT-pB;
  var allV=eng.concat(des);
  var min=Math.min.apply(null,allV),max=Math.max.apply(null,allV);
  var range=(max-min)||1,padv=range*0.15||1;
  var yOf=function(v){return pT+iH-((v-(min-padv))/(range+2*padv))*iH;};
  var xOf=function(i){return pL+(i/(eng.length-1))*iW;};
  var last=eng.length-1;
  function line(vals,color){
    var d=vals.map(function(v,i){return(i===0?"M":"L")+xOf(i).toFixed(1)+","+yOf(v).toFixed(1);}).join(" ");
    var s='<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2"/>';
    var step=Math.max(1,Math.round(vals.length/5));
    vals.forEach(function(v,i){
      var isLast=i===last, showLbl=isLast||i%step===0;
      s+='<circle cx="'+xOf(i).toFixed(1)+'" cy="'+yOf(v).toFixed(1)+'" r="'+(isLast?3.5:2)+'" fill="'+color+'"/>';
      if(showLbl) s+='<text x="'+xOf(i).toFixed(1)+'" y="'+(yOf(v)-7).toFixed(1)+'" text-anchor="middle" font-size="'+(isLast?10:7.5)+'" font-weight="700" fill="'+color+'">'+fmtK(v)+'</text>';
    });
    return s;
  }
  var s=line(des,"var(--red)")+line(eng,"var(--blue)");
  [0,Math.floor(last/2),last].forEach(function(i){ s+='<text x="'+xOf(i).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle" font-size="8" fill="var(--muted)">'+esc(periods[i])+'</text>'; });
  var legend='<div class="legrow">'+
    '<span class="legitem"><span class="sw" style="background:var(--blue)"></span>Engajadas '+fmtK(eng[last])+'</span>'+
    '<span class="legitem"><span class="sw" style="background:var(--red)"></span>Desengajadas '+fmtK(des[last])+'</span></div>';
  var hdr='<div class="card-title">Engajadas x Desengajadas MoM</div>'+legend;
  return card(hdr+'<svg width="100%" viewBox="0 0 '+W+' '+H+'" style="overflow:visible">'+s+'</svg>','style="height:100%;"');
}




var CURRENT_DS=null;
function buildAll(ds){
  CURRENT_DS=ds;
  scripts=[];
  var h="";
  h+=buildKpiRow(ds);

  h+='<div class="section"><div class="row-60-40">'+mtdChart(ds)+ngelWowChart(ds)+'</div></div>';

  h+='<div class="section"><div class="row-50-50">'+
    engVsDesengChart(ds,"Engajadas x Desengajadas — "+ds.W12.length+" semanas",ds.W12,function(x){return x.novas_gen+x.reeng;},function(x){return x.deseng+x.cancel;},function(x){return x.label;})+
    dailyChart(ds)+
    '</div></div>';

  h+='<div class="section" id="sec-composicao"><div class="section-hd"><div class="section-title">Composição e detalhe</div><div class="section-sub">Clique nas categorias para filtrar o tipo de movimento.</div></div>'+
    '<div id="sec-composicao-inner">'+buildComposicao(ds)+'</div></div>';

  h+='<div class="section" id="sec-coordenadores"><div class="row-50-50">'+waterfallCard(ds)+coordTable(ds)+'</div></div>';

  h+='<div class="section"><div class="section-hd">'+
     '<div class="section-title">Base e engajamento</div>'+
     '<div class="section-sub">Fim de mês · base consolidada</div></div>'+
     baseVsEngajadaChart(ds)+'</div>';

  h+='<div class="section"><div class="section-hd"><div class="section-title">Taxas e engajamento MoM</div></div><div class="row-33">'+
    rateLineChart("Taxa de engajamento mensal",(ds.TAXA_ENG_MENSAL||[]).map(function(x){return x.mes;}),(ds.TAXA_ENG_MENSAL||[]).map(function(x){return x.taxa;}),"var(--blue)",function(v){return v.toFixed(1).replace(".",",")+"%";})+
    rateLineChart("Taxa de desengajamento mensal",(ds.MOM_CHART||[]).map(function(x){return x.mes;}),(ds.MOM_CHART||[]).map(function(x){return x.taxa;}),"var(--red)",function(v){return v.toFixed(1).replace(".",",")+"%";})+
    dualLineMomChart(ds)+
    '</div></div>';

  document.getElementById("content").innerHTML=h;
  document.getElementById("sf-period").textContent=document.getElementById("hdr-period").textContent;
  document.getElementById("sf-updated").textContent=document.getElementById("hdr-updated").textContent.replace(/^Atualizado em /,"");
  for(var i=0;i<scripts.length;i++){ try{ eval(scripts[i]); }catch(e){ console.error(e); } }
}
function setFilter(key,el){
  document.querySelectorAll(".fbtn").forEach(function(b){b.classList.remove("active");});
  el.classList.add("active");
  var src;
  if(key==="todos") src=RAW;
  else if(key==="gerentes") src=RAW.GERENTES;
  else { var idx=parseInt(key.replace("coord_","")); src=RAW.COORD_METRICS[RAW.COORDS[idx]]; }
  buildAll(Object.assign({}, RAW, src, {COORD_RANKING: RAW.COORD_RANKING, COORD_RANKING_M: RAW.COORD_RANKING_M}));
}
window.toggleComp=toggleComp;
buildAll(RAW);`;
}
