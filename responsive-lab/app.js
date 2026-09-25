import {devices,breakpoints,boundaries} from './catalog.js';
import {defaults,readState,writeState,clearState,normalizeURL,dimension,newView} from './storage.js';
import {ViewManager,el} from './views.js';
import {download} from './reports.js';
import {runnerConfig,parseResult} from './adapters.js';
const $=id=>document.getElementById(id);let state=readState(),external=null;
const message=text=>{$('message').textContent=text;};
const save=()=>{if(!writeState(state))message('No se pudieron guardar las preferencias en este navegador.');};
const current=()=>state.views[state.active];
const byId=id=>state.views.find(v=>v.id===id);
const manager=new ViewManager($('views'),{
 select(id){state.active=state.views.findIndex(v=>v.id===id);render();},
 rotate(id){rotate(byId(id));render();},
 remove(id){state.views=state.views.filter(v=>v.id!==id);state.active=Math.min(state.active,state.views.length-1);render();},
 resize(id,w,h){const v=byId(id);v.width=w;v.height=h;v.name='Viewport personalizado';v.source='Redimensionamiento manual';v.dpr=null;v.presetId=undefined;v.orientation=w>h?'horizontal':'vertical';state.active=state.views.indexOf(v);manager.render(state);$('width').value=w;$('height').value=h;syncBreakpoints();},
 resizeEnd(){render();}
});
function rotate(v){const p=devices.find(d=>d.id===v.presetId);if(p&&v.width===p.width&&v.height===p.height&&p.landscape){v.width=p.landscape.width;v.height=p.landscape.height;}else if(p?.landscape&&v.width===p.landscape.width&&v.height===p.landscape.height){v.width=p.width;v.height=p.height;}else [v.width,v.height]=[v.height,v.width];v.orientation=v.width>v.height?'horizontal':'vertical';}
function applyPreset(p){const v=current();Object.assign(v,{name:p.name,width:p.width,height:p.height,dpr:p.dpr??null,source:p.source||'Preset personalizado guardado',presetId:p.id,orientation:p.width>p.height?'horizontal':'vertical'});render();}
function render(){$('url').value=state.url;$('open').href=state.url;$('width').value=current().width;$('height').value=current().height;$('zoom').value=state.zoom;$('frame').checked=!!current().frame;$('sidebar').hidden=!state.sidebar;document.querySelector('.lab-layout').classList.toggle('collapsed',!state.sidebar);$('toggle-sidebar').setAttribute('aria-expanded',String(state.sidebar));$('view-count').textContent=`${state.views.length} / 4 vistas`;$('add-view').disabled=state.views.length===4;manager.render(state);syncBreakpoints();renderDevices();save();}
function deviceCategory(p){
 if(p.group==='Personalizados')return 'Mis dispositivos personalizados';
 if(/iPad|Tab|tablet/i.test(p.name))return 'Tabletas';
 if(p.group.startsWith('Apple')&&!p.name.startsWith('Desktop'))return 'Teléfonos Apple';
 if(p.group==='Android')return 'Teléfonos Android';
 return 'Escritorio';
}
function deviceShape(p){return el('span',{class:'device-shape '+(deviceCategory(p)==='Tabletas'?'tablet':deviceCategory(p)==='Escritorio'?'desktop':''),'aria-hidden':'true'});}
function chooseDevice(p){applyPreset(p);$('device-picker').close();}
function deviceTile(p,custom=false){
 const tile=el('div',{class:'device-tile'}),selected=current().presetId===p.id;
 const use=el('button',{class:'device-use',type:'button','aria-label':p.name+' · '+p.width+' × '+p.height+' CSS px','aria-pressed':String(selected)});
 use.append(deviceShape(p),el('span',{},p.name),el('small',{},p.width+' × '+p.height));use.onclick=()=>chooseDevice(p);
 const star=el('button',{class:'device-favorite',type:'button','aria-label':'Favorito: '+p.name,'aria-pressed':String(state.favorites.includes(p.id))},state.favorites.includes(p.id)?'★':'☆');
 star.onclick=()=>{state.favorites=state.favorites.includes(p.id)?state.favorites.filter(x=>x!==p.id):[...state.favorites,p.id];renderDevices();save();[...$('device-picker').querySelectorAll('.device-favorite')].find(b=>b.getAttribute('aria-label')==='Favorito: '+p.name)?.focus();};
 tile.append(use,star);
 if(custom){const remove=el('button',{class:'device-remove',type:'button','aria-label':'Eliminar preset '+p.name},'×');remove.style.left='1px';remove.style.right='auto';remove.onclick=()=>{state.custom=state.custom.filter(x=>x.id!==p.id);state.favorites=state.favorites.filter(x=>x!==p.id);renderDevices();save();};tile.append(remove);}
 return tile;
}
function renderDevices(){
 const q=$('search').value.trim().toLocaleLowerCase(),fav=$('only-favorites').checked;
 const matches=p=>(p.name+' '+p.group+' '+deviceCategory(p)).toLocaleLowerCase().includes(q)&&(!fav||state.favorites.includes(p.id));
 $('devices').replaceChildren();
 for(const category of ['Teléfonos Apple','Teléfonos Android','Tabletas','Escritorio']){
  const list=devices.filter(p=>deviceCategory(p)===category&&matches(p));if(!list.length)continue;
  const grid=el('div',{class:'device-grid'});list.forEach(p=>grid.append(deviceTile(p)));$('devices').append(el('h3',{class:'device-group'},category),grid);
 }
 $('custom-devices').replaceChildren();state.custom.map(p=>({...p,group:'Personalizados'})).filter(matches).forEach(p=>$('custom-devices').append(deviceTile(p,true)));
 if(!$('devices').children.length&&!$('custom-devices').children.length)$('devices').append(el('p',{class:'device-empty'},'No hay dispositivos que coincidan con tu búsqueda.'));
 renderVisibleDevices();
}
function renderVisibleDevices(){
 $('visible-devices').replaceChildren();
 state.views.forEach((v,i)=>{const button=el('button',{type:'button','aria-label':'Seleccionar vista '+(i+1)+': '+v.name,'aria-pressed':String(i===state.active),title:v.name+' · '+v.width+' × '+v.height});const p=devices.find(p=>p.id===v.presetId)||{name:v.name,group:v.width>=992?'Desktop':'Apple'};button.append(deviceShape(p),el('span',{class:'view-number'},String(i+1)));button.onclick=()=>{state.active=i;render();};$('visible-devices').append(button);});
 const add=el('button',{class:'picker-add',type:'button','aria-label':'Añadir vista al selector',title:'Añadir vista'},'+');add.disabled=state.views.length>=4;add.onclick=()=>{$('add-view').click();$('search').focus();};$('visible-devices').append(add);
 $('picker-context').textContent='Vista '+(state.active+1)+' de '+state.views.length+' · Elige un dispositivo para esta vista.';
}
$('open-devices').onclick=()=>{renderDevices();$('device-picker').showModal();};
$('close-devices').onclick=()=>$('device-picker').close();
$('device-picker').addEventListener('click',e=>{const r=$('device-picker').getBoundingClientRect();if(e.target===$('device-picker')&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))$('device-picker').close();});
$('device-picker').addEventListener('close',()=>$('open-devices').focus());
$('url-form').onsubmit=e=>{e.preventDefault();try{state.url=normalizeURL($('url').value);render();message('URL aplicada a todas las vistas. La navegación interna sigue siendo independiente.');}catch(err){message(err.message);}};
$('reload').onclick=()=>manager.reload();
$('dimensions').onsubmit=e=>{e.preventDefault();try{applyPreset({name:'Viewport personalizado',width:dimension($('width').value),height:dimension($('height').value,3840)});}catch(err){message(err.message);}};
$('rotate').onclick=()=>{rotate(current());render();};$('frame').onchange=()=>{current().frame=$('frame').checked;render();};
$('toggle-sidebar').onclick=()=>{state.sidebar=!state.sidebar;render();};$('zoom').onchange=()=>{state.zoom=$('zoom').value;render();};
$('add-view').onclick=()=>{if(state.views.length>=4)return;const v=current(),n=newView(v.width,v.height);Object.assign(n,{name:v.name,dpr:v.dpr,source:v.source,presetId:v.presetId,frame:v.frame});state.views.push(n);state.active=state.views.length-1;render();};
const svgNS='http://www.w3.org/2000/svg';
for(const [label,width] of breakpoints){
 $('breakpoint-select').append(el('option',{value:String(width)},label));
 if(width===320)continue;
 const b=el('button',{'aria-label':label,title:label,'data-width':String(width),'aria-pressed':'false'});
 const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','19');svg.setAttribute('height','19');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.4');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS(svgNS,'path');
 path.setAttribute('d',width>=992?'M3 4h18v12H3z M8 20h8 M12 16v4':width===991?'M5 2h14v20H5z M10 19h4':width===767?'M2 6h20v12H2z M19 10v4':'M7 2h10v20H7z M10 19h4');svg.append(path);
 if(width>=1280){const text=document.createElementNS(svgNS,'text');text.setAttribute('x','12');text.setAttribute('y','12');text.setAttribute('text-anchor','middle');text.setAttribute('fill','currentColor');text.setAttribute('stroke','none');text.setAttribute('font-size','7');text.textContent=width===1920?'XL':width===1440?'L':'M';svg.append(text);}
 b.append(svg);b.onclick=()=>applyPreset({name:label,width,height:current().height});$('breakpoints').append(b);
}
$('breakpoint-select').append(el('option',{value:'custom'},'Personalizado'));
function syncBreakpoints(){const w=current().width;$('breakpoint-current').textContent=w+'px';$('breakpoint-width').value=w;$('breakpoint-select').value=breakpoints.some(([,n])=>n===w)?String(w):'custom';$('breakpoints').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.width)===w)));}
$('breakpoint-select').onchange=()=>{const p=breakpoints.find(([,w])=>String(w)===$('breakpoint-select').value);if(p){applyPreset({name:p[0],width:p[1],height:current().height});$('breakpoint-current').parentElement.open=false;}else $('breakpoint-width').focus();};
$('breakpoint-custom').onsubmit=e=>{e.preventDefault();try{applyPreset({name:'Viewport personalizado',width:dimension($('breakpoint-width').value),height:current().height});$('breakpoint-current').parentElement.open=false;}catch(err){message(err.message);}};
$('small-mobile').onclick=()=>{applyPreset({name:'Small mobile · 320 CSS px',width:320,height:current().height});document.querySelector('.breakpoint-more').open=false;};
$('expand-workspace').disabled=!document.fullscreenEnabled;
$('expand-workspace').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('workspace').requestFullscreen();}catch{message('Pantalla completa no disponible en este navegador.');}};
document.addEventListener('fullscreenchange',()=>{const label=document.fullscreenElement?'Salir de pantalla completa':'Pantalla completa';$('expand-workspace').setAttribute('aria-label',label);$('expand-workspace').title=label;manager.fit();});
for(const [a,b] of boundaries){const button=el('button',{},`${a} / ${b}`);button.onclick=()=>{if(state.views.length>2){message('Deja dos espacios libres para añadir esta pareja (máximo 4 vistas).');return;}state.views.push(newView(a,current().height),newView(b,current().height));state.active=state.views.length-2;render();message(`Añadidas vistas de ${a} y ${b} CSS px.`);};$('boundaries').append(button);}
$('search').oninput=renderDevices;$('only-favorites').onchange=renderDevices;
$('custom-form').onsubmit=e=>{e.preventDefault();const name=$('custom-name').value.trim();if(!name)return;if(state.custom.length>=50){message('Máximo 50 presets; elimina uno antes de añadir otro.');return;}state.custom.push({id:crypto.randomUUID(),name,width:current().width,height:current().height,source:'Preset personalizado guardado'});$('custom-name').value='';renderDevices();save();message('Preset guardado.');};
$('reset').onclick=()=>{if(!confirm('¿Restablecer las vistas? Se mantienen favoritos y presets.'))return;state={...defaults(),favorites:state.favorites,custom:state.custom};external=null;$('runner-results').replaceChildren();render();message('Vistas restablecidas.');};
$('clear-data').onclick=()=>{if(!confirm('¿Borrar revisión, favoritos, presets y preferencias guardados?'))return;const ok=clearState();state=defaults();external=null;$('runner-results').replaceChildren();$('search').value='';$('only-favorites').checked=false;render();clearState();message(ok?'Datos guardados eliminados.':'El navegador no permite borrar el almacenamiento.');};
function mode(engine){$('responsive-panel').hidden=engine;$('engines-panel').hidden=!engine;$('responsive-mode').setAttribute('aria-pressed',String(!engine));$('engines-mode').setAttribute('aria-pressed',String(engine));if(!engine)manager.fit();}
$('responsive-mode').onclick=()=>mode(false);$('engines-mode').onclick=()=>mode(true);
$('runner-config').onclick=()=>download('responsive-lab-config.json',JSON.stringify(runnerConfig(state),null,2),'application/json');
$('import-result').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2000000)throw Error('Máximo 2 MB.');external=parseResult(await file.text());$('runner-results').replaceChildren(el('h3',{},'Informe importado · no es una ejecución en esta página'),el('pre',{},JSON.stringify(external,null,2)));message(`Informe importado: ${external.date}. URL: ${external.url}`);}catch(err){message(err.message);}finally{e.target.value='';}};
render();
