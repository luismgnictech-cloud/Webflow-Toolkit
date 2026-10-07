"use strict";
const STORAGE_KEY="webflowToolkitPromptLibraryV1";
const CATEGORIES=["Webflow","Framer","HTML","CSS","JavaScript","Ocio","General"];
const $=id=>document.getElementById(id);
let prompts=load();
let editingId=null;
let toastTimer=null;

function load(){
 try{
  const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
  return Array.isArray(value)?value:[];
 }catch{return []}
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(prompts))}
function now(){return new Date().toISOString()}
function latest(prompt){return prompt.versions[prompt.versions.length-1]}
function formatDate(value){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}
function escapeText(value){return String(value??"")}
function notify(text){const el=$("toast");el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2200)}
function slugWords(text){
 return text.replace(/\s+/g," ").trim().split(" ").filter(Boolean);
}
function suggestTitle(text,category){
 let cleaned=text.replace(/[#*_>\[\]{}()]/g," ").replace(/\s+/g," ").trim();
 cleaned=cleaned.replace(/^(act as|you are|please|i want you to|create|generate|build|make|help me|write)\s+/i,"");
 const sentence=(cleaned.split(/[.!?\n]/)[0]||cleaned).trim();
 const words=slugWords(sentence).slice(0,9);
 let title=words.join(" ");
 if(title.length>72)title=title.slice(0,72).replace(/\s+\S*$/,"");
 if(!title)title=category+" Prompt";
 title=title.charAt(0).toUpperCase()+title.slice(1);
 return title;
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
 if(!ranked.length){const li=document.createElement("li");li.textContent="No usage yet.";li.style.color="#7a8695";list.append(li);return}
 ranked.forEach((p,i)=>{
  const li=document.createElement("li");
  const n=document.createElement("span");n.className="rank-index";n.textContent=i+1;
  const title=document.createElement("span");title.className="rank-title";title.textContent=latest(p).title;title.title=latest(p).title;
  const count=document.createElement("span");count.className="rank-count";count.textContent=(p.usageCount||0)+" copies";
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
 $("resultCount").textContent=filtered.length+" result"+(filtered.length===1?"":"s");
 const list=$("promptList");list.replaceChildren();
 if(!filtered.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=prompts.length?"No prompts match your filters.":"No prompts yet. Add your first prompt.";list.append(empty);return}
 filtered.forEach(prompt=>list.append(promptCard(prompt)));
}
function promptCard(prompt){
 const v=latest(prompt),card=document.createElement("article");card.className="prompt-card";
 const top=document.createElement("div");top.className="prompt-top";
 const main=document.createElement("div");
 const title=document.createElement("h3");title.className="prompt-title";title.textContent=v.title;
 const meta=document.createElement("div");meta.className="meta";
 const badge=document.createElement("span");badge.className="badge";badge.textContent=v.category;
 const version=document.createElement("span");version.textContent="v"+v.version;
 const copies=document.createElement("span");copies.textContent=(prompt.usageCount||0)+" copies";
 const updated=document.createElement("span");updated.textContent="Updated "+formatDate(prompt.updatedAt);
 meta.append(badge,version,copies,updated);main.append(title,meta);top.append(main);
 const preview=document.createElement("div");preview.className="prompt-preview";preview.textContent=v.content;
 const actions=document.createElement("div");actions.className="card-actions";
 const copy=button("Copy","btn btn-primary",async()=>{await copyPrompt(prompt.id)});
 const edit=button("Edit","btn",()=>openEditor(prompt.id));
 const versions=button("Versions ("+prompt.versions.length+")","btn",()=>showVersions(prompt.id));
 const remove=button("Delete","btn btn-danger",()=>deletePrompt(prompt.id));
 actions.append(copy,edit,versions,remove);card.append(top,preview,actions);return card;
}
function button(text,className,fn){const b=document.createElement("button");b.type="button";b.className=className;b.textContent=text;b.addEventListener("click",fn);return b}
async function copyPrompt(id){
 const prompt=prompts.find(p=>p.id===id);if(!prompt)return;
 const text=latest(prompt).content;
 try{
  if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
  else{const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.append(ta);ta.select();document.execCommand("copy");ta.remove()}
  prompt.usageCount=(prompt.usageCount||0)+1;prompt.lastUsedAt=now();save();render();notify("Prompt copied");
 }catch{notify("Unable to copy automatically")}
}
function openEditor(id=null){
 editingId=id;
 $("promptForm").reset();
 $("promptId").value=id||"";
 if(id){
  const p=prompts.find(x=>x.id===id),v=latest(p);
  $("editorTitle").textContent="Edit Prompt";$("title").value=v.title;$("category").value=v.category;$("promptText").value=v.content;
 }else{
  $("editorTitle").textContent="Add Prompt";$("category").value="Webflow";
 }
 $("editor").showModal();
 setTimeout(()=>$("title").focus(),0);
}
function savePrompt(event){
 event.preventDefault();
 const title=$("title").value.trim(),category=$("category").value,content=$("promptText").value.trim();
 if(!title||!content)return;
 if(editingId){
  const p=prompts.find(x=>x.id===editingId),v=latest(p);
  if(v.title===title&&v.category===category&&v.content===content){$("editor").close();notify("No changes to save");return}
  p.versions.push({version:v.version+1,title,category,content,createdAt:now()});
  p.updatedAt=now();
  notify("New version saved");
 }else{
  const time=now();
  prompts.unshift({id:crypto.randomUUID(),createdAt:time,updatedAt:time,usageCount:0,lastUsedAt:null,versions:[{version:1,title,category,content,createdAt:time}]});
  notify("Prompt added");
 }
 save();$("editor").close();editingId=null;render();
}
function deletePrompt(id){
 const p=prompts.find(x=>x.id===id);if(!p)return;
 if(!confirm('Delete "'+latest(p).title+'"? This also deletes its version history.'))return;
 prompts=prompts.filter(x=>x.id!==id);save();render();notify("Prompt deleted");
}
function showVersions(id){
 const p=prompts.find(x=>x.id===id);if(!p)return;
 $("versionsTitle").textContent=latest(p).title;
 const list=$("versionList");list.replaceChildren();
 [...p.versions].sort((a,b)=>a.version-b.version).forEach(v=>{
  const box=document.createElement("article");box.className="version";
  const head=document.createElement("div");head.className="version-head";
  const num=document.createElement("span");num.className="version-number";num.textContent="Version "+v.version;
  const date=document.createElement("span");date.className="version-date";date.textContent=formatDate(v.createdAt);
  const title=document.createElement("div");title.className="version-title";title.textContent=v.title+" · "+v.category;
  const content=document.createElement("div");content.className="version-content";content.textContent=v.content;
  head.append(num,date);box.append(head,title,content);list.append(box);
 });
 $("versionsDialog").showModal();
}
$("newPrompt").addEventListener("click",()=>openEditor());
$("promptForm").addEventListener("submit",savePrompt);
$("suggestTitle").addEventListener("click",()=>{$("title").value=suggestTitle($("promptText").value,$("category").value);$("title").focus();});
$("search").addEventListener("input",render);
$("categoryFilter").addEventListener("change",render);
document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>$(btn.dataset.close).close()));
[$("editor"),$("versionsDialog")].forEach(dialog=>dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()}));
initCategories();render();