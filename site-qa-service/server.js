import express from "express";
import cors from "cors";
import helmet from "helmet";
import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";
import { chromium } from "playwright";
import { XMLParser } from "fast-xml-parser";
import robotsParser from "robots-parser";

const app=express();
const PORT=Number(process.env.PORT||8787);
const ORIGINS=(process.env.ALLOWED_ORIGIN||"http://localhost:8000").split(",").map(s=>s.trim());
const MAX_PAGES=Math.min(Number(process.env.MAX_PAGES||100),200);
const MAX_RUNTIME_MS=Math.min(Number(process.env.MAX_RUNTIME_MS||180000),600000);
const MAX_RESOURCE_BYTES=Math.min(Number(process.env.MAX_RESOURCE_BYTES||8000000),25000000);
const MAX_CONCURRENCY=Math.max(1,Math.min(Number(process.env.MAX_CONCURRENCY||2),4));
const CLIENT_FIRST_DOC="https://finsweet.com/client-first/docs/classes-strategy-1";
const browserArgs=["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking"];

app.use(helmet({crossOriginResourcePolicy:false}));
app.use(cors({origin(origin,cb){if(!origin||ORIGINS.includes("*")||ORIGINS.includes(origin))return cb(null,true);cb(new Error("Origin not allowed"));}}));
app.use(express.json({limit:"256kb"}));

