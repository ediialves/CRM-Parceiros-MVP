/**
 * Dashboard NGEL — gráfico "Base engajada x base total (fim de mês) + taxa de engajamento"
 *
 * COMO INSTALAR (2 passos, dentro do Apps Script do dashboard):
 *
 * 1) Cole a função `baseVsEngajadaChart` abaixo junto das outras funções de gráfico
 *    geradas por `buildJS` (ao lado de `rateLineChart` / `dualLineMomChart`).
 *
 * 2) Em `buildAll(ds)`, adicione a seção. Sugestão: logo ANTES da seção
 *    "Taxas e engajamento MoM", porque ela dá o contexto de volume que as duas
 *    linhas de taxa daquela seção não têm:
 *
 *      h+='<div class="section"><div class="section-hd">'+
 *         '<div class="section-title">Base e engajamento</div>'+
 *         '<div class="section-sub">Fim de mês · base consolidada</div></div>'+
 *         baseVsEngajadaChart(ds)+'</div>';
 *
 * DADOS: `ds.BASE_NGEL` — [{mes, eng, tot, pct}] vindo da planilha "Levantamento NGEL",
 * aba `NGEL`, colunas H (backlog_end_month), N (Subscribers) e O (% engajadas).
 * Ver `getBaseNGEL.gs` neste diretório: cole a função no projeto e acrescente
 * `BASE_NGEL: getBaseNGEL_(),` ao objeto que o `getData` retorna.
 *
 * Enquanto isso não estiver ligado, a função cai para `ds.BACKLOG_CHART` e deriva a
 * base total de val/(pct/100), exibindo aviso de estimativa no rodapé do card.
 *
 * Depende só de helpers que já existem: card, esc, uid, fmtN, fmtK, fmtSigned,
 * niceStep e o array `scripts` (padrão de hover do mtdChart).
 */
function baseVsEngajadaChart(ds){
  /* Fonte: ds.BASE_NGEL (planilha Levantamento NGEL, aba NGEL, colunas H/N/O).
     Cai para BACKLOG_CHART, derivando a base total, só enquanto getBaseNGEL_
     não estiver ligado no getData. */
  var src=(ds && ds.BASE_NGEL && ds.BASE_NGEL.length) ? ds.BASE_NGEL : ((ds && ds.BACKLOG_CHART) || []);
  var derived=false;
  var rows=[];
  for(var r=0;r<src.length;r++){
    var x=src[r];
    var pct=(x.pct==null)?null:Number(x.pct);
    var eng=Number(x.eng!=null?x.eng:x.val)||0;
    var tot=(x.tot!=null)?Number(x.tot):((x.total!=null)?Number(x.total):null);
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
