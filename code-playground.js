'use strict';
const $=id=>document.getElementById(id),editors=['html','css','js'],storageKey='webflow-toolkit-playground-v1';
const example={html:'<main class="card">\n  <span class="badge">YOUR SANDBOX</span>\n  <h1>Make something work.</h1>\n  <p>Edit HTML, CSS and JavaScript, then see your changes here.</p>\n  <button id="demo">Click me</button>\n  <p id="count" aria-live="polite">0 clicks</p>\n</main>',css:'body {\n  margin: 0; min-height: 100vh; display: grid;\n  place-items: center; background: #edf1ff;\n  font-family: system-ui, sans-serif; color: #1d2852;\n}\n.card { padding: 32px; max-width: 380px; margin: 20px;\n  background: white; border-radius: 20px;\n  box-shadow: 0 20px 60px #3454cc20; }\n.badge { font-size: 11px; letter-spacing: 2px; color: #3454cc; }\nh1 { font-size: 36px; line-height: 1.1; }\np { line-height: 1.6; }\nbutton { background: #3454cc; color: white; border: 0;\n  border-radius: 9px; padding: 12px 20px; cursor: pointer; }',js:'let clicks = 0;\ndocument.getElementById("demo").addEventListener("click", () => {\n  clicks++;\n  document.getElementById("count").textContent = `${clicks} clicks`;\n  console.log("Button clicked", clicks);\n});'};
let timer,frame,token='',saveOK=true;
function values(){return Object.fromEntries(editors.map(id=>[id,$(id).value]));}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({...values(),auto:$('auto').checked}));saveOK=true;}catch{saveOK=false;}}
function log(level,text){const row=document.createElement('div');row.className=level;row.textContent=text.slice(0,5000);$('console').append(row);while($('console').children.length>200)$('console').firstChild.remove();$('console').scrollTop=$('console').scrollHeight;}
// This function runs inside an opaque-origin iframe, never in the editor page.
function consoleBridge(session){
 const send=(level,args)=>{const text=args.map(value=>{try{return typeof value==='string'?value:JSON.stringify(value)??String(value);}catch{return String(value);}}).join(' ');parent.postMessage({playground:session,level,text},'*');};
 for(const level of ['log','info','warn','error']){const original=console[level];console[level]=(...args)=>{original.apply(console,args);send(level,args);};}
 addEventListener('error',event=>send('error',[event.message||'Resource failed to load',event.lineno?'(line '+event.lineno+')':'']),true);
 addEventListener('unhandledrejection',event=>send('error',['Unhandled rejection:',String(event.reason)]));
}
function buildDocument(code,session){
 const doc=new DOMParser().parseFromString(code.html,'text/html');
 // Support the conventional filenames shown in the editors without fetching them.
 doc.querySelectorAll('link[href],script[src]').forEach(el=>{const path=el.getAttribute('href')||el.getAttribute('src');if((el.tagName==='LINK'&&/^(\.\/)?style\.css$/.test(path))||(el.tagName==='SCRIPT'&&/^(\.\/)?script\.js$/.test(path)))el.remove();});
 if(!doc.querySelector('meta[name="viewport"]')){const meta=doc.createElement('meta');meta.name='viewport';meta.content='width=device-width,initial-scale=1';doc.head.append(meta);}
 const charset=doc.createElement('meta');charset.setAttribute('charset','utf-8');doc.head.prepend(charset);
 const style=doc.createElement('style');style.textContent=code.css.replace(/<\/style/gi,'<\\/style');doc.head.append(style);
 if(session){const bridge=doc.createElement('script');bridge.textContent='('+consoleBridge.toString()+')('+JSON.stringify(session)+');';doc.head.prepend(bridge);}
 const script=doc.createElement('script');script.textContent=code.js.replace(/<\/script/gi,'<\\/script');doc.body.append(script);
 return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
function run(){clearTimeout(timer);save();$('console').replaceChildren();token=crypto.randomUUID();const next=document.createElement('iframe');next.title='Code preview';next.setAttribute('sandbox','allow-scripts allow-forms allow-modals');next.style.width=$('viewport').value;next.srcdoc=buildDocument(values(),token);frame=next;$('stage').replaceChildren(next);$('status').textContent=saveOK?'Preview updated · Saved locally':'Preview updated · Local saving unavailable';}
addEventListener('message',event=>{if(!frame||event.source!==frame.contentWindow||event.data?.playground!==token)return;const {level,text}=event.data;if(['log','info','warn','error'].includes(level)&&typeof text==='string')log(level,text);});
for(const id of editors){$(id).addEventListener('input',()=>{save();clearTimeout(timer);$('status').textContent=saveOK?'Saved locally · Changes pending':'Local saving unavailable';if($('auto').checked)timer=setTimeout(run,600);});$(id).addEventListener('keydown',event=>{if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();const input=event.target;input.setRangeText('  ',input.selectionStart,input.selectionEnd,'end');input.dispatchEvent(new Event('input'));}});}
$('run').addEventListener('click',run);$('auto').addEventListener('change',()=>{clearTimeout(timer);save();if($('auto').checked)run();});$('viewport').addEventListener('change',()=>{if(frame)frame.style.width=$('viewport').value;});$('clear').addEventListener('click',()=>$('console').replaceChildren());
$('reset').addEventListener('click',()=>{if(!confirm('Replace your code with the starter example?'))return;editors.forEach(id=>$(id).value=example[id]);run();});
$('export').addEventListener('click',()=>{const blob=new Blob([buildDocument(values())],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='playground.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}});
let initial=example;try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&editors.every(id=>typeof saved[id]==='string')){initial=saved;$('auto').checked=saved.auto!==false;}}catch{}
editors.forEach(id=>$(id).value=initial[id]);run();
