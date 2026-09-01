/**
 * Dashboard NGEL — leitura da base de engajamento direto da planilha.
 *
 * Planilha: "Levantamento NGEL" (1vWOk-AL0Vs9zBOUc6f4jZi7kawk9-8sxPed4cPMNuEs)
 * Aba:      "NGEL"  (atenção: existe também "NGEL - Com Substituição" — não é essa)
 * Colunas:  A = Mes
 *           H = backlog_end_month  -> base engajada no fim do mês
 *           N = Subscribers        -> base total no fim do mês
 *           O = % engajadas        -> taxa de engajamento
 *
 * COMO LIGAR: cole este arquivo no projeto e acrescente uma linha ao objeto que o
 * `getData` já retorna:
 *
 *     BASE_NGEL: getBaseNGEL_(),
 *
 * `baseVsEngajadaChart` passa a usar esses números e para de derivar a base total.
 *
 * OBS: se o `getData` já abre essa mesma planilha, reaproveite o handle existente
 * em vez de chamar openById de novo — cada openById é uma leitura a mais.
 */
var NGEL_SS_ID = "1vWOk-AL0Vs9zBOUc6f4jZi7kawk9-8sxPed4cPMNuEs";
var NGEL_ABA   = "NGEL";

/** Colunas (1-based) da aba NGEL. */
var NGEL_COL = { MES: 1, BACKLOG_END: 8, SUBSCRIBERS: 14, PCT_ENGAJADAS: 15 };

function getBaseNGEL_() {
  var sh = SpreadsheetApp.openById(NGEL_SS_ID).getSheetByName(NGEL_ABA);
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  var vals = sh.getRange(2, 1, lastRow - 1, NGEL_COL.PCT_ENGAJADAS).getValues();
  var out = [];

  for (var i = 0; i < vals.length; i++) {
    var row = vals[i];
    var mes = ngelMesLabel_(row[NGEL_COL.MES - 1]);
    var eng = Number(row[NGEL_COL.BACKLOG_END - 1]);
    var tot = Number(row[NGEL_COL.SUBSCRIBERS - 1]);
    var pct = Number(row[NGEL_COL.PCT_ENGAJADAS - 1]);

    if (!mes || !isFinite(eng) || !eng || !isFinite(tot) || !tot) continue;

    /* Célula formatada como porcentagem chega como fração (0,7455). O corte em 1,5
       é seguro aqui porque a taxa histórica vive na faixa de 67–75%; se algum dia a
       coluna puder valer menos de 1,5%, troque por uma checagem de formato. */
    if (!isFinite(pct) || !pct) pct = (eng / tot) * 100;
    else if (pct <= 1.5) pct = pct * 100;

    out.push({
      mes: mes,
      eng: Math.round(eng),
      tot: Math.round(tot),
      pct: Math.round(pct * 100) / 100
    });
  }
  return out;
}

/** "jan./25" (ou uma Date) -> "Jan/25", que é o rótulo usado nos eixos do dashboard. */
function ngelMesLabel_(v) {
  if (v instanceof Date) {
    var M = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return M[v.getMonth()] + "/" + String(v.getFullYear()).slice(-2);
  }
  var s = String(v == null ? "" : v).trim().replace(/\./g, "");
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
