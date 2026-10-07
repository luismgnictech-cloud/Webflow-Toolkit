"use strict";

const CLIENT_ID="766686827896-8h8ct9f3fo9gsenl0867r8cct9ehp86t.apps.googleusercontent.com";
const DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER_NAME="Webflow Toolkit";
const DRIVE_FILE_NAME="prompt-library.json";
const MIME_FOLDER="application/vnd.google-apps.folder";
const MIME_JSON="application/json";
const MAX_API_REQUESTS_PER_SESSION=1000;
const CATEGORIES=["Webflow","Framer","HTML","CSS","JavaScript","Ocio","General"];
const $=id=>document.getElementById(id);

let prompts=[];
let editingId=null;
let toastTimer=null;
let tokenClient=null;
let accessToken="";
let tokenExpiresAt=0;
let folderId="";
let dataFileId="";
let apiRequestCount=0;
let syncing=false;
let initialized=false;
let syncChain=Promise.resolve();

function now(){return new Date().toISOString()}
function latest(prompt){return prompt.versions[prompt.versions.length-1]}
function formatDate(value){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}
function notify(text){const el=$("toast");el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2600)}
function setDriveState(state,note=""){
 const panel=$("drivePanel");
 panel.classList.toggle("is-connected",state==="connected");
 panel.classList.toggle("is-error",state==="error");
 const labels={disconnected:"Google Drive · Not connected",connecting:"Google Drive · Connecting…",connected:"Google Drive · Connected",syncing:"Google Drive · Syncing…",error:"Google Drive · Attention required"};
 $("driveStatus").textContent=labels[state]||labels.disconnected;
 $("driveNote").textContent=note||(
  state==="connected"?"Online library loaded from Drive.":
  state==="syncing"?"Saving changes to Drive…":
  state==="error"?"Drive could not be reached.":
  "Connect your Google account to load your online prompt library."
 );
 const connected=state==="connected"||state==="syncing";
 $("connectDrive").hidden=connected;
 $("syncDrive").hidden=!connected;
 $("disconnectDrive").hidden=!connected;
 $("newPrompt").disabled=!connected||syncing;
}
function disableForQuota(message){
 accessToken="";
 tokenExpiresAt=0;
 setDriveState("error",message+" Writes are stopped to avoid repeated quota requests.");
 notify("Drive quota guard activated");
}
function countRequest(){
 apiRequestCount++;
 if(apiRequestCount>MAX_API_REQUESTS_PER_SESSION){
  disableForQuota("This session reached the app's internal request safety limit.");
  throw new Error("Internal Drive request safety limit reached.");
 }
}
function driveErrorMessage(data,status){
 const reason=data?.error?.errors?.[0]?.reason||data?.error?.status||"";
 if(/quota|rateLimit|dailyLimit|userRateLimit/i.test(reason)||status===429){
  disableForQuota("Google Drive reported a quota or rate limit.");
 }
 return data?.error?.message||("Google Drive request failed ("+status+").");
}
async function requestToken(prompt=""){
 if(!tokenClient)throw new Error("Google Identity Services is not ready yet.");
 return new Promise((resolve,reject)=>{
  tokenClient.callback=response=>{
   if(response.error){reject(new Error(response.error_description||response.error));return}
   accessToken=response.access_token;
   tokenExpiresAt=Date.now()+Math.max(60,(Number(response.expires_in)||3600)-60)*1000;
   resolve(accessToken);
  };
  tokenClient.requestAccessToken({prompt});
 });
}
async function ensureToken(interactive=false){
 if(accessToken&&Date.now()<tokenExpiresAt)return accessToken;
 return requestToken(interactive?"consent":"");
}
async function driveFetch(url,options={},retry=true){
 countRequest();
 await ensureToken(false);
 const headers=new Headers(options.headers||{});
 headers.set("Authorization","Bearer "+accessToken);
 const response=await fetch(url,{...options,headers});
 if(response.status===401&&retry){
  accessToken="";tokenExpiresAt=0;
  await ensureToken(false);
  return driveFetch(url,options,false);
 }
 if(!response.ok){
  let data={};try{data=await response.json()}catch{}
  throw new Error(driveErrorMessage(data,response.status));
 }
 if(response.status===204)return null;
 const type=response.headers.get("content-type")||"";
 return type.includes("application/json")?response.json():response.text();
}
function q(value){return encodeURIComponent(value)}
async function findFolder(){
 const query="name='"+DRIVE_FOLDER_NAME.replace(/'/g,"\\'")+"' and mimeType='"+MIME_FOLDER+"' and trashed=false";
 const data=await driveFetch("https://www.googleapis.com/drive/v3/files?q="+q(query)+"&spaces=drive&fields=files(id,name)&pageSize=10");
 return data.files?.[0]?.id||"";
}
async function createFolder(){
 const data=await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({name:DRIVE_FOLDER_NAME,mimeType:MIME_FOLDER})
 });
 return data.id;
}
async function findDataFile(){
 const query="name='"+DRIVE_FILE_NAME+"' and '"+folderId+"' in parents and trashed=false";
 const data=await driveFetch("https://www.googleapis.com/drive/v3/files?q="+q(query)+"&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=10");
 return data.files?.[0]?.id||"";
}
function dataPayload(){
 return {
  schemaVersion:2,
  updatedAt:now(),
  categories:CATEGORIES,
  prompts
 };
}
async function createDataFile(){
 const boundary="wt_"+crypto.randomUUID();
 const metadata={name:DRIVE_FILE_NAME,mimeType:MIME_JSON,parents:[folderId]};
 const body=[
  "--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
  JSON.stringify(metadata),
  "\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n",
  JSON.stringify(dataPayload(),null,2),
  "\r\n--"+boundary+"--"
 ].join("");
 const data=await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{
  method:"POST",
  headers:{"Content-Type":"multipart/related; boundary="+boundary},
  body
 });
 return data.id;
}
async function loadData(){
 const text=await driveFetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(dataFileId)+"?alt=media");
 const parsed=typeof text==="string"?JSON.parse(text):text;
 prompts=Array.isArray(parsed?.prompts)?parsed.prompts:[];
 normalizePrompts();
}
async function performSave(){
 if(!dataFileId)throw new Error("Google Drive data file is not ready.");
 syncing=true;
 setDriveState("syncing");
 try{
  await driveFetch("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(dataFileId)+"?uploadType=media",{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(dataPayload(),null,2)
  });
  setDriveState("connected","Saved online · "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
 }catch(error){
  setDriveState("error",error.message);
  throw error;
 }finally{
  syncing=false;
  $("newPrompt").disabled=!accessToken;
 }
}
function saveToDrive(){
 syncChain=syncChain.catch(()=>{}).then(()=>performSave());
 return syncChain;
}
async function initializeDrive(interactive=true){
 try{
  setDriveState("connecting","Authorizing Google Drive…");
  await ensureToken(interactive);
  folderId=await findFolder();
  if(!folderId)folderId=await createFolder();
  dataFileId=await findDataFile();
  if(!dataFileId){
   prompts=[];
   dataFileId=await createDataFile();
  }else{
   await loadData();
  }
  initialized=true;
  initCategories();
  render();
  setDriveState("connected","Online library loaded from Google Drive.");
 }catch(error){
  initialized=false;
  prompts=[];
  render();
  setDriveState("error",error.message);
 }
}
function disconnect(){
 const token=accessToken;
 accessToken="";tokenExpiresAt=0;folderId="";dataFileId="";prompts=[];initialized=false;syncChain=Promise.resolve();
 if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});
 render();setDriveState("disconnected");
}
function normalizePrompts(){
 for(const prompt of prompts){
  if(!Array.isArray(prompt.versions))prompt.versions=[];
  if(!Array.isArray(prompt.tests))prompt.tests=[];
  if(!Number.isFinite(prompt.usageCount))prompt.usageCount=0;
 }
}
function promptTests(prompt){return Array.isArray(prompt.tests)?prompt.tests:[]}
function averageScore(prompt,version=null){
 const tests=promptTests(prompt).filter(test=>version==null||Number(test.version)===Number(version));
 if(!tests.length)return null;
 return tests.reduce((sum,test)=>sum+Number(test.score||0),0)/tests.length;
}
function slugWords(text){return text.replace(/\s+/g," ").trim().split(" ").filter(Boolean)}
function suggestTitle(text,category){
 let cleaned=text.replace(/[#*_>\[\]{}()]/g," ").replace(/\s+/g," ").trim();
 cleaned=cleaned.replace(/^(act as|you are|please|i want you to|create|generate|build|make|help me|write)\s+/i,"");
 const sentence=(cleaned.split(/[.!?\n]/)[0]||cleaned).trim();
 const words=slugWords(sentence).slice(0,9);
 let title=words.join(" ");
 if(title.length>72)title=title.slice(0,72).replace(/\s+\S*$/,"");
 if(!title)title=category+" Prompt";
 return title.charAt(0).toUpperCase()+title.slice(1);
}
function initCategories(){
 $("category").replaceChildren(...CATEGORIES.map(c=>new Option(c,c)));
 refreshCategoryFilter();
}
function refreshCategoryFilter(){
 const current=$("categoryFilter").value;
 const cats=[...new Set([...CATEGORIES,...prompts.map(p=>latest(p).category)])].sort();
 $("categoryFilter").replaceChildren(new Option("All categories",""),...cats.map(c=>new Option(c,c)));
 if(cats.includes(current))$("categoryFilter").value=current;
}
function stats(){
 $("promptCount").textContent=prompts.length;
 $("copyCount").textContent=prompts.reduce((sum,p)=>sum+(p.usageCount||0),0);
 const ranked=[...prompts].sort((a,b)=>(b.usageCount||0)-(a.usageCount||0)||new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,5);
 const list=$("ranking");list.replaceChildren();
 if(!ranked.length){const li=document.createElement("li");li.textContent=initialized?"No usage yet.":"Connect Drive to load prompts.";li.style.color="#7a8695";list.append(li);return}
 ranked.forEach((p,i)=>{
  const li=document.createElement("li"),n=document.createElement("span"),title=document.createElement("span"),count=document.createElement("span");
  n.className="rank-index";n.textContent=i+1;
  title.className="rank-title";title.textContent=latest(p).title;title.title=latest(p).title;
  count.className="rank-count";count.textContent=(p.usageCount||0)+" copies";
  li.append(n,title,count);list.append(li);
 });
}
function render(){
 refreshCategoryFilter();stats();
 const term=$("search").value.trim().toLowerCase(),cat=$("categoryFilter").value;
 const filtered=[...prompts].filter(p=>{
  const v=latest(p);
  return (!cat||v.category===cat)&&(!term||v.title.toLowerCase().includes(term)||v.content.toLowerCase().includes(term));
 }).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
 $("resultCount").textContent=initialized?(filtered.length+" result"+(filtered.length===1?"":"s")):"";
 const list=$("promptList");list.replaceChildren();
 if(!initialized){const empty=document.createElement("div");empty.className="empty";empty.textContent="Connect Google Drive to open your online Prompt Library.";list.append(empty);return}
 if(!filtered.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=prompts.length?"No prompts match your filters.":"No prompts yet. Add your first prompt.";list.append(empty);return}
 filtered.forEach(prompt=>list.append(promptCard(prompt)));
}
function promptCard(prompt){
 const v=latest(prompt),card=document.createElement("article");card.className="prompt-card";
 const top=document.createElement("div"),main=document.createElement("div"),title=document.createElement("h3"),meta=document.createElement("div");
 top.className="prompt-top";title.className="prompt-title";title.textContent=v.title;meta.className="meta";
 const badge=document.createElement("span"),version=document.createElement("span"),copies=document.createElement("span"),updated=document.createElement("span");
 badge.className="badge";badge.textContent=v.category;version.textContent="v"+v.version;copies.textContent=(prompt.usageCount||0)+" copies";updated.textContent="Updated "+formatDate(prompt.updatedAt);
 meta.append(badge,version,copies,updated);main.append(title,meta);
 const testSummary=document.createElement("div");testSummary.className="test-summary";
 const tests=promptTests(prompt),avg=averageScore(prompt);
 const testsChip=document.createElement("span");testsChip.className="test-chip";testsChip.textContent=tests.length+" test"+(tests.length===1?"":"s");
 testSummary.append(testsChip);
 if(avg!==null){const scoreChip=document.createElement("span");scoreChip.className="test-chip score";scoreChip.textContent="Avg "+avg.toFixed(1)+"/10";testSummary.append(scoreChip)}
 main.append(testSummary);top.append(main);
 const preview=document.createElement("div");preview.className="prompt-preview";preview.textContent=v.content;
 const actions=document.createElement("div");actions.className="card-actions";
 actions.append(
 button("Copy","btn btn-primary",()=>copyPrompt(prompt.id)),
 button("Test","btn",()=>openTest(prompt.id)),
 button("Tests ("+promptTests(prompt).length+")","btn",()=>showTests(prompt.id)),
 button("Compare","btn",()=>openCompare(prompt.id)),
 button("Edit","btn",()=>openEditor(prompt.id)),
 button("Versions ("+prompt.versions.length+")","btn",()=>showVersions(prompt.id)),
 button("Delete","btn btn-danger",()=>deletePrompt(prompt.id))
);
 card.append(top,preview,actions);return card;
}
function button(text,className,fn){const b=document.createElement("button");b.type="button";b.className=className;b.textContent=text;b.addEventListener("click",fn);return b}
async function copyPrompt(id){
 const prompt=prompts.find(p=>p.id===id);if(!prompt)return;
 try{
  const text=latest(prompt).content;
  if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
  else{const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.append(ta);ta.select();document.execCommand("copy");ta.remove()}
  prompt.usageCount=(prompt.usageCount||0)+1;prompt.lastUsedAt=now();render();
  await saveToDrive();notify("Prompt copied and usage synced");
 }catch(error){notify(error.message||"Unable to copy or sync")}
}
function openEditor(id=null){
 if(!initialized)return;
 editingId=id;$("promptForm").reset();$("promptId").value=id||"";
 if(id){const p=prompts.find(x=>x.id===id),v=latest(p);$("editorTitle").textContent="Edit Prompt";$("title").value=v.title;$("category").value=v.category;$("promptText").value=v.content}
 else{$("editorTitle").textContent="Add Prompt";$("category").value="Webflow"}
 $("editor").showModal();setTimeout(()=>$("title").focus(),0);
}
async function savePrompt(event){
 event.preventDefault();
 const title=$("title").value.trim(),category=$("category").value,content=$("promptText").value.trim();
 if(!title||!content)return;
 const snapshot=JSON.stringify(prompts);
 try{
  if(editingId){
   const p=prompts.find(x=>x.id===editingId),v=latest(p);
   if(v.title===title&&v.category===category&&v.content===content){$("editor").close();notify("No changes to save");return}
   p.versions.push({version:v.version+1,title,category,content,createdAt:now()});p.updatedAt=now();
  }else{
   const time=now();prompts.unshift({id:crypto.randomUUID(),createdAt:time,updatedAt:time,usageCount:0,lastUsedAt:null,tests:[],versions:[{version:1,title,category,content,createdAt:time}]});
  }
  const wasEditing=Boolean(editingId);render();await saveToDrive();$("editor").close();editingId=null;notify(wasEditing?"New version saved online":"Prompt saved online");
 }catch(error){
  prompts=JSON.parse(snapshot);render();notify("Save failed: "+error.message);
 }
}
async function deletePrompt(id){
 const p=prompts.find(x=>x.id===id);if(!p)return;
 if(!confirm('Delete "'+latest(p).title+'"? This also deletes its version history.'))return;
 const snapshot=JSON.stringify(prompts);
 try{prompts=prompts.filter(x=>x.id!==id);render();await saveToDrive();notify("Prompt deleted online")}
 catch(error){prompts=JSON.parse(snapshot);render();notify("Delete failed: "+error.message)}
}

function versionByNumber(prompt,number){return prompt.versions.find(v=>Number(v.version)===Number(number))}
function openTest(id){
 const prompt=prompts.find(p=>p.id===id);if(!prompt||!initialized)return;
 $("testForm").reset();
 $("testPromptId").value=id;
 $("testTitle").textContent="Test · "+latest(prompt).title;
 $("testSubtitle").textContent="Record how a specific prompt version behaved in a real task.";
 $("testVersion").replaceChildren(...prompt.versions.map(v=>new Option("Version "+v.version+" · "+v.title,v.version)));
 $("testVersion").value=String(latest(prompt).version);
 $("testScore").value="7";$("testScoreValue").textContent="7/10";
 $("testDialog").showModal();
}
async function saveTest(event){
 event.preventDefault();
 const prompt=prompts.find(p=>p.id===$("testPromptId").value);if(!prompt)return;
 const snapshot=JSON.stringify(prompts);
 const test={
  id:crypto.randomUUID(),
  version:Number($("testVersion").value),
  platform:$("testPlatform").value,
  model:$("testModel").value.trim(),
  scenario:$("testScenario").value.trim(),
  expectedBehavior:$("expectedBehavior").value.trim(),
  result:$("testResult").value.trim(),
  score:Number($("testScore").value),
  workedWell:$("workedWell").value.trim(),
  problems:$("problemsFound").value.trim(),
  improvementNotes:$("improvementNotes").value.trim(),
  createdAt:now()
 };
 if(!test.scenario||!test.result)return;
 try{
  if(!Array.isArray(prompt.tests))prompt.tests=[];
  prompt.tests.push(test);prompt.updatedAt=now();render();
  await saveToDrive();$("testDialog").close();notify("Test saved online");
 }catch(error){
  prompts=JSON.parse(snapshot);render();notify("Test save failed: "+error.message);
 }
}
function textBlock(label,value){
 const block=document.createElement("div");block.className="test-block";
 const strong=document.createElement("strong");strong.textContent=label;
 const content=document.createElement("div");content.textContent=value||"—";
 block.append(strong,content);return block;
}
function showTests(id){
 const prompt=prompts.find(p=>p.id===id);if(!prompt)return;
 $("testsTitle").textContent="Tests · "+latest(prompt).title;
 const list=$("testList");list.replaceChildren();
 const tests=[...promptTests(prompt)].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
 if(!tests.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No tests recorded yet.";list.append(empty)}
 tests.forEach(test=>{
  const item=document.createElement("article");item.className="test-item";
  const head=document.createElement("div");head.className="test-item-head";
  const info=document.createElement("div"),title=document.createElement("h3"),meta=document.createElement("div"),score=document.createElement("span");
  const version=versionByNumber(prompt,test.version);
  title.textContent=(test.platform||"Other")+(test.model?" · "+test.model:"");
  meta.className="test-meta";meta.textContent="Version "+test.version+(version?" · "+version.title:"")+" · "+formatDate(test.createdAt);
  score.className="score-badge";score.textContent=Number(test.score).toFixed(0)+"/10";
  info.append(title,meta);head.append(info,score);
  const grid=document.createElement("div");grid.className="test-grid";
  grid.append(
   textBlock("Scenario",test.scenario),
   textBlock("Expected behavior",test.expectedBehavior),
   textBlock("Observed result",test.result),
   textBlock("What worked well",test.workedWell),
   textBlock("Problems found",test.problems),
   textBlock("Improvement notes",test.improvementNotes)
  );
  item.append(head,grid);list.append(item);
 });
 $("testsDialog").showModal();
}
function versionMetrics(prompt,version){
 const tests=promptTests(prompt).filter(test=>Number(test.version)===Number(version));
 const avg=averageScore(prompt,version),v=versionByNumber(prompt,version);
 return {tests,avg,v};
}
function compareCard(prompt,version){
 const {tests,avg,v}=versionMetrics(prompt,version);
 const card=document.createElement("article");card.className="compare-card";
 const h=document.createElement("h3");h.textContent="Version "+version+(v?" · "+v.title:"");
 card.append(h);
 const metrics=[
  ["Tests",String(tests.length)],
  ["Average score",avg===null?"No score":avg.toFixed(1)+"/10"],
  ["Best score",tests.length?Math.max(...tests.map(t=>Number(t.score))).toFixed(0)+"/10":"—"],
  ["Latest test",tests.length?formatDate([...tests].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0].createdAt):"—"]
 ];
 metrics.forEach(([label,value])=>{const row=document.createElement("div");row.className="compare-metric";const a=document.createElement("span"),b=document.createElement("strong");a.textContent=label;b.textContent=value;row.append(a,b);card.append(row)});
 const notes=tests.map(t=>t.improvementNotes).filter(Boolean);
 if(notes.length)card.append(textBlock("Improvement notes",notes.join("\n\n")));
 return card;
}
function renderComparison(prompt){
 const a=Number($("compareA").value),b=Number($("compareB").value);
 const out=$("compareResults");out.replaceChildren(compareCard(prompt,a),compareCard(prompt,b));
}
function openCompare(id){
 const prompt=prompts.find(p=>p.id===id);if(!prompt)return;
 if(prompt.versions.length<2){notify("Create at least two prompt versions to compare");return}
 $("compareTitle").textContent="Compare · "+latest(prompt).title;
 const options=prompt.versions.map(v=>new Option("Version "+v.version+" · "+v.title,v.version));
 $("compareA").replaceChildren(...options.map(o=>o.cloneNode(true)));
 $("compareB").replaceChildren(...options.map(o=>o.cloneNode(true)));
 $("compareA").value=String(prompt.versions[0].version);
 $("compareB").value=String(latest(prompt).version);
 $("compareA").onchange=()=>renderComparison(prompt);
 $("compareB").onchange=()=>renderComparison(prompt);
 renderComparison(prompt);$("compareDialog").showModal();
}

function showVersions(id){
 const p=prompts.find(x=>x.id===id);if(!p)return;
 $("versionsTitle").textContent=latest(p).title;
 const list=$("versionList");list.replaceChildren();
 [...p.versions].sort((a,b)=>a.version-b.version).forEach(v=>{
  const box=document.createElement("article"),head=document.createElement("div"),num=document.createElement("span"),date=document.createElement("span"),title=document.createElement("div"),content=document.createElement("div");
  box.className="version";head.className="version-head";num.className="version-number";date.className="version-date";title.className="version-title";content.className="version-content";
  num.textContent="Version "+v.version;date.textContent=formatDate(v.createdAt);title.textContent=v.title+" · "+v.category;content.textContent=v.content;
  head.append(num,date);box.append(head,title,content);list.append(box);
 });
 $("versionsDialog").showModal();
}
function waitForGoogleIdentity(){
 if(window.google?.accounts?.oauth2){
  tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:DRIVE_SCOPE,callback:()=>{}});
  return;
 }
 setTimeout(waitForGoogleIdentity,100);
}

$("newPrompt").addEventListener("click",()=>openEditor());
$("promptForm").addEventListener("submit",savePrompt);
$("testForm").addEventListener("submit",saveTest);
$("testScore").addEventListener("input",()=>$("testScoreValue").textContent=$("testScore").value+"/10");
$("suggestTitle").addEventListener("click",()=>{$("title").value=suggestTitle($("promptText").value,$("category").value);$("title").focus()});
$("search").addEventListener("input",render);
$("categoryFilter").addEventListener("change",render);
$("connectDrive").addEventListener("click",()=>initializeDrive(true));
$("syncDrive").addEventListener("click",async()=>{try{await saveToDrive();notify("Drive synced")}catch(error){notify(error.message)}});
$("disconnectDrive").addEventListener("click",disconnect);
document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>$(btn.dataset.close).close()));
[$("editor"),$("versionsDialog"),$("testDialog"),$("testsDialog"),$("compareDialog")].forEach(dialog=>dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()}));

initCategories();
render();
setDriveState("disconnected");
waitForGoogleIdentity();
