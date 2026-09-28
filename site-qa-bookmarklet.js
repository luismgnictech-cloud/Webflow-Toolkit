(() => {
  "use strict";
  const HOST_ID="wft-site-qa-host";
  const existing=document.getElementById(HOST_ID);
  if(existing){existing.remove();return;}

  const host=document.createElement("div");
  host.id=HOST_ID;
  host.style.cssText="all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
  const shadow=host.attachShadow({mode:"open"});
  document.documentElement.append(host);

  const style=document.createElement("style");
  style.textContent=\`
    :host{all:initial}*{box-sizing:border-box}
    .panel{pointer-events:auto;position:fixed;top:14px;right:14px;width:min(520px,calc(100vw - 28px));max-height:calc(100vh - 28px);display:flex;flex-direction:column;background:#fff;color:#18212e;border:1px solid #dfe5ee;border-radius:16px;box-shadow:0 20px 70px rgba(18,30,50,.24);overflow:hidden;font:13px/1.45 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #e7ebf1;background:#fbfcfe}.title{font-size:15px;font-weight:800}.sub{font-size:11px;color:#657286;margin-top:2px}.head-actions{display:flex;gap:6px}
    button,select{font:inherit}.icon,.btn{border:1px solid #d2dae5;background:#fff;color:#20324a;border-radius:8px;cursor:pointer}.icon{width:30px;height:30px}.btn{padding:8px 10px;font-weight:700}.btn.primary{background:#3454cc;border-color:#3454cc;color:#fff}
    .body{overflow:auto;padding:14px}.controls{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.controls select{border:1px solid #d2dae5;border-radius:8px;padding:8px;color:#20324a;background:#fff}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:12px}.stat{border:1px solid #e3e8ef;border-radius:10px;padding:9px;background:#fff}.stat strong{display:block;font-size:16px}.stat span{font-size:10px;color:#6c7888}
    .note{font-size:11px;color:#687587;background:#f5f7fa;border-radius:9px;padding:9px;margin-bottom:12px}
    .finding{border:1px solid #e1e6ed;border-radius:10px;margin-bottom:8px;overflow:hidden}.finding-head{display:flex;align-items:center;gap:7px;padding:9px 10px;background:#fbfcfd}.badge{font-size:9px;font-weight:800;text-transform:uppercase;padding:3px 6px;border-radius:999px;background:#edf1f5}.badge.high{background:#ffe5e8;color:#a52331}.badge.medium{background:#fff0cf;color:#8b5c00}.badge.low{background:#e7f2ff;color:#235d99}.badge.info{background:#edf0f4;color:#536173}.finding-title{font-weight:750;flex:1}.finding-body{padding:9px 10px;border-top:1px solid #edf0f4}.finding-body p{margin:4px 0;color:#526173}.evidence{margin-top:7px;padding:7px;background:#f5f7f9;border-radius:6px;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:150px;overflow:auto}
    .empty{padding:28px 12px;text-align:center;color:#667486}.footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:11px 14px;border-top:1px solid #e7ebf1;background:#fbfcfe}.footer .group{display:flex;gap:6px;flex-wrap:wrap}
    @media(max-width:560px){.panel{top:6px;right:6px;width:calc(100vw - 12px);max-height:calc(100vh - 12px)}.summary{grid-template-columns:repeat(2,1fr)}}
  \`;
  shadow.append(style);

  const panel=document.createElement("section");
  panel.className="panel";
  panel.innerHTML='<div class="head"><div><div class="title">Webflow Toolkit · Site QA</div><div class="sub"></div></div><div class="head-actions"><button class="icon" data-action="min" title="Minimize">−</button><button class="icon" data-action="close" title="Close">×</button></div></div><div class="body"><div class="controls"><select data-filter="category"><option value="">All categories</option></select><select data-filter="severity"><option value="">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select><button class="btn primary" data-action="run">Run QA</button></div><div class="summary"><div class="stat"><strong data-stat="findings">0</strong><span>Findings</span></div><div class="stat"><strong data-stat="images">0</strong><span>Images</span></div><div class="stat"><strong data-stat="links">0</strong><span>Links</span></div><div class="stat"><strong data-stat="dom">0</strong><span>DOM nodes</span></div></div><div class="note" data-note></div><div data-results></div></div><div class="footer"><div class="group"><button class="btn" data-action="json">Export JSON</button><button class="btn" data-action="csv">Export CSV</button></div><div class="group"><button class="btn" data-action="copy">Copy Summary</button></div></div>';
  shadow.append(panel);

  const q=s=>shadow.querySelector(s);
  q(".sub").textContent=location.hostname+" · "+innerWidth+"×"+innerHeight;
  let report=null;

  function selectorFor(el){
    if(!el||el.nodeType!==1)return "";
    if(el.id)return "#"+CSS.escape(el.id);
    let s=el.tagName.toLowerCase();
    const cls=[...el.classList].filter(Boolean).slice(0,2);
    if(cls.length)s+=cls.map(x=>"."+CSS.escape(x)).join("");
    return s;
  }
  function add(list,data){list.push(Object.assign({url:location.href,viewport:innerWidth},data));}
  function runAudit(){
    const findings=[];
    const all=[...document.querySelectorAll("*")],imgs=[...document.images],links=[...document.querySelectorAll("a")];

    const hs=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(el=>({el,level:Number(el.tagName[1]),text:el.textContent.replace(/\s+/g," ").trim(),hidden:!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)}));
    const h1=hs.filter(x=>x.level===1);
    if(!h1.length)add(findings,{category:"Headings",rule:"Missing H1",severity:"high",title:"No H1 found",recommendation:"Add one meaningful H1 for the page."});
    if(h1.length>1)add(findings,{category:"Headings",rule:"Multiple H1",severity:"medium",title:"Multiple H1 elements",evidence:h1.map(x=>x.text),recommendation:"Review whether multiple H1s are intentional."});
    hs.filter(x=>!x.text).forEach(x=>add(findings,{category:"Headings",rule:"Empty heading",severity:"medium",title:"Empty heading",selector:selectorFor(x.el),evidence:x.el.outerHTML.slice(0,300),recommendation:"Remove the empty heading or add meaningful text."}));
    for(let i=1;i<hs.length;i++)if(hs[i].level>hs[i-1].level+1)add(findings,{category:"Headings",rule:"Level skip",severity:"medium",title:"Heading level jump",selector:selectorFor(hs[i].el),evidence:"H"+hs[i-1].level+" → H"+hs[i].level+" · "+hs[i].text,recommendation:"Review the semantic hierarchy. Returning from H3 to H2 is valid and is not flagged."});
    hs.filter(x=>x.hidden).forEach(x=>add(findings,{category:"Headings",rule:"Hidden heading",severity:"info",title:"Hidden heading",selector:selectorFor(x.el),evidence:x.text,recommendation:"Confirm this heading is intentionally hidden at the current viewport."}));

    const divs=[...document.querySelectorAll("div")];let maxDepth=0;
    all.forEach(el=>{let d=0,p=el;while(p&&p!==document.documentElement){d++;p=p.parentElement}maxDepth=Math.max(maxDepth,d)});
    if(all.length>100&&divs.length/all.length>.65)add(findings,{category:"Divitis",rule:"High div ratio",severity:"low",title:"High proportion of div elements",evidence:{nodes:all.length,divs:divs.length,ratio:(divs.length/all.length).toFixed(2),maxDepth},explanation:"This is a heuristic, not an absolute error.",recommendation:"Review whether wrappers can be simplified or replaced with semantic elements."});
    divs.filter(el=>el.children.length===1&&el.attributes.length<=1&&!el.matches(".w-dyn-item,.w-slider,.w-embed,[data-w-id],[role]")).slice(0,15).forEach(el=>add(findings,{category:"Divitis",rule:"Single-child wrapper",severity:"info",title:"Wrapper requires review",selector:selectorFor(el),evidence:el.outerHTML.slice(0,240),recommendation:"Check layout, styling and interactions before removing this wrapper."}));

    imgs.forEach(img=>{
      const alt=img.getAttribute("alt"),sel=selectorFor(img),linked=img.closest("a"),cs=getComputedStyle(img),r=img.getBoundingClientRect();
      if(alt===null)add(findings,{category:"Images",rule:"Missing alt",severity:"high",title:"Image missing alt attribute",selector:sel,evidence:img.currentSrc||img.src,recommendation:'Add meaningful alt text, or alt="" if the image is decorative.'});
      else if(alt===""&&linked&&!linked.getAttribute("aria-label")&&!linked.textContent.trim())add(findings,{category:"Images",rule:"Linked image accessible name",severity:"medium",title:"Linked image has no accessible name",selector:sel,evidence:img.currentSrc||img.src,recommendation:"Give the link an accessible name or meaningful image alt text."});
      else if(alt&&/\.(png|jpe?g|webp|avif|svg)$/i.test(alt))add(findings,{category:"Images",rule:"Filename-like alt",severity:"medium",title:"Filename-like alt text",selector:sel,evidence:alt,recommendation:"Replace it with a concise description of the image content or function."});
      if(!(img.hasAttribute("width")&&img.hasAttribute("height")))add(findings,{category:"Images",rule:"Missing width/height",severity:cs.aspectRatio&&cs.aspectRatio!=="auto"?"low":"medium",title:"Image missing HTML width/height attributes",selector:sel,evidence:{intrinsic:img.naturalWidth+"×"+img.naturalHeight,rendered:Math.round(r.width)+"×"+Math.round(r.height),cssAspectRatio:cs.aspectRatio,objectFit:cs.objectFit},recommendation:cs.aspectRatio&&cs.aspectRatio!=="auto"?"CSS reserves aspect ratio; intrinsic attributes are still worth reviewing.":"Add intrinsic width and height attributes without breaking responsive behavior."});
    });

    [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,button,label,[role=button]")].filter(el=>el.offsetParent!==null).forEach(el=>{
      const text=el.textContent.replace(/\s+/g," ").trim();if(!text||text.length>350)return;
      if(/\b([A-Za-z]+)\s+\1\b/i.test(text))add(findings,{category:"Writing",rule:"Duplicate word",severity:"medium",title:"Possible duplicated word",selector:selectorFor(el),evidence:text,recommendation:"Review and remove the repeated word if accidental."});
      if(/\s+[,.!?;:]/.test(text))add(findings,{category:"Writing",rule:"Punctuation spacing",severity:"low",title:"Space before punctuation",selector:selectorFor(el),evidence:text,recommendation:"Review punctuation spacing."});
      if(/\b(lorem ipsum|placeholder|todo)\b/i.test(text))add(findings,{category:"Writing",rule:"Placeholder copy",severity:"medium",title:"Possible placeholder copy",selector:selectorFor(el),evidence:text,recommendation:"Replace placeholder copy with final English content."});
    });
    add(findings,{category:"Writing",rule:"Coverage",severity:"info",title:"Grammar coverage is limited",explanation:"This browser audit checks obvious text patterns only; it is not a full grammar engine.",recommendation:"Review English copy manually or use a dedicated grammar service for deeper checks."});

    const ignored=/^(w-|is-|fs-|swiper|splide|slick|js-|has-|u-)/,classes=new Map();
    document.querySelectorAll("[class]").forEach(el=>[...el.classList].forEach(c=>{if(!classes.has(c))classes.set(c,el)}));
    for(const [c,el] of classes){
      if(ignored.test(c))continue;
      if(/[A-Z ]/.test(c))add(findings,{category:"Client-First",rule:"Class format",severity:"low",title:"Class naming inconsistency",selector:selectorFor(el),evidence:c,recommendation:"Review this class against the project's Client-First conventions."});
      else if(/^[a-z0-9]+$/.test(c)&&c.length<5)add(findings,{category:"Client-First",rule:"Generic class",severity:"info",title:"Potentially generic custom class",selector:selectorFor(el),evidence:c,recommendation:"Confirm this class communicates its component or utility purpose. Do not rename automatically."});
    }

    [...document.querySelectorAll("a,button,[role=button]")].forEach(el=>{
      const tag=el.tagName.toLowerCase(),href=tag==="a"?el.getAttribute("href"):null,sel=selectorFor(el),name=(el.getAttribute("aria-label")||el.textContent||"").trim().slice(0,120);
      if(tag==="a"&&(href===null||href===""))add(findings,{category:"Links",rule:"Missing href",severity:"high",title:"Navigation link has no destination",selector:sel,evidence:{name,href},recommendation:"Add a valid href or use a button for an action."});
      if(tag==="a"&&href==="#"&&!el.hasAttribute("data-w-id"))add(findings,{category:"Links",rule:"Placeholder href",severity:"medium",title:"Placeholder # URL",selector:sel,evidence:{name,href},recommendation:"Use a real destination unless an interaction intentionally owns this control."});
      if(tag==="a"&&href&&href.startsWith("#")&&href.length>1&&!document.getElementById(decodeURIComponent(href.slice(1))))add(findings,{category:"Links",rule:"Missing anchor",severity:"high",title:"Anchor target does not exist",selector:sel,evidence:href,recommendation:"Create the target ID or correct the fragment URL."});
      if(tag==="button"&&!el.onclick&&!el.hasAttribute("data-w-id")&&!el.closest("form")&&!el.getAttribute("aria-controls"))add(findings,{category:"Links",rule:"Button action",severity:"info",title:"Button action requires review",selector:sel,evidence:name,recommendation:"Buttons do not need URLs. Confirm this one triggers the intended action."});
    });

    const hasGsap=!!window.gsap,hasST=!!window.ScrollTrigger||!!window.gsap?.plugins?.ScrollTrigger;
    add(findings,{category:"GSAP",rule:"Detection",severity:"info",title:hasGsap?"GSAP detected":"GSAP not globally exposed",evidence:{gsap:hasGsap,scrollTrigger:hasST},explanation:hasGsap?"A global GSAP instance is observable.":"Bundled or scoped GSAP may still exist; this result is not proof that GSAP is absent.",recommendation:hasGsap?"Manually review scroll, resize, hover/click and reduced-motion behavior.":"If animations are expected, inspect bundled scripts or test behavior manually."});

    const nav=performance.getEntriesByType("navigation")[0],resources=performance.getEntriesByType("resource"),transferred=resources.reduce((s,r)=>s+(r.transferSize||0),0);
    add(findings,{category:"Performance",rule:"Browser timing",severity:"info",title:"Basic browser performance snapshot",evidence:{domContentLoadedMs:nav?Math.round(nav.domContentLoadedEventEnd):null,loadMs:nav?Math.round(nav.loadEventEnd):null,requests:resources.length,transferredBytes:transferred},explanation:"These are browser timing/resource observations, not a Lighthouse score or field data.",recommendation:"Use Lighthouse or WebPageTest for a full performance audit."});
    resources.filter(r=>(r.transferSize||0)>500000).slice(0,15).forEach(r=>add(findings,{category:"Performance",rule:"Heavy resource",severity:"medium",title:"Large transferred resource",evidence:{name:r.name,bytes:r.transferSize,initiatorType:r.initiatorType},recommendation:"Review whether this asset can be compressed, resized, deferred or removed."}));

    report={meta:{url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight},timestamp:new Date().toISOString(),domNodes:all.length,images:imgs.length,links:links.length},findings};
    render();
  }

  function render(){
    const category=q('[data-filter="category"]').value,severity=q('[data-filter="severity"]').value,findings=report?.findings||[];
    q('[data-stat="findings"]').textContent=findings.length;q('[data-stat="images"]').textContent=report?.meta.images||0;q('[data-stat="links"]').textContent=report?.meta.links||0;q('[data-stat="dom"]').textContent=report?.meta.domNodes||0;
    q("[data-note]").textContent="Current page · "+innerWidth+"×"+innerHeight+" · Browser audit only. Network status, full grammar review, Lighthouse scores, physical-device behavior, and cross-browser behavior are not fully verified.";
    const cats=[...new Set(findings.map(f=>f.category))].sort(),select=q('[data-filter="category"]'),current=select.value;
    select.innerHTML='<option value="">All categories</option>'+cats.map(c=>'<option>'+c+'</option>').join("");if(cats.includes(current))select.value=current;
    const filtered=findings.filter(f=>(!category||f.category===category)&&(!severity||f.severity===severity)),out=q("[data-results]");out.replaceChildren();
    if(!filtered.length){const e=document.createElement("div");e.className="empty";e.textContent=findings.length?"No findings match the current filters.":"No findings were generated.";out.append(e);return}
    filtered.forEach(f=>{
      const card=document.createElement("article");card.className="finding";
      const head=document.createElement("div");head.className="finding-head";
      const badge=document.createElement("span");badge.className="badge "+(f.severity||"info");badge.textContent=f.severity||"info";
      const title=document.createElement("div");title.className="finding-title";title.textContent=f.category+" · "+(f.title||f.rule);head.append(badge,title);
      const body=document.createElement("div");body.className="finding-body";
      if(f.explanation){const p=document.createElement("p");p.textContent=f.explanation;body.append(p)}
      if(f.selector){const p=document.createElement("p");p.textContent="Selector: "+f.selector;body.append(p)}
      if(f.evidence!==undefined){const pre=document.createElement("div");pre.className="evidence";pre.textContent=typeof f.evidence==="string"?f.evidence:JSON.stringify(f.evidence,null,2);body.append(pre)}
      if(f.recommendation){const p=document.createElement("p");p.textContent="Recommendation: "+f.recommendation;body.append(p)}
      card.append(head,body);out.append(card);
    });
  }

  function download(name,type,text){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function csvSafe(v){let s=String(v??"").replace(/"/g,'""');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s+'"';}

  panel.addEventListener("click",async e=>{
    const action=e.target.closest("[data-action]")?.dataset.action;if(!action)return;
    if(action==="close"){host.remove();return}if(action==="min"){q(".body").toggleAttribute("hidden");q(".footer").toggleAttribute("hidden");return}if(action==="run"){runAudit();return}
    if(!report)return;
    if(action==="json")download("site-qa-"+location.hostname+".json","application/json",JSON.stringify(report,null,2));
    if(action==="csv"){const rows=[["category","rule","severity","url","viewport","selector","evidence","recommendation"]];report.findings.forEach(f=>rows.push([f.category,f.rule,f.severity,f.url,f.viewport,f.selector||"",typeof f.evidence==="string"?f.evidence:JSON.stringify(f.evidence||""),f.recommendation||""]));download("site-qa-"+location.hostname+".csv","text/csv;charset=utf-8",rows.map(r=>r.map(csvSafe).join(",")).join("\n"));}
    if(action==="copy"){const counts={};report.findings.forEach(f=>counts[f.category]=(counts[f.category]||0)+1);const summary="Site QA · "+location.href+"\nViewport: "+innerWidth+"×"+innerHeight+"\nFindings: "+report.findings.length+"\n"+Object.entries(counts).map(([k,v])=>k+": "+v).join("\n");try{await navigator.clipboard.writeText(summary);q("[data-note]").textContent="Summary copied to clipboard."}catch{q("[data-note]").textContent="Clipboard unavailable; use JSON or CSV export."}}
  });
  q('[data-filter="category"]').addEventListener("change",render);q('[data-filter="severity"]').addEventListener("change",render);
  runAudit();
})();