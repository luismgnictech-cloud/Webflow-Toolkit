import { Squoosh } from "https://esm.sh/@bit-blazer/squoosh@1.3.0";
"use strict";
let SquooshCtor=null;
async function getSquoosh(){
 if(SquooshCtor)return SquooshCtor;
 try{
  const module=await import("https://esm.sh/@bit-blazer/squoosh@1.3.0");
  SquooshCtor=module.Squoosh;
  return SquooshCtor;
 }catch{
  return null;
 }
}
const $=id=>document.getElementById(id);
const picker=$("files"),drop=$("drop"),status=$("status");
const mimeExt={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"};
let queue=[],objectUrls=[],running=false,readyDownloads=[],generation=0;
function message(text,error=false){status.textContent=text;status.classList.toggle("error",error)}
function bytes(n){return n>=1000000?(n/1000000).toFixed(2)+" MB":(n/1000).toFixed(1)+" KB"}
function isAllowed(file){return Object.hasOwn(mimeExt,file.type)}
function inferType(file){return file.type||({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",avif:"image/avif"}[file.name.split('.').pop().toLowerCase()]||"")}
function compressedName(name){
 const dot=name.lastIndexOf(".");
 if(dot<=0)return name+"-compressed";
 return name.slice(0,dot)+"-compressed"+name.slice(dot);
}
// Read immediately, before clearing the input or awaiting any other file. These bytes
// are independent of later changes to the source file or its filesystem permissions.
function captureFile(file){
 let read;
 try{read=file.arrayBuffer();}catch(error){return Promise.resolve({error});}
 return Promise.resolve(read).then(data=>({file:new File([data],file.name,{type:inferType(file),lastModified:file.lastModified})}),error=>({error}));
}
function readError(error){
 if(error?.name==="NotReadableError"||error?.name==="NotFoundError"||error?.name==="SecurityError")return "Cannot read this file. Save it locally, then select it again. It may have changed or become unavailable.";
 return "This image could not be processed. Select it again or try another image.";
}
function invalidateZip(){const all=$("downloadAll");all.hidden=true;const url=all.getAttribute("href");if(url){URL.revokeObjectURL(url);objectUrls=objectUrls.filter(value=>value!==url);}all.removeAttribute("href");}
function placeholder(entry){
 const row=document.createElement("article");row.className="result is-pending";
 const icon=document.createElement("span");icon.className="thumb file-icon";icon.textContent="↑";icon.setAttribute("aria-hidden","true");
 const info=document.createElement("div");info.className="info";
 const name=document.createElement("div");name.className="filename";name.textContent=entry.name;name.title=entry.name;
 const note=document.createElement("div");note.className="meta";note.textContent="Reading image…";
 info.append(name,note);row.append(icon,info);return row;
}
function errorRow(entry,error){const row=placeholder(entry);row.className="result is-error";row.querySelector('.file-icon').textContent="!";const detail=row.querySelector('.meta');detail.className="meta error";detail.textContent=readError(error);return row;}
function addFiles(files){
 const incoming=Array.from(files);let skipped=0,limited=0;
 for(const source of incoming){
  const type=inferType(source);if(!Object.hasOwn(mimeExt,type)){skipped++;continue;}
  const previous=queue.find(entry=>entry.name===source.name&&entry.size===source.size&&entry.modified===source.lastModified);
  if(previous&&previous.state!=="error")continue;
  if(source.size>64000000||queue.reduce((sum,entry)=>sum+entry.size,0)-(previous?.size||0)+source.size>256000000){limited++;continue;}
  const entry={name:source.name,size:source.size,modified:source.lastModified,state:"pending",capture:captureFile(source)};
  entry.row=placeholder(entry);
  if(previous){queue[queue.indexOf(previous)]=entry;previous.row.replaceWith(entry.row);}else{queue.push(entry);$("results").append(entry.row);}
 }
 picker.value="";
 if(queue.length){$("resultsSection").hidden=false;$("resultsTitle").textContent="Your images ("+queue.length+")";invalidateZip();}
 if(skipped||limited)message((skipped?skipped+" unsupported file(s). ":"")+(limited?limited+" file(s) exceed the memory limit. Use a smaller batch.":""),true);
 void processQueue();
}
drop.addEventListener("click",()=>picker.click());
picker.addEventListener("change",()=>addFiles(picker.files));
drop.addEventListener("dragover",event=>{event.preventDefault();drop.classList.add("drag")});
drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));
drop.addEventListener("drop",event=>{event.preventDefault();drop.classList.remove("drag");addFiles(event.dataTransfer.files)});
$("clear").addEventListener("click",()=>{if(running)return;generation++;queue=[];readyDownloads=[];picker.value="";objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];$("results").replaceChildren();$("resultsSection").hidden=true;invalidateZip();message("");});
$("mode").addEventListener("change",()=>{if(running)return;for(const entry of queue){if(entry.file){entry.state="pending";entry.result=null;const row=placeholder(entry);entry.row.replaceWith(row);entry.row=row;}}invalidateZip();void processQueue();});
function crc32(data){
 let crc=0xffffffff;
 for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
}
function pngChunk(type,data){
 const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);
 view.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);
 view.setUint32(data.length+8,crc32(out.subarray(4,data.length+8)));return out;
}
async function transformBytes(data,stream){
 return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
}
function sameBytes(a,b){return a.length===b.length&&a.every((value,i)=>value===b[i]);}
async function optimizePng(file){
 const bytes=new Uint8Array(await file.arrayBuffer());
 const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
 if(!sameBytes(bytes.subarray(0,8),signature))throw new Error("Invalid PNG signature.");
 const chunks=[],idats=[];let offset=8,width=0,height=0,ended=false,seenIdat=false,closedIdat=false,animated=false;
 const view=new DataView(bytes.buffer);
 while(offset<bytes.length){
  if(offset+12>bytes.length)throw new Error("Incomplete PNG chunk.");
  const size=view.getUint32(offset),end=offset+12+size;
  if(end>bytes.length)throw new Error("Incomplete PNG data.");
  const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
  if(crc32(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4))throw new Error("Invalid PNG checksum.");
  if(chunks.length===0){
   if(type!=="IHDR"||size!==13)throw new Error("Invalid PNG header.");
   width=view.getUint32(offset+8);height=view.getUint32(offset+12);
   if(!width||!height)throw new Error("Invalid PNG dimensions.");
  }else if(type==="IHDR")throw new Error("Duplicate PNG header.");
  if(type==="acTL")animated=true;
  if(type==="IDAT"){
   if(closedIdat)throw new Error("Invalid PNG chunk order.");
   seenIdat=true;idats.push(bytes.subarray(offset+8,end-4));
  }else if(seenIdat)closedIdat=true;
  chunks.push({type,bytes:bytes.subarray(offset,end)});offset=end;
  if(type==="IEND"){if(size!==0)throw new Error("Invalid PNG end.");ended=true;break;}
 }
 if(!ended||!idats.length||offset!==bytes.length)throw new Error("Unsupported PNG structure.");
 const original={blob:file,type:file.type,width,height,unchanged:true};
 if(animated)return {...original,reason:"Animated PNG retained unchanged."};
 if(typeof CompressionStream==="undefined"||typeof DecompressionStream==="undefined")
  return {...original,reason:"Lossless compression unavailable in this browser; original retained."};
 // Bound memory use. Larger images are preserved rather than risking a failed conversion.
 if(width*height>40000000||file.size>64000000)
  return {...original,reason:"Large image retained unchanged for safe processing."};
 const joined=new Uint8Array(await new Blob(idats).arrayBuffer());
 const raw=await transformBytes(joined,new DecompressionStream("deflate"));
 const compressed=await transformBytes(raw,new CompressionStream("deflate"));
 const verified=await transformBytes(compressed,new DecompressionStream("deflate"));
 if(!sameBytes(raw,verified))throw new Error("Lossless verification failed.");
 let inserted=false;
 const parts=[signature];
 for(const chunk of chunks){
  if(chunk.type==="IDAT"){if(!inserted){parts.push(pngChunk("IDAT",compressed));inserted=true;}}
  else parts.push(chunk.bytes);
 }
 const blob=new Blob(parts,{type:"image/png"});
 if(blob.size>=file.size)return {...original,reason:"No smaller lossless result; original retained."};
 return {blob,type:"image/png",width,height,unchanged:false};
}
async function optimize(file){
 if(file.type==="image/png"){
  try{return await optimizePng(file);}
  catch(error){return {blob:file,type:file.type,unchanged:true,reason:"PNG could not be safely optimized; original retained."};}
 }
 // Never re-encode lossy formats: even a quality setting of 100 is not lossless.
 return {blob:file,type:file.type,unchanged:true,reason:"Lossless optimization is not available for this format; original retained."};
}
// Keep palette processing off the UI thread. A failed worker retains the safe result.
function smartPng(pixels,width,height){
 return new Promise((resolve,reject)=>{
  const worker=new Worker('./png-optimizer-worker.js');
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('PNG optimization timed out.'));},120000);
  const finish=()=>{clearTimeout(timer);worker.terminate();};
  worker.onmessage=event=>{finish();resolve(event.data);};
  worker.onerror=()=>{finish();reject(new Error('PNG optimizer unavailable.'));};
  worker.postMessage({pixels:pixels.buffer,width,height},[pixels.buffer]);
 });
}
// Smart mode uses Squoosh WebAssembly codecs locally in the browser.
async function targetOptimize(file){
 const fallback=await optimize(file);
 const Squoosh=await getSquoosh();
 if(!Squoosh)return {...fallback,reason:"Advanced WASM codec unavailable; safe local optimizer used."};
 const squoosh=new Squoosh();
 try{
  let image=await squoosh.decode(file);
  const width=image.width,height=image.height;
  if(width*height>24000000)return {...fallback,reason:"Large image retained with the safe optimizer."};

  let blob=null,reason="";
  if(file.type==="image/png"){
   // Preserve gradients and glows: use the largest PNG-8 palette and full dithering.
   // We deliberately avoid automatically dropping to 128/64/32 colors because that
   // can create visible posterization on gradients even when the file becomes smaller.
   const quantized=await squoosh.quantize(image,{maxNumColors:256,dither:1.0});
   blob=await squoosh.encodeToBlob(quantized,{codec:"oxipng",options:{level:4,interlace:false}});
   reason="Squoosh WASM · high-quality PNG-8 · 256 colors · full dithering · OxiPNG";
  }else if(file.type==="image/jpeg"){
   blob=await squoosh.encodeToBlob(image,{codec:"mozjpeg",options:{quality:82,progressive:true}});
   reason="Squoosh WASM · MozJPEG quality 82";
  }else if(file.type==="image/webp"){
   blob=await squoosh.encodeToBlob(image,{codec:"webp",options:{quality:82}});
   reason="Squoosh WASM · WebP quality 82";
  }else if(file.type==="image/avif"){
   blob=await squoosh.encodeToBlob(image,{codec:"avif",options:{quality:50,speed:6}});
   reason="Squoosh WASM · AVIF quality 50";
  }

  if(!blob)return {...fallback,reason:"Squoosh could not encode this format; safe result retained."};
  if(blob.size>=fallback.blob.size)return {...fallback,reason:"Squoosh tested; existing result was smaller."};

  return {blob,type:file.type,width,height,lossy:true,reason};
 }catch(error){
  return {...fallback,reason:"Squoosh WASM unavailable for this image; safe result retained."};
 }finally{
  squoosh.terminate();
 }
}
// Store the exact final compressed output bytes in a standard ZIP. Never use source files here.
async function buildZip(entries){
 if(entries.length>65535)throw new Error("Too many images for one ZIP. Use a smaller batch.");
 const localParts=[],centralParts=[],usedNames=new Set();let offset=0,centralSize=0;
 for(const entry of entries){
  const data=new Uint8Array(await entry.blob.arrayBuffer());
  const clean=entry.name.replace(/[\\\\/\x00-\x1f]/g,"_")||"image";
  const dot=clean.lastIndexOf("."),stem=dot>0?clean.slice(0,dot):clean,ext=dot>0?clean.slice(dot):"";
  let filename=clean,index=2;
  while(usedNames.has(filename.toLowerCase()))filename=stem+" ("+(index++)+")"+ext;
  usedNames.add(filename.toLowerCase());
  const name=new TextEncoder().encode(filename),checksum=crc32(data);
  if(name.length>65535||data.length>0xffffffff)throw new Error("A file is too large for this ZIP.");
  const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
  lv.setUint16(12,33,true);lv.setUint32(14,checksum,true);
  lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);local.set(name,30);
  const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);
  cv.setUint16(14,33,true);cv.setUint32(16,checksum,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);
  cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);
  localParts.push(local,data);centralParts.push(central);offset+=local.length+data.length;centralSize+=central.length;
  if(offset+centralSize>0xffffffff)throw new Error("This ZIP is too large. Use a smaller batch.");
 }
 const end=new Uint8Array(22),ev=new DataView(end.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);
 ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
 return new Blob([...localParts,...centralParts,end],{type:"application/zip"});
}
function downloadUrl(blob){const url=URL.createObjectURL(blob);objectUrls.push(url);return url;}
function resultRow(entry,result){
 const row=document.createElement("article");row.className="result is-complete";
 const thumb=document.createElement("img");thumb.className="thumb";thumb.alt="";thumb.src=downloadUrl(result.blob);
 const info=document.createElement("div");info.className="info";
 const name=document.createElement("div");name.className="filename";name.textContent=entry.name;name.title=entry.name;
 const format=mimeExt[result.type].toUpperCase();
 const details=document.createElement("div");details.className="file-details";
 const badge=document.createElement("span");badge.className="format-badge";badge.textContent=format;
 const original=document.createElement("span");original.textContent=bytes(entry.size);original.title="Original size";
 details.append(badge,original);info.append(name,details);
 if(result.reason){const strategy=document.createElement("div");strategy.className="result-note";strategy.textContent=result.reason;info.append(strategy);}
 const stats=document.createElement("div");stats.className="output-stats";
 const saving=entry.size?Math.max(0,(1-result.blob.size/entry.size)*100):0;
 const reduction=document.createElement("div");reduction.className="output-saving";
 reduction.textContent=saving>=1?"−"+Math.round(saving)+"%":saving>0?"−"+saving.toFixed(1)+"%":"0%";
 reduction.title=result.lossy?"Smart compression · Pixels may change":result.unchanged?"Original retained":"Lossless compression";
 const size=document.createElement("div");size.className="output-size";size.textContent=bytes(result.blob.size);size.title="Compressed size";
 stats.append(reduction,size);
 const link=document.createElement("a");link.className="result-download";link.href=downloadUrl(result.blob);link.download=entry.name;
 link.setAttribute("aria-label","Download "+format+" "+entry.name);link.title="Download "+format;
 const check=document.createElement("span");check.className="download-check";check.textContent="✓";check.setAttribute("aria-hidden","true");
 const label=document.createElement("span");label.textContent=format;
 link.append(check,label);row.append(thumb,info,stats,link);return row;
}
async function processQueue(){
 if(running||!queue.length)return;
 running=true;$("mode").disabled=true;$("clear").disabled=true;
 try{
  // New selections join the queue; completed entries are never re-read or reprocessed.
  while(true){
   let entry;
   while((entry=queue.find(item=>item.state==="pending"))){
    entry.state="processing";message("Compressing "+entry.name+"…");entry.row.querySelector('.meta').textContent="Compressing…";
    try{
     if(!entry.file){const captured=await entry.capture;entry.capture=null;if(captured.error)throw captured.error;entry.file=captured.file;}
     entry.result=await ($("mode").value==="target"?targetOptimize(entry.file):optimize(entry.file));entry.state="done";
     const row=resultRow(entry,entry.result);entry.row.replaceWith(row);entry.row=row;
    }catch(error){entry.state="error";const row=errorRow(entry,error);entry.row.replaceWith(row);entry.row=row;}
   }
   const finished=queue.filter(entry=>entry.state==="done");
   readyDownloads=finished.map(entry=>({
    name:compressedName(entry.name),
    blob:entry.result.blob,
    originalSize:entry.size,
    compressedSize:entry.result.blob.size
   }));
   const original=finished.reduce((sum,entry)=>sum+entry.size,0),saved=finished.reduce((sum,entry)=>sum+entry.result.blob.size,0);
   const failed=queue.filter(entry=>entry.state==="error").length;
   $("totalSavings").textContent=original?bytes(original)+" → "+bytes(saved)+" · "+((1-saved/original)*100).toFixed(1)+"% saved":"No images ready";
   $("downloadSummary").textContent=finished.length+" ready"+(failed?" · "+failed+" could not be read or processed":"");
   invalidateZip();
   if(readyDownloads.length){
    try{
     // Build the archive only from final compressed output blobs.
     const zip=await buildZip(readyDownloads);
     if(queue.some(entry=>entry.state==="pending"))continue;
     const all=$("downloadAll");
     all.href=downloadUrl(zip);
     all.textContent="Download all compressed (ZIP)";
     all.download="images-compressed.zip";
     all.hidden=false;
     $("downloadSummary").textContent+=" · ZIP "+bytes(zip.size);

    }catch(error){$("downloadSummary").textContent+=" · ZIP unavailable; use individual downloads.";}
   }
   if(queue.some(entry=>entry.state==="pending"))continue;
   message(failed?"Some images need attention. Select those files again to retry.":"",failed>0);break;
  }
 }finally{running=false;$("mode").disabled=false;$("clear").disabled=false;}
}