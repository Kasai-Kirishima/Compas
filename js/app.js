import {TEMPLATES, FORMATS, formatForTemplate, isGostTemplate, getTemplateFrame, getForm1Bounds} from '../src/templates.mjs';
import {History} from '../src/history.mjs';
import {distance, constrainAngle, nearestPoint, boundsOfObject, pathData, splinePathData, svgEscape, arrowHeadPoints} from '../src/geometry.mjs';
import {createProject, parseProject} from '../src/project-file.mjs';
import {removePathWindow, splitOpenPath, splitClosedPolygon} from '../src/operations.mjs';
import {zoomView, panView, wheelZoomFactor} from '../src/viewport.mjs';
import {referenceImportSize, referenceAspectRatio, resizeReference, scaleReference, fitReferenceToSheet} from '../src/reference.mjs';
import {circleGeometryFromInputs, parsePointRows, lineGeometryFromInputs} from '../src/object-edit.mjs';
import {rotateGeometryObject, scaleGeometryObject, scaleObjectToBounds} from '../src/transforms.mjs';
import {isDimensionObject, getDimensionGeometry, getDimensionLabelLayout, getDimensionArrowPlacement} from '../src/dimensions.mjs';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs={}, parent=null, text=null) => {
  const node=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs)) if(v!==undefined && v!==null) node.setAttribute(k,String(v));
  if(text!==null) node.textContent=String(text);
  if(parent) parent.appendChild(node);
  return node;
};
const round = n => Math.round(Number(n)*1000)/1000;
const fmt = n => Number(n).toFixed(2).replace(/\.00$/,'');
const defaultTitle = () => ({title:'Лабораторна робота 4',code:'КТ-24.ЛР5.001',material:'',liter:'У',mass:'—',scale:'',sheet:'',sheets:'1',company:'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ',developer:'Кушвид О.',checker:'Базиль Б.',technical:'',normative:'',approved:''});
const lab8DefaultTitle = () => ({...defaultTitle(),title:'Корпус',code:'8.090220 ЛР XX XX 01',material:'',liter:'',mass:'',scale:'1:1',sheet:'',sheets:'1',company:'ШЦМГУ',developer:'Кушвид О.',checker:'Базиль Б.',technical:'',normative:'',approved:'',variant:'Варіант 8',leftHeader:'10 ХХ ХХ д/ 02206018',copy:'Копіював',sheetFormat:'А3'});
const kompasLab5DefaultTitle = () => ({...defaultTitle(),title:'Лабораторна робота 5',code:'КТ-24.ЛР5.001',material:'',scale:'1:1',sheets:'1',company:'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ',developer:'Кушвид О.А.',checker:'Базиль Б.',kompasTemplateTextOverrides:{
 'tpltext-145_246_6_middle_0-0':{source:'Лабораторна робота 5',text:'Лабораторна робота 4',x:145,y:246.6,size:7,widthFactor:1,font:"GOST type B,Arial,sans-serif",color:'#000000',rotation:0,anchor:'middle',slanted:true},
 'tpltext-55_12_middle_180-0':{source:'Лабораторна робота 5',text:'Лабораторна робота 4',x:55,y:12,size:7,widthFactor:1,font:"GOST type B,Arial,sans-serif",color:'#000000',rotation:180,anchor:'middle',slanted:true},
 'tpltext-38_2_265_35_start_0-0':{source:'Кушвид О.А.',text:'Кушвид О.',x:38.2,y:265.35,size:2.2,widthFactor:1,font:"GOST type B,Arial,sans-serif",color:'#000000',rotation:0,anchor:'start',slanted:true},
 'tpltext-196_265_4_middle_0-0':{source:'1:1',text:'1:1',x:196,y:265.4,size:4,widthFactor:1,font:"GOST type B,Arial,sans-serif",color:'#000000',rotation:0,anchor:'middle',slanted:true}
}});
const state={name:'Корпус_Варіант_8',sheet:{format:'A3L',width:420,height:297},templateId:'lab8-reference-template',title:lab8DefaultTitle(),objects:[],selected:new Set(),tool:'select',pending:null,preview:null,drag:null,drawGesture:null,pan:null,grid:false,snapGrid:false,osnap:true,ortho:false,zoom:1,baseViewWidth:460,view:{x:-20,y:-24,w:460,h:346},settings:{lineWidth:.35,defaultTextSize:5,gridStep:5},lastPolar:null};
const history=new History(100);
const svg=$('sheetSvg'), sheetRoot=$('sheetRoot'), drawing=$('drawingArea');
const layers={reference:$('referenceLayer'),template:$('templateLayer'),geometry:$('geometryLayer'),construction:$('constructionLayer'),annotation:$('annotationLayer'),preview:$('previewLayer'),selection:$('selectionLayer')};
let idCounter=0, textInsertPoint=null, editingTextId=null, polylinePoints=[], moving=false, spaceDown=false, lastSavedSnapshot='';
const nextId=()=>`o${Date.now().toString(36)}${(++idCounter).toString(36)}`;
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const getVal=(id, fallback='')=>$(id)?.value ?? fallback;
const getNum=(id, fallback=0)=>{const v=Number(getVal(id,fallback));return Number.isFinite(v)?v:fallback;};
const checked=id=>!!$(id)?.checked;
const setStatus=(s)=>{if($('statusMessage'))$('statusMessage').textContent=s;};
const titleMap={title:'titleField',code:'codeField',material:'materialField',liter:'literField',mass:'massField',scale:'scaleField',sheet:'sheetField',sheets:'sheetsField',company:'companyField',developer:'developerField',checker:'checkerField',technical:'technicalField',normative:'normativeField',approved:'approvedField'};

function readTitleFromUI(){for(const [k,id] of Object.entries(titleMap))if($(id))state.title[k]=$(id).value;}
function writeTitleToUI(){for(const [k,id] of Object.entries(titleMap))if($(id))$(id).value=state.title[k]??'';}

