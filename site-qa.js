"use strict";
const $=id=>document.getElementById(id);
const categories=[
 ["headings","Headings"],["divitis","Divitis"],["images","Images"],["writing","Writing"],
 ["classes","Client-First"],["links","Links"],["gsap","GSAP"],["performance","Performance"]
];
const viewportOptions=[1920,1440,1280,992,991,767,479,375,320];
let controller=null,lastReport=null,lastConfig=null,serviceConnected=false;
const endpointInput=$("endpoint");
endpointInput.value=localStorage.getItem("siteQaEndpoint")||"http://localhost:8787";
categories.forEach(([value,label],i)=>{
 const wrap=document.createElement("label");wrap.className="chip";
 const input=document.createElement("input");input.type="checkbox";input.value=value;input.checked=i<6;
 wrap.append(input,document.createTextNode(label));$("categories").append(wrap);
});
viewportOptions.forEach((value,i)=>{
 const wrap=document.createElement("label");wrap.className="chip";
 const input=document.createElement("input");input.type="checkbox";input.value=value;input.checked=[1440,991,767,375].includes(value);
 wrap.append(input,document.createTextNode(value+" px"));$("viewports").append(wrap);
});
function selected(container){return [...container.querySelectorAll("input:checked")].map(x=>x.value)}
function updateMode(){
 const full=$("mode").value==="full";
 [...$("categories").querySelectorAll("input")].forEach(input=>{
  if(["gsap","performance"].includes(input.value))input.checked=full;
 });
 updateCount();
}
function updateCount(){
 const urls=$("scope").value==="manual"?Math.max(1,$("manualUrls").value.split(/\r?\n/).filter(Boolean).length):1;
 $("testCount").textContent=selected($("viewports")).length+" viewport(s) selected · at least "+(selected($("viewports")).length*urls)+" page/viewport test(s). Viewport emulation is not a physical-device or cross-browser test; the service reports the browser it actually used.";
}
$("mode").addEventListener("change",updateMode);
$("scope").addEventListener("change",()=>{$("manualWrap").classList.toggle("hidden",$("scope").value!=="manual");updateCount()});
$("manualUrls").addEventListener("input",updateCount);
$("viewports").addEventListener("change",updateCount);
endpointInput.addEventListener("change",()=>{localStorage.setItem("siteQaEndpoint",endpointInput.value.replace(/\/+$/,""));checkHealth()});
function endpoint(path=""){return endpointInput.value.trim().replace(/\/+$/,"")+path}
async function checkHealth(){
 $("serviceState").textContent="Checking…";$("serviceDot").className="dot";$("serviceHelp").classList.add("hidden");serviceConnected=false;
 const ep=endpoint();
 const mixed=location.protocol==="https:"&&/^http:\/\//i.test(ep);
 try{
  if(mixed)throw new Error("HTTPS frontend cannot connect to an HTTP audit service.");
  const res=await fetch(endpoint("/health"),{signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Error("HTTP "+res.status);
  const data=await res.json();serviceConnected=true;$("serviceState").textContent="Connected · "+(data.browser||"browser service");$("serviceDot").className="dot ok";
 }catch(error){
  $("serviceState").textContent="Not connected";$("serviceDot").className="dot bad";$("serviceHelp").classList.remove("hidden");
  $("serviceHelp").innerHTML='<div class="small"><strong>Audit service unavailable.</strong> '+(mixed?'This page is running over HTTPS, so the browser will not connect to an HTTP endpoint such as localhost. Deploy the Playwright service to an HTTPS URL, or run both the frontend and service locally over HTTP.':'Start the Playwright service and verify the Service endpoint. The frontend cannot audit external DOMs without it.')+'</div>';
 }
 return serviceConnected;
}
function csvSafe(value){
 let s=String(value??"").replace(/"/g,'""');
 if(/^[=+\-@]/.test(s))s="'"+s;
 return '"'+s+'"';
}
function download(name,type,content){
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function buildConfig(){
 const target=$("target").value.trim();
 const vps=selected($("viewports")).map(Number);
 const cats=selected($("categories"));
 if(!target)throw Error("Enter a target URL.");
 if(!vps.length)throw Error("Select at least one viewport.");
 if(!cats.length)throw Error("Select at least one category.");
 return {
  target,scope:$("scope").value,mode:$("mode").value,
  manualUrls:$("manualUrls").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),
  include:$("include").value.split(",").map(x=>x.trim()).filter(Boolean),
  exclude:$("exclude").value.split(",").map(x=>x.trim()).filter(Boolean),
  limit:Number($("limit").value)||50,english:$("english").value,
  dictionary:$("dictionary").value.split(",").map(x=>x.trim()).filter(Boolean),
  categories:cats,viewports:vps
 };
}
function setRunning(on){
 $("start").disabled=on;$("cancel").disabled=!on;$("rerun").disabled=on||!lastConfig;
}
function status(text){$("status").textContent=text}
function updateSummary(meta={}){
 ["discovered","analyzed","skipped","failed"].forEach(k=>$(k).textContent=meta[k]??0);
 const findings=(lastReport?.pages||[]).flatMap(p=>p.findings||[]);
 $("issues").textContent=findings.length;
 const total=Math.max(1,meta.discovered||0);
 $("progress").style.width=Math.min(100,Math.round(((meta.analyzed||0)+(meta.skipped||0)+(meta.failed||0))/total*100))+"%";
}
function render(){
 if(!lastReport)return;
 $("report").hidden=false;
 updateSummary(lastReport.meta);
 const allFindings=lastReport.pages.flatMap(p=>(p.findings||[]).map(f=>({...f,pageUrl:p.url,pageTitle:p.title,browser:p.browser})));
 const category=$("filterCategory").value,severity=$("filterSeverity").value,viewport=$("filterViewport").value;
 const filtered=allFindings.filter(f=>(!category||f.category===category)&&(!severity||f.severity===severity)&&(!viewport||String(f.viewport)===viewport));
 const out=$("results");out.replaceChildren();
 if(!filtered.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=allFindings.length?"No findings match the current filters.":"No findings were returned for the executed checks.";out.append(empty);return}
 filtered.forEach(f=>{
  const card=document.createElement("article");card.className="page-result";
  const head=document.createElement("div");head.className="page-head";
  const left=document.createElement("div");const u=document.createElement("div");u.className="page-url";u.textContent=f.pageUrl;
  const meta=document.createElement("div");meta.className="page-meta";meta.textContent=[f.category,f.rule,f.viewport?f.viewport+"px":null,f.classification].filter(Boolean).join(" · ");left.append(u,meta);
  const open=document.createElement("a");open.className="btn";open.href=f.pageUrl;open.target="_blank";open.rel="noopener";open.textContent="Open Page";head.append(left,open);
  const body=document.createElement("div");body.className="finding";
  const badge=document.createElement("span");badge.className="badge "+(f.severity||"info");badge.textContent=f.severity||"info";
  const detail=document.createElement("div");const h=document.createElement("h3");h.textContent=f.title||f.rule||"Finding";detail.append(h);
  if(f.explanation){const p=document.createElement("p");p.textContent=f.explanation;detail.append(p)}
  if(f.selector){const p=document.createElement("p");p.textContent="Selector: "+f.selector;detail.append(p)}
  if(f.evidence){const pre=document.createElement("div");pre.className="evidence";pre.textContent=typeof f.evidence==="string"?f.evidence:JSON.stringify(f.evidence,null,2);detail.append(pre)}
  if(f.recommendation){const p=document.createElement("p");p.textContent="Recommendation: "+f.recommendation;detail.append(p)}
  if(f.confidence){const p=document.createElement("p");p.textContent="Confidence: "+f.confidence;detail.append(p)}
  body.append(badge,detail);card.append(head,body);out.append(card);
 });
}
function refreshFilters(){
 const findings=(lastReport?.pages||[]).flatMap(p=>p.findings||[]);
 const cats=[...new Set(findings.map(f=>f.category).filter(Boolean))].sort();
 const vps=[...new Set(findings.map(f=>f.viewport).filter(Boolean))].sort((a,b)=>a-b);
 $("filterCategory").innerHTML='<option value="">All categories</option>'+cats.map(x=>'<option>'+x+'</option>').join("");
 $("filterViewport").innerHTML='<option value="">All viewports</option>'+vps.map(x=>'<option value="'+x+'">'+x+' px</option>').join("");
}
async function runAudit(config){
 controller=new AbortController();setRunning(true);lastReport={meta:{discovered:0,analyzed:0,skipped:0,failed:0},pages:[],skipped:[],failed:[],config,startedAt:new Date().toISOString()};
 $("report").hidden=false;updateSummary(lastReport.meta);$("results").replaceChildren();status("Connecting to audit service…");
 try{
  const res=await fetch(endpoint("/audit"),{method:"POST",headers:{"content-type":"application/json","accept":"application/x-ndjson"},body:JSON.stringify(config),signal:controller.signal});
  if(!res.ok)throw Error((await res.text())||("HTTP "+res.status));
  const reader=res.body.getReader(),decoder=new TextDecoder();let buffer="";
  while(true){
   const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
   const lines=buffer.split("\n");buffer=lines.pop();
   for(const line of lines){if(!line.trim())continue;const ev=JSON.parse(line);
    if(ev.type==="start"||ev.type==="progress"){lastReport.meta={...lastReport.meta,...ev.meta};status(ev.message||"Auditing…");updateSummary(lastReport.meta)}
    if(ev.type==="page"){lastReport.pages.push(ev.page);lastReport.meta={...lastReport.meta,...ev.meta};status("Analyzed "+ev.page.url);updateSummary(lastReport.meta);refreshFilters();render()}
    if(ev.type==="skipped"){lastReport.skipped.push(ev.item);lastReport.meta={...lastReport.meta,...ev.meta};updateSummary(lastReport.meta)}
    if(ev.type==="failed"){lastReport.failed.push(ev.item);lastReport.meta={...lastReport.meta,...ev.meta};updateSummary(lastReport.meta)}
    if(ev.type==="done"){lastReport.meta={...lastReport.meta,...ev.meta};lastReport.finishedAt=new Date().toISOString();status(ev.message||"Audit complete.");updateSummary(lastReport.meta)}
   }
  }
  refreshFilters();render();
 }catch(error){
   if(error.name==="AbortError")status("Audit cancelled.");
   else if(error instanceof TypeError&&/fetch/i.test(error.message))status("Audit service connection failed. Check the Service endpoint, HTTPS/CORS configuration, and whether the Playwright service is running.");
   else status("Audit failed: "+error.message);
 }
 finally{controller=null;setRunning(false)}
}
$("start").addEventListener("click",async()=>{
 try{
  lastConfig=buildConfig();
  const connected=await checkHealth();
  if(!connected){
   const ep=endpoint();
   const mixed=location.protocol==="https:"&&/^http:\/\//i.test(ep);
   status(mixed
    ?"Audit cannot start: GitHub Pages is HTTPS, but the audit service is HTTP. Use a deployed HTTPS service endpoint or run the toolkit locally."
    :"Audit cannot start: the Playwright audit service is not connected. Start or deploy the service, then try again.");
   return;
  }
  runAudit(lastConfig);
 }catch(e){status(e.message)}
});
$("rerun").addEventListener("click",()=>lastConfig&&runAudit(lastConfig));
$("cancel").addEventListener("click",()=>controller?.abort());
["filterCategory","filterSeverity","filterViewport"].forEach(id=>$(id).addEventListener("change",render));
$("exportJson").addEventListener("click",()=>lastReport&&download("site-qa-report.json","application/json",JSON.stringify(lastReport,null,2)));
$("exportCsv").addEventListener("click",()=>{
 if(!lastReport)return;
 const rows=[["category","rule","severity","classification","url","viewport","selector","evidence","recommendation"]];
 lastReport.pages.forEach(p=>(p.findings||[]).forEach(f=>rows.push([f.category,f.rule,f.severity,f.classification,p.url,f.viewport||"",f.selector||"",typeof f.evidence==="string"?f.evidence:JSON.stringify(f.evidence||""),f.recommendation||""])));
 download("site-qa-findings.csv","text/csv;charset=utf-8",rows.map(r=>r.map(csvSafe).join(",")).join("\n"));
});
checkHealth();updateCount();