const fs=require('fs');
const sheet=JSON.parse(fs.readFileSync('ngel_sheet.json','utf8'));

// ---- EX_NGEL_Diario sintético: jan/25 .. ago/26, 4 coordenadores
const COORDS=["Lilian Regina Santi","Paola Pagangrizo","Greiciane Fagundes","João Vitor"];
const diario=[["hdr","data","time","novas","novas_gen","reeng","canceladas","deseng","ngel","nunca"]];
let t=0;
for(let d=new Date(2025,0,1); d<=new Date(2026,7,31); d.setDate(d.getDate()+1)){
  for(const c of COORDS){
    const novas=30+(t%11), gen=7+(t%5), reeng=novas-gen;
    const canc=-(6+(t%4)), des=-(14+(t%7));
    diario.push([null,new Date(d),c,novas,gen,reeng,canc,des,novas+canc+des,0]);
    t++;
  }
}
const ngelRows=[["Mes","backlog_begin_month","c","d","e","f","ngaa","backlog_end_month","i","j","k","l","m","Subscribers","% engajadas"]]
  .concat(sheet.map(r=>[r.A,r.B,0,0,0,0,0,r.H,0,0,0,0,0,r.N,r.O]));

const mkSheet=v=>({getDataRange:()=>({getValues:()=>v}),getName:()=>"x"});
global.SpreadsheetApp={
  getActiveSpreadsheet:()=>({getSheetByName:n=>n==="EX_NGEL_Diario"?mkSheet(diario):null}),
  openById:()=>({getName:()=>"Levantamento NGEL",getSheets:()=>[{getName:()=>"NGEL"}],
    getSheetByName:n=>n==="NGEL"?mkSheet(ngelRows):null})
};
const MM=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
global.Utilities={formatDate:(dt,tz,f)=>{
  const p=n=>String(n).padStart(2,"0");
  if(f==="yyyy-MM-dd") return dt.getFullYear()+"-"+p(dt.getMonth()+1)+"-"+p(dt.getDate());
  return p(dt.getDate())+"/"+p(dt.getMonth()+1)+"/"+dt.getFullYear()+" "+p(dt.getHours())+":"+p(dt.getMinutes());
}};
global.Logger={log:()=>{}};
global.HtmlService={XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:h=>({setTitle(){return this},setXFrameOptionsMode(){return this},_h:h})};

eval(fs.readFileSync('/home/user/CRM-Parceiros-MVP/apps-script/dashboard-ngel/src/Codigo.js','utf8'));

const data=getData();
const bc=data.BACKLOG_CHART;
console.log("BACKLOG_CHART: "+bc.length+" meses");
console.log("primeiro:", JSON.stringify(bc[0]));
console.log("último:  ", JSON.stringify(bc[bc.length-1]));
const semTot=bc.filter(x=>!x.tot);
console.log("meses sem tot: "+semTot.length+(semTot.length?" <-- FALHA":" (ok)"));
const html=buildHTML(data);
fs.writeFileSync('dashboard_full.html',html);
console.log("HTML: "+html.length+" bytes");
console.log("seção nova presente: "+(html.indexOf("Base engajada x base total")>-1));
console.log("aviso de estimativa: "+(html.indexOf("estimada a partir")>-1?"APARECE <-- não deveria":"ausente (ok)"));