function showPanel(name){
 const panels={tools:'toolsPanel',tree:'treePanel',properties:'propertiesPanel',references:'referencesPanel',settings:'settingsPanel'};
 for(const [key,id] of Object.entries(panels))$(id)?.classList.toggle('hidden',key!==name);
 document.querySelectorAll('[data-panel]').forEach(b=>{const active=b.dataset.panel===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
 if(name==='references')renderReferenceManager();
 if(name==='properties')showProperties();
}
function setupPanelOrganization(){
 const tools=$('toolsPanel'),settingsHost=$('settingsPanelContent'),properties=$('propertiesPanel'),selection=$('selectionPanel');
 if(selection&&properties&&!properties.contains(selection))properties.append(selection);
 if(!tools||!settingsHost)return;
 const headingText=n=>(n?.classList?.contains('panel-heading')?n.textContent.trim().replace(/\s+/g,' ').toUpperCase():'');
 // Move the long preferences tail away from the drawing tools into a dedicated Settings tab.
 const toolChildren=[...tools.children];
 const settingsStart=toolChildren.findIndex(n=>headingText(n).startsWith('ПАРАМЕТРЫ ПОСТРОЕНИЯ'));
 const settingsNodes=settingsStart>=0?toolChildren.slice(settingsStart):[];
 for(const n of settingsNodes)n.remove();
 const settingsMarkers=[
  ['general','ПАРАМЕТРЫ ПОСТРОЕНИЯ'],['standards','ЕСКД / ГОСТ'],['drawing','ТОЧНОСТЬ И ПАРАМЕТРЫ РИСОВАНИЯ'],
  ['precision','ПРИВЯЗКИ И СЕТКА'],['sheet','ЛИСТ И БИБЛИОТЕКА ШАБЛОНОВ']
 ];
 let activeSetting='general',section=null;
 for(const node of settingsNodes){
  const h=headingText(node),marker=settingsMarkers.find(([key,label])=>h.startsWith(label));
  if(marker){activeSetting=marker[0];section=document.createElement('div');section.className='settings-section';section.dataset.settingsSection=activeSetting;settingsHost.append(section);}
  if(!section){section=document.createElement('div');section.className='settings-section';section.dataset.settingsSection=activeSetting;settingsHost.append(section);}
  section.append(node);
 }
 settingsHost.querySelectorAll('.settings-section').forEach((node,i)=>node.classList.toggle('hidden',i!==0));
 const tabs=[...document.querySelectorAll('[data-settings-section]')];tabs.forEach(btn=>btn.addEventListener('click',()=>{
  const key=btn.dataset.settingsSection;tabs.forEach(t=>t.classList.toggle('active',t===btn));
  settingsHost.querySelectorAll('.settings-section').forEach(sec=>sec.classList.toggle('hidden',sec.dataset.settingsSection!==key));
 }));
 // Make tool categories actually filter their respective blocks instead of only changing the status text.
 const current=[...tools.children],startIndex=current.findIndex(n=>n.classList?.contains('tool-category-tabs'));
 const toolNodes=startIndex>=0?current.slice(startIndex+1):current;
 const toolMarkers=[['geometry','ВЫБОР И ГЕОМЕТРИЯ'],['dimensions','РАЗМЕРЫ'],['annotations','ОБОЗНАЧЕНИЯ И ОФОРМЛЕНИЕ'],['editing','РЕДАКТИРОВАНИЕ']];
 const sections=[];let key='geometry',block=null;
 for(const node of toolNodes){
  const h=headingText(node),marker=toolMarkers.find(([k,label])=>h===label);
  if(marker){key=marker[0];block=document.createElement('div');block.className='tool-category-section';block.dataset.toolSection=key;sections.push(block);}
  if(!block){block=document.createElement('div');block.className='tool-category-section';block.dataset.toolSection=key;sections.push(block);}
  block.append(node);
 }
 const fragment=document.createDocumentFragment();sections.forEach(n=>fragment.append(n));tools.append(fragment);
 document.querySelectorAll('[data-tool-category]').forEach(btn=>btn.addEventListener('click',()=>{
  const key=btn.dataset.toolCategory;document.querySelectorAll('[data-tool-category]').forEach(t=>{const active=t===btn;t.classList.toggle('active',active);t.setAttribute('aria-selected',String(active));});
  tools.querySelectorAll('.tool-category-section').forEach(sec=>sec.classList.toggle('hidden',key!=='all'&&sec.dataset.toolSection!==key));
 }));
 // Start on the geometry tools category.
 tools.querySelectorAll('.tool-category-section').forEach(sec=>sec.classList.toggle('hidden',sec.dataset.toolSection!=='geometry'));
}
function inspectorField(parent,label,key,value,opts={}){
 const wrap=document.createElement('label');wrap.className='field-label';wrap.textContent=label;
 const input=opts.multiline?document.createElement('textarea'):document.createElement('input');
 if(opts.multiline){input.rows=opts.rows||4;input.value=String(value??'');input.placeholder=opts.placeholder||'';}
 else{input.type=opts.type||'number';input.value=value??'';if(input.type==='number'){input.step=opts.step||'0.1';if(opts.min!=null)input.min=opts.min;if(opts.max!=null)input.max=opts.max;}}
 input.dataset.specificProp=key;wrap.append(input);parent.append(wrap);return input;
}
function renderObjectSpecificFields(o){
 const root=$('objectSpecificFields');if(!root)return;root.replaceChildren();
 const add=(label,key,val,opts)=>inspectorField(root,label,key,val,opts);
 const addArrowHeadSize=(value)=>{
  const input=add('Размер наконечника, мм','arrowSize',value??3.2,{min:.5,max:20,step:.1});
  const slider=document.createElement('input');slider.type='range';slider.className='dimension-fine-slider';slider.min='.5';slider.max='20';slider.step='.1';slider.value=String(value??3.2);slider.setAttribute('aria-label','Увеличить или уменьшить наконечник стрелки');
  slider.addEventListener('input',()=>{input.value=slider.value;});
  input.addEventListener('input',()=>{const n=Number(input.value);if(Number.isFinite(n))slider.value=String(Math.max(.5,Math.min(20,n)));});
  root.append(slider);
 };
 const point=(prefix,p)=>{add(`${prefix} X, мм`,`${prefix.toLowerCase()}X`,p?.x??0);add(`${prefix} Y, мм`,`${prefix.toLowerCase()}Y`,p?.y??0);};
 if(o.type==='circle'){
  root.append(Object.assign(document.createElement('div'),{className:'specific-help',textContent:'Окружность: меняйте координаты центра и радиус. Диаметр рассчитывается автоматически.'}));
  point('Центр',o.center);add('Радиус, мм','radius',o.r,{min:.05,step:.1});add('Диаметр, мм','diameter',(o.r||0)*2,{min:.1,step:.1});
 }else if(['line','arrowLine','construction','centerline','ray','xline','ruler'].includes(o.type)){
  point('Начало',o.a);point('Конец',o.b);add('Длина, мм','lineLength',distance(o.a,o.b).toFixed(2),{min:.05,step:.1});add('Угол, °','lineAngle',(Math.atan2(o.b.y-o.a.y,o.b.x-o.a.x)*180/Math.PI).toFixed(2),{step:.1});if(o.type==='arrowLine')addArrowHeadSize(o.arrowSize??3.2);
 }else if(['polyline','spline','curvedArrow','polygon','freehand','breakline'].includes(o.type)){
  add('Вершины X;Y (одна точка на строку)','points',(o.points||[]).map(p=>`${round(p.x)}; ${round(p.y)}`).join('\n'),{multiline:true,rows:Math.max(4,Math.min(12,o.points?.length||4)),placeholder:'10; 20\n40; 30\n55; 15'});if(o.type==='curvedArrow')addArrowHeadSize(o.arrowSize??3.2);
  root.append(Object.assign(document.createElement('div'),{className:'muted-hint',textContent:'Изменяйте координаты, добавляйте или удаляйте строки — так можно редактировать каждую вершину ломаной/сплайна.'}));
 }else if(o.type==='rect'){
  add('X, мм','x',o.x);add('Y, мм','y',o.y);add('Ширина, мм','w',o.w,{min:.05});add('Высота, мм','h',o.h,{min:.05});add('Радиус углов, мм','rx',o.rx||0,{min:0});
 }else if(o.type==='ellipse'){
  point('Центр',o.center);add('Полуось X (rx), мм','rx',o.rx,{min:.05});add('Полуось Y (ry), мм','ry',o.ry,{min:.05});
 }else if(o.type==='arc'){
  point('Центр',o.center);add('Радиус, мм','radius',o.r,{min:.05});add('Начальный угол, °','startAngle',o.startAngle);add('Конечный угол, °','endAngle',o.endAngle);
 }else if(o.type==='dimension'){
  point('Точка 1',o.a);point('Точка 2',o.b);add('Отступ размерной линии, мм','offset',o.offset??2,{min:.01,step:.01});add('Высота цифр, мм','textSize',o.textSize??2.5,{min:.5,step:.1});add('Текст размера (пусто — авто)','label',o.label??'',{type:'text'});
 }else if(o.type==='text'){
  add('X, мм','x',o.x);add('Y, мм','y',o.y);add('Текст','text',o.text,{multiline:true,rows:3});add('Высота, мм','size',o.size||5,{min:.5});add('Поворот, °','rotation',o.rotation||0);
 }else if(o.type==='reference'){
  add('X, мм','x',o.x);add('Y, мм','y',o.y);add('Ширина, мм','w',o.w,{min:1});add('Высота, мм','h',o.h,{min:1});add('Поворот, °','rotation',o.rotation||0);
 }else{
  root.append(Object.assign(document.createElement('div'),{className:'muted-hint',textContent:`Для объекта «${o.type}» доступны общие свойства и положение/габариты выше.`}));
 }
}
function applyObjectSpecificProps(){
 if(state.selected.size!==1)return;const o=findSelected()[0];if(!o||o.locked)return;
 const values={};$('objectSpecificFields')?.querySelectorAll('[data-specific-prop]').forEach(input=>{values[input.dataset.specificProp]=input.value;});
 const num=k=>{const v=Number(values[k]);return Number.isFinite(v)?v:null;};
 const pt=(prefix)=>({x:num(`${prefix.toLowerCase()}X`),y:num(`${prefix.toLowerCase()}Y`)});
 if(o.type==='circle'){
  try{Object.assign(values,circleGeometryFromInputs(o,values));}catch(error){setStatus(error.message);return;}
 }else if(['line','arrowLine','construction','centerline','ray','xline','ruler'].includes(o.type)){
  try{Object.assign(values,lineGeometryFromInputs(o,values));}catch(error){setStatus(error.message);return;}
  if(o.type==='arrowLine'){const size=num('arrowSize');if(!Number.isFinite(size)||size<.5||size>20){setStatus('Размер наконечника должен быть от 0,5 до 20 мм');return;}values.arrowSize=size;}
 }else if(['polyline','spline','curvedArrow','polygon','freehand','breakline'].includes(o.type)){
  try{values.points=parsePointRows(values.points,o.type==='polygon'?3:2);}catch(error){setStatus(error.message);return;}
  if(o.type==='curvedArrow'){const size=num('arrowSize');if(!Number.isFinite(size)||size<.5||size>20){setStatus('Размер наконечника должен быть от 0,5 до 20 мм');return;}values.arrowSize=size;}
 }else if(o.type==='rect'){
  const [x,y,w,h]=['x','y','w','h'].map(num);if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0){setStatus('Ширина и высота должны быть больше нуля');return;}
  Object.assign(values,{x,y,w,h,rx:Math.max(0,num('rx')??0)});
 }else if(o.type==='ellipse'){
  const c=pt('Центр'),rx=num('rx'),ry=num('ry');if(![c.x,c.y,rx,ry].every(Number.isFinite)||rx<=0||ry<=0){setStatus('Полуоси эллипса должны быть больше нуля');return;}Object.assign(values,{center:c,rx,ry});
 }else if(o.type==='arc'){
  const c=pt('Центр'),r=num('radius');if(![c.x,c.y,r].every(Number.isFinite)||r<=0)return;Object.assign(values,{center:c,r,startAngle:num('startAngle'),endAngle:num('endAngle')});
 }else if(o.type==='dimension'){
  const a=pt('Точка 1'),b=pt('Точка 2'),offset=num('offset'),textSize=num('textSize');if(![a.x,a.y,b.x,b.y,offset,textSize].every(Number.isFinite)||textSize<=0){setStatus('Проверьте координаты размерных точек и параметры размера');return;}Object.assign(values,{a,b,offset,textSize,label:String(values.label||'').trim()||undefined});
 }else if(o.type==='text'){
  const x=num('x'),y=num('y'),size=num('size');if(![x,y,size].every(Number.isFinite)||size<=0)return;Object.assign(values,{x,y,text:String(values.text??''),size,rotation:num('rotation')??0});
 }else if(o.type==='reference'){
  Object.assign(values,{x:num('x'),y:num('y'),w:num('w'),h:num('h'),rotation:num('rotation')??0});
 }
 history.push(snapshot());
 if(o.type==='circle'){o.center=values.center;o.r=values.r;}
 else if(['line','arrowLine','construction','centerline','ray','xline','ruler'].includes(o.type)){o.a=values.a;o.b=values.b;if(o.type==='arrowLine')o.arrowSize=values.arrowSize;}
 else if(['polyline','spline','curvedArrow','polygon','freehand','breakline'].includes(o.type)){o.points=values.points;if(o.type==='curvedArrow')o.arrowSize=values.arrowSize;}
 else Object.assign(o,values);
 render();showProperties();scheduleAutosave();updateHistoryButtons();setStatus('Параметры объекта обновлены');
}
function sizeLabel(){return `${state.sheet.format} · ${state.sheet.width}×${state.sheet.height} мм`;}
function setSheet(format){
 const size=FORMATS[format]||FORMATS.A3P;state.sheet={format,width:size[0],height:size[1]};
 $('paperFormat').value=Object.keys(FORMATS).includes(format)?format:'A3P';
 updateSheetGeometry();fitSheet();render();
}
function updateSheetGeometry(){const {width:w,height:h}=state.sheet;let printStyle=$('dynamicPrintPageStyle');if(!printStyle){printStyle=document.createElement('style');printStyle.id='dynamicPrintPageStyle';document.head.appendChild(printStyle);}printStyle.textContent=`@media print{@page{size:${w}mm ${h}mm;margin:0;}}`;
 $('paperRect').setAttribute('width',w);$('paperRect').setAttribute('height',h);svg.style.setProperty('--sheet-print-width',`${w}mm`);svg.style.setProperty('--sheet-print-height',`${h}mm`);
 $('gridRect').setAttribute('width',w);$('gridRect').setAttribute('height',h);
 $('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');
 svg.setAttribute('viewBox',`${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
 const docMeta=document.querySelector('.doc-meta');if(docMeta)docMeta.textContent=sizeLabel()+' · 1:1';
}
// The SVG is now the whole infinite workspace. The paper is a child group in that
// workspace, so pan/zoom moves the complete sheet rather than sliding geometry
// inside a page-sized viewport.
function fitSheet(){
 if(!drawing||!svg)return;
 const {width:w,height:h}=state.sheet;
 const viewportW=Math.max(320,drawing.clientWidth||800),viewportH=Math.max(240,drawing.clientHeight||600);
 const marginPx=40,pxPerMm=Math.max(.12,Math.min((viewportW-marginPx*2)/w,(viewportH-marginPx*2)/h));
 const viewW=viewportW/pxPerMm,viewH=viewportH/pxPerMm;
 state.view={x:-(viewW-w)/2,y:-(viewH-h)/2,w:viewW,h:viewH};
 state.baseViewWidth=viewW;state.zoom=1;applyView();updateSheetGeometry();$('zoomLabel').textContent='100%';
}
function applyView(){
 const v=state.view;
 svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
 state.zoom=(state.baseViewWidth||v.w)/v.w;
 $('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;
}
function setZoom(factor,clientPoint=null){
 const rect=svg.getBoundingClientRect();
 const anchor=clientPoint?{
  x:Math.max(0,Math.min(1,(clientPoint.x-rect.left)/Math.max(1,rect.width))),
  y:Math.max(0,Math.min(1,(clientPoint.y-rect.top)/Math.max(1,rect.height)))
 }:{x:.5,y:.5};
 const base=state.baseViewWidth||state.view.w;
 const next=zoomView({x:state.view.x,y:state.view.y,width:state.view.w,height:state.view.h},factor,anchor,{
  minWidth:base/64,maxWidth:base/.05
 });
 state.view={x:next.x,y:next.y,w:next.width,h:next.height};
 applyView();
}
function zoomFromWheel(evt){
 const factor=wheelZoomFactor(evt.deltaY,evt.deltaMode,evt.ctrlKey,drawing.clientHeight);
 setZoom(factor,{x:evt.clientX,y:evt.clientY});
}
function onCanvasWheel(evt){
 if(evt.cancelable)evt.preventDefault();
 const unit=evt.deltaMode===1?16:evt.deltaMode===2?Math.max(1,drawing.clientHeight):1;
 const dx=evt.deltaX*unit,dy=evt.deltaY*unit;
 // Horizontal two-finger trackpad scroll pans; vertical scroll and pinch zoom the sheet.
 if(evt.ctrlKey){zoomFromWheel(evt);return;}
 if(evt.shiftKey||(!evt.ctrlKey&&Math.abs(dx)>Math.abs(dy)*1.25)){
  const deltaX=evt.shiftKey?(Math.abs(dx)>0?dx:dy):dx;
  const r=svg.getBoundingClientRect();
  const next=panView(state.view,deltaX,0,r.width,r.height);
  state.view={x:next.x,y:next.y,w:next.width,h:next.height};
  applyView();return;
 }
 if(evt.altKey){const r=svg.getBoundingClientRect();const next=panView(state.view,0,dy,r.width,r.height);state.view={x:next.x,y:next.y,w:next.width,h:next.height};applyView();return;}
 // Precision touchpads send smooth pixel deltas. Their ordinary two-finger scroll
 // pans the sheet; mouse-wheel notches zoom; Ctrl+wheel / touchpad pinch zooms.
 if(evt.deltaMode===0&&Math.abs(dy)>0&&Math.abs(dy)<70&&Math.abs(dx)<70){
  const r=svg.getBoundingClientRect();
  const next=panView(state.view,dx,dy,r.width,r.height);
  state.view={x:next.x,y:next.y,w:next.width,h:next.height};applyView();return;
 }
 zoomFromWheel(evt);
}
function screenPoint(evt){
 const rect=svg.getBoundingClientRect();
 // Invert the paper group's matrix, not the outer workspace SVG matrix. This
 // returns page-local millimetres even when the sheet is panned or zoomed.
 try{const pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;const m=sheetRoot?.getScreenCTM?.();if(m){const p=pt.matrixTransform(m.inverse());if(Number.isFinite(p.x)&&Number.isFinite(p.y))return{x:p.x,y:p.y};}}catch{}
 const vb=svg.viewBox?.baseVal||{x:state.view.x,y:state.view.y,width:state.view.w,height:state.view.h};
 return {x:vb.x+(evt.clientX-rect.left)*(vb.width/Math.max(1,rect.width)),y:vb.y+(evt.clientY-rect.top)*(vb.height/Math.max(1,rect.height))};
}
function applyPrecision(p,evt=null){let q={x:p.x,y:p.y};
 if(state.snapGrid||checked('snapToggle')){const s=Math.max(.1,getNum('gridStep',5));q={x:Math.round(q.x/s)*s,y:Math.round(q.y/s)*s};}
 if(state.osnap && checked('objectSnapToggle')){const tol=4/state.zoom;const sn=nearestPoint(q,state.objects,tol);if(sn)q={x:sn.x,y:sn.y};}
 if(state.pending?.start && (state.ortho||checked('orthoToggle'))){q=constrainAngle(state.pending.start,q,getNum('angleStep',15));}
 if(evt?.shiftKey && state.pending?.start)q=constrainAngle(state.pending.start,q,getNum('angleStep',15));
 return {x:round(q.x),y:round(q.y)};
}
function snapshot(){return {objects:state.objects,selected:[...state.selected],templateId:state.templateId,sheet:state.sheet,title:state.title,name:state.name,view:state.view,baseViewWidth:state.baseViewWidth};}
function commit(){render();scheduleAutosave();updateHistoryButtons();}
function updateHistoryButtons(){if($('undoBtn'))$('undoBtn').disabled=!history.canUndo;if($('redoBtn'))$('redoBtn').disabled=!history.canRedo;}
function restoreSnapshot(s){if(!s)return;state.objects=structuredClone(s.objects||[]);state.selected=new Set((s.selected||[]).filter(id=>state.objects.some(o=>o.id===id)));state.templateId=s.templateId||state.templateId;state.sheet=structuredClone(s.sheet||state.sheet);state.title={...defaultTitle(),...(s.title||{})};state.name=s.name||state.name;state.view=structuredClone(s.view||state.view);state.baseViewWidth=s.baseViewWidth||state.baseViewWidth||state.view?.w;writeTitleToUI();$('titleFormSelect').value=state.templateId;$('templateQuickSelect').value=state.templateId;$('filenameField').value=state.name;$('paperFormat').value=state.sheet.format||'A3P';updateSheetGeometry();applyView();render();showProperties();}
// Undo/redo restore drawing data but intentionally retain the current workspace camera.
function undo(){const currentView={...state.view};const s=history.undo(snapshot());if(s){s.view=currentView;s.baseViewWidth=state.baseViewWidth;restoreSnapshot(s);setStatus('Отменено — вид сцены сохранён');}updateHistoryButtons();}
function redo(){const currentView={...state.view};const s=history.redo(snapshot());if(s){s.view=currentView;s.baseViewWidth=state.baseViewWidth;restoreSnapshot(s);setStatus('Повторено — вид сцены сохранён');}updateHistoryButtons();}
function layerFor(o){if(o.type==='reference')return 'reference';if(['dimension','dimH','dimV','dimDia','dimRad','dimAngle','text','leader','hatch','table','roughness','tolerance','weld','section','techReq'].includes(o.type))return 'annotation';if(o.type==='construction'||o.type==='xline'||o.type==='ray'||o.type==='ruler'||o.type==='centerline')return 'construction';return 'geometry';}
function styleFor(o){const dash=(o.role==='center'&&!o.dash)?'8 2 1 2':o.dash;return {stroke:o.color||'#20252a','stroke-width':o.width??.35,'stroke-dasharray':dash||null,'stroke-linecap':'round','stroke-linejoin':'round',fill:o.fill||'none',opacity:o.opacity??1};}
function drawArrow(parent,tip,from,size=4.5,color='#20252a',halfAngleDeg=14){
 const pts=arrowHeadPoints(tip,from,size,halfAngleDeg);
 if(pts.length!==3)return;
 el('polygon',{points:pts.map(p=>`${round(p.x)},${round(p.y)}`).join(' '),fill:color,stroke:color,'stroke-width':.12,'stroke-linejoin':'round'},parent);
}
function addText(parent,x,y,text,size=3.5,attrs={}){
 const lines=String(text??'').split('\n');const t=el('text',{x,y,'font-size':size,'font-family':'Arial, sans-serif',fill:'#20252a','dominant-baseline':'auto',...attrs},parent);
 lines.forEach((line,i)=>el('tspan',{x,dy:i===0?0:size*1.25},t, line));return t;
}
function drawDimensionArrow(parent,tip,toward,size,color,style='filled',axis={x:1,y:0}){
 if(style==='none'||!style)return;
 if(style==='dot'){el('circle',{cx:tip.x,cy:tip.y,r:Math.max(.18,size*.16),fill:color,stroke:color,'stroke-width':.12},parent);return;}
 if(style==='tick'){
  const nx=-axis.y,ny=axis.x,k=Math.max(.35,size*.36);
  el('line',{x1:tip.x-nx*k+axis.x*k,y1:tip.y-ny*k+axis.y*k,x2:tip.x+nx*k-axis.x*k,y2:tip.y+ny*k-axis.y*k,stroke:color,'stroke-width':.3},parent);return;
 }
 const pts=arrowHeadPoints(tip,toward,size,14);if(pts.length!==3)return;
 if(style==='open'){
  el('path',{d:`M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} M ${pts[0].x} ${pts[0].y} L ${pts[2].x} ${pts[2].y}`,fill:'none',stroke:color,'stroke-width':.28,'stroke-linejoin':'round'},parent);return;
 }
 el('polygon',{points:pts.map(p=>`${round(p.x)},${round(p.y)}`).join(' '),fill:color,stroke:color,'stroke-width':.12,'stroke-linejoin':'round'},parent);
}
function dimensionArrowStyles(o){
 const both=o.arrowStyle||'filled';
 const start=o.arrowStartStyle&&o.arrowStartStyle!=='inherit'?o.arrowStartStyle:(both==='single'?'none':both);
 const end=o.arrowEndStyle&&o.arrowEndStyle!=='inherit'?o.arrowEndStyle:both;
 return {start,end};
}
function dimensionLabelLayoutWorld(o){
 const geometry=getDimensionGeometry(o),label=getDimensionLabelLayout(o,geometry);
 return {...label,geometry,x:label.x+(o.dx||0),y:label.y+(o.dy||0)};
}
function renderForm1TitleBlock(g, bounds, title, ink='#000000'){
 const {x,y,width:w,height:h}=bounds;
 const ln=(x1,y1,x2,y2,sw=.25)=>el('line',{x1,y1,x2,y2,stroke:ink,'stroke-width':sw,fill:'none'},g);
 const rc=(x1,y1,ww,hh,sw=.35)=>el('rect',{x:x1,y:y1,width:ww,height:hh,fill:'none',stroke:ink,'stroke-width':sw},g);
 const tx=(x1,y1,str,size=1.7,anchor='start')=>addText(g,x1,y1,str,size,{'font-family':'Arial, sans-serif','text-anchor':anchor,fill:ink});
 rc(x,y,w,h,.35);
 // Form 1: 185 x 55 mm. Horizontal chain: 7+10+23+15+10+70+50.
 const colEdges=[7,17,40,55,65,135];
 for(const dx of colEdges)ln(x+dx,y,x+dx,y+h);
 // Change / approval table on the left (65 mm).
 [15,20,25,35,40,45,50].forEach(dy=>ln(x,y+dy,x+65,y+dy));
 const headers=['(14)','(15)','(16)','(17)','(18)'];
 const labels=['Зм.','Арк.','№ докум.','Підп.','Дата'];
 const widths=[7,10,23,15,10];let cx=x;
 widths.forEach((cw,i)=>{tx(cx+cw/2,y+18.2,headers[i],1.35,'middle');tx(cx+cw/2,y+23.4,labels[i],1.2,'middle');cx+=cw;});
 tx(x+2,y+31.5,'Студент',1.55);tx(x+2,y+38.5,'Кер. пр.',1.55);
 tx(x+2,y+43.5,'(10)',1.35);tx(x+17,y+43.5,'(11)',1.35);tx(x+42,y+43.5,'(12)',1.35);tx(x+57,y+43.5,'(13)',1.35);
 tx(x+2,y+48.5,'Н. контр.',1.45);tx(x+2,y+53.5,'Зав. каф.',1.45);
 tx(x+25,y+31.5,title.developer||'',1.7);tx(x+25,y+38.5,title.checker||'',1.7);tx(x+25,y+48.5,title.normative||'',1.65);tx(x+25,y+53.5,title.approved||'',1.65);
 // Main information fields: 70 mm wide, split into 15 / 20 / 20 mm bands.
 ln(x+65,y+15,x+135,y+15);ln(x+65,y+35,x+135,y+35);
 tx(x+67,y+4,'Позначення документа',1.45);tx(x+67,y+12,title.code||'КТ-24.000.000',2.0);
 tx(x+67,y+22,'Найменування виробу / роботи',1.45);tx(x+67,y+31,title.title||'Кресленик',2.25);
 tx(x+67,y+42,'Матеріал',1.45);tx(x+67,y+52,title.material||'',1.85);
 // Right block: 50 mm, divided into 15 / 17 / 18 mm and 15 / 5 / 15 / 5 / 15 mm rows.
 ln(x+150,y,x+150,y+35);ln(x+167,y,x+167,y+35);
 ln(x+140,y+15,x+140,y+35);ln(x+145,y+15,x+145,y+35);
 ln(x+155,y+15,x+155,y+55);
 [15,20,35,40].forEach(dy=>ln(x+135,y+dy,x+185,y+dy));
 tx(x+142.5,y+4,'Літ.',1.45,'middle');tx(x+158.5,y+4,'Маса',1.35,'middle');tx(x+176,y+4,'Масштаб',1.3,'middle');
 tx(x+137.5,y+19,'5',1.1,'middle');tx(x+142.5,y+19,'5',1.1,'middle');tx(x+147.5,y+19,'5',1.1,'middle');
 tx(x+142.5,y+31,title.liter||'У',1.7,'middle');tx(x+158.5,y+29,title.mass||'—',1.7,'middle');tx(x+176,y+29,title.scale||'1:1',1.7,'middle');
 tx(x+145,y+39,'Арк.',1.25,'middle');tx(x+170,y+39,'Аркушів',1.25,'middle');
 tx(x+145,y+48,title.sheet||'1',1.8,'middle');tx(x+170,y+48,title.sheets||'1',1.8,'middle');
 tx(x+157,y+53,'Організація: '+(title.company||'').slice(0,22),1.2,'middle');
}

function renderLab8SampleTemplate(g,w,h,title){
 // Faithful, monochrome reconstruction of the supplied A3 landscape frame.
 // The page is 420×297 mm. Coordinates below are mapped from the reference raster.
 const ink='#000000';
 const line=(x1,y1,x2,y2,width=.22)=>el('line',{x1,y1,x2,y2,stroke:ink,'stroke-width':width,fill:'none'},g);
 const rect=(x,y,ww,hh,width=.24)=>el('rect',{x,y,width:ww,height:hh,fill:'none',stroke:ink,'stroke-width':width},g);
 const tx=(x,y,text,size=2.2,anchor='start',key=null,rotate=null,italic=true)=>{
  const attrs={'font-family':"'GOST type B',Arial,sans-serif",'font-style':italic?'italic':'normal','font-weight':'400','text-anchor':anchor,fill:ink};
  if(key)attrs['data-template-key']=key;
  if(rotate)attrs.transform=`rotate(${rotate} ${x} ${y})`;
  return addText(g,x,y,text,size,attrs);
 };
 // Thin sheet perimeter visible in the provided scan, plus the actual working frame.
 rect(.6,.6,418.8,295.8,.18);
 rect(4.5,4,409,285,.30);
 // Left filing strip: 4.5 / 9.5 / 16.3 mm rails.
 line(9.5,4,9.5,124.5,.24);
 line(9.5,145,9.5,289,.24);
 line(16.3,4,16.3,289,.30);
 // Two upper cells, separated by a blank interval, then six lower cells.
 [64.5,124.5,145,180.5,187,216,224.5,261.5].forEach(y=>line(4.5,y,16.3,y,.22));
 // Vertical captions are deliberately kept short enough to remain inside the narrow strip.
 // The tiny words in the raster are not fully legible; these Ukrainian labels preserve their function.
 tx(7.0,39.0,'ПЕРШИЙ АРКУШ',2.05,'middle',null,-90);
 tx(7.0,97.5,'НАСТУПНІ АРКУШІ',2.0,'middle',null,-90);
 tx(7.0,163.0,'ПОЗНАЧЕННЯ',1.9,'middle',null,-90);
 tx(7.0,183.8,'ЗМІНИ',1.85,'middle',null,-90);
 tx(7.0,201.5,'ПЕРЕВІРКА',1.9,'middle',null,-90);
 tx(7.0,220.2,'ПІДПИС',1.85,'middle',null,-90);
 tx(7.0,243.0,'ДАТА',1.9,'middle',null,-90);
 tx(7.0,275.0,'АРКУШ',1.9,'middle',null,-90);
 // Upper-left designation/index field. Exact 70.5×14 mm footprint in the reference.
 rect(16.3,4,70.5,14,.30);
 const headerText=tx(51.55,13.9,title.leftHeader||'10 ХХ ХХ д/ 02206018',5.6,'middle','leftHeader');
 headerText.setAttribute('textLength','65.5');headerText.setAttribute('lengthAdjust','spacingAndGlyphs');

 // Main title block: 185×55 mm, flush with the right and lower working-frame edges.
 // Reference raster places it at x=228.5, y=234.0 on a 420×297 mm sheet.
 const x=228.5,y=234.0,bw=185,bh=55;
 rect(x,y,bw,bh,.34);
 // Left change/approval register, with five vertical columns and three empty upper rows.
 [7,17,40,55,65].forEach(dx=>line(x+dx,y,x+dx,y+bh,.25));
 [5,10,15,20,27,34,41,48].forEach(dy=>line(x,y+dy,x+65,y+dy,.20));
 const colCenters=[3.5,12,28.5,47.5,60];
 ['Зм.','Арк.','№ докум.','Підп.','Дата'].forEach((label,i)=>tx(x+colCenters[i],y+18.55,label,2.55,'middle',null,null,true));
 const roles=[
  ['Розроб.',title.developer||'Кушвид О.'],
  ['Перев.',title.checker||'Базиль Б.'],
  ['Т. контр.',title.technical||''],
  ['Н. контр.',title.normative||''],
  ['Затв.',title.approved||'']
 ];
 roles.forEach((r,i)=>{
  const yy=y+24.6+i*7.0;
  const roleLabel=tx(x+0.45,yy,r[0],1.5,'start',null,null,true);
  roleLabel.setAttribute('textLength','5.2');roleLabel.setAttribute('lengthAdjust','spacingAndGlyphs');
  // Keep personal names in the signature column; the document-number column stays empty.
  if(r[1]){const nameText=tx(x+47.5,yy,r[1],2.3,'middle',i===0?'developer':i===1?'checker':null,null,true);nameText.setAttribute('textLength','11.8');nameText.setAttribute('lengthAdjust','spacingAndGlyphs');}
 });
 // Code band across the complete 120 mm right section (no extra separator).
 line(x+65,y+15,x+185,y+15,.27);
 tx(x+125,y+10.1,title.code||'8.090220 ЛР XX XX 01',8.0,'middle','code');
 // Product name and variant occupy the 70 mm central panel.
 line(x+65,y+40,x+135,y+40,.27);
 tx(x+100,y+30.7,title.title||'Корпус',13.0,'middle','title');
 tx(x+100,y+52.0,title.variant||'Варіант 8',8.7,'middle','variant');
 // Right 50 mm data table: literature / mass / scale, sheet / sheet count and institution.
 line(x+135,y+15,x+135,y+55,.25);
 line(x+150,y+15,x+150,y+35,.22);
 line(x+167,y+15,x+167,y+35,.22);
 line(x+135,y+22,x+185,y+22,.20);
 tx(x+142.5,y+19.35,'Літ.',2.55,'middle',null,null,true);
 tx(x+158.5,y+19.35,'Маса',2.55,'middle',null,null,true);
 tx(x+176,y+19.35,'Масштаб',2.35,'middle',null,null,true);
 tx(x+142.5,y+31.2,title.liter||'У',4.2,'middle','liter');
 tx(x+158.5,y+31.2,title.mass||'—',4.2,'middle','mass');
 tx(x+176,y+31.2,title.scale||'1:1',4.2,'middle','scale');
 line(x+135,y+35,x+185,y+35,.22);
 line(x+160,y+35,x+160,y+45,.20);
 line(x+135,y+45,x+185,y+45,.22);
 tx(x+147.5,y+39.2,'Арк.',2.5,'middle',null,null,true);
 tx(x+172.5,y+39.2,'Аркушів',2.5,'middle',null,null,true);
 tx(x+147.5,y+44.1,title.sheet||'1',4.2,'middle','sheet');
 tx(x+172.5,y+44.1,title.sheets||'1',4.2,'middle','sheets');
 tx(x+160,y+53.0,title.company||'ШЦМГУ',7.6,'middle','company');
 // Two footer labels sit in the narrow strip below the title-block border, as in the source.
 tx(x+67.5,294.1,title.copy||'Копіював',2.9,'middle','copy');
 tx(x+160,294.1,`Формат ${title.sheetFormat||'А3'}`,2.9,'middle','sheetFormat');
}
function renderKompasLab5Template(g,w,h,title){
 const ink='#000000',sw=.38;
 const line=(x1,y1,x2,y2,width=sw)=>el('line',{x1,y1,x2,y2,stroke:ink,'stroke-width':width,fill:'none'},g);
 const rect=(x,y,ww,hh,width=sw)=>el('rect',{x,y,width:ww,height:hh,fill:'none',stroke:ink,'stroke-width':width},g);
 // Reconstructed from the uploaded Kompas Online v14 document: A4 portrait,
 // standard 20 mm binding margin and 5 mm remaining margins.
 const frame=getTemplateFrame('kompas-lab5-a4-template',w,h);
 rect(frame.x,frame.y,frame.width,frame.height,.45);
 // Keep the original drawing's form-1 title block at the lower right (185×55 mm).
 const tb=getForm1Bounds(w,h);
 const titleBlock={...title,developer:'',checker:'',technical:'',normative:'',approved:'',code:'',title:'',liter:'',mass:'',scale:'',sheet:'',sheets:'',company:''};
 renderForm1TitleBlock(g,tb,titleBlock,ink);
 // The supplied KCAD stores editable template text overrides separately from drawing geometry.
 const overrides=title.kompasTemplateTextOverrides&&typeof title.kompasTemplateTextOverrides==='object'
  ? Object.values(title.kompasTemplateTextOverrides) : [];
 overrides.forEach((item)=>{
  if(!item||!String(item.text??'').trim())return;
  const x=finiteNumber(item.x),y=finiteNumber(item.y),size=finiteNumber(item.size,2.5);
  const attrs={fill:ink,'font-size':size,'font-family':item.font||'Arial, sans-serif','font-style':item.slanted?'italic':'normal','font-weight':item.bold?'bold':'normal','text-anchor':item.anchor==='middle'?'middle':item.anchor==='end'?'end':'start'};
  if(Number(item.rotation))attrs.transform=`rotate(${Number(item.rotation)} ${x} ${y})`;
  const node=addText(g,x,y,String(item.text),size,attrs);
  node.setAttribute('data-template-key',item.key||'kompas-imported-text');
 });
 // Fill the standard title-block fields not represented by editable overrides.
 const tx=(x,y,text,size=1.65,anchor='start')=>addText(g,x,y,text,size,{'font-family':"'GOST type B',Arial,sans-serif",'text-anchor':anchor,fill:ink});
 tx(tb.x+67,tb.y+12,title.code||'КТ-24.ЛР5.001',1.8);
 tx(tb.x+67,tb.y+31,title.title||'Лабораторна робота 5',2.1);
 tx(tb.x+25,tb.y+31.5,title.developer||'Кушвид О.А.',1.6);
 tx(tb.x+25,tb.y+38.5,title.checker||'Базиль Б.',1.6);
 tx(tb.x+176,tb.y+29,title.scale||'1:1',1.6,'middle');
 tx(tb.x+157,tb.y+53,(title.company||'').slice(0,36),1.05,'middle');
}
function finiteNumber(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}

function renderTemplate(){
 const g=layers.template;g.replaceChildren();
 if((!checked('templateVisible')||!checked('templateToggle')) && $('templateVisible'))return;
 if(!state.templateId||state.templateId==='blank')return;
 const {width:w,height:h}=state.sheet;const t=state.templateId;const ink='#000000';const sw=.35;
 if(t==='lab8-reference-template'||t==='lab8-a3-landscape-template'){renderLab8SampleTemplate(g,w,h,state.title);return;}
 if(t==='kompas-lab5-a4-template'||t==='kompas-import-a4-template'){renderKompasLab5Template(g,w,h,state.title);return;}
 const line=(x1,y1,x2,y2,width=sw)=>el('line',{x1,y1,x2,y2,stroke:ink,'stroke-width':width,fill:'none'},g);
 const rect=(x,y,ww,hh,width=sw)=>el('rect',{x,y,width:ww,height:hh,fill:'none',stroke:ink,'stroke-width':width},g);
 const txt=(x,y,s,z=2.6,anchor='start',key=null,rotate=null)=>{
  const a={x,y,'font-size':z,'text-anchor':anchor,fill:ink,'font-family':'Arial, sans-serif'};if(rotate)a.transform=`rotate(${rotate} ${x} ${y})`;
  const e=addText(g,x,y,s,z,a);if(key)e.setAttribute('data-template-key',key);return e;
 };
 const frame=getTemplateFrame(t,w,h);rect(frame.x,frame.y,frame.width,frame.height,isGostTemplate(t)?.7:sw);
 if(t==='lab4-reference-template'){
  const left=18;line(left,10,left,h-10);line(23,10,23,h-10);line(left,48,23,48);line(left,86,23,86);line(left,124,23,124);
  rect(23,10,70,14);txt(58,19,state.title.code||'КТ-24.ЛР4.001',2.6,'middle','code');
  for(let i=0;i<5;i++){const yy=140+i*48;line(left,yy,23,yy);}
  const bw=Math.min(185,w-34),bx=w-5-bw,by=h-65;rect(bx,by,bw,55);line(bx,by+10,bx+bw,by+10);line(bx,by+20,bx+bw,by+20);line(bx,by+32,bx+bw,by+32);line(bx+80,by,bx+80,by+32);line(bx+125,by,bx+125,by+32);line(bx+150,by,bx+150,by+55);line(bx,by+42,bx+bw,by+42);
  txt(bx+3,by+7,'Позначення',2);txt(bx+3,by+18,state.title.title||'Лабораторна робота №4',3.2,'start','title');txt(bx+83,by+7,'Масштаб',1.8);txt(bx+101,by+18,state.title.scale||'1:1',2.7,'middle','scale');txt(bx+128,by+7,'Арк.',1.8);txt(bx+137,by+18,state.title.sheet||'1',2.4,'middle','sheet');
  txt(bx+3,by+30,'Розроб. '+(state.title.developer||'Кушвид О.'),2.2,'start','developer');txt(bx+83,by+30,'Перев. '+(state.title.checker||'Базиль Б.'),2.2,'start','checker');txt(bx+3,by+40,'Матеріал: '+(state.title.material||''),2.0,'start','material');txt(bx+3,by+50,state.title.company||'ШЦК',2.0,'start','company');txt(bx+bw-3,by+40,'ЛР №4',2.6,'end');
 }else if(t==='lab5-a4-reference-template'){
  const bw=Math.min(185,w-25),bx=w-10-bw,by=h-65;rect(bx,by,bw,55);line(bx,by+8,bx+bw,by+8);line(bx,by+17,bx+bw,by+17);line(bx,by+27,bx+bw,by+27);line(bx,by+38,bx+bw,by+38);line(bx+75,by,bx+75,by+38);line(bx+120,by,bx+120,by+38);line(bx+150,by,bx+150,by+55);
  txt(bx+3,by+6,'Позначення документа',2);txt(bx+3,by+15,state.title.title||'Лабораторна робота №5',2.8,'start','title');txt(bx+78,by+6,'Масштаб',1.8);txt(bx+98,by+15,state.title.scale||'1:1',2.2,'middle','scale');txt(bx+3,by+25,'Розроб. '+(state.title.developer||'Кушвид О.'),2.1,'start','developer');txt(bx+78,by+25,'Перев. '+(state.title.checker||''),2.1,'start','checker');txt(bx+3,by+35,'Матеріал '+(state.title.material||''),2.0,'start','material');txt(bx+3,by+48,state.title.company||'Коледж',2,'start','company');txt(bx+bw-3,by+48,'ЛР №5',2.5,'end');
  line(18,10,18,h-10);line(18,35,10,35);
 }else if(isGostTemplate(t)){
  renderForm1TitleBlock(g,getForm1Bounds(w,h),state.title,ink);
 }
}

function renderObject(o,parent){
 if(o.hidden)return;
 const wrap=el('g',{'data-object-id':o.id,'data-reference-exportable':o.exportable===false?'false':'true',transform:`translate(${o.dx||0} ${o.dy||0})`,opacity:o.opacity??1},parent);
 const common=styleFor(o);const sw=common['stroke-width'];
 const add=(tag,attrs={})=>el(tag,{...common,...attrs},wrap);
 switch(o.type){
 case 'line':case 'arrowLine':case 'construction':case 'xline':case 'ray':case 'ruler':case 'centerline':{
  let a=o.a,b=o.b;
  if(o.type==='xline'||o.type==='ray'){
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,extent=Math.max(state.sheet.width,state.sheet.height)*3;
   a=o.type==='xline'?{x:a.x-ux*extent,y:a.y-uy*extent}:a;b={x:a.x+ux*extent,y:a.y+uy*extent};
  }
  add('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,fill:'none','stroke-dasharray':o.type==='construction'||o.type==='centerline'?'4 2':common['stroke-dasharray']});
  if(o.type==='arrowLine')drawArrow(wrap,b,a,Math.max(.5,Number(o.arrowSize??3.2)),o.color||'#20252a',15);
  if(o.type==='centerline'){
   const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};add('line',{x1:mid.x-1,y1:mid.y-1,x2:mid.x+1,y2:mid.y+1,'stroke-width':sw});
  }
  break;
 }
 case 'circle':add('circle',{cx:o.center.x,cy:o.center.y,r:o.r});break;
 case 'ellipse':add('ellipse',{cx:o.center.x,cy:o.center.y,rx:o.rx,ry:o.ry,transform:o.rotation?`rotate(${o.rotation} ${o.center.x} ${o.center.y})`:null});break;
 case 'rect':add('rect',{x:o.x,y:o.y,width:o.w,height:o.h,rx:o.rx||0,ry:o.ry||0});break;
 case 'polygon':add('polygon',{points:o.points.map(p=>`${p.x},${p.y}`).join(' ')});break;
 case 'polyline':case 'freehand':case 'breakline':add('path',{d:pathData(o.points,!!o.closed),fill:'none'});break;
 case 'spline':add('path',{d:splinePathData(o.points||[],!!o.closed),fill:'none'});break;
 case 'curvedArrow':{const pts=o.points||[];if(pts.length>=2){add('path',{d:splinePathData(pts,false),fill:'none'});drawArrow(wrap,pts[pts.length-1],pts[pts.length-2],Math.max(.5,Number(o.arrowSize??3.2)),o.color||'#20252a',15);}break;}
 case 'arc':{
   const a=o.startAngle*Math.PI/180,b=o.endAngle*Math.PI/180;
   const p1={x:o.center.x+o.r*Math.cos(a),y:o.center.y+o.r*Math.sin(a)},p2={x:o.center.x+o.r*Math.cos(b),y:o.center.y+o.r*Math.sin(b)};
   const large=Math.abs(o.endAngle-o.startAngle)>180?1:0;add('path',{d:`M ${p1.x} ${p1.y} A ${o.r} ${o.r} 0 ${large} 1 ${p2.x} ${p2.y}`,fill:'none'});break;
 }
 case 'text':{
   const t=addText(wrap,o.x,o.y,o.text,o.size||5,{fill:o.color||'#20252a','font-family':o.font||'Arial, sans-serif','font-weight':o.bold?'bold':'normal','font-style':o.italic?'italic':'normal','text-anchor':o.align==='center'?'middle':o.align==='end'?'end':'start',transform:o.rotation?`rotate(${o.rotation} ${o.x} ${o.y})`:null});
   if(o.underline||o.frame){const b=boundsOfObject(o);if(o.frame)el('rect',{x:o.x-1,y:o.y-(o.size||5),width:Math.max(10,String(o.text).length*(o.size||5)*.58)+2,height:(o.size||5)*1.5,fill:'none',stroke:o.color||'#20252a','stroke-width':.25},wrap);if(o.underline)el('line',{x1:o.x,y1:o.y+1,x2:o.x+String(o.text).length*(o.size||5)*.58,y2:o.y+1,stroke:o.color||'#20252a','stroke-width':.25},wrap);}
   break;
 }
 case 'dimension':case 'dimH':case 'dimV':case 'dimRad':case 'dimDia':case 'dimAngle':{
   const geometry=getDimensionGeometry(o),{a,b,p1,p2,axis}=geometry,color=o.color||'#20252a';
   const kind=geometry.kind;
   if(kind!=='dimDia'&&kind!=='diameter'){
    add('line',{x1:a.x,y1:a.y,x2:p1.x,y2:p1.y,'stroke-width':.2});
    add('line',{x1:b.x,y1:b.y,x2:p2.x,y2:p2.y,'stroke-width':.2});
   }
   add('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,'stroke-width':.25});
   const arrowSize=Math.max(.5,Number(o.arrowSize??2.5));
   const labelLayout=getDimensionLabelLayout(o,geometry);
   const placement=getDimensionArrowPlacement(o,geometry,labelLayout);
   const inside=placement==='inside',styles=dimensionArrowStyles(o);
   const startToward={x:p1.x+(inside?axis.x:-axis.x),y:p1.y+(inside?axis.y:-axis.y)};
   const endToward={x:p2.x+(inside?-axis.x:axis.x),y:p2.y+(inside?-axis.y:axis.y)};
   drawDimensionArrow(wrap,p1,startToward,arrowSize,color,styles.start,axis);
   drawDimensionArrow(wrap,p2,endToward,arrowSize,color,styles.end,axis);
   if(o.showValue!==false){
    const labelRotation=labelLayout.rotation;
    const transform=labelRotation?`rotate(${labelRotation} ${labelLayout.x} ${labelLayout.y})`:null;
    addText(wrap,labelLayout.x,labelLayout.y,labelLayout.text,labelLayout.textSize,{fill:color,'text-anchor':'middle','paint-order':'normal','stroke':'none',transform,'pointer-events':'all','data-dimension-label-hit':'true','data-object-id':o.id,'aria-label':'Переместить размерное число'});
   }
   break;
 }
 case 'leader':{
   const pts=o.points||[];if(pts.length>1){add('path',{d:pathData(pts),fill:'none'});drawArrow(wrap,pts[0],pts[1],2.5,o.color||'#20252a');addText(wrap,pts.at(-1).x+1,pts.at(-1).y-1,o.text||'',o.textSize||3.5,{fill:o.color||'#20252a'});}break;
 }
 case 'centerMark':{
  const c=o.center,r=o.r||5;add('line',{x1:c.x-r,y1:c.y,x2:c.x+r,y2:c.y,'stroke-dasharray':'3 1'});add('line',{x1:c.x,y1:c.y-r,x2:c.x,y2:c.y+r,'stroke-dasharray':'3 1'});break;
 }
 case 'hatch':{
   const path=pathData(o.points,true);const clipId=`clip-${o.id}`;const defs=svg.querySelector('defs');let cp=el('clipPath',{id:clipId},defs);el('path',{d:path},cp);
   el('path',{d:path,fill:'none',stroke:o.color||'#20252a','stroke-width':o.width||.25},wrap);
   if(o.pattern==='solid'){el('path',{d:path,fill:o.color||'#20252a',opacity:.25,stroke:'none'},wrap);}else{
    const b=boundsOfObject(o),angle=(o.angle||45)*Math.PI/180,spacing=o.spacing||3,span=Math.hypot(b.w,b.h)+20,cx=b.x+b.w/2,cy=b.y+b.h/2;
    const angles=o.pattern==='cross'?[(o.angle||45),(o.angle||45)+90]:o.pattern==='triple'?[(o.angle||45),(o.angle||45)+60,(o.angle||45)+120]:[(o.angle||45)];
    for(const angle of angles){const hatchGroup=el('g',{ 'clip-path':`url(#${clipId})`,transform:`rotate(${angle} ${cx} ${cy})`},wrap);for(let y=cy-span;y<=cy+span;y+=spacing)el('line',{x1:cx-span,y1:y,x2:cx+span,y2:y,stroke:o.color||'#20252a','stroke-width':o.width||.25},hatchGroup);}
   }break;
 }
 case 'table':{
   const rows=o.rows||3,cols=o.cols||3,cw=o.w/cols,ch=o.h/rows;add('rect',{x:o.x,y:o.y,width:o.w,height:o.h});for(let c=1;c<cols;c++)add('line',{x1:o.x+c*cw,y1:o.y,x2:o.x+c*cw,y2:o.y+o.h});for(let r=1;r<rows;r++)add('line',{x1:o.x,y1:o.y+r*ch,x2:o.x+o.w,y2:o.y+r*ch});break;
 }
 case 'roughness':case 'tolerance':case 'weld':case 'section':case 'techReq':{
  const p=o.a||{x:o.x,y:o.y};add('path',{d:`M ${p.x} ${p.y} l 5 -5 l 5 5`,fill:'none'});addText(wrap,p.x+8,p.y-2,o.text||({roughness:'Ra 3,2',tolerance:'±0,1',weld:'△',section:'А—А',techReq:'Технические требования'}[o.type]),o.textSize||3.5);break;
 }
 case 'reference':{
   if(o.dataUrl){
    const rotation=o.rotation?`rotate(${o.rotation} ${o.x+o.w/2} ${o.y+o.h/2})`:null;
    const aspectMode=o.keepAspect===false?'none':'xMidYMid meet';
    el('image',{href:o.dataUrl,x:o.x,y:o.y,width:o.w,height:o.h,preserveAspectRatio:aspectMode,transform:rotation,'data-reference-locked':o.locked?'true':'false'},wrap);
    el('rect',{x:o.x,y:o.y,width:o.w,height:o.h,transform:rotation,fill:'none',stroke:'#168db2','stroke-dasharray':'2 2','stroke-width':.3},wrap);
   }break;
 }
 default:break;
 }
 // transparent hit strip makes thin geometry easy to select
 if(['line','arrowLine','construction','ray','xline','ruler','centerline','polyline','freehand','spline','curvedArrow','arc','dimension','dimH','dimV'].includes(o.type)){
   const pts=o.points||[];let d='';if(o.a&&o.b)d=`M ${o.a.x} ${o.a.y} L ${o.b.x} ${o.b.y}`;else if(pts.length)d=o.type==='spline'||o.type==='curvedArrow'?splinePathData(pts,false):pathData(pts,false);
   if(d)el('path',{d,fill:'none',stroke:'transparent','stroke-width':Math.max(3,sw+2),'pointer-events':'stroke'},wrap);
 }
 // Keep a dedicated label hitbox above the dimension-line hit strip so the value can be grabbed independently.
 if(isDimensionObject(o)&&o.showValue!==false){
  const label=dimensionLabelLayoutWorld(o),rotation=label.rotation?`rotate(${label.rotation} ${label.x-(o.dx||0)} ${label.y-(o.dy||0)})`:null;
  el('rect',{x:label.x-(o.dx||0)-label.width/2,y:label.y-(o.dy||0)-label.textSize*1.12,width:label.width,height:label.textSize*1.5,transform:rotation,fill:'transparent',stroke:'none','pointer-events':'all','data-dimension-label-hit':'true','data-object-id':o.id,cursor:'move'},wrap);
 }
 // Filled transparent hit targets let a user select closed geometry from its interior,
 // instead of having to hit a sub-pixel outline (especially useful for circles on laptops).
 if(o.type==='circle')el('circle',{cx:o.center.x,cy:o.center.y,r:o.r,fill:'transparent',stroke:'transparent','stroke-width':Math.max(3,sw+2),'pointer-events':'all'},wrap);
 else if(o.type==='ellipse')el('ellipse',{cx:o.center.x,cy:o.center.y,rx:o.rx,ry:o.ry,transform:o.rotation?`rotate(${o.rotation} ${o.center.x} ${o.center.y})`:null,fill:'transparent',stroke:'transparent','stroke-width':Math.max(3,sw+2),'pointer-events':'all'},wrap);
 else if(o.type==='rect')el('rect',{x:o.x,y:o.y,width:o.w,height:o.h,rx:o.rx||0,ry:o.rx||0,fill:'transparent',stroke:'transparent','stroke-width':Math.max(3,sw+2),'pointer-events':'all'},wrap);
 else if(o.type==='polygon')el('polygon',{points:o.points.map(p=>`${p.x},${p.y}`).join(' '),fill:'transparent',stroke:'transparent','stroke-width':Math.max(3,sw+2),'pointer-events':'all'},wrap);
}
function updateLayerVisibility(){layers.geometry.style.display=checked('geometryVisible')?'':'none';layers.annotation.style.display=checked('dimensionsVisible')?'':'none';layers.construction.style.display=checked('constructionVisible')?'':'none';const visible=checked('referenceVisibleToggle')&&checked('referenceVisibleToggleSecondary');layers.reference.style.display=visible?'':'none';}
function renderObjects(){
 for(const l of [layers.reference,layers.geometry,layers.construction,layers.annotation])l.replaceChildren();
 for(const o of state.objects){const parent=layers[layerFor(o)]||layers.geometry;renderObject(o,parent);}
 updateLayerVisibility();renderSelection();renderTree();renderReferenceManager();
}
function objectBounds(o){const b=boundsOfObject(o);return{x:b.x+(o.dx||0),y:b.y+(o.dy||0),w:b.w,h:b.h};}
function bakeOffset(o){const dx=o.dx||0,dy=o.dy||0;if(!dx&&!dy)return o;if(o.points)o.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));for(const k of ['a','b','center'])if(o[k])o[k]={x:o[k].x+dx,y:o[k].y+dy};if(o.x!=null)o.x+=dx;if(o.y!=null)o.y+=dy;o.dx=0;o.dy=0;return o;}
function materializedObject(o){const q=structuredClone(o);return bakeOffset(q);}
function renderSelection(){
 const g=layers.selection;g.replaceChildren();
 for(const id of state.selected){const o=state.objects.find(v=>v.id===id);if(!o)continue;const b=objectBounds(o);el('rect',{x:b.x-1,y:b.y-1,width:Math.max(b.w,2)+2,height:Math.max(b.h,2)+2,fill:'none',stroke:'#13a9d1','stroke-width':.4,'stroke-dasharray':'2 1'},g);
  if(!o.locked&&o.type!=='circle'){
   const cx=b.x+b.w/2,top=b.y,hy=top-8.5;
   el('line',{x1:cx,y1:top-1,x2:cx,y2:hy,stroke:'#f3a83b','stroke-width':.32,'stroke-dasharray':'1 0.7','pointer-events':'none'},g);
   el('circle',{cx,cy:hy,r:1.45,fill:'#f3a83b',stroke:'#20252a','stroke-width':.25,cursor:'grab','pointer-events':'all','data-object-rotate-handle':'true','data-object-id':o.id,'aria-label':'Повернуть объект'},g);
  }
  if(o.type==='reference'&&!o.locked){el('rect',{x:b.x+b.w-1.8,y:b.y+b.h-1.8,width:3.6,height:3.6,rx:.45,fill:'#fff',stroke:'#087fa8','stroke-width':.7,cursor:'nwse-resize','data-reference-resize-handle':'true','data-object-id':o.id},g);}
  if(!o.locked){
   if(isDimensionObject(o)&&o.showValue!==false){
    const label=dimensionLabelLayoutWorld(o),axis=label.geometry.axis;
    const cx=label.x,cy=label.y,scale=Math.max(.1,state.zoom);
    const free={x:cx,y:cy+label.textSize*.8};
    const along={x:cx+axis.x*(label.width/2+2.2),y:cy+axis.y*(label.width/2+2.2)};
    const size={x:cx+label.width/2+1.1,y:cy-label.textSize*.55};
    const rotate={x:cx,y:cy-label.textSize*2.05};
    el('line',{x1:free.x,y1:free.y-1.2/scale,x2:free.x,y2:cy+label.textSize*.25,stroke:'#0786a4','stroke-width':.3/scale,'pointer-events':'none'},g);
    el('rect',{x:free.x-1.15/scale,y:free.y-1.15/scale,width:2.3/scale,height:2.3/scale,fill:'#eafaff',stroke:'#0786a4','stroke-width':.55/scale,'vector-effect':'non-scaling-stroke',cursor:'move','pointer-events':'all','data-dimension-label-move-handle':'true','data-object-id':o.id,'aria-label':'Свободно переместить размерное число'},g);
    el('line',{x1:cx,y1:cy,x2:along.x,y2:along.y,stroke:'#0786a4','stroke-width':.25/scale,'stroke-dasharray':'1 1','pointer-events':'none'},g);
    el('rect',{x:along.x-1.35/scale,y:along.y-1.35/scale,width:2.7/scale,height:2.7/scale,transform:`rotate(45 ${along.x} ${along.y})`,fill:'#d8f5ff',stroke:'#087fa8','stroke-width':.55/scale,'vector-effect':'non-scaling-stroke',cursor:'move','pointer-events':'all','data-dimension-label-axis-handle':'true','data-object-id':o.id,'aria-label':'Переместить число вдоль размерной оси'},g);
    el('rect',{x:size.x-1.25/scale,y:size.y-1.25/scale,width:2.5/scale,height:2.5/scale,rx:.3/scale,fill:'#fff',stroke:'#087fa8','stroke-width':.6/scale,'vector-effect':'non-scaling-stroke',cursor:'nwse-resize','pointer-events':'all','data-dimension-label-size-handle':'true','data-object-id':o.id,'aria-label':'Изменить высоту цифры'},g);
    el('line',{x1:cx,y1:cy-label.textSize*.65,x2:rotate.x,y2:rotate.y+1.2/scale,stroke:'#e39a2d','stroke-width':.3/scale,'stroke-dasharray':'1 1','pointer-events':'none'},g);
    el('circle',{cx:rotate.x,cy:rotate.y,r:1.45/scale,fill:'#f3a83b',stroke:'#20252a','stroke-width':.25/scale,'vector-effect':'non-scaling-stroke',cursor:'grab','pointer-events':'all','data-dimension-label-rotate-handle':'true','data-object-id':o.id,'aria-label':'Повернуть размерное число'},g);
   }
   const addGrip=(point,kind,index)=>{
    const r=1.45/Math.max(.1,state.zoom),visible=.28/Math.max(.1,state.zoom);
    el('circle',{cx:point.x+(o.dx||0),cy:point.y+(o.dy||0),r,fill:'transparent',stroke:'none','pointer-events':'all',cursor:'grab','data-edit-point-handle':'true','data-handle-kind':kind,'data-point-index':index,'data-object-id':o.id},g);
    el('circle',{cx:point.x+(o.dx||0),cy:point.y+(o.dy||0),r:visible,fill:'#0786a4',stroke:'none','stroke-width':0,'vector-effect':'non-scaling-stroke','pointer-events':'none'},g);
   };
   if(['line','arrowLine','construction','xline','ray','ruler','centerline'].includes(o.type)){addGrip(o.a,'line-end',0);addGrip(o.b,'line-end',1);}
   else if(isDimensionObject(o)){addGrip(o.a,'dimension-point',0);addGrip(o.b,'dimension-point',1);}
   else if(['polyline','spline','curvedArrow','polygon','freehand','breakline'].includes(o.type))(o.points||[]).forEach((pt,i)=>addGrip(pt,'vertex',i));
   else if(o.type==='circle'&&o.center){addGrip(o.center,'circle-center',0);addGrip({x:o.center.x+o.r,y:o.center.y},'circle-radius',0);}
   else if(o.type==='ellipse'&&o.center){addGrip(o.center,'ellipse-center',0);addGrip({x:o.center.x+o.rx,y:o.center.y},'ellipse-rx',0);addGrip({x:o.center.x,y:o.center.y+o.ry},'ellipse-ry',0);}
   // Visible, hit-testable corner grips for box scaling. Use explicit pointer-events
   // because the parent selection layer intentionally ignores pointer input.
   if(['circle','ellipse','rect','hatch'].includes(o.type)&&b.w>.05&&b.h>.05){
    const hs=2.7/Math.max(.1,state.zoom);
    for(const [corner,x,y] of [['nw',b.x,b.y],['ne',b.x+b.w,b.y],['se',b.x+b.w,b.y+b.h],['sw',b.x,b.y+b.h]]){
     el('rect',{x:x-hs/2,y:y-hs/2,width:hs,height:hs,rx:.25/Math.max(.1,state.zoom),fill:'#f4fbff',stroke:'#087f9d','stroke-width':.48/Math.max(.1,state.zoom),'vector-effect':'non-scaling-stroke','pointer-events':'all',cursor:corner==='nw'||corner==='se'?'nwse-resize':'nesw-resize','data-object-scale-handle':'true','data-scale-corner':corner,'data-object-id':o.id},g);
    }
   }
  }
 }
 $('selectedStatus').textContent=String(state.selected.size);
}
function renderTree(){
 const tree=$('objectTree');if(!tree)return;tree.replaceChildren();
 const counts={geometry:0,annotation:0,construction:0};
 for(const o of state.objects){counts[layerFor(o)]++;const b=document.createElement('button');b.type='button';b.className='tree-object'+(state.selected.has(o.id)?' selected':'');b.textContent=`${o.name||({line:'Отрезок',arrowLine:'Стрелка 1',circle:'Окружность',ellipse:'Эллипс',rect:'Прямоугольник',dimension:'Размер',spline:'Сплайн',curvedArrow:'Гнутая стрелка',polyline:'Ломаная',text:'Текст',polygon:'Многоугольник',reference:'Референс'}[o.type]||o.type)} · ${o.id}`;b.addEventListener('click',()=>{state.selected=new Set([o.id]);renderObjects();showProperties();showPanel('properties');});tree.appendChild(b);}
 $('geometryCount').textContent=counts.geometry;$('annotationCount').textContent=counts.annotation;$('constructionCount').textContent=counts.construction;
}
function renderReferenceManager(){
 const list=$('referenceList');if(!list)return;
 const refs=state.objects.filter(o=>o.type==='reference');
 $('referenceCount').textContent=String(refs.length);
 $('referenceEmptyState').classList.toggle('hidden',refs.length>0);
 list.replaceChildren();
 for(const ref of refs){
  const card=document.createElement('article');card.className='reference-card'+(state.selected.has(ref.id)?' selected':'')+(ref.hidden?' is-hidden':'');
  const select=document.createElement('button');select.type='button';select.className='reference-card-main';select.title='Выбрать этот референс';
  const thumb=document.createElement('span');thumb.className='reference-card-thumb';
  const image=document.createElement('img');image.alt='';image.src=ref.dataUrl||'';image.draggable=false;thumb.append(image);
  const copy=document.createElement('span');copy.className='reference-card-copy';
  const name=document.createElement('b');name.textContent=ref.name||`Референс ${ref.id}`;
  const meta=document.createElement('small');meta.textContent=`${Number(ref.w||0).toFixed(1)} × ${Number(ref.h||0).toFixed(1)} мм · ${Math.round((ref.opacity??.88)*100)}%`;
  const stateText=document.createElement('small');stateText.className='reference-card-state';stateText.textContent=ref.hidden?'Скрыт':(ref.locked?'Закреплён':'Можно перемещать');
  copy.append(name,meta,stateText);select.append(thumb,copy);select.addEventListener('click',()=>{selectObject(ref.id,false);showPanel('references');});
  const actions=document.createElement('div');actions.className='reference-card-actions';
  const visibility=document.createElement('button');visibility.type='button';visibility.className='reference-icon-btn';visibility.textContent=ref.hidden?'◉':'◌';visibility.title=ref.hidden?'Показать референс':'Скрыть референс';visibility.setAttribute('aria-label',visibility.title);visibility.addEventListener('click',()=>mutateReference(ref.id,o=>o.hidden=!o.hidden));
  const lock=document.createElement('button');lock.type='button';lock.className='reference-icon-btn';lock.textContent=ref.locked?'🔒':'🔓';lock.title=ref.locked?'Разблокировать':'Закрепить';lock.setAttribute('aria-label',lock.title);lock.addEventListener('click',()=>mutateReference(ref.id,o=>o.locked=!o.locked));
  actions.append(visibility,lock);card.append(select,actions);list.append(card);
 }
 const selected=selectedReference();const controls=$('referenceManagerSelected');controls?.classList.toggle('hidden',!selected);
 if(selected){
  const preview=$('referenceManagerPreview');if(preview&&preview.getAttribute('src')!==selected.dataUrl)preview.setAttribute('src',selected.dataUrl||'');
  $('referenceManagerName').textContent=selected.name||'Референс';
  $('referenceManagerMeta').textContent=`X ${Number(selected.x||0).toFixed(1)} · Y ${Number(selected.y||0).toFixed(1)} мм · ${Number(selected.w||0).toFixed(1)} × ${Number(selected.h||0).toFixed(1)} мм`;
  const opacity=$('referenceManagerOpacity');if(document.activeElement!==opacity)opacity.value=Math.round((selected.opacity??.88)*100);
  $('referenceManagerOpacityValue').textContent=`${Math.round((selected.opacity??.88)*100)}%`;
  $('referenceManagerLockBtn').textContent=selected.locked?'🔓 Разблокировать':'🔒 Заблокировать';
 }
}
function mutateReference(id,mutator){const ref=state.objects.find(o=>o.id===id&&o.type==='reference');if(!ref)return;history.push(snapshot());mutator(ref);render();showProperties();scheduleAutosave();updateHistoryButtons();}
function showReferencesPanel(){document.querySelector('[data-panel="references"]')?.click();}
function render(){
 updateSheetGeometry();renderTemplate();renderObjects();renderPreview();
 const doc=$('docName');if(doc)doc.textContent=state.name||'Кресленик БЕЗ НАЗВИ';
 updateHistoryButtons();
}
function renderPreview(){const g=layers.preview;g.replaceChildren();if(state.preview){const o={...state.preview,color:'#168db2',width:.35,dash:'2 1',fill:'none'};renderObject(o,g);const pts=o.points?.length?[o.points[0],o.points[o.points.length-1]]:(o.a&&o.b?[o.a,o.b]:[]);for(const p of pts)el('circle',{cx:p.x,cy:p.y,r:.7/Math.max(.1,state.zoom),fill:'#0b8eae',stroke:'#ffffff','stroke-width':.18,'vector-effect':'non-scaling-stroke'},g);}}
function addObject(o){history.push(snapshot());o.id=o.id||nextId();o.color=o.color||getVal('objectColor','#20252a');o.width=o.width??getNum('drawingLineWidth',.35);o.layer=o.layer||'Основной';o.dx=o.dx||0;o.dy=o.dy||0;state.objects.push(o);state.selected=new Set([o.id]);commit();showProperties();setStatus('Объект создан');}
function selectObject(id,additive=false){if(!additive)state.selected.clear();if(id)state.selected.add(id);renderObjects();showProperties();if(id)showPanel('properties');}
function showProperties(){
 renderReferenceManager();
 const o=state.objects.find(x=>state.selected.size===1&&x.id===[...state.selected][0]);
 $('noSelection')?.classList.toggle('hidden',!!o);$('selectionFields')?.classList.toggle('hidden',!o);
 if(!o){if($('quickReferenceLockBtn'))$('quickReferenceLockBtn').disabled=true;$('objectSpecificFields')?.replaceChildren(Object.assign(document.createElement('div'),{className:'muted-hint',textContent:'Выберите объект, чтобы открыть его точные параметры.'}));return;}if($('quickReferenceLockBtn'))$('quickReferenceLockBtn').disabled=o.type!=='reference';if($('quickReferenceLockBtn'))$('quickReferenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));if($('referenceLockStatus')&&o.type==='reference'){$('referenceLockStatus').textContent=o.locked?'● Перемещение запрещено':'● Перемещение разрешено';$('referenceLockStatus').className='reference-lock-status '+(o.locked?'locked':'unlocked');}if($('referenceLockBtn')&&o.type==='reference'){$('referenceLockBtn').textContent=o.locked?'🔓 Разрешить перемещение':'🔒 Запретить перемещение';$('referenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));}
 const put=(id,v)=>{if($(id))$(id).value=v??'';};const chk=(id,v)=>{if($(id))$(id).checked=!!v;};
 put('objectColor',o.color||'#20252a');put('objectWidth',o.width??.35);put('objectDash',o.dash||'');put('objectLayer',o.layer||'geometry');put('objectLineRole',o.role||'main');put('objectName',o.name||'');chk('objectLocked',o.locked);
 const b=objectBounds(o);put('objectBoxX',round(b.x));put('objectBoxY',round(b.y));put('objectBoxW',round(b.w));put('objectBoxH',round(b.h));put('objectRotationAngle',o.rotation||0);put('objectRotationSlider',o.rotation||0);
 $('objectGeometryFields')?.classList.toggle('hidden',false);$('dimensionSelectionFields')?.classList.toggle('hidden',!String(o.type).startsWith('dim')&&o.type!=='dimension');$('referenceSelectionFields')?.classList.toggle('hidden',o.type!=='reference');
 if(o.type==='dimension'||String(o.type).startsWith('dim')){
  put('dimensionSelectedOffset',o.offset??2);put('dimensionSelectedOffsetSlider',o.offset??2);
  put('dimensionTextHeight',o.textSize??getNum('defaultDimensionTextHeight',2.5));
  put('dimensionTextHeightSlider',o.textSize??getNum('defaultDimensionTextHeight',2.5));
  put('dimensionArrowSize',o.arrowSize??2.5);
  chk('dimensionShowValue',o.showValue!==false);
  put('dimensionArrowPlacement',o.arrowPlacement||'auto');
  put('dimensionArrowStyle',o.arrowStyle||'filled');
  put('dimensionArrowStartStyle',o.arrowStartStyle||'inherit');
  put('dimensionArrowEndStyle',o.arrowEndStyle||'inherit');
  put('dimensionTextOrientation',o.textOrientation||'horizontal');
  put('dimensionLabelRotation',o.labelRotation??0);put('dimensionLabelRotationSlider',o.labelRotation??0);
  put('dimensionLabelDx',o.labelDx??0);put('dimensionLabelDy',o.labelDy??0);
  put('dimensionValueText',o.label??'');
 }
 if(o.type==='reference'){put('referenceX',o.x);put('referenceY',o.y);put('referenceWidth',o.w);put('referenceHeight',o.h);put('referenceRotation',o.rotation||0);put('referenceOpacity',Math.round((o.opacity??.35)*100));chk('referenceKeepAspect',o.keepAspect!==false);chk('referenceExportable',o.exportable);chk('objectLocked',o.locked);$('referenceOpacityValue').textContent=`${Math.round((o.opacity??.88)*100)}%`;}
 renderObjectSpecificFields(o);
}
function updateSelectedDimensionProps(){
 const o=findSelected().find(v=>v.type==='dimension'||String(v.type).startsWith('dim'));if(!o||o.locked)return;
 history.push(snapshot());
 o.offset=Math.max(.01,getNum('dimensionSelectedOffset',o.offset??2));
 o.textSize=Math.max(.5,getNum('dimensionTextHeight',o.textSize??2.5));o.textSize=Math.min(30,o.textSize);
 o.arrowSize=Math.max(.5,Math.min(12,getNum('dimensionArrowSize',o.arrowSize??2.5)));
 o.showValue=checked('dimensionShowValue');
 o.arrowPlacement=getVal('dimensionArrowPlacement','auto');
 o.arrowStyle=getVal('dimensionArrowStyle','filled');
 o.arrowStartStyle=getVal('dimensionArrowStartStyle','inherit');
 o.arrowEndStyle=getVal('dimensionArrowEndStyle','inherit');
 o.textOrientation=getVal('dimensionTextOrientation','horizontal');
 o.labelRotation=getNum('dimensionLabelRotation',o.labelRotation??0);
 o.labelDx=getNum('dimensionLabelDx',o.labelDx??0);o.labelDy=getNum('dimensionLabelDy',o.labelDy??0);
 o.label=String(getVal('dimensionValueText',o.label||'')).trim()||undefined;
 render();showProperties();scheduleAutosave();updateHistoryButtons();setStatus('Параметры размера обновлены');
}
function findSelected(){return state.objects.filter(o=>state.selected.has(o.id));}
function updateSelected(mutator){const picked=findSelected();if(!picked.length)return;history.push(snapshot());for(const o of picked)mutator(o);render();showProperties();scheduleAutosave();updateHistoryButtons();}
function selectedReference(){const refs=findSelected().filter(o=>o.type==='reference');return refs.length===1?refs[0]:null;}
function editSelectedReference(mutator){const o=selectedReference();if(!o)return;history.push(snapshot());mutator(o);render();showProperties();scheduleAutosave();updateHistoryButtons();}
function resizeSelectedReference(axis){const value=getNum(axis==='width'?'referenceWidth':'referenceHeight',100);editSelectedReference(o=>Object.assign(o,resizeReference(o,axis,value,checked('referenceKeepAspect'))));}
function scaleSelectedReference(factor){editSelectedReference(o=>Object.assign(o,scaleReference(o,factor)));$('referenceKeepAspect').checked=true;}
function fitSelectedReference(){editSelectedReference(o=>Object.assign(o,fitReferenceToSheet(o,state.sheet.width,state.sheet.height,10)));$('referenceKeepAspect').checked=true;}
function normalizeLegacyReference(o){
 if(o.type!=='reference'||!o.dataUrl||o.aspectRatio>0)return;
 const image=new Image();image.onload=()=>{if(!state.objects.includes(o)||!(image.naturalWidth>0&&image.naturalHeight>0))return;const dims=referenceImportSize(image.naturalWidth,image.naturalHeight,Math.max(o.w||100,o.h||100));o.aspectRatio=dims.aspectRatio;o.naturalWidth=dims.naturalWidth;o.naturalHeight=dims.naturalHeight;if(o.keepAspect!==false)o.h=(o.w||dims.w)/o.aspectRatio;render();scheduleAutosave();};image.src=o.dataUrl;
}
function currentStyle(){const role=getVal('drawingLineRole','main');const defaultWidth=role==='main'?getNum('gostMainLine',.5):getNum('gostThinLine',.25);return {color:getVal('objectColor','#20252a'),width:getNum('drawingLineWidth',defaultWidth)||defaultWidth,dash:getVal('objectDash','')||null,layer:getVal('objectLayer','geometry'),role};}
function setTool(tool){state.tool=tool;state.pending=null;state.preview=null;state.drawGesture=null;polylinePoints=[];drawing.dataset.tool=tool;renderPreview();document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('panModeBtn')?.classList.toggle('active',tool==='pan');setStatus(`Инструмент: ${toolLabel(tool)}`);}
const toolNames={select:'Выбор',pan:'Перемещение листа',line:'Отрезок',arrowLine:'Стрелка 1',circle:'Окружность',ellipse:'Эллипс',rect:'Прямоугольник',dimension:'Размер',spline:'Сплайн',curvedArrow:'Гнутая стрелка',polyline:'Ломаная',dimAuto:'Авторазмер',dimH:'Горизонтальный размер',dimV:'Вертикальный размер',dimRad:'Радиус',dimDia:'Диаметр',dimAngle:'Угловой размер',polyline:'Ломаная',curvedArrow:'Гнутая стрелка',polygon:'Многоугольник',text:'Текст',freehand:'Свободная линия',eraser:'Ластик',centerMark:'Центровые',innerCutout:'Внутренний контур',construction:'Вспомогательная линия',ray:'Луч',xline:'Прямая',arc:'Дуга',ellipse:'Эллипс',roundRect:'Скруглённый прямоугольник',measure:'Измерение',hatch:'Штриховка',leader:'Выноска'};
function toolLabel(t){return toolNames[t]||t;}
function objectFromEventOrSelection(evt){
 const target=evt?.target?.closest?.('[data-object-id]');
 const id=target?.getAttribute('data-object-id');
 return state.objects.find(o=>o.id===id) || (state.selected.size===1?findSelected()[0]:null);
}
function replaceObjectWithResults(source, results, operationName){
 if(!results?.length)return false;
 history.push(snapshot());state.objects=state.objects.filter(o=>o.id!==source.id);
 const created=[];
 for(let i=0;i<results.length;i++){
  const result=results[i],base=materializedObject(source);
  for(const key of ['a','b','center','x','y','w','h','r','rx','ry','points','startAngle','endAngle'])delete base[key];
  const o={...base,...result,id:nextId(),dx:0,dy:0,locked:false};
  if(results.length>1&&source.name)o.name=`${source.name} · ${i+1}`;
  state.objects.push(o);created.push(o.id);
 }
 state.selected=new Set(created);commit();showProperties();scheduleAutosave();setStatus(`${operationName}: создано частей ${created.length}`);return true;
}
function pathForOpenObject(source){
 const o=materializedObject(source);
 if(['line','arrowLine','construction','ray','ruler','centerline'].includes(o.type)&&o.a&&o.b)return [o.a,o.b];
 if(['polyline','freehand','spline','breakline'].includes(o.type)&&o.points?.length>=2)return o.points;
 return null;
}
function applyOpenCut(source, point){
 if(!source||source.locked){setStatus('Выбранный объект заблокирован или отсутствует');return false;}
 const points=pathForOpenObject(source);if(!points){setStatus('Сейчас вырез участка доступен для открытых отрезков и ломаных. Для замкнутых контуров нужен отдельный профильный вырез.');return false;}
 const width=Math.max(.5,getNum('cutoutNotchWidth',18)),tol=Math.max(2,5/state.zoom),parts=removePathWindow(points,point,width,tol);
 if(!parts){setStatus('Не удалось найти участок линии рядом с курсором');return false;}
 const results=parts.map((pts,index)=>{
  const arrow=source.type==='arrowLine'&&index===parts.length-1;
  return pts.length===2?{type:arrow?'arrowLine':'line',a:pts[0],b:pts[1]}:{type:'polyline',points:pts};
 });
 return replaceObjectWithResults(source,results,'Участок удалён');
}
function applySplitTool(source, point){
 if(!source||source.locked){setStatus('Выберите незаблокированный объект');return;}
 const path=pathForOpenObject(source);
 if(path){const parts=splitOpenPath(path,point,Math.max(2,5/state.zoom));if(!parts){setStatus('Щёлкните внутри отрезка/ломаной, не на самом конце');return;}const results=parts.map(pts=>pts.length===2?{type:'line',a:pts[0],b:pts[1]}:{type:'polyline',points:pts});replaceObjectWithResults(source,results,'Объект разделён');return;}
 let ring=null;const o=materializedObject(source);
 if(o.type==='rect')ring=[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}];
 else if(o.type==='polygon')ring=o.points;
 if(!ring){setStatus('Разделение замкнутого контура поддерживает многоугольники и прямоугольники');return;}
 if(!state.pending||state.pending.objectId!==source.id){state.pending={objectId:source.id,firstPoint:point,ring};setStatus('Теперь щёлкните вторую точку на другой стороне того же контура');return;}
 const parts=splitClosedPolygon(state.pending.ring,state.pending.firstPoint,point,Math.max(2,5/state.zoom));state.pending=null;
 if(!parts){setStatus('Не удалось разделить: точки должны лежать на разных рёбрах контура');return;}
 replaceObjectWithResults(source,parts.map(points=>({type:'polygon',points})),'Профиль разделён');
}
function openModal(id){$(id)?.classList.remove('hidden');}
function closeModal(id){$(id)?.classList.add('hidden');}
function addTextAt(p){textInsertPoint=p;$('textPosX').value=fmt(p.x);$('textPosY').value=fmt(p.y);$('textContent').value='Текст';openModal('textModal');}
function finishText(){const p={x:getNum('textPosX',textInsertPoint?.x||0),y:getNum('textPosY',textInsertPoint?.y||0)};const values={x:p.x,y:p.y,text:getVal('textContent','Текст'),size:getNum('textSize',5),color:getVal('textColor','#20252a'),font:getVal('textFont','Arial'),rotation:getNum('textRotation',0),align:getVal('textAlign','start'),bold:checked('textBold'),italic:checked('textItalic'),underline:checked('textUnderline'),frame:checked('textFrame')};closeModal('textModal');if(editingTextId){updateSelected(o=>{if(o.id===editingTextId)Object.assign(o,values);});editingTextId=null;}else addObject({type:'text',...values});setTool('select');}
const dragDrawTools=new Set(['line','arrowLine','spline','construction','xline','ray','centerline','circle','rect','roundRect','ellipse','polygon','star6','arc','breakline','table','roughness','tolerance','weld','section','techReq']);
function makeTwoPointObject(t,a,p,evt={}){
 const st=currentStyle();
 let b=p;
 if((state.ortho||checked('orthoToggle'))||evt.shiftKey)b=constrainAngle(a,p,getNum('angleStep',15));
 if(t==='spline')return {type:'spline',points:[a,b],...st};
 if(t==='arrowLine')return {type:t,a,b,arrowSize:3.2,...st};
 if(t==='line'||t==='construction'||t==='xline'||t==='ray'||t==='centerline'||t==='ruler')return {type:t,a,b,...st};
 if(t==='circle'){const diameter=getVal('circleInputMode','radius')==='diameter';return {type:'circle',center:a,r:distance(a,b)/(diameter?2:1),...st};}
 if(t==='rect'||t==='roundRect')return {type:'rect',x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y),rx:t==='roundRect'?getNum('roundingRadius',3):0,...st};
 if(t==='ellipse')return {type:'ellipse',center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},rx:Math.abs(b.x-a.x)/2,ry:Math.abs(b.y-a.y)/2,...st};
 if(t==='polygon'||t==='star6'){
  const n=t==='star6'?12:Math.max(3,Math.round(getNum('polygonSides',6))),r=distance(a,b),pts=[];
  for(let i=0;i<n;i++){const angle=-Math.PI/2+i*2*Math.PI/n,rr=t==='star6'&&i%2===1?r*.48:r;pts.push({x:a.x+rr*Math.cos(angle),y:a.y+rr*Math.sin(angle)});}
  return {type:'polygon',points:pts,...st};
 }
 if(t==='arc'){const r=distance(a,b);return {type:'arc',center:a,r,startAngle:0,endAngle:90,...st};}
 if(t==='breakline')return {type:'breakline',points:[a,b],...st};
 if(t==='roughness'||t==='tolerance'||t==='weld'||t==='section'||t==='techReq')return {type:t,a,text:t==='roughness'?'Ra 3,2':t==='tolerance'?'±0,1':t==='section'?'А—А':'',...st};
 if(t==='table')return {type:'table',x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y),rows:3,cols:3,...st};
 return null;
}
function updateDrawPreview(gesture,p){
 const q=applyPrecision(p,{shiftKey:false});
 if(gesture.tool==='spline'&&polylinePoints.length){state.preview={type:'spline',points:[...polylinePoints,q],...currentStyle()};renderPreview();return;}
 const o=makeTwoPointObject(gesture.tool,gesture.start,q,{});
 if(!o)return;
 state.preview=o;renderPreview();
}
function clickTool(p,evt){
 const t=state.tool, st=currentStyle();
 if(t==='select'){
  const target=evt.target.closest('[data-object-id]');const id=target?.getAttribute('data-object-id');
  if(id){if(evt.shiftKey)selectObject(id,true);else if(!state.selected.has(id))selectObject(id,false);const o=state.objects.find(v=>v.id===id);if(o&&!o.locked)state.drag={type:'objects',start:p,last:p,ids:[...state.selected],before:snapshot()};}
  else if(!evt.shiftKey){state.selected.clear();renderObjects();showProperties();}
  return;
 }
 if(t==='eraser'){
   const target=evt.target.closest('[data-object-id]');const id=target?.getAttribute('data-object-id');if(id){history.push(snapshot());state.objects=state.objects.filter(o=>o.id!==id);state.selected.delete(id);commit();showProperties();}return;
 }
 if(['cutout','cutoutNoBottom','cutoutNoWalls'].includes(t)){
  const source=objectFromEventOrSelection(evt);if(!source){setStatus('Щёлкните по открытому отрезку/ломаной или предварительно выделите её');return;}applyOpenCut(source,p);return;
 }
 if(t==='split'){
  const source=objectFromEventOrSelection(evt);applySplitTool(source,p);return;
 }
 if(t==='point'){addObject({type:'circle',center:p,r:.6,...st,fill:st.color});return;}
 if(t==='centerMark'){const hit=evt.target.closest('[data-object-id]');const o=hit&&state.objects.find(v=>v.id===hit.getAttribute('data-object-id'));const c=o?.center||p;addObject({type:'centerMark',center:c,r:5,...st});return;}
 if(t==='text'){addTextAt(p);return;}
 if(t==='polyline'||t==='spline'||t==='curvedArrow'){
  if(evt.detail>=2&&polylinePoints.length>=2){polylinePoints.push(p);addObject({type:t==='spline'?'spline':t==='curvedArrow'?'curvedArrow':'polyline',points:polylinePoints,...(t==='curvedArrow'?{arrowSize:3.2}:{}),...st});polylinePoints=[];state.preview=null;setTool('select');return;}
  polylinePoints.push(p);state.preview={type:t==='spline'?'spline':t==='curvedArrow'?'curvedArrow':'polyline',points:[...polylinePoints,p],...st};renderPreview();setStatus(`Точок кривої: ${polylinePoints.length}. Подвійне клацання або Enter — завершити.`);return;
 }
 if(t==='dimension'||t==='dimAuto'||t==='dimH'||t==='dimV'||t==='dimRad'||t==='dimDia'||t==='dimAngle'||t==='measure'){
  if(!state.pending){state.pending={start:p};state.preview={type:'line',a:p,b:p};renderPreview();setStatus('Укажите вторую точку размера');return;}
  if(!state.pending.end){state.pending.end=p;const kind=t==='dimAuto'?'dimension':t==='measure'?'dimension':t;state.preview={type:'line',a:state.pending.start,b:p};renderPreview();if(['dimRad','dimDia'].includes(t)){addObject({type:'dimension',kind:t,a:state.pending.start,b:p,offset:0,textSize:getNum('defaultDimensionTextHeight',2.5),...st});state.pending=null;state.preview=null;return;}setStatus('Укажите положение размерной линии');return;}
  const a=state.pending.start,b=state.pending.end,base=state.pending.end,off=Math.abs(t==='dimV'?p.x-base.x:t==='dimH'?p.y-base.y:((p.x-base.x)+(p.y-base.y))/2)||getNum('dimensionOffset',2);
  addObject({type:'dimension',kind:t==='dimH'?'dimH':t==='dimV'?'dimV':t==='dimAngle'?'dimAngle':'dimension',a,b,offset:off,textSize:getNum('defaultDimensionTextHeight',2.5),...st});state.pending=null;state.preview=null;return;
 }
 if(t==='leader'){
  if(!state.pending){state.pending={points:[p]};state.preview={type:'polyline',points:[p,p]};return;}
  if(state.pending.points.length<2){state.pending.points.push(p);state.preview={type:'polyline',points:[...state.pending.points,p]};return;}
  const points=[...state.pending.points,p];const text=prompt('Текст выноски:','');addObject({type:'leader',points,text:text||'',...st});state.pending=null;state.preview=null;return;
 }
 if(t==='arc3'){
  if(!state.pending){state.pending={points:[p]};setStatus('Укажите вторую точку дуги');return;}
  if(state.pending.points.length===1){state.pending.points.push(p);state.preview={type:'polyline',points:[...state.pending.points,p]};setStatus('Укажите конечную точку дуги');return;}
  const [a,m,b]=[...state.pending.points,p];const d=2*(a.x*(m.y-b.y)+m.x*(b.y-a.y)+b.x*(a.y-m.y));
  if(Math.abs(d)<1e-8){addObject({type:'polyline',points:[a,m,b],...st});}else{const aa=a.x*a.x+a.y*a.y,mm=m.x*m.x+m.y*m.y,bb=b.x*b.x+b.y*b.y;const c={x:(aa*(m.y-b.y)+mm*(b.y-a.y)+bb*(a.y-m.y))/d,y:(aa*(b.x-m.x)+mm*(a.x-b.x)+bb*(m.x-a.x))/d};const ang=q=>Math.atan2(q.y-c.y,q.x-c.x)*180/Math.PI;let a0=ang(a),a1=ang(b),am=ang(m);const ccw=((a1-a0)%360+360)%360,cm=((am-a0)%360+360)%360;const end=cm<=ccw?a0+ccw:a0-(360-ccw);addObject({type:'arc',center:c,r:distance(c,a),startAngle:a0,endAngle:end,...st});}
  state.pending=null;state.preview=null;return;
 }
 if(t==='innerCutout'){const kind=getVal('cutoutShape','rect'),w=getNum('cutoutInnerWidth',16),h=getNum('cutoutInnerHeight',24),ang=getNum('cutoutInnerAngle',0),r=getNum('cutoutInnerRadius',8);let o;if(kind==='circle')o={type:'circle',center:p,r:Math.max(.5,r),...st};else if(kind==='slot')o={type:'rect',x:p.x-getNum('cutoutInnerLength',54)/2,y:p.y-w/2,w:getNum('cutoutInnerLength',54),h:w,rx:w/2,...st};else o={type:'rect',x:p.x-w/2,y:p.y-h/2,w,h,...st};if(ang&&o.type==='rect'){const x=o.x,y=o.y,ww=o.w,hh=o.h,rad=ang*Math.PI/180,cx=p.x,cy=p.y;o.type='polygon';o.points=[{x,y},{x:x+ww,y},{x:x+ww,y:y+hh},{x,y:y+hh}].map(q=>({x:cx+(q.x-cx)*Math.cos(rad)-(q.y-cy)*Math.sin(rad),y:cy+(q.x-cx)*Math.sin(rad)+(q.y-cy)*Math.cos(rad)}));}addObject(o);setStatus('Внутренний контур добавлен. Это отдельная 2D-граница, не булево вычитание.');return;}
 if(t==='straightCut'||t==='moveFace'){
   setStatus(t==='straightCut'?'Прямой проходной вырез по замкнутым профилям пока не восстановлен; для открытой линии используйте «Вырез / разрез».':'Перемещение отдельной грани пока не восстановлено.');return;
 }
 if(t==='hatch'){
   const selected=findSelected().find(o=>o.points?.length>=3||o.type==='rect');if(!selected){setStatus('Выберите замкнутый контур (многоугольник) для штриховки');return;}
   let pts=selected.points;if(selected.type==='rect')pts=[{x:selected.x,y:selected.y},{x:selected.x+selected.w,y:selected.y},{x:selected.x+selected.w,y:selected.y+selected.h},{x:selected.x,y:selected.y+selected.h}];if(selected.type==='circle')pts=Array.from({length:64},(_,i)=>({x:selected.center.x+selected.r*Math.cos(i*Math.PI/32),y:selected.center.y+selected.r*Math.sin(i*Math.PI/32)}));
   addObject({type:'hatch',points:pts,angle:getNum('hatchAngle',45),spacing:getNum('hatchSpacing',3),pattern:getVal('hatchPattern','single'),color:getVal('hatchColor','#20252a'),...st});return;
 }
 if(t==='ruler'){if(!state.pending){state.pending={start:p};state.preview={type:'line',a:p,b:p};return;}addObject({type:'ruler',a:state.pending.start,b:p,color:'#168db2',width:.25,dash:'3 2'});state.pending=null;state.preview=null;return;}
 if(!state.pending){state.pending={start:p};const preview=makeTwoPointObject(t,p,p,evt);state.preview=preview||{type:'line',a:p,b:p};renderPreview();setStatus(`Укажите вторую точку: ${toolLabel(t)}`);return;}
 const o=makeTwoPointObject(t,state.pending.start,p,evt);
 if(o)addObject(o);else setStatus(`Для инструмента «${toolLabel(t)}» этот способ построения не поддерживается.`);
 state.pending=null;state.preview=null;renderPreview();
}
function onCanvasMouseDown(evt){
 const isPanButton=evt.button===1||evt.button===2||(evt.button===0&&(spaceDown||evt.altKey||state.tool==='pan'));
 if(isPanButton){
  state.pan={clientX:evt.clientX,clientY:evt.clientY,view:{...state.view}};
  drawing.classList.add('dragging');evt.preventDefault();return;
 }
 if(evt.button!==0)return;
 const raw=screenPoint(evt),p=applyPrecision(raw,evt);
 evt.preventDefault();
 const dimensionLabelHandle=evt.target.closest?.('[data-dimension-label-move-handle],[data-dimension-label-axis-handle],[data-dimension-label-size-handle],[data-dimension-label-rotate-handle],[data-dimension-label-hit]');
 if(dimensionLabelHandle){
  const id=dimensionLabelHandle.getAttribute('data-object-id'),o=state.objects.find(v=>v.id===id);
  if(o&&isDimensionObject(o)&&!o.locked){
   const before=snapshot();selectObject(id,false);
   const type=dimensionLabelHandle.hasAttribute('data-dimension-label-axis-handle')?'dimensionLabelAxis':dimensionLabelHandle.hasAttribute('data-dimension-label-size-handle')?'dimensionLabelSize':dimensionLabelHandle.hasAttribute('data-dimension-label-rotate-handle')?'dimensionLabelRotate':'dimensionLabelMove';
   const layout=dimensionLabelLayoutWorld(o),pivot={x:layout.x,y:layout.y};
   state.drag={type,id,before,start:raw,last:raw,initialDx:Number(o.labelDx)||0,initialDy:Number(o.labelDy)||0,initialSize:Number(o.textSize)||2.5,initialRotation:Number(o.labelRotation)||0,pivot,axis:{...layout.geometry.axis},startDistance:Math.max(.01,Math.hypot(raw.x-pivot.x,raw.y-pivot.y)),startAngle:Math.atan2(raw.y-pivot.y,raw.x-pivot.x)};
  }
  return;
 }
 const scaleHandle=evt.target.closest?.('[data-object-scale-handle]');
 if(scaleHandle){
  const id=scaleHandle.getAttribute('data-object-id'),o=state.objects.find(v=>v.id===id),corner=scaleHandle.getAttribute('data-scale-corner');
  if(o&&!o.locked){
   const before=snapshot(),original=materializedObject(o),b=boundsOfObject(original);
   const anchor={x:corner.includes('w')?b.x+b.w:b.x,y:corner.startsWith('n')?b.y+b.h:b.y};
   const start={x:corner.includes('e')?b.x+b.w:b.x,y:corner.startsWith('s')?b.y+b.h:b.y};
   state.drag={type:'objectScale',id,before,original,bounds:b,anchor,start,corner,last:{...start}};
  }
  evt.preventDefault();return;
 }
 const rotateHandle=evt.target.closest?.('[data-object-rotate-handle]');
 if(rotateHandle){
  const id=rotateHandle.getAttribute('data-object-id'),o=state.objects.find(v=>v.id===id);
  if(o&&!o.locked){selectObject(id,false);const before=snapshot(),original=structuredClone(o);bakeOffset(original);const b=objectBounds(original),pivot={x:b.x+b.w/2,y:b.y+b.h/2};
   state.drag={type:'objectRotate',id,before,original,pivot,startAngle:Math.atan2(raw.y-pivot.y,raw.x-pivot.x),lastDelta:0};
  }
  evt.preventDefault();return;
 }
 const editHandle=evt.target.closest?.('[data-edit-point-handle]');
 if(editHandle){const id=editHandle.getAttribute('data-object-id'),o=state.objects.find(v=>v.id===id);if(o&&!o.locked){const before=snapshot();bakeOffset(o);selectObject(id,false);state.drag={type:'objectPoint',id,kind:editHandle.getAttribute('data-handle-kind'),index:Number(editHandle.getAttribute('data-point-index')||0),before,start:p,last:p};evt.preventDefault();return;}}
 const resizeHandle=evt.target.closest?.('[data-reference-resize-handle]');
 if(resizeHandle){const id=resizeHandle.getAttribute('data-object-id'),o=state.objects.find(v=>v.id===id);if(o&&!o.locked){selectObject(id,false);const before=snapshot();bakeOffset(o);state.drag={type:'referenceResize',id,start:p,last:p,before,initial:{x:o.x,y:o.y,w:o.w,h:o.h,ratio:referenceAspectRatio(o)},keepAspect:checked('referenceKeepAspect')};}return;}
 if(state.tool==='freehand'){state.drag={type:'freehand',points:[p]};return;}
 if(state.tool==='selectRegion'){state.drag={type:'region',start:p,current:p};return;}
 if(state.tool==='select'){
   const target=evt.target.closest?.('[data-object-id]');const id=target?.getAttribute('data-object-id');
   if(id){if(evt.shiftKey)selectObject(id,true);else if(!state.selected.has(id))selectObject(id,false);const o=state.objects.find(v=>v.id===id);if(o&&!o.locked)state.drag={type:'objects',start:p,last:p,ids:[...state.selected],before:snapshot()};}
   else if(!evt.shiftKey){state.selected.clear();renderObjects();showProperties();}
   return;
 }
 const hasPendingAnchor=!!state.pending?.start&&dragDrawTools.has(state.tool);const gestureStart=hasPendingAnchor?state.pending.start:(state.tool==='spline'&&polylinePoints.length?polylinePoints[polylinePoints.length-1]:p);
 state.drawGesture={tool:state.tool,start:gestureStart,last:p,clientX:evt.clientX,clientY:evt.clientY,moved:false,pendingAtStart:hasPendingAnchor,target:evt.target};
}
function onCanvasMouseMove(evt){
 const p=screenPoint(evt);$('coordinates').textContent=`X: ${fmt(p.x)} · Y: ${fmt(p.y)} мм`;
 if(state.pan){const r=svg.getBoundingClientRect(),v=state.pan.view,next=panView({x:v.x,y:v.y,width:v.w,height:v.h},evt.clientX-state.pan.clientX,evt.clientY-state.pan.clientY,r.width,r.height);state.view={x:next.x,y:next.y,w:next.width,h:next.height};applyView();return;}
 if(state.drawGesture){
  const g=state.drawGesture,distPx=Math.hypot(evt.clientX-g.clientX,evt.clientY-g.clientY);
  if(dragDrawTools.has(g.tool)&&distPx>=3){g.moved=true;g.last=applyPrecision(p,evt);updateDrawPreview(g,g.last);}
  return;
 }
 if(state.drag?.type==='dimensionLabelMove'||state.drag?.type==='dimensionLabelAxis'){
  const d=state.drag,o=state.objects.find(v=>v.id===d.id);if(!o)return;
  const dx=p.x-d.start.x,dy=p.y-d.start.y;
  if(d.type==='dimensionLabelAxis'){
   const amount=dx*d.axis.x+dy*d.axis.y;
   o.labelDx=d.initialDx+d.axis.x*amount;o.labelDy=d.initialDy+d.axis.y*amount;
  }else{o.labelDx=d.initialDx+dx;o.labelDy=d.initialDy+dy;}
  d.last=p;renderObjects();return;
 }
 if(state.drag?.type==='dimensionLabelSize'){
  const d=state.drag,o=state.objects.find(v=>v.id===d.id);if(!o)return;
  const current=Math.max(.01,Math.hypot(p.x-d.pivot.x,p.y-d.pivot.y));
  o.textSize=Math.max(.5,Math.min(30,d.initialSize*current/d.startDistance));
  d.last=p;renderObjects();return;
 }
 if(state.drag?.type==='dimensionLabelRotate'){
  const d=state.drag,o=state.objects.find(v=>v.id===d.id);if(!o)return;
  let delta=(Math.atan2(p.y-d.pivot.y,p.x-d.pivot.x)-d.startAngle)*180/Math.PI;
  delta=((delta+540)%360)-180;if(evt.shiftKey)delta=Math.round(delta/15)*15;
  o.labelRotation=d.initialRotation+delta;d.last=p;renderObjects();return;
 }
 if(state.drag?.type==='objectRotate'){
  const o=state.objects.find(v=>v.id===state.drag.id);if(!o)return;
  let delta=(Math.atan2(p.y-state.drag.pivot.y,p.x-state.drag.pivot.x)-state.drag.startAngle)*180/Math.PI;
  delta=((delta+540)%360)-180;
  if(evt.shiftKey)delta=Math.round(delta/15)*15;
  const rotated=rotateGeometryObject(state.drag.original,delta,state.drag.pivot);
  for(const key of Object.keys(o))delete o[key];Object.assign(o,rotated);state.drag.lastDelta=delta;renderObjects();return;
 }
 if(state.drag?.type==='objectScale'){
  const d=state.drag,o=state.objects.find(v=>v.id===d.id);if(!o)return;
  const q=applyPrecision(p,evt),b=d.bounds,c=d.corner;
  let sx=Math.max(.02,Math.min(100,1+(c.includes('e')?1:-1)*(q.x-d.start.x)/Math.max(.05,b.w)));
  let sy=Math.max(.02,Math.min(100,1+(c.startsWith('s')?1:-1)*(q.y-d.start.y)/Math.max(.05,b.h)));
  const preserve=['circle','arc','text'].includes(o.type)||(o.type==='reference'&&o.keepAspect!==false)||evt.shiftKey;
  if(preserve){const f=Math.max(sx,sy);sx=f;sy=f;}
  const scaled=scaleGeometryObject(d.original,sx,sy,d.anchor);
  for(const key of Object.keys(o))delete o[key];Object.assign(o,scaled);d.last=q;renderObjects();return;
 }
 if(state.drag?.type==='objectPoint'){
  const o=state.objects.find(v=>v.id===state.drag.id);if(!o)return;const q=applyPrecision(p,evt),kind=state.drag.kind,index=state.drag.index;
  if(kind==='line-end'){if(index===0)o.a={...q};else o.b={...q};}
  else if(kind==='dimension-point'){const local={x:q.x-(o.dx||0),y:q.y-(o.dy||0)};if(index===0)o.a=local;else o.b=local;}
  else if(kind==='vertex'&&o.points?.[index])o.points[index]={...q};
  else if(kind==='circle-center')o.center={...q};
  else if(kind==='circle-radius')o.r=Math.max(.05,distance(o.center,q));
  else if(kind==='ellipse-center')o.center={...q};
  else if(kind==='ellipse-rx')o.rx=Math.max(.05,Math.abs(q.x-o.center.x));
  else if(kind==='ellipse-ry')o.ry=Math.max(.05,Math.abs(q.y-o.center.y));
  state.drag.last=q;renderObjects();return;
 }
 if(state.drag?.type==='referenceResize'){
  const o=state.objects.find(v=>v.id===state.drag.id);if(!o)return;
  const initial=state.drag.initial,dx=Math.max(1,p.x-initial.x),dy=Math.max(1,p.y-initial.y);
  if(state.drag.keepAspect){const scale=Math.max(dx/Math.max(initial.w,1),dy/Math.max(initial.h,1),.02);o.w=Math.max(1,Math.min(2000,initial.w*scale));o.h=o.w/initial.ratio;}
  else{o.w=Math.max(1,Math.min(2000,dx));o.h=Math.max(1,Math.min(2000,dy));}
  state.drag.last=p;renderObjects();renderSelection();return;
 }
 if(state.drag?.type==='objects'){
  const q=applyPrecision(p,evt),dx=q.x-state.drag.last.x,dy=q.y-state.drag.last.y;
  if(dx||dy){for(const id of state.drag.ids){const o=state.objects.find(v=>v.id===id);if(o){o.dx=(o.dx||0)+dx;o.dy=(o.dy||0)+dy;}}state.drag.last=q;renderObjects();}
  return;
 }
 if(state.drag?.type==='freehand'){state.drag.points.push(applyPrecision(p,evt));state.preview={type:'freehand',points:state.drag.points};renderPreview();return;}
 if(state.drag?.type==='region'){state.drag.current=p;const g=layers.preview;g.replaceChildren();const a=state.drag.start,b=p;el('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:'#168db2',opacity:.12,stroke:'#168db2','stroke-dasharray':'2 1'},g);return;}
 if(polylinePoints.length&&['polyline','spline','curvedArrow'].includes(state.tool)){
  const q=applyPrecision(p,evt);state.preview={type:state.tool==='spline'?'spline':state.tool==='curvedArrow'?'curvedArrow':'polyline',points:[...polylinePoints,q],...currentStyle()};renderPreview();return;
 }
 if(state.pending){const q=applyPrecision(p,evt);const t=state.tool;const o=makeTwoPointObject(t,state.pending.start,q,evt);if(o){state.preview=o;renderPreview();}}
}
function onCanvasMouseUp(evt){
 if(state.pan){state.pan=null;drawing.classList.remove('dragging');return;}
 if(state.drawGesture){
  const g=state.drawGesture,p=applyPrecision(screenPoint(evt),evt);state.drawGesture=null;
  const toolEvt={target:g.target||evt.target,shiftKey:evt.shiftKey,detail:evt.detail||1};
  if(g.moved){
   if(g.tool==='spline'){
    const points=polylinePoints.length?[...polylinePoints,p]:[g.start,p];
    if(points.length>=2)addObject({type:'spline',points,...currentStyle()});
    polylinePoints=[];state.pending=null;state.preview=null;renderPreview();
   }else{
    const o=makeTwoPointObject(g.tool,g.start,p,toolEvt);
    if(o){addObject(o);state.pending=null;state.preview=null;renderPreview();}
    else clickTool(p,toolEvt);
   }
  }else clickTool(p,toolEvt);
  return;
 }
 if(state.drag?.type==='freehand'){const points=state.drag.points;if(points.length>1)addObject({type:'freehand',points,color:getVal('objectColor','#20252a'),width:getNum('freehandWidth',.25)});state.drag=null;state.preview=null;renderPreview();return;}
 if(state.drag?.type==='region'){const {start,current}=state.drag;const ids=state.objects.filter(o=>{const b=objectBounds(o);return b.x>=Math.min(start.x,current.x)&&b.y>=Math.min(start.y,current.y)&&b.x+b.w<=Math.max(start.x,current.x)&&b.y+b.h<=Math.max(start.y,current.y);}).map(o=>o.id);state.selected=new Set(ids);state.drag=null;renderPreview();renderObjects();showProperties();return;}
 if(['dimensionLabelMove','dimensionLabelAxis','dimensionLabelSize','dimensionLabelRotate'].includes(state.drag?.type)){
  const d=state.drag,moved=d.last.x!==d.start.x||d.last.y!==d.start.y;
  if(moved){history.push(d.before);scheduleAutosave();updateHistoryButtons();}
  state.drag=null;render();showProperties();if(moved)setStatus('Размерное число изменено');return;
 }
 if(state.drag?.type==='objectRotate'){const moved=Math.abs(state.drag.lastDelta||0)>.05;if(moved){history.push(state.drag.before);scheduleAutosave();updateHistoryButtons();}state.drag=null;render();showProperties();return;}
 if(state.drag?.type==='objectScale'){const moved=state.drag.last.x!==state.drag.start.x||state.drag.last.y!==state.drag.start.y;if(moved){history.push(state.drag.before);scheduleAutosave();updateHistoryButtons();}state.drag=null;render();showProperties();return;}
 if(state.drag?.type==='objectPoint'){const moved=state.drag.last.x!==state.drag.start.x||state.drag.last.y!==state.drag.start.y;if(moved){history.push(state.drag.before);scheduleAutosave();updateHistoryButtons();}state.drag=null;render();showProperties();return;}
 if(state.drag?.type==='referenceResize'){const moved=state.drag.last.x!==state.drag.start.x||state.drag.last.y!==state.drag.start.y;if(moved){history.push(state.drag.before);scheduleAutosave();updateHistoryButtons();}state.drag=null;render();showProperties();return;}
 if(state.drag?.type==='objects'){if(state.drag.last.x!==state.drag.start.x||state.drag.last.y!==state.drag.start.y){history.push(state.drag.before);scheduleAutosave();updateHistoryButtons();}state.drag=null;render();return;}
}
function cancelCanvasGesture(){if(state.drag?.before&&['objectRotate','objectScale','objectPoint','objects','referenceResize','dimensionLabelMove','dimensionLabelAxis','dimensionLabelSize','dimensionLabelRotate'].includes(state.drag.type)){const before=state.drag.before;state.objects=structuredClone(before.objects||[]);state.selected=new Set(before.selected||[]);}state.pan=null;state.drawGesture=null;state.drag=null;drawing.classList.remove('dragging');state.preview=null;render();showProperties();}
function updateSelectionByProps(){const id=[...state.selected][0];const o=state.objects.find(v=>v.id===id);if(!o)return;history.push(snapshot());o.color=getVal('objectColor',o.color);o.width=getNum('objectWidth',o.width);o.dash=getVal('objectDash','solid');o.layer=getVal('objectLayer',o.layer);o.role=getVal('objectLineRole',o.role);o.name=getVal('objectName',o.name);o.locked=checked('objectLocked');render();scheduleAutosave();updateHistoryButtons();}
function replaceObjectData(target,source){for(const key of Object.keys(target))delete target[key];Object.assign(target,source);}
function applyBoxProps(){
 const id=[...state.selected][0],o=state.objects.find(v=>v.id===id);if(!o||o.locked)return;
 const b=objectBounds(o),x=getNum('objectBoxX',b.x),y=getNum('objectBoxY',b.y),w=getNum('objectBoxW',b.w),h=getNum('objectBoxH',b.h);
 if(![x,y,w,h].every(Number.isFinite)||w<0||h<0){setStatus('Положение и размеры должны быть корректными числами.');return;}
 let scaled;
 try{scaled=scaleObjectToBounds(o,{x,y,w,h},{keepAspect:checked('referenceKeepAspect')});}
 catch(error){setStatus(error.message);return;}
 history.push(snapshot());replaceObjectData(o,scaled);
 render();showProperties();scheduleAutosave();updateHistoryButtons();setStatus('Положение и размер объекта обновлены');
}

function scaleSelectedByFactor(factor){
 const f=Number(factor);if(!Number.isFinite(f)||f<=0||f>100){setStatus('Коэффициент масштаба должен быть больше 0 и не больше 100.');return;}
 transformSelected(o=>{const b=objectBounds(o),pivot={x:b.x+b.w/2,y:b.y+b.h/2};replaceObjectData(o,scaleGeometryObject(o,f,f,pivot));});
 setStatus(`Выбранные объекты масштабированы ×${fmt(f)}`);
}

function deleteSelected(){if(!state.selected.size)return;history.push(snapshot());state.objects=state.objects.filter(o=>!state.selected.has(o.id));state.selected.clear();render();showProperties();scheduleAutosave();updateHistoryButtons();setStatus('Выбранное удалено');}
function duplicateSelected(){const picked=findSelected();if(!picked.length)return;history.push(snapshot());const copies=picked.map(o=>({...structuredClone(o),id:nextId(),dx:(o.dx||0)+5,dy:(o.dy||0)+5,name:o.name?`${o.name} копия`:''}));state.objects.push(...copies);state.selected=new Set(copies.map(o=>o.id));render();showProperties();scheduleAutosave();updateHistoryButtons();}
function transformSelected(fn){const picked=findSelected();if(!picked.length)return;history.push(snapshot());for(const o of picked)fn(o);render();showProperties();scheduleAutosave();updateHistoryButtons();}
function rotateObject(o,deg,pivot=null){bakeOffset(o);const b=objectBounds(o),center=pivot||{x:b.x+b.w/2,y:b.y+b.h/2};const rotated=rotateGeometryObject(o,deg,center);for(const key of Object.keys(o))delete o[key];Object.assign(o,rotated);}
function mirrorSelected(axis='vertical'){
 const picked=findSelected();if(!picked.length)return;
 const bs=picked.map(objectBounds),xmin=Math.min(...bs.map(b=>b.x)),xmax=Math.max(...bs.map(b=>b.x+b.w)),ymin=Math.min(...bs.map(b=>b.y)),ymax=Math.max(...bs.map(b=>b.y+b.h));
 let p1,p2;
 if(axis==='custom'){p1={x:getNum('mirrorX1',0),y:getNum('mirrorY1',0)};p2={x:getNum('mirrorX2',100),y:getNum('mirrorY2',0)};if(Math.hypot(p2.x-p1.x,p2.y-p1.y)<1e-8){setStatus('Точки оси симметрии должны быть разными');return;}}
 else if(axis==='vertical'){p1={x:(xmin+xmax)/2,y:0};p2={x:p1.x,y:1};}
 else {p1={x:0,y:(ymin+ymax)/2};p2={x:1,y:p1.y};}
 const cloneMode=checked('mirrorKeepOriginal');history.push(snapshot());
 const reflect=p=>{const vx=p2.x-p1.x,vy=p2.y-p1.y,l2=vx*vx+vy*vy,t=((p.x-p1.x)*vx+(p.y-p1.y)*vy)/l2,proj={x:p1.x+t*vx,y:p1.y+t*vy};return{x:2*proj.x-p.x,y:2*proj.y-p.y};};
 const result=[];
 for(const source of picked){const o=cloneMode?materializedObject(source):source;if(!cloneMode)bakeOffset(o);
  if(o.points)o.points=o.points.map(reflect);if(o.a)o.a=reflect(o.a);if(o.b)o.b=reflect(o.b);if(o.center)o.center=reflect(o.center);
  if(o.type==='rect'){const corners=[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}].map(reflect);o.type='polygon';o.points=corners;delete o.x;delete o.y;delete o.w;delete o.h;delete o.rx;}
  else if(o.type==='text'){const v=o.rotation||0;o.rotation=axis==='vertical'?-v:axis==='horizontal'?-v:180-v;}
  if(cloneMode){o.id=nextId();o.dx=0;o.dy=0;state.objects.push(o);result.push(o.id);}
 }
 if(cloneMode)state.selected=new Set(result);render();showProperties();scheduleAutosave();updateHistoryButtons();closeModal('mirrorModal');
}
function performAction(action){
 const picked=findSelected();if(action==='centerMarks'){const circles=picked.filter(o=>o.type==='circle');if(!circles.length){setStatus('Выберите окружности');return;}history.push(snapshot());for(const c of circles)state.objects.push({id:nextId(),type:'centerMark',center:{x:c.center.x+(c.dx||0),y:c.center.y+(c.dy||0)},r:Math.max(c.r*.18,2),color:c.color,width:.25,layer:'construction',role:'center'});state.selected.clear();render();scheduleAutosave();updateHistoryButtons();return;}if(action==='duplicate')return duplicateSelected();if(action==='split')return setTool('split');if(action==='toggleLock'){transformSelected(o=>o.locked=!o.locked);showProperties();return;}if(action==='hideSelected'){transformSelected(o=>o.hidden=true);state.selected.clear();renderObjects();showProperties();return;}if(action==='showAll'){history.push(snapshot());state.objects.forEach(o=>o.hidden=false);render();scheduleAutosave();updateHistoryButtons();return;}if(action==='bringFront'||action==='sendBack'){history.push(snapshot());const ids=new Set(state.selected);const sel=state.objects.filter(o=>ids.has(o.id)),rest=state.objects.filter(o=>!ids.has(o.id));state.objects=action==='bringFront'?[...rest,...sel]:[...sel,...rest];commit();return;}if(action==='centerToSheet'){transformSelected(o=>{const b=objectBounds(o);o.dx+=(state.sheet.width/2-(b.x+b.w/2));o.dy+=(state.sheet.height/2-(b.y+b.h/2));});return;}if(action==='zoomSelected'){const b=picked.map(objectBounds);if(b.length){const x=Math.min(...b.map(x=>x.x)),y=Math.min(...b.map(x=>x.y)),r=Math.max(...b.map(x=>x.x+x.w)),d=Math.max(...b.map(x=>x.y+x.h));state.view={x:x-10,y:y-10,w:Math.max(20,r-x+20),h:Math.max(20,d-y+20)};applyView();}return;}
 if(action==='rotate'){const v=Number(prompt('Угол поворота, °','90'));if(Number.isFinite(v))transformSelected(o=>rotateObject(o,v));return;}
 if(action==='mirror'){openModal('mirrorModal');return;}
 if(action==='moveBy'){const dx=Number(prompt('Смещение X, мм','0')),dy=Number(prompt('Смещение Y, мм','0'));if(Number.isFinite(dx)&&Number.isFinite(dy))transformSelected(o=>{o.dx=(o.dx||0)+dx;o.dy=(o.dy||0)+dy;});return;}
 if(action==='scale'){const f=Number(prompt('Коэффициент масштаба','1.25'));if(Number.isFinite(f)&&f>0)scaleSelectedByFactor(f);return;}
 if(action==='offset'){setStatus('Offset для контуров произвольной формы пока ограничен; используйте копирование и точный сдвиг.');return;}
 if(action==='fillet'||action==='chamfer'||action==='trim'||action==='split'){setStatus(`${action}: операция требует устойчивой топологии контуров и не включена в восстановленное ядро.`);return;}
 if(action==='arrayPolar'){openPolarArray();return;}
 if(action==='repeatPolarArray'){repeatPolarArray();return;}
 if(action==='arrayRect'){const dx=Number(prompt('Шаг X, мм','20')),dy=Number(prompt('Шаг Y, мм','20')),cols=Number(prompt('Количество по X','3')),rows=Number(prompt('Количество по Y','2'));if([dx,dy,cols,rows].every(Number.isFinite)){history.push(snapshot());const base=picked.map(o=>structuredClone(o)),copies=[];for(let y=0;y<Math.max(1,rows);y++)for(let x=0;x<Math.max(1,cols);x++){if(x===0&&y===0)continue;for(const o of base)copies.push({...o,id:nextId(),dx:(o.dx||0)+x*dx,dy:(o.dy||0)+y*dy});}state.objects.push(...copies);state.selected=new Set(copies.map(o=>o.id));commit();}return;}
 if(action==='group'||action==='ungroup'){setStatus('Группировка визуально поддерживается множественным выбором; экспорт сохраняет объекты по отдельности.');return;}
 if(action.startsWith('align')||action.startsWith('distribute')){if(picked.length<2){setStatus('Выберите минимум два объекта');return;}const bs=picked.map(objectBounds);const x1=Math.min(...bs.map(b=>b.x)),x2=Math.max(...bs.map(b=>b.x+b.w)),y1=Math.min(...bs.map(b=>b.y)),y2=Math.max(...bs.map(b=>b.y+b.h));transformSelected((o,i)=>{const b=bs[i];if(action==='alignLeft')o.dx+=x1-b.x;if(action==='alignRight')o.dx+=x2-(b.x+b.w);if(action==='alignCenter')o.dx+=(x1+x2)/2-(b.x+b.w/2);if(action==='alignTop')o.dy+=y1-b.y;if(action==='alignBottom')o.dy+=y2-(b.y+b.h);if(action==='alignMiddle')o.dy+=(y1+y2)/2-(b.y+b.h/2);});return;}
}
function openPolarArray(){if(!state.selected.size){setStatus('Сначала выберите объект для массива');return;}openModal('polarArrayModal');$('polarCount').value=6;$('polarCenterX').value=state.sheet.width/2;$('polarCenterY').value=state.sheet.height/2;$('polarAngle').value=360;}
function repeatPolarArray(){if(!state.lastPolar){setStatus('Сначала создайте круговой массив');return;}applyPolarArray(state.lastPolar);}
function applyPolarArray(opts){
 const picked=findSelected();if(!picked.length)return;
 const base=picked.map(materializedObject);history.push(snapshot());
 const n=Math.max(1,Math.min(360,Number(opts.count)||6)),ang=(Number(opts.angle)||360)*Math.PI/180,cx=Number(opts.cx),cy=Number(opts.cy);
 const full=checked('polarFullCircle'),rotateCopies=checked('polarRotateCopies'),out=[];
 const rotatePoint=(p,t)=>({x:cx+(p.x-cx)*Math.cos(t)-(p.y-cy)*Math.sin(t),y:cy+(p.x-cx)*Math.sin(t)+(p.y-cy)*Math.cos(t)});
 for(let i=1;i<n;i++){
  const t=ang*i/(full?n:n-1);
  for(const source of base){
   const clone=structuredClone(source);clone.id=nextId();
   if(clone.points)clone.points=clone.points.map(p=>rotatePoint(p,t));
   if(clone.a)clone.a=rotatePoint(clone.a,t);
   if(clone.b)clone.b=rotatePoint(clone.b,t);
   if(clone.center)clone.center=rotatePoint(clone.center,t);
   if(clone.type==='rect'){
    const c={x:clone.x+clone.w/2,y:clone.y+clone.h/2},rc=rotatePoint(c,t);
    if(rotateCopies){clone.points=[{x:clone.x,y:clone.y},{x:clone.x+clone.w,y:clone.y},{x:clone.x+clone.w,y:clone.y+clone.h},{x:clone.x,y:clone.y+clone.h}].map(p=>rotatePoint(p,t));clone.type='polygon';delete clone.x;delete clone.y;delete clone.w;delete clone.h;delete clone.rx;}
    else {clone.x=rc.x-clone.w/2;clone.y=rc.y-clone.h/2;}
   } else {
    if(clone.x!=null&&clone.y!=null&&!clone.center&&!clone.a&&!clone.points){const q=rotatePoint({x:clone.x,y:clone.y},t);clone.x=q.x;clone.y=q.y;}
    if(rotateCopies&&clone.type==='text')clone.rotation=(clone.rotation||0)+t*180/Math.PI;
    if(rotateCopies&&clone.type==='ellipse')clone.rotation=(clone.rotation||0)+t*180/Math.PI;
    if(rotateCopies&&clone.type==='reference')clone.rotation=(clone.rotation||0)+t*180/Math.PI;
   }
   clone.dx=0;clone.dy=0;out.push(clone);
  }
 }
 state.objects.push(...out);state.lastPolar=opts;state.selected=new Set(out.map(o=>o.id));commit();closeModal('polarArrayModal');
}
function exportSVGString(){const clone=svg.cloneNode(true);clone.querySelector('#gridRect')?.remove();clone.querySelector('#previewLayer')?.remove();clone.querySelector('#selectionLayer')?.remove();clone.querySelector('#snapIndicatorLayer')?.remove();clone.querySelectorAll('[data-reference-exportable="false"]').forEach(n=>n.remove());clone.setAttribute('xmlns',NS);clone.setAttribute('width',`${state.sheet.width}mm`);clone.setAttribute('height',`${state.sheet.height}mm`);clone.setAttribute('viewBox',`0 0 ${state.sheet.width} ${state.sheet.height}`);return new XMLSerializer().serializeToString(clone);}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportProject(){readTitleFromUI();const data=createProject({...state,objects:state.objects,settings:{grid:state.grid,snapGrid:state.snapGrid,ortho:state.ortho}});downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${state.name||'drawing'}.kcad`);setStatus('Проект экспортирован в .kcad');}
function exportSVG(){downloadBlob(new Blob([exportSVGString()],{type:'image/svg+xml'}),`${state.name||'drawing'}.svg`);}
function exportDXF(){
 const out=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
 const pair=(c,v)=>out.push(String(c),String(v));
 for(const source of state.objects){if(source.hidden||source.type==='reference')continue;const o=materializedObject(source);const color=7;
  if(['line','arrowLine','construction','ray','xline'].includes(o.type)){pair(0,'LINE');pair(8,o.layer||'0');pair(62,color);const a=o.a,b=o.b;pair(10,a.x);pair(20,-a.y);pair(30,0);pair(11,b.x);pair(21,-b.y);pair(31,0);}
  else if(o.type==='circle'){pair(0,'CIRCLE');pair(8,o.layer||'0');pair(10,o.center.x);pair(20,-o.center.y);pair(30,0);pair(40,o.r);}
  else if(o.type==='rect'||o.type==='polygon'||o.type==='polyline'){const pts=o.type==='rect'?[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}]:o.points; if(!pts?.length)continue;pair(0,'LWPOLYLINE');pair(8,o.layer||'0');pair(90,pts.length);pair(70,o.type==='rect'||o.type==='polygon'?1:0);for(const p of pts){pair(10,p.x);pair(20,-p.y);}}
  else if(o.type==='text'){pair(0,'TEXT');pair(8,o.layer||'0');pair(10,o.x);pair(20,-o.y);pair(30,0);pair(40,o.size||5);pair(1,o.text||'');}
 }
 out.push('0','ENDSEC','0','EOF');downloadBlob(new Blob([out.join('\r\n')],{type:'application/dxf'}),`${state.name||'drawing'}.dxf`);setStatus('DXF экспортирован (базовые сущности)');
}
function exportRaster(type='image/png'){
 const data=exportSVGString(),blob=new Blob([data],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=Math.round(state.sheet.width*3.78);c.height=Math.round(state.sheet.height*3.78);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(b=>downloadBlob(b,`${state.name||'drawing'}.${type.split('/')[1]}`),type);};img.onerror=()=>{URL.revokeObjectURL(url);setStatus('Не удалось сформировать растр');};img.src=url;
}
function saveProject(){exportProject();}
function saveToLibrary(newCopy=false){readTitleFromUI();const key='cad-geometry-library-v1';let list=[];try{list=JSON.parse(localStorage.getItem(key)||'[]');}catch{}const data=createProject(state);if(newCopy)data.name=`${state.name} копия`;else data.name=state.name;const item={id:crypto.randomUUID?.()||nextId(),name:data.name,savedAt:new Date().toISOString(),data};list=list.filter(x=>x.name!==data.name);list.unshift(item);localStorage.setItem(key,JSON.stringify(list.slice(0,100)));setStatus(`Сохранено в библиотеку: ${data.name}`);}
function scheduleAutosave(){try{localStorage.setItem('cad-geometry-autosave-v1',JSON.stringify(createProject(state)));$('saveState').textContent='Изменения сохранены локально';}catch(e){$('saveState').textContent='Автосохранение недоступно';}}
function loadProjectData(data){const p=parseProject(data);history.push(snapshot());state.name=p.name;state.sheet=p.sheet;state.templateId=p.templateId;state.grid=!!p.settings?.grid;state.snapGrid=!!p.settings?.snapGrid;state.ortho=!!p.settings?.ortho;state.title={...defaultTitle(),...p.title};state.objects=(p.objects||[]).map(o=>{const q={...o,id:o.id||nextId()};if(q.type==='reference'){if(q.opacity==null||q.opacity===.35)q.opacity=.88;q.keepAspect=q.keepAspect!==false;normalizeLegacyReference(q);}return q;});state.selected.clear();writeTitleToUI();$('gridToggle').checked=state.grid;$('snapToggle').checked=state.snapGrid;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';$('filenameField').value=state.name;$('titleFormSelect').value=state.templateId;$('templateQuickSelect').value=state.templateId;setSheet(state.sheet.format||'A3P');render();setStatus('Проект загружен');scheduleAutosave();}
const libraryKey='cad-geometry-library-v1';
function readLibrary(){try{const data=JSON.parse(localStorage.getItem(libraryKey)||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
function writeLibrary(list){localStorage.setItem(libraryKey,JSON.stringify(list.slice(0,100)));}
function addImportedProjectToLibrary(project,sourceName){
 const normalized=createProject(project);const list=readLibrary();
 const item={id:crypto.randomUUID?.()||nextId(),name:normalized.name||sourceName||'Імпортований кресленик',savedAt:new Date().toISOString(),sourceName:sourceName||'',imported:true,data:normalized};
 list.unshift(item);writeLibrary(list);openLibrary();setStatus('Файл додано до списку. Вибери його та натисни «Відкрити» — поточний кресленик не буде накладено.');
}
function openLibrary(){
 const listNode=$('savedProjectsList');listNode.replaceChildren();const list=readLibrary();
 const query=String($('fileSearch')?.value||'').trim().toLocaleLowerCase();const filtered=list.filter(item=>`${item.name||''} ${item.sourceName||''}`.toLocaleLowerCase().includes(query));
 $('fileCount').textContent=`${filtered.length} / ${list.length}`;
 if(!filtered.length){const d=document.createElement('div');d.className='file-empty';d.textContent=list.length?'За цим пошуком файлів не знайдено.':'Поки немає креслеників. Імпортуй .kcad — він з’явиться тут, не відкриваючись поверх поточного аркуша.';listNode.appendChild(d);}
 for(const item of filtered){
  const card=document.createElement('div');card.className='file-card';const info=document.createElement('div'),name=document.createElement('div'),meta=document.createElement('div');
  name.className='file-card-name';name.textContent=item.name||'Кресленик без назви';meta.className='file-card-meta';
  meta.textContent=`${item.imported?'Імпортований файл':'Збережений файл'} · ${new Date(item.savedAt).toLocaleString()} · ${item.data.sheet?.format||''}${item.sourceName?' · '+item.sourceName:''}`;info.append(name,meta);
  const actions=document.createElement('div');actions.className='file-card-actions';const open=document.createElement('button');open.className='primary';open.textContent='Відкрити';open.onclick=()=>{loadProjectData(item.data);closeModal('filesModal');};
  const del=document.createElement('button');del.className='danger';del.textContent='Видалити';del.onclick=()=>{writeLibrary(readLibrary().filter(x=>x.id!==item.id));openLibrary();};actions.append(open,del);card.append(info,actions);listNode.append(card);
 }
 openModal('filesModal');
}
function importFile(file,kind){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const text=String(reader.result),ext=file.name.toLowerCase();if(kind==='project'||kind==='json'||ext.endsWith('.kcad')||ext.endsWith('.json')){const project=parseProject(text);addImportedProjectToLibrary(project,file.name);}else if(kind==='svg'||ext.endsWith('.svg'))importSVG(text);else if(kind==='dxf'||ext.endsWith('.dxf'))importDXF(text);else if(kind==='image')importReference(reader.result,file.name);else setStatus('Цей тип імпорту поки не підтримується');}catch(e){alert(`Не вдалося імпортувати файл: ${e.message}`);}};if(kind==='image')reader.readAsDataURL(file);else reader.readAsText(file);}

function importReference(dataUrl,name){const img=new Image();img.onload=()=>{const size=referenceImportSize(img.naturalWidth||img.width,img.naturalHeight||img.height,100);addObject({type:'reference',dataUrl,x:10,y:10,...size,name,opacity:.88,exportable:false,locked:false,rotation:0});setStatus('Референс добавлен без искажения пропорций. Размер можно увеличить кнопками или полями ширины/высоты.');};img.onerror=()=>setStatus('Не удалось прочитать изображение референса');img.src=dataUrl;}
function importSVG(text){history.push(snapshot());const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror'))throw new Error('Некорректный SVG');const root=doc.documentElement;const view=(root.getAttribute('viewBox')||`0 0 ${state.sheet.width} ${state.sheet.height}`).split(/[ ,]+/).map(Number);const sx=state.sheet.width/(view[2]||state.sheet.width),sy=state.sheet.height/(view[3]||state.sheet.height);const add=(o)=>{o.id=nextId();state.objects.push(o);};for(const node of root.querySelectorAll('line,circle,rect,ellipse,polyline,polygon,text')){const tag=node.tagName,attr=k=>Number(node.getAttribute(k)||0),style=node.getAttribute('style')||'';const color=node.getAttribute('stroke')||style.match(/stroke:([^;]+)/)?.[1]||'#20252a';if(tag==='line')add({type:'line',a:{x:attr('x1')*sx,y:attr('y1')*sy},b:{x:attr('x2')*sx,y:attr('y2')*sy},color});if(tag==='circle')add({type:'circle',center:{x:attr('cx')*sx,y:attr('cy')*sy},r:attr('r')*sx,color});if(tag==='rect')add({type:'rect',x:attr('x')*sx,y:attr('y')*sy,w:attr('width')*sx,h:attr('height')*sy,color});if(tag==='ellipse')add({type:'ellipse',center:{x:attr('cx')*sx,y:attr('cy')*sy},rx:attr('rx')*sx,ry:attr('ry')*sy,color});if(tag==='polyline'||tag==='polygon'){const vals=(node.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number),points=[];for(let i=0;i<vals.length;i+=2)points.push({x:vals[i]*sx,y:vals[i+1]*sy});add({type:tag==='polygon'?'polygon':'polyline',points,color});}if(tag==='text')add({type:'text',x:attr('x')*sx,y:attr('y')*sy,text:node.textContent,size:attr('font-size')*sx||4,color});}commit();setStatus('SVG импортирован (базовые фигуры)');}
function importDXF(text){history.push(snapshot());const lines=text.replace(/\r/g,'').split('\n');const pairs=[];for(let i=0;i+1<lines.length;i+=2)pairs.push([lines[i].trim(),lines[i+1].trim()]);let type=null,ent={};const flush=()=>{if(!type)return;const val=c=>ent[c]!==undefined?Number(ent[c]):0;if(type==='LINE')state.objects.push({id:nextId(),type:'line',a:{x:val('10'),y:-val('20')},b:{x:val('11'),y:-val('21')},color:'#20252a'});if(type==='CIRCLE')state.objects.push({id:nextId(),type:'circle',center:{x:val('10'),y:-val('20')},r:val('40'),color:'#20252a'});if(type==='TEXT')state.objects.push({id:nextId(),type:'text',x:val('10'),y:-val('20'),size:val('40'),text:ent['1']||'',color:'#20252a'});if(type==='LWPOLYLINE'){const pts=[];for(let i=0;i<ent._xs.length;i++)pts.push({x:ent._xs[i],y:-ent._ys[i]});if(pts.length)state.objects.push({id:nextId(),type:'polyline',points:pts,color:'#20252a'});}type=null;ent={_xs:[],_ys:[]};};for(const [c,v] of pairs){if(c==='0'){flush();type=v;continue;}if(c==='10'&&type==='LWPOLYLINE')ent._xs.push(Number(v));else if(c==='20'&&type==='LWPOLYLINE')ent._ys.push(Number(v));else ent[c]=v;}flush();commit();setStatus('DXF импортирован (LINE/CIRCLE/TEXT/LWPOLYLINE)');}
function applyTitle(){readTitleFromUI();renderTemplate();scheduleAutosave();setStatus('Данные основной надписи обновлены');}
function switchTemplate(id){state.templateId=id;if(id==='lab8-reference-template'||id==='lab8-a3-landscape-template'){state.title={...state.title,...lab8DefaultTitle()};writeTitleToUI();}if(id==='kompas-lab5-a4-template'&&state.name==='Новый чертёж'){state.title={...state.title,...kompasLab5DefaultTitle()};writeTitleToUI();}const f=formatForTemplate(id);setSheet(f);$('titleFormSelect').value=id;$('templateQuickSelect').value=id;const t=TEMPLATES.find(v=>v.id===id);$('templateDescription').textContent=t?.description||'';document.querySelectorAll('[data-template-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.templatePreset===id)));renderTemplate();scheduleAutosave();}
function populateNewDocTemplateOptions(){
 const select=$('newDocTemplate');if(!select)return;select.replaceChildren();
 const groups=[
  {label:'Мои образцы',items:TEMPLATES.filter(t=>!isGostTemplate(t.id))},
  {label:'ДСТУ ГОСТ / ЕСКД · основная надпись форма 1',items:TEMPLATES.filter(t=>isGostTemplate(t.id))}
 ];
 for(const group of groups){const og=document.createElement('optgroup');og.label=group.label;for(const item of group.items){const op=document.createElement('option');op.value=item.id;op.textContent=`${item.name} · ${item.format}`;og.append(op);}select.append(og);}
 if(!TEMPLATES.some(t=>t.id===select.value))select.value=state.templateId||TEMPLATES[0].id;
}
function populateTemplateSelectors(){
 const groups=[
  {label:'Мои образцы',items:TEMPLATES.filter(t=>!isGostTemplate(t.id))},
  {label:'ДСТУ ГОСТ / ЕСКД · форма 1',items:TEMPLATES.filter(t=>isGostTemplate(t.id))}
 ];
 for(const id of ['templateQuickSelect','titleFormSelect']){
  const select=$(id);if(!select)continue;select.replaceChildren();
  for(const group of groups){const og=document.createElement('optgroup');og.label=group.label;for(const item of group.items){const op=document.createElement('option');op.value=item.id;op.textContent=`${item.name} · ${item.format}`;og.append(op);}select.append(og);}
 }
}
function createNewDocument(){
 const name=getVal('newDocName','Новый чертёж').trim()||'Новый чертёж';
 const templateCandidate=getVal('newDocTemplate',state.templateId);
 const id=TEMPLATES.some(t=>t.id===templateCandidate)?templateCandidate:(TEMPLATES.some(t=>t.id===state.templateId)?state.templateId:TEMPLATES[0].id);
 const format=getVal('newDocFormat','A3'),orient=getVal('newDocOrientation','P');
 // ГОСТ/DСТУ A4 drawing sheets are portrait; do not silently create the unsupported A4 landscape preset.
 let f=id==='lab8-a3-landscape-template'?'A3L':(format==='A4'?'A4P':format+orient);if(!FORMATS[f])f='A3P';
 state.objects=[];state.selected.clear();state.pending=null;state.preview=null;state.name=name;state.title=(id==='lab8-reference-template'||id==='lab8-a3-landscape-template')?lab8DefaultTitle():id==='kompas-lab5-a4-template'?kompasLab5DefaultTitle():defaultTitle();if(id!=='lab8-reference-template'&&id!=='lab8-a3-landscape-template'&&id!=='kompas-lab5-a4-template')state.title.title=name;state.templateId=id;
 state.sheet.format=f;state.sheet.width=FORMATS[f][0];state.sheet.height=FORMATS[f][1];
 writeTitleToUI();$('filenameField').value=name;
 $('titleFormSelect').value=id;$('templateQuickSelect').value=id;$('templateVisible').checked=true;$('templateToggle').checked=true;
 const description=TEMPLATES.find(t=>t.id===id)?.description||'';$('templateDescription').textContent=description;
 history.undoStack.length=0;history.redoStack.length=0;state.view={x:0,y:0,w:state.sheet.width,h:state.sheet.height};
 setSheet(f);closeModal('newDocModal');render();scheduleAutosave();updateHistoryButtons();
 setStatus(f==='A4P'&&format==='A4'&&orient==='L'?'Создан новый чертёж: для А4 установлена книжная ориентация по стандарту.':'Создан новый чертёж с рамкой: '+(TEMPLATES.find(t=>t.id===id)?.name||'шаблон'));
}
function showNewDoc(){
 const fm=$('newDocFormat');fm.replaceChildren();['A4','A3','A2'].forEach(f=>{const op=document.createElement('option');op.value=f;op.textContent=f;fm.append(op);});
 populateNewDocTemplateOptions();$('newDocTemplate').value=TEMPLATES.some(t=>t.id===state.templateId)?state.templateId:'lab8-reference-template';
 $('newDocFormat').value=state.sheet.format.slice(0,2);$('newDocOrientation').value=state.sheet.format.endsWith('L')?'L':'P';
 $('newDocName').value='Новый чертёж';renderNewDocPreview();openModal('newDocModal');
}
function renderNewDocPreview(){
 const p=$('newDocPreview');if(!p)return;
 const format=getVal('newDocFormat','A3'),orientation=format==='A4'?'P':getVal('newDocOrientation','P');
 const id=getVal('newDocTemplate',state.templateId),f=id==='lab8-a3-landscape-template'?'A3L':format+orientation,[w,h]=FORMATS[f]||FORMATS.A3P;
 p.setAttribute('viewBox',`0 0 ${w} ${h}`);p.replaceChildren();
 el('rect',{x:0,y:0,width:w,height:h,fill:'#fff',stroke:'#777','stroke-width':.35},p);
 if(id!=='lab8-reference-template'&&id!=='lab8-a3-landscape-template'){const b=getTemplateFrame(id,w,h);el('rect',{x:b.x,y:b.y,width:b.width,height:b.height,fill:'none',stroke:'#000000','stroke-width':isGostTemplate(id)?.7:.4},p);}
 if(isGostTemplate(id)){const tb=getForm1Bounds(w,h);renderForm1TitleBlock(p,tb,{title:'Найменування',code:'Позначення',developer:'Розроб.',checker:'Перев.',normative:'Н.контр.',approved:'Затв.',liter:'У',mass:'—',scale:'1:1',sheet:'1',sheets:'1',company:'Організація'},'#000000');}
 else if(id==='lab8-reference-template'||id==='lab8-a3-landscape-template'){renderLab8SampleTemplate(p,w,h,lab8DefaultTitle());}
 else if(id==='kompas-lab5-a4-template'||id==='kompas-import-a4-template'){renderKompasLab5Template(p,w,h,kompasLab5DefaultTitle());}
 else {el('rect',{x:w-195,y:h-65,width:185,height:55,fill:'none',stroke:'#111','stroke-width':.3},p);}
 const item=TEMPLATES.find(t=>t.id===id);$('newDocTemplateHint').textContent=item?.description||'Предпросмотр выбранного листа и рамки.';
 p.style.aspectRatio=`${w}/${h}`;p.style.width=`${Math.min(260,360*w/h)}px`;p.style.height=`${Math.min(360,260*h/w)}px`;
}
function doGostCheck(){const issues=[];if(state.objects.length===0)issues.push('На листе нет геометрии.');if(!state.title.title)issues.push('Не заполнено наименование документа.');if(!state.title.developer)issues.push('Не заполнен разработчик.');const widths=state.objects.filter(o=>o.width!=null).map(o=>o.width);if(widths.some(w=>w>1.2))issues.push('Есть линии толще 1,2 мм — проверьте назначение толщины.');const dims=state.objects.filter(o=>o.type==='dimension');if(!dims.length)issues.push('Размерные обозначения не найдены.');$('gostSummary').textContent=issues.length?`Проверка завершена: замечаний ${issues.length}. Это вспомогательная проверка, не сертификат соответствия.`:'Базовые проверки пройдены. Это не является официальным подтверждением соответствия стандартам.';$('gostCheckResults').replaceChildren();(issues.length?issues:['Базовые проверки завершены без замечаний.']).forEach(s=>{const d=document.createElement('div');d.className='gost-result';d.textContent='• '+s;$('gostCheckResults').append(d);});openModal('gostModal');}

// Menus and button bindings
function bind(){
 document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
 document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>performAction(b.dataset.action)));
 document.querySelectorAll('[data-template-preset]').forEach(b=>b.addEventListener('click',()=>switchTemplate(b.dataset.templatePreset)));
 document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.panel)));
 document.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click',()=>{const m=b.dataset.menu;if(m==='help')openModal('helpModal');else if(m==='file')showNewDoc();else setStatus(`Раздел «${b.textContent}»: используйте соответствующие панели инструментов.`);}));
 $('panModeBtn')?.addEventListener('click',()=>setTool(state.tool==='pan'?'select':'pan'));$('newBtn').onclick=showNewDoc;$('closeNewDocModal').onclick=()=>closeModal('newDocModal');$('cancelNewDocBtn').onclick=()=>closeModal('newDocModal');$('createNewDocBtn').onclick=createNewDocument;
 $('newDocTemplate').onchange=()=>{const t=TEMPLATES.find(v=>v.id===getVal('newDocTemplate'));if(t){$('newDocFormat').value=t.format.slice(0,2);$('newDocOrientation').value=t.format.endsWith('L')?'L':'P';}renderNewDocPreview();};$('newDocFormat').onchange=renderNewDocPreview;$('newDocOrientation').onchange=renderNewDocPreview;
 $('openBtn').onclick=openLibrary;$('openLibraryBtn').onclick=openLibrary;$('closeFilesModal').onclick=()=>closeModal('filesModal');$('fileSearch').oninput=()=>openLibrary();$('importJsonFromLibraryBtn').onclick=()=>$('fileInput').click();$('saveBtn').onclick=saveProject;$('exportProjectBtn').onclick=exportProject;$('saveJsonBtn').onclick=exportProject;$('importProjectBtn').onclick=()=>$('fileInput').click();$('loadJsonBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{const file=e.target.files[0];importFile(file,'project');e.target.value='';};
 $('saveToLibraryBtn').onclick=()=>saveToLibrary(false);$('saveAsLibraryBtn').onclick=()=>saveToLibrary(true);$('restoreAutosaveBtn').onclick=()=>{const s=localStorage.getItem('cad-geometry-autosave-v1');if(s)loadProjectData(s);else setStatus('Автосохранение не найдено');};
 $('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('deleteBtn').onclick=deleteSelected;$('deleteSelectedBtn').onclick=deleteSelected;$('fitBtn').onclick=fitSheet;$('zoomIn').onclick=()=>setZoom(1.25);$('zoomOut').onclick=()=>setZoom(.8);
 $('gridBtn').onclick=()=>{state.grid=!state.grid;$('gridToggle').checked=state.grid;updateSheetGeometry();};$('gridToggle').onchange=()=>{state.grid=checked('gridToggle');updateSheetGeometry();};$('snapToggle').onchange=()=>state.snapGrid=checked('snapToggle');$('snapBtn').onclick=()=>{$('objectSnapToggle').checked=!$('objectSnapToggle').checked;state.osnap=$('objectSnapToggle').checked;};$('objectSnapToggle').onchange=()=>state.osnap=checked('objectSnapToggle');$('orthoBtn').onclick=()=>{$('orthoToggle').checked=!checked('orthoToggle');state.ortho=checked('orthoToggle');$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';};$('orthoToggle').onchange=()=>{state.ortho=checked('orthoToggle');$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';};
 $('paperFormat').onchange=()=>{history.push(snapshot());setSheet(getVal('paperFormat','A3P'));scheduleAutosave();updateHistoryButtons();};$('templateQuickSelect').onchange=()=>{history.push(snapshot());switchTemplate(getVal('templateQuickSelect'));updateHistoryButtons();};$('titleFormSelect').onchange=()=>{history.push(snapshot());switchTemplate(getVal('titleFormSelect'));updateHistoryButtons();};$('templateVisible').onchange=()=>{$('templateToggle').checked=$('templateVisible').checked;renderTemplate();};$('templateToggle').onchange=()=>{$('templateVisible').checked=$('templateToggle').checked;renderTemplate();};['geometryVisible','dimensionsVisible','constructionVisible'].forEach(id=>$(id)?.addEventListener('change',updateLayerVisibility));['referenceVisibleToggle','referenceVisibleToggleSecondary'].forEach(id=>$(id)?.addEventListener('change',e=>{const other=$(e.target.id==='referenceVisibleToggle'?'referenceVisibleToggleSecondary':'referenceVisibleToggle');if(other)other.checked=e.target.checked;updateLayerVisibility();}));layers.template.addEventListener('dblclick',e=>{const node=e.target.closest('[data-template-key]');if(!node)return;const key=node.getAttribute('data-template-key'),value=prompt(`Изменить поле «${key}»`,state.title[key]||'');if(value!==null){state.title[key]=value;writeTitleToUI();renderTemplate();scheduleAutosave();}});
 $('applyTitleBtn').onclick=applyTitle;Object.values(titleMap).forEach(id=>$(id)?.addEventListener('change',()=>{readTitleFromUI();renderTemplate();scheduleAutosave();}));
 ['objectColor','objectWidth','objectDash','objectLayer','objectLineRole','objectName','objectLocked'].forEach(id=>$(id)?.addEventListener('change',updateSelectionByProps));$('applyObjectGeometryBtn').onclick=applyBoxProps;$('applyObjectSpecificBtn')?.addEventListener('click',applyObjectSpecificProps);$('applyObjectRotationBtn').onclick=()=>{const target=getNum('objectRotationAngle',0);transformSelected(o=>rotateObject(o,target-(Number(o.rotation)||0)));};$('applyObjectScaleBtn')?.addEventListener('click',()=>scaleSelectedByFactor(getNum('objectScaleFactor',1.25)));document.querySelectorAll('[data-object-scale]').forEach(btn=>btn.addEventListener('click',()=>scaleSelectedByFactor(Number(btn.dataset.objectScale)||1)));$('objectRotationSlider').oninput=()=>{$('objectRotationAngle').value=$('objectRotationSlider').value;};$('objectRotationSlider').onchange=()=>{const target=getNum('objectRotationSlider',0);transformSelected(o=>rotateObject(o,target-(Number(o.rotation)||0)));};document.querySelectorAll('[data-rotate-step]').forEach(btn=>btn.addEventListener('click',()=>transformSelected(o=>rotateObject(o,Number(btn.dataset.rotateStep)||0))));
 $('dimensionSelectedOffset')?.addEventListener('change',()=>{if($('dimensionSelectedOffsetSlider'))$('dimensionSelectedOffsetSlider').value=$('dimensionSelectedOffset').value;updateSelectedDimensionProps();});
 $('dimensionSelectedOffsetSlider')?.addEventListener('input',()=>{if($('dimensionSelectedOffset'))$('dimensionSelectedOffset').value=$('dimensionSelectedOffsetSlider').value;});
 $('dimensionSelectedOffsetSlider')?.addEventListener('change',updateSelectedDimensionProps);
 $('dimensionTextHeight')?.addEventListener('change',()=>{if($('dimensionTextHeightSlider'))$('dimensionTextHeightSlider').value=$('dimensionTextHeight').value;updateSelectedDimensionProps();});
 $('dimensionArrowSize')?.addEventListener('change',updateSelectedDimensionProps);
 $('dimensionTextHeightSlider')?.addEventListener('input',()=>{if($('dimensionTextHeight'))$('dimensionTextHeight').value=$('dimensionTextHeightSlider').value;});
 $('dimensionTextHeightSlider')?.addEventListener('change',updateSelectedDimensionProps);
 $('dimensionTextHeight')?.addEventListener('input',()=>{if($('dimensionTextHeightSlider'))$('dimensionTextHeightSlider').value=String(Math.max(.5,Math.min(30,getNum('dimensionTextHeight',2.5))));});
 $('dimensionLabelRotation')?.addEventListener('input',()=>{if($('dimensionLabelRotationSlider'))$('dimensionLabelRotationSlider').value=$('dimensionLabelRotation').value;});
 $('dimensionLabelRotation')?.addEventListener('change',updateSelectedDimensionProps);
 $('dimensionLabelRotationSlider')?.addEventListener('input',()=>{if($('dimensionLabelRotation'))$('dimensionLabelRotation').value=$('dimensionLabelRotationSlider').value;});
 $('dimensionLabelRotationSlider')?.addEventListener('change',updateSelectedDimensionProps);
 ['dimensionLabelDx','dimensionLabelDy','dimensionValueText','dimensionShowValue','dimensionArrowPlacement','dimensionArrowStyle','dimensionArrowStartStyle','dimensionArrowEndStyle','dimensionTextOrientation'].forEach(id=>$(id)?.addEventListener('change',updateSelectedDimensionProps));
 document.querySelectorAll('[data-dimension-text-step]').forEach(btn=>btn.addEventListener('click',()=>{const next=Math.max(.5,Math.min(30,getNum('dimensionTextHeight',2.5)+Number(btn.dataset.dimensionTextStep)));if($('dimensionTextHeight'))$('dimensionTextHeight').value=String(next);if($('dimensionTextHeightSlider'))$('dimensionTextHeightSlider').value=String(next);updateSelectedDimensionProps();}));
 document.querySelectorAll('[data-dimension-rotation-step]').forEach(btn=>btn.addEventListener('click',()=>{const next=getNum('dimensionLabelRotation',0)+Number(btn.dataset.dimensionRotationStep);if($('dimensionLabelRotation'))$('dimensionLabelRotation').value=String(next);if($('dimensionLabelRotationSlider'))$('dimensionLabelRotationSlider').value=String(next);updateSelectedDimensionProps();}));
 $('coordinateApplyBtn').onclick=()=>{const p={x:getNum('coordinateX'),y:getNum('coordinateY')};state.pending=null;clickTool(p,{shiftKey:false,detail:1,target:svg});};
 $('circleInputMode').onchange=()=>setStatus(`Режим окружности: ${getVal('circleInputMode')}`);
 $('addReferenceRibbonBtn').onclick=()=>{showReferencesPanel();$('referenceInput').click();};$('addReferenceBtn').onclick=()=>$('referenceInput').click();$('referenceInput').onchange=e=>{importFile(e.target.files[0],'image');e.target.value='';};
 $('referenceLockBtn').onclick=()=>updateSelected(o=>{o.locked=!o.locked;});$('quickReferenceLockBtn').onclick=()=>updateSelected(o=>{if(o.type==='reference')o.locked=!o.locked;});$('referenceOpacity').oninput=()=>updateSelected(o=>{if(o.type==='reference')o.opacity=Number($('referenceOpacity').value)/100;});$('referenceExportable').onchange=()=>updateSelected(o=>{o.exportable=checked('referenceExportable');});
 $('referenceKeepAspect').onchange=()=>editSelectedReference(o=>{o.keepAspect=checked('referenceKeepAspect');if(o.keepAspect){o.aspectRatio=referenceAspectRatio(o);o.h=o.w/o.aspectRatio;}});
 $('referenceX').onchange=()=>editSelectedReference(o=>o.x=getNum('referenceX'));$('referenceY').onchange=()=>editSelectedReference(o=>o.y=getNum('referenceY'));
 $('referenceWidth').onchange=()=>resizeSelectedReference('width');$('referenceHeight').onchange=()=>resizeSelectedReference('height');$('referenceRotation').onchange=()=>editSelectedReference(o=>o.rotation=getNum('referenceRotation'));
 $('referenceEnlargeBtn').onclick=()=>scaleSelectedReference(1.25);$('referenceEnlarge2Btn').onclick=()=>scaleSelectedReference(2);$('referenceReduceBtn').onclick=()=>scaleSelectedReference(.8);$('fitReferenceBtn').onclick=fitSelectedReference;
 $('centerReferenceBtn').onclick=()=>transformSelected(o=>{if(o.type==='reference'){o.x=(state.sheet.width-o.w)/2;o.y=(state.sheet.height-o.h)/2;}});
 $('referenceManagerOpacity').oninput=()=>{const value=Number($('referenceManagerOpacity').value);$('referenceManagerOpacityValue').textContent=`${value}%`;updateSelected(o=>{if(o.type==='reference')o.opacity=value/100;});};
 $('referenceManagerEnlargeBtn').onclick=()=>scaleSelectedReference(1.25);$('referenceManagerReduceBtn').onclick=()=>scaleSelectedReference(.8);$('referenceManagerFitBtn').onclick=fitSelectedReference;
 $('referenceManagerCenterBtn').onclick=()=>$('centerReferenceBtn').click();$('referenceManagerLockBtn').onclick=()=>updateSelected(o=>{if(o.type==='reference')o.locked=!o.locked;});$('referenceManagerDeleteBtn').onclick=deleteSelected;
 $('referenceShowAllBtn').onclick=()=>{const hidden=state.objects.filter(o=>o.type==='reference'&&o.hidden);if(!hidden.length)return;history.push(snapshot());hidden.forEach(o=>o.hidden=false);if($('referenceVisibleToggle'))$('referenceVisibleToggle').checked=true;if($('referenceVisibleToggleSecondary'))$('referenceVisibleToggleSecondary').checked=true;updateLayerVisibility();render();scheduleAutosave();updateHistoryButtons();};
 $('addTextBtn').onclick=()=>setTool('text');$('editContentBtn').onclick=()=>{const o=findSelected()[0];if(o?.type==='text'){textInsertPoint={x:o.x,y:o.y};$('textContent').value=o.text;$('textSize').value=o.size;openModal('textModal');}else setStatus('Выберите текстовый объект');};$('editTextFormatBtn').onclick=()=>{const o=findSelected()[0];if(o?.type==='text'){editingTextId=o.id;$('textContent').value=o.text;$('textSize').value=o.size;openModal('textModal');}else setStatus('Выберите текстовый объект');};$('closeTextModal').onclick=()=>{closeModal('textModal');editingTextId=null;};$('cancelTextBtn').onclick=()=>{closeModal('textModal');editingTextId=null;};$('applyTextBtn').onclick=finishText;
 $('dxfBtn').onclick=exportDXF;$('exportDxfBtn').onclick=exportDXF;$('svgBtn').onclick=exportSVG;$('exportJpgBtn').onclick=()=>exportRaster('image/jpeg');$('exportWebpBtn').onclick=()=>exportRaster('image/webp');$('exportBmpBtn').onclick=()=>exportRaster('image/png');$('pngBtn').onclick=()=>exportRaster('image/png');$('exportCsvBtn').onclick=()=>{const rows=['id,type,x,y,width,height,color'];for(const o of state.objects){const b=objectBounds(o);rows.push([o.id,o.type,b.x,b.y,b.w,b.h,o.color||''].join(','));}downloadBlob(new Blob([rows.join('\n')],{type:'text/csv'}),`${state.name}.csv`);};$('exportHpglBtn').onclick=()=>setStatus('HPGL/PLT экспорт не реализован в восстановленной сборке.');
 $('importDxfBtn').onclick=()=>$('dxfInput').click();$('dxfInput').onchange=e=>importFile(e.target.files[0],'dxf');$('importSvgBtn').onclick=()=>$('svgInput').click();$('svgInput').onchange=e=>importFile(e.target.files[0],'svg');$('importCsvBtn').onclick=()=>$('csvInput').click();$('csvInput').onchange=e=>setStatus('Импорт CSV пока не реализован');$('importHpglBtn').onclick=()=>$('hpglInput').click();$('hpglInput').onchange=e=>setStatus('Импорт HPGL пока не реализован');
 $('printBtn').onclick=()=>{const p=$('printPageDimensions');if(p)p.textContent=`Лист ${state.sheet.width} × ${state.sheet.height} мм`;openModal('printModal');};$('closePrintModal').onclick=()=>closeModal('printModal');$('printNowBtn').onclick=()=>{closeModal('printModal');window.print();};$('printPreflightBtn').onclick=doGostCheck;$('printCalibrationBtn').onclick=()=>{addObject({type:'line',a:{x:20,y:30},b:{x:120,y:30},color:'#000',width:.35});addObject({type:'text',x:20,y:25,text:'Контрольний відрізок 100 мм',size:4,color:'#000'});};
 $('kompasBridgeBtn').onclick=()=>openModal('kompasBridgeModal');$('closeKompasBridgeBtn').onclick=()=>closeModal('kompasBridgeModal');$('closeBridgeBottomBtn').onclick=()=>closeModal('kompasBridgeModal');$('bridgeExportDxfBtn').onclick=()=>{closeModal('kompasBridgeModal');exportDXF();};
 $('gostRibbonBtn').onclick=doGostCheck;$('checkGostBtn').onclick=doGostCheck;$('closeGostModal').onclick=()=>closeModal('gostModal');$('closeGostModalBottom').onclick=()=>closeModal('gostModal');$('helpBtn').onclick=()=>openModal('helpModal');$('closeHelp').onclick=()=>closeModal('helpModal');
 $('applyMirrorBtn').onclick=()=>mirrorSelected(getVal('mirrorAxisMode','vertical'));$('closeMirrorModal').onclick=()=>closeModal('mirrorModal');$('cancelMirrorBtn').onclick=()=>closeModal('mirrorModal');$('mirrorAxisMode').onchange=()=>$('mirrorCustomPoints').classList.toggle('hidden',getVal('mirrorAxisMode')!=='custom');
 $('applyPolarArrayBtn').onclick=()=>applyPolarArray({count:getNum('polarCount',6),cx:getNum('polarCenterX',state.sheet.width/2),cy:getNum('polarCenterY',state.sheet.height/2),angle:getNum('polarAngle',360)});$('closePolarArrayBtn').onclick=()=>closeModal('polarArrayModal');$('cancelPolarArrayBtn').onclick=()=>closeModal('polarArrayModal');$('polarSheetCenterBtn').onclick=()=>{$('polarCenterX').value=state.sheet.width/2;$('polarCenterY').value=state.sheet.height/2;};$('polarSelectionCenterBtn').onclick=()=>{const b=findSelected().map(objectBounds);if(b.length){$('polarCenterX').value=(Math.min(...b.map(v=>v.x))+Math.max(...b.map(v=>v.x+v.w)))/2;$('polarCenterY').value=(Math.min(...b.map(v=>v.y))+Math.max(...b.map(v=>v.y+v.h)))/2;}};
 $('hatchSelectedRegionBtn').onclick=()=>{if(state.tool!=='hatch')setTool('hatch');const o=findSelected()[0];if(o){clickTool({x:0,y:0},{target:svg});}};$('hatchSelectedBoundaryBtn').onclick=$('hatchSelectedRegionBtn').onclick;$('findClosedLoopsHatchBtn').onclick=()=>setStatus('Автоматический поиск замкнутых контуров из отдельных рёбер пока не включён; выберите готовую ломаную/контур и инструмент штриховки.');
 $('placeInnerCutoutBtn').onclick=()=>setTool('innerCutout');$('applyPolygonFaceOffsetBtn').onclick=()=>setStatus('Редактирование отдельных граней многоугольника пока не включено.');$('lockAllObjectsBtn').onclick=()=>{if(!state.objects.length)return;history.push(snapshot());state.objects.forEach(o=>o.locked=true);render();scheduleAutosave();updateHistoryButtons();};$('unlockAllObjectsBtn').onclick=()=>{if(!state.objects.length)return;history.push(snapshot());state.objects.forEach(o=>o.locked=false);render();scheduleAutosave();updateHistoryButtons();};$('clearRulerBtn').onclick=()=>{history.push(snapshot());state.objects=state.objects.filter(o=>o.type!=='ruler');commit();};$('saveGostSettingsBtn').onclick=()=>setStatus('Параметры ГОСТ применены к новым объектам.');$('applyGostBtn').onclick=()=>setStatus('Новые объекты используют миллиметры и заданную толщину линий.');$('normalizeGostBtn').onclick=()=>updateSelected(o=>{o.width=.35;});$('increaseDrawingTextBtn').onclick=()=>transformSelected(o=>{if(o.type==='text')o.size=5;});$('saveAssignmentDimensionsBtn').onclick=()=>localStorage.setItem('cad-assignment-dimensions',getVal('assignmentDimensions'));
 $('hatchAngle').onchange=()=>{$('hatchAngleSlider').value=getNum('hatchAngle',45);};$('hatchAngleSlider').oninput=()=>{$('hatchAngle').value=$('hatchAngleSlider').value;};document.querySelectorAll('[data-hatch-angle]').forEach(b=>b.onclick=()=>{$('hatchAngle').value=b.dataset.hatchAngle;$('hatchAngleSlider').value=b.dataset.hatchAngle;});
 $('saveState').title='Локальное автосохранение включено';
 window.addEventListener('beforeprint',()=>{svg.setAttribute('viewBox',`0 0 ${state.sheet.width} ${state.sheet.height}`);});
 window.addEventListener('afterprint',applyView);
 // Unified pointer input: works with mouse, pen and touchpad-emulated mouse gestures.
 // Capture the pointer so an in-progress line/pan is completed even when the cursor leaves the sheet.
 const handlePointerDown=evt=>{
  if(evt.pointerType==='mouse'&&evt.button===0&&evt.target.closest?.('button,input,select,textarea'))return;
  onCanvasMouseDown(evt);
  try{drawing.setPointerCapture(evt.pointerId);}catch{}
 };
 if(window.PointerEvent){
  drawing.addEventListener('pointerdown',handlePointerDown);
  window.addEventListener('pointermove',onCanvasMouseMove);
  window.addEventListener('pointerup',onCanvasMouseUp);
  window.addEventListener('pointercancel',cancelCanvasGesture);
 }else{
  drawing.addEventListener('mousedown',onCanvasMouseDown);
  window.addEventListener('mousemove',onCanvasMouseMove);
  window.addEventListener('mouseup',onCanvasMouseUp);
 }
 window.addEventListener('blur',cancelCanvasGesture);
 drawing.addEventListener('dragstart',e=>e.preventDefault());
 drawing.addEventListener('dblclick',evt=>{if(['polyline','spline','curvedArrow'].includes(state.tool)&&polylinePoints.length>=2){addObject({type:state.tool,points:polylinePoints,...currentStyle()});polylinePoints=[];state.preview=null;setTool('select');}});
 drawing.addEventListener('wheel',onCanvasWheel,{passive:false});
 drawing.addEventListener('contextmenu',e=>e.preventDefault());drawing.addEventListener('auxclick',e=>e.preventDefault());
 document.addEventListener('keydown',e=>{if(e.key===' '&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){spaceDown=true;drawing.classList.add('pan-ready');e.preventDefault();return;}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='Escape'){state.pending=null;state.preview=null;polylinePoints=[];state.drag=null;state.drawGesture=null;renderPreview();setTool('select');}if(e.key==='Enter'&&polylinePoints.length>=2){addObject({type:state.tool==='spline'?'spline':state.tool==='curvedArrow'?'curvedArrow':'polyline',points:polylinePoints,...(state.tool==='curvedArrow'?{arrowSize:3.2}:{}),...currentStyle()});polylinePoints=[];state.preview=null;setTool('select');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if(e.key==='F8'){$('orthoToggle').checked=!checked('orthoToggle');state.ortho=checked('orthoToggle');$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';}if(e.key==='Delete'||e.key==='Backspace')deleteSelected();if(e.key===' '&&!e.repeat){drawing.dataset.space='1';}});document.addEventListener('keyup',e=>{if(e.key===' '){spaceDown=false;drawing.classList.remove('pan-ready');}});
 window.addEventListener('resize',()=>fitSheet());
 document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)m.classList.add('hidden');}));
}

// Initial UI state
function init(){
 setupPanelOrganization();populateTemplateSelectors();writeTitleToUI();$('paperFormat').value=state.sheet.format;$('titleFormSelect').value=state.templateId;$('templateQuickSelect').value=state.templateId;$('filenameField').value=state.name;$('templateDescription').textContent=TEMPLATES.find(t=>t.id===state.templateId)?.description||'';
 $('gridPattern').setAttribute('width',getNum('gridStep',5));$('gridPattern').setAttribute('height',getNum('gridStep',5));
 bind();setTool('select');fitSheet();render();
 try{const auto=localStorage.getItem('cad-geometry-autosave-v1');if(auto){const d=JSON.parse(auto);if(d?.objects?.length||d?.name){setStatus('Найдено локальное автосохранение. Нажмите «Восстановить автосохранение» для загрузки.');}}}catch{}
}
try{init();}catch(error){console.error('CAD startup failed:',error);const status=$('statusMessage');if(status)status.textContent=`Ошибка запуска: ${error.message}. Обновите страницу и проверьте консоль.`;throw error;}