function isPrivateAddress(value){
 try{return ipaddr.parse(value).range()!=="unicast"}catch{return true}
}
async function assertSafeUrl(raw,allowedHost){
 let u;
 try{u=new URL(raw)}catch{throw new Error("Invalid URL")}
 if(!["http:","https:"].includes(u.protocol))throw new Error("Only HTTP(S) URLs are allowed");
 if(u.username||u.password)throw new Error("Credentialed URLs are not allowed");
 const host=u.hostname.toLowerCase();
 if(host==="localhost"||host.endsWith(".localhost"))throw new Error("Localhost is blocked");
 if(net.isIP(host)&&isPrivateAddress(host))throw new Error("Private or special-use IP addresses are blocked");
 const records=await dns.lookup(host,{all:true,verbatim:true});
 if(!records.length||records.some(r=>isPrivateAddress(r.address)))throw new Error("Hostname resolves to a private or special-use address");
 if(allowedHost&&host!==allowedHost)throw new Error("Cross-domain navigation is blocked for this audit");
 return u;
}
function cleanUrl(raw){
 const u=new URL(raw);u.hash="";
 for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key))u.searchParams.delete(key);
 return u.href;
}
async function safeFetch(raw,opts={}){
 let current=await assertSafeUrl(raw,opts.allowedHost);
 for(let hop=0;hop<6;hop++){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),opts.timeout||10000);
  let res;try{res=await fetch(current,{redirect:"manual",signal:ctrl.signal,headers:{"user-agent":"Webflow-Toolkit-Site-QA/1.0"}})}finally{clearTimeout(timer)}
  if([301,302,303,307,308].includes(res.status)){
   const loc=res.headers.get("location");if(!loc)throw new Error("Redirect without Location");
   current=await assertSafeUrl(new URL(loc,current).href,opts.allowedHost);continue;
  }
  const max=opts.maxBytes||2000000;const len=Number(res.headers.get("content-length")||0);if(len>max)throw new Error("Response too large");
  let total=0,chunks=[];const reader=res.body&&res.body.getReader();
  if(reader)while(true){const item=await reader.read();if(item.done)break;total+=item.value.byteLength;if(total>max){reader.cancel();throw new Error("Response exceeded size limit")}chunks.push(Buffer.from(item.value))}
  const body=Buffer.concat(chunks);
  return {status:res.status,url:current.href,text:()=>body.toString("utf8")};
 }
 throw new Error("Too many redirects");
}
function pathAllowed(url,include,exclude){
 const p=new URL(url).pathname;if(exclude.some(x=>p.startsWith(x)))return false;
 return !include.length||include.some(x=>p.startsWith(x));
}
async function discoverFromSitemaps(target,host,include,exclude,limit,skipped){
 const found=new Set(),queue=[new URL("/sitemap.xml",target).href],seen=new Set(),parser=new XMLParser({ignoreAttributes:false});
 while(queue.length&&found.size<limit){
  const sm=queue.shift();if(seen.has(sm))continue;seen.add(sm);
  try{
   const res=await safeFetch(sm,{allowedHost:host,maxBytes:5000000});if(res.status>=400)continue;const doc=parser.parse(res.text());
   for(const item of [].concat((doc.sitemapindex&&doc.sitemapindex.sitemap)||[])){const loc=typeof item==="string"?item:item&&item.loc;if(loc&&new URL(loc).hostname===host)queue.push(loc)}
   for(const item of [].concat((doc.urlset&&doc.urlset.url)||[])){
    const loc=typeof item==="string"?item:item&&item.loc;if(!loc)continue;const u=cleanUrl(loc);if(new URL(u).hostname!==host)continue;
    if(pathAllowed(u,include,exclude))found.add(u);else skipped.push({url:u,reason:"Excluded by path filter"});
    if(found.size>=limit)break;
   }
  }catch{}
 }
 return [...found];
}
async function getRobots(target,host){
 const url=new URL("/robots.txt",target).href;
 try{const res=await safeFetch(url,{allowedHost:host,maxBytes:500000});return robotsParser(url,res.status<400?res.text():"")}catch{return robotsParser(url,"")}
}
async function domAudit(page,categories,viewport,dictionary,english){
 return page.evaluate(({categories,viewport,dictionary,english})=>{
  const findings=[];const add=f=>findings.push(Object.assign({viewport},f));
  const selectorFor=el=>{
   if(!el||el.nodeType!==1)return "";
   if(el.id)return "#"+CSS.escape(el.id);
   let s=el.tagName.toLowerCase();const cls=[...el.classList].slice(0,2);if(cls.length)s+=cls.map(x=>"."+CSS.escape(x)).join("");return s;
  };
  if(categories.includes("headings")){
   const hs=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(el=>({level:Number(el.tagName[1]),text:el.textContent.trim(),hidden:!(el.offsetWidth||el.offsetHeight||el.getClientRects().length),selector:selectorFor(el),html:el.outerHTML.slice(0,300)}));
   const h1=hs.filter(x=>x.level===1);
   if(!h1.length)add({category:"headings",rule:"missing-h1",severity:"high",classification:"problem detected",title:"No H1 found",explanation:"The rendered DOM does not contain an H1.",recommendation:"Add one meaningful H1 for the page."});
   if(h1.length>1)add({category:"headings",rule:"multiple-h1",severity:"medium",classification:"possible problem",title:"Multiple H1 elements",evidence:h1,recommendation:"Review whether multiple H1s are intentional in the document outline."});
   hs.filter(x=>!x.text).forEach(x=>add({category:"headings",rule:"empty-heading",severity:"medium",classification:"problem detected",title:"Empty heading",selector:x.selector,evidence:x.html,recommendation:"Remove the empty heading or add meaningful text."}));
   for(let i=1;i<hs.length;i++)if(hs[i].level>hs[i-1].level+1)add({category:"headings",rule:"heading-level-skip",severity:"medium",classification:"possible problem",title:"Heading level jumps from H"+hs[i-1].level+" to H"+hs[i].level,selector:hs[i].selector,evidence:hs[i].html,recommendation:"Review the semantic hierarchy. Moving from H3 back to H2 is valid and is not flagged."});
   const counts=new Map();hs.forEach(x=>{if(x.text)counts.set(x.text,(counts.get(x.text)||0)+1)});
   hs.filter(x=>x.text&&counts.get(x.text)>1).forEach(x=>add({category:"headings",rule:"repeated-heading",severity:"low",classification:"review manually",title:"Repeated heading text",selector:x.selector,evidence:x.text,recommendation:"Confirm the repeated heading is useful and not duplicated accidentally."}));
   hs.filter(x=>x.hidden).forEach(x=>add({category:"headings",rule:"hidden-heading",severity:"info",classification:"review manually",title:"Hidden heading",selector:x.selector,evidence:x.text,recommendation:"Confirm hidden headings are intentional at this viewport."}));
  }
  if(categories.includes("divitis")){
   const all=[...document.querySelectorAll("*")],divs=[...document.querySelectorAll("div")];let maxDepth=0;
   all.forEach(el=>{let d=0,p=el;while(p&&p!==document.documentElement){d++;p=p.parentElement}maxDepth=Math.max(maxDepth,d)});
   if(all.length>100&&divs.length/all.length>.65)add({category:"divitis",rule:"high-div-ratio",severity:"low",classification:"possible problem",title:"High proportion of div elements",evidence:{nodes:all.length,divs:divs.length,ratio:(divs.length/all.length).toFixed(2),maxDepth},explanation:"Divitis is heuristic, not an absolute validation.",recommendation:"Review whether some wrappers can be semantic elements or safely simplified."});
   divs.filter(el=>el.children.length===1&&el.attributes.length<=1&&!el.matches(".w-dyn-item,.w-slider,.w-embed,[data-w-id],[role]")).slice(0,20).forEach(el=>add({category:"divitis",rule:"single-child-wrapper",severity:"info",classification:"review manually",title:"Single-child wrapper",selector:selectorFor(el),evidence:el.outerHTML.slice(0,260),confidence:"low",recommendation:"Review styles, layout and interactions before removing this wrapper."}));
  }
  if(categories.includes("images")){
   [...document.images].forEach(img=>{
    const alt=img.getAttribute("alt"),selector=selectorFor(img),linked=img.closest("a");
    if(alt===null)add({category:"images",rule:"missing-alt",severity:"high",classification:"problem detected",title:"Image missing alt attribute",selector,evidence:img.currentSrc||img.src,recommendation:"Add meaningful alt text, or alt empty if the image is purely decorative."});
    else if(alt===""&&linked&&!linked.getAttribute("aria-label")&&!linked.textContent.trim())add({category:"images",rule:"linked-empty-alt",severity:"medium",classification:"possible problem",title:"Linked image has no accessible name",selector,evidence:img.currentSrc||img.src,recommendation:"Give the link an accessible name or meaningful image alt text."});
    else if(alt&&/\.(png|jpe?g|webp|avif|svg)$/i.test(alt))add({category:"images",rule:"filename-as-alt",severity:"medium",classification:"possible problem",title:"Filename-like alt text",selector,evidence:alt,recommendation:"Replace with a concise description of the image content or function."});
    const hasWH=img.hasAttribute("width")&&img.hasAttribute("height"),cs=getComputedStyle(img),aspect=cs.aspectRatio,r=img.getBoundingClientRect();
    if(!hasWH)add({category:"images",rule:"missing-width-height",severity:aspect&&aspect!=="auto"?"low":"medium",classification:"possible problem",title:"Image missing HTML width/height attributes",selector,evidence:{intrinsic:img.naturalWidth+"x"+img.naturalHeight,rendered:Math.round(r.width)+"x"+Math.round(r.height),cssAspectRatio:aspect},recommendation:aspect&&aspect!=="auto"?"CSS reserves aspect ratio; consider intrinsic width/height attributes when practical.":"Add intrinsic width and height attributes without breaking responsive CSS."});
   });
   [...document.querySelectorAll("*")].filter(el=>getComputedStyle(el).backgroundImage!=="none").slice(0,40).forEach(el=>add({category:"images",rule:"css-background-image",severity:"info",classification:"review manually",title:"CSS background image",selector:selectorFor(el),evidence:getComputedStyle(el).backgroundImage,recommendation:"Background images do not use alt attributes. Confirm informational backgrounds have an accessible text equivalent."}));
  }
  if(categories.includes("writing")){
   const nodes=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,button,label,[role=button]")].filter(el=>el.offsetParent!==null);
   nodes.forEach(el=>{const text=el.textContent.replace(/\s+/g," ").trim();if(!text||text.length>300)return;
    const dup=text.match(/\b([A-Za-z]+)\s+\1\b/i);if(dup)add({category:"writing",rule:"duplicate-word",severity:"medium",classification:"possible problem",title:"Possible duplicated word",selector:selectorFor(el),evidence:text,recommendation:"Review and remove the repeated word if accidental.",confidence:"high"});
    if(/\s+[,.!?;:]/.test(text))add({category:"writing",rule:"punctuation-spacing",severity:"low",classification:"possible problem",title:"Space before punctuation",selector:selectorFor(el),evidence:text,recommendation:"Review punctuation spacing."});
    if(/\b(lorem ipsum|placeholder|todo)\b/i.test(text))add({category:"writing",rule:"placeholder-copy",severity:"medium",classification:"possible problem",title:"Possible placeholder copy",selector:selectorFor(el),evidence:text,recommendation:"Replace placeholder copy with final English content."});
   });
   add({category:"writing",rule:"coverage-note",severity:"info",classification:"not fully verified",title:"Grammar coverage is limited",evidence:{variant:english,dictionary},recommendation:"Local checks cover duplicate words, punctuation spacing and placeholder text. Configure a grammar provider for deeper grammar/spelling review."});
  }
  if(categories.includes("classes")){
   const ignored=/^(w-|is-|fs-|swiper|splide|slick|js-|has-|u-)/,classes=new Map();
   document.querySelectorAll("[class]").forEach(el=>[...el.classList].forEach(c=>{if(!classes.has(c))classes.set(c,selectorFor(el))}));
   for(const [c,sel] of classes){if(ignored.test(c))continue;
    if(/[A-Z ]/.test(c))add({category:"classes",rule:"class-format",severity:"low",classification:"possible problem",title:"Class naming inconsistency",selector:sel,evidence:c,recommendation:"Client-First class names are generally lowercase and human-readable."});
    else if(/^([a-z0-9]+)$/.test(c)&&!["button","container","wrapper"].includes(c))add({category:"classes",rule:"generic-class",severity:"info",classification:"review manually",title:"Potentially generic custom class",selector:sel,evidence:c,recommendation:"Confirm the class communicates its component or utility purpose. Do not rename automatically because CSS/scripts may depend on it.",confidence:"low"});
   }
  }
  if(categories.includes("links")){
   [...document.querySelectorAll("a,button,[role=button]")].forEach(el=>{
    const tag=el.tagName.toLowerCase(),href=tag==="a"?el.getAttribute("href"):null,selector=selectorFor(el),name=(el.getAttribute("aria-label")||el.textContent||"").trim().slice(0,120);
    if(tag==="a"&&(href===null||href===""))add({category:"links",rule:"missing-href",severity:"high",classification:"problem detected",title:"Navigation link has no destination",selector,evidence:{name,href},recommendation:"Add a valid href or use a button if this element performs an action."});
    if(tag==="a"&&href==="#"&&!el.hasAttribute("data-w-id"))add({category:"links",rule:"placeholder-href",severity:"medium",classification:"possible problem",title:"Placeholder # URL",selector,evidence:{name,href},recommendation:"Use a real destination unless JavaScript intentionally owns this control."});
    if(tag==="a"&&href&&href.startsWith("#")&&href.length>1&&!document.getElementById(decodeURIComponent(href.slice(1))))add({category:"links",rule:"missing-anchor",severity:"high",classification:"problem detected",title:"Anchor target does not exist",selector,evidence:href,recommendation:"Create the target ID or correct the fragment URL."});
    if(tag==="button"&&!el.onclick&&!el.hasAttribute("data-w-id")&&!el.closest("form")&&!el.getAttribute("aria-controls"))add({category:"links",rule:"button-action",severity:"info",classification:"review manually",title:"Button action requires interaction review",selector,evidence:name,recommendation:"A button does not need a URL. Confirm it triggers the intended modal, menu, filter or action."});
   });
  }
  if(categories.includes("gsap")){
   const hasGsap=!!window.gsap,hasST=!!window.ScrollTrigger||!!(window.gsap&&window.gsap.plugins&&window.gsap.plugins.ScrollTrigger);
   add({category:"gsap",rule:"gsap-detection",severity:"info",classification:hasGsap?"detected":"not verifiable",title:hasGsap?"GSAP detected":"No globally exposed GSAP instance",evidence:{gsap:hasGsap,scrollTrigger:hasST},recommendation:hasGsap?"Run interaction checks for behavioral validation.":"Bundled or scoped GSAP may still exist; absence from window is not proof that it is unused."});
  }
  return findings;
 },{categories,viewport,dictionary,english});
}
async function networkLinkChecks(page,findings){
 const links=await page.locator("a[href]").evaluateAll(els=>els.map(a=>({href:a.href,text:(a.getAttribute("aria-label")||a.textContent||"").trim().slice(0,120)})).filter(x=>/^https?:/.test(x.href)));
 const unique=[...new Map(links.map(x=>[x.href,x])).values()].slice(0,80);
 for(const item of unique){
  try{const res=await safeFetch(item.href,{maxBytes:256000,timeout:8000});
   if(res.status>=400&&![403,429].includes(res.status))findings.push({category:"links",rule:"http-error",severity:"medium",classification:"problem detected",title:"Link returned an HTTP error",evidence:{href:item.href,status:res.status,finalUrl:res.url,name:item.text},recommendation:"Verify or update this destination."});
   else if([403,429].includes(res.status))findings.push({category:"links",rule:"access-restricted",severity:"info",classification:"not verifiable",title:"Link verification was restricted",evidence:{href:item.href,status:res.status},recommendation:"Do not treat this as a confirmed broken link; verify manually."});
  }catch(error){findings.push({category:"links",rule:"link-unverifiable",severity:"info",classification:"not verifiable",title:"Link destination could not be verified",evidence:{href:item.href,error:error.message},recommendation:"Verify manually. Timeouts or automation blocks are not automatically broken links."})}
 }
}
async function performanceAudit(url){
 try{
  const light=await import("lighthouse"),launcher=await import("chrome-launcher");
  const chrome=await launcher.launch({chromePath:chromium.executablePath(),chromeFlags:["--headless","--no-sandbox","--disable-gpu"]});
  try{
   const result=await light.default(url,{port:chrome.port,output:"json",logLevel:"error",onlyCategories:["performance"],formFactor:"desktop"});
   const a=result&&result.lhr&&result.lhr.audits||{},cat=result&&result.lhr&&result.lhr.categories&&result.lhr.categories.performance;
   return {score:cat&&cat.score!=null?Math.round(cat.score*100):null,lcp:a["largest-contentful-paint"]&&a["largest-contentful-paint"].numericValue,cls:a["cumulative-layout-shift"]&&a["cumulative-layout-shift"].numericValue,tbt:a["total-blocking-time"]&&a["total-blocking-time"].numericValue,fcp:a["first-contentful-paint"]&&a["first-contentful-paint"].numericValue,speedIndex:a["speed-index"]&&a["speed-index"].numericValue};
  }finally{await chrome.kill()}
 }catch(error){return {error:error.message}}
}
async function auditPage(browser,url,config,cancelled){
 const findings=[],consoleErrors=[],failedResources=[];
 for(const viewport of config.viewports){
  if(cancelled())throw new Error("Cancelled");
  const context=await browser.newContext({viewport:{width:viewport,height:Math.max(720,Math.round(viewport*.65))},reducedMotion:"no-preference"}),page=await context.newPage();
  page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text().slice(0,500))});
  page.on("requestfailed",r=>failedResources.push({url:r.url(),error:r.failure()&&r.failure().errorText}));
  await page.route("**/*",async route=>{try{const u=route.request().url();if(u.startsWith("data:")||u.startsWith("blob:"))return route.continue();await assertSafeUrl(u);return route.continue()}catch{return route.abort("blockedbyclient")}});
  try{
   await page.goto(url,{waitUntil:"domcontentloaded",timeout:25000});await page.waitForTimeout(700);
   await page.evaluate(async()=>{window.scrollTo(0,document.body.scrollHeight);await new Promise(r=>setTimeout(r,250));window.scrollTo(0,0)});
   findings.push(...await domAudit(page,config.categories,viewport,config.dictionary,config.english));
   if(config.categories.includes("links")&&viewport===config.viewports[0])await networkLinkChecks(page,findings);
   if(config.categories.includes("gsap")){
    await page.setViewportSize({width:Math.max(320,viewport-1),height:720});await page.waitForTimeout(120);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
    if(overflow)findings.push({category:"gsap",rule:"horizontal-overflow-after-resize",severity:"medium",classification:"possible problem",title:"Horizontal overflow observed after resize",viewport,recommendation:"Inspect responsive layout and animation transforms; do not assume GSAP is the cause without further evidence."});
   }
  }finally{await context.close()}
 }
 if(consoleErrors.length)findings.push({category:"performance",rule:"console-errors",severity:"medium",classification:"possible problem",title:"Console errors observed",evidence:consoleErrors.slice(0,20),recommendation:"Review runtime errors because they may affect behavior or performance."});
 if(failedResources.length)findings.push({category:"performance",rule:"failed-resources",severity:"medium",classification:"problem detected",title:"Failed resources observed",evidence:failedResources.slice(0,20),recommendation:"Fix failed resources or confirm intentional blocking."});
 let perf=null;if(config.categories.includes("performance"))perf=await performanceAudit(url);
 if(perf&&perf.error)findings.push({category:"performance",rule:"lighthouse-unavailable",severity:"info",classification:"not executed",title:"Lighthouse could not run",evidence:perf.error,recommendation:"Confirm the service has a usable Chromium binary and retry."});
 else if(perf)findings.push({category:"performance",rule:"lighthouse",severity:"info",classification:"measured",title:"Lighthouse laboratory performance",evidence:perf,recommendation:"These are lab measurements for this run, not field data. INP is not inferred from TBT."});
 return {url,browser:"Chromium (Playwright)",findings,performance:perf};
}
app.get("/health",async(req,res)=>{
 let browser;try{browser=await chromium.launch({headless:true,args:browserArgs});res.json({ok:true,browser:"Chromium "+browser.version(),clientFirstReference:CLIENT_FIRST_DOC,limits:{maxPages:MAX_PAGES,maxConcurrency:MAX_CONCURRENCY,maxRuntimeMs:MAX_RUNTIME_MS}})}
 catch(error){res.status(503).json({ok:false,error:error.message})}finally{if(browser)await browser.close()}
});
app.post("/audit",async(req,res)=>{
 res.status(200);res.setHeader("content-type","application/x-ndjson; charset=utf-8");res.setHeader("cache-control","no-store");if(res.flushHeaders)res.flushHeaders();
 const send=obj=>res.write(JSON.stringify(obj)+"\n");let cancelled=false;req.on("close",()=>{cancelled=true});const deadline=Date.now()+MAX_RUNTIME_MS;let browser;
 try{
  const raw=req.body||{},target=await assertSafeUrl(raw.target),host=target.hostname;
  const config={target:cleanUrl(target.href),scope:["page","site","manual"].includes(raw.scope)?raw.scope:"page",manualUrls:Array.isArray(raw.manualUrls)?raw.manualUrls.slice(0,MAX_PAGES):[],include:Array.isArray(raw.include)?raw.include.slice(0,20):[],exclude:Array.isArray(raw.exclude)?raw.exclude.slice(0,20):[],limit:Math.min(Math.max(Number(raw.limit)||50,1),MAX_PAGES),english:raw.english==="en-GB"?"en-GB":"en-US",dictionary:Array.isArray(raw.dictionary)?raw.dictionary.slice(0,100):[],categories:Array.isArray(raw.categories)?raw.categories.filter(x=>["headings","divitis","images","writing","classes","links","gsap","performance"].includes(x)):[],viewports:Array.isArray(raw.viewports)?[...new Set(raw.viewports.map(Number).filter(x=>x>=320&&x<=2560))].slice(0,9):[1440]};
  if(!config.categories.length||!config.viewports.length)throw new Error("Select categories and viewports.");
  const skipped=[],failed=[],robots=await getRobots(config.target,host);let urls=[];
  if(config.scope==="page")urls=[config.target];
  if(config.scope==="manual")for(const rawUrl of config.manualUrls){try{const u=await assertSafeUrl(rawUrl,host),clean=cleanUrl(u.href);if(pathAllowed(clean,config.include,config.exclude))urls.push(clean);else skipped.push({url:clean,reason:"Excluded by path filter"})}catch(error){failed.push({url:rawUrl,reason:error.message})}}
  if(config.scope==="site"){urls=await discoverFromSitemaps(config.target,host,config.include,config.exclude,config.limit,skipped);if(!urls.includes(config.target))urls.unshift(config.target)}
  urls=[...new Set(urls)].slice(0,config.limit);const allowed=[];
  for(const u of urls){if(robots.isAllowed(u,"Webflow-Toolkit-Site-QA/1.0")===false)skipped.push({url:u,reason:"Disallowed by robots.txt"});else allowed.push(u)}
  const meta={discovered:urls.length,analyzed:0,skipped:skipped.length,failed:failed.length,pending:allowed.length,coverageLimitReached:urls.length>=config.limit};
  send({type:"start",meta,message:"Discovered "+urls.length+" page(s). Starting browser audit."});skipped.forEach(item=>send({type:"skipped",item,meta}));failed.forEach(item=>send({type:"failed",item,meta}));
  browser=await chromium.launch({headless:true,args:browserArgs});const remaining=[...allowed];
  async function worker(){while(remaining.length){if(cancelled||Date.now()>deadline)return;const url=remaining.shift();meta.pending=remaining.length;
   try{const page=await auditPage(browser,url,config,()=>cancelled||Date.now()>deadline);meta.analyzed++;send({type:"page",page,meta:{...meta}})}
   catch(error){meta.failed++;const item={url,reason:error.message};failed.push(item);send({type:"failed",item,meta:{...meta}})}
  }}
  await Promise.all(Array.from({length:Math.min(MAX_CONCURRENCY,remaining.length||1)},()=>worker()));
  send({type:"done",meta,message:cancelled?"Audit cancelled.":Date.now()>deadline?"Audit stopped at the runtime limit.":"Audit complete. "+meta.analyzed+" page(s) analyzed."});
 }catch(error){send({type:"done",meta:{discovered:0,analyzed:0,skipped:0,failed:1},message:"Audit failed: "+error.message})}
 finally{if(browser)await browser.close();res.end()}
});
app.listen(PORT,()=>console.log("Site QA service listening on http://localhost:"+PORT));