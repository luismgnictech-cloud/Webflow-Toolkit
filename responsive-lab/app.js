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
function renderDevices(){const q=$('search').value.toLocaleLowerCase(),fav=$('only-favorites').checked;$('devices').replaceChildren();let group='';for(const p of devices){if(!p.name.toLocaleLowerCase().includes(q)&&!p.group.toLocaleLowerCase().includes(q)||fav&&!state.favorites.includes(p.id))continue;if(group!==p.group){group=p.group;$('devices').append(el('h3',{class:'device-group'},group));}const row=el('div',{class:'device-row'}),use=el('button'),txt=el('span',{},p.name);txt.append(el('small',{},`${p.width} × ${p.height} · DPR ${p.dpr}`));use.append(txt);use.onclick=()=>applyPreset(p);const star=el('button',{'aria-label':`Favorito: ${p.name}`,'aria-pressed':String(state.favorites.includes(p.id))},state.favorites.includes(p.id)?'★':'☆');star.onclick=()=>{state.favorites=state.favorites.includes(p.id)?state.favorites.filter(x=>x!==p.id):[...state.favorites,p.id];renderDevices();save();};row.append(use,star);$('devices').append(row);}$('custom-devices').replaceChildren();for(const p of state.custom){const row=el('div',{class:'device-row'}),use=el('button',{},`${p.name} · ${p.width} × ${p.height}`),remove=el('button',{'aria-label':`Eliminar preset ${p.name}`},'×');use.onclick=()=>applyPreset(p);remove.onclick=()=>{state.custom=state.custom.filter(x=>x.id!==p.id);renderDevices();save();};row.append(use,remove);$('custom-devices').append(row);}}
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
