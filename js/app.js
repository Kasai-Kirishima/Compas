import {TEMPLATES, FORMATS, formatForTemplate} from '../src/templates.mjs';
import {History} from '../src/history.mjs';
import {distance, constrainAngle, nearestPoint, boundsOfObject, pathData, svgEscape} from '../src/geometry.mjs';
import {createProject, parseProject} from '../src/project-file.mjs';
import {removePathWindow, splitOpenPath, splitClosedPolygon} from '../src/operations.mjs';

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
const state={name:'Кресленик_1',sheet:{format:'A3P',width:297,height:420},templateId:'lab4-reference-template',title:defaultTitle(),objects:[],selected:new Set(),tool:'select',pending:null,preview:null,drag:null,drawGesture:null,pan:null,grid:false,snapGrid:false,osnap:true,ortho:false,zoom:1,view:{x:0,y:0,w:297,h:420},settings:{lineWidth:.35,defaultTextSize:5,gridStep:5},lastPolar:null};
const history=new History(100);
const svg=$('sheetSvg'), drawing=$('drawingArea');
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
function fitSheet(){
 if(!drawing)return;
 const {width:w,height:h}=state.sheet;const availW=Math.max(200,drawing.clientWidth-70),availH=Math.max(200,drawing.clientHeight-88);
 const px=Math.min(availW/w,availH/h);svg.style.width=`${w*px}px`;svg.style.height=`${h*px}px`;
 state.zoom=1;state.view={x:0,y:0,w,h};updateSheetGeometry();$('zoomLabel').textContent='100%';
}
function applyView(){
 const v=state.view;
 svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
 state.zoom=state.sheet.width/v.w;
 $('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;
}
function setZoom(factor,clientPoint=null){
 const old=state.view, rect=svg.getBoundingClientRect();
 const fx=clientPoint?Math.max(0,Math.min(1,(clientPoint.x-rect.left)/Math.max(1,rect.width))):.5;
 const fy=clientPoint?Math.max(0,Math.min(1,(clientPoint.y-rect.top)/Math.max(1,rect.height))):.5;
 const anchorX=old.x+old.w*fx,anchorY=old.y+old.h*fy;
 const nw=Math.max(state.sheet.width/64,Math.min(state.sheet.width/.05,old.w/factor));
 const nh=nw*old.h/old.w;
 state.view={x:anchorX-nw*fx,y:anchorY-nh*fy,w:nw,h:nh};
 applyView();
}
function zoomFromWheel(evt){
 const factor=Math.exp(-evt.deltaY*.0015);
 setZoom(factor,{x:evt.clientX,y:evt.clientY});
}
function screenPoint(evt){const pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;const m=svg.getScreenCTM();if(!m)return{x:0,y:0};const p=pt.matrixTransform(m.inverse());return{x:p.x,y:p.y};}
function applyPrecision(p,evt=null){let q={x:p.x,y:p.y};
 if(state.snapGrid||checked('snapToggle')){const s=Math.max(.1,getNum('gridStep',5));q={x:Math.round(q.x/s)*s,y:Math.round(q.y/s)*s};}
 if(state.osnap && checked('objectSnapToggle')){const tol=4/state.zoom;const sn=nearestPoint(q,state.objects,tol);if(sn)q={x:sn.x,y:sn.y};}
 if(state.pending?.start && (state.ortho||checked('orthoToggle'))){q=constrainAngle(state.pending.start,q,getNum('angleStep',15));}
 if(evt?.shiftKey && state.pending?.start)q=constrainAngle(state.pending.start,q,getNum('angleStep',15));
 return {x:round(q.x),y:round(q.y)};
}
function snapshot(){return {objects:state.objects,templateId:state.templateId,sheet:state.sheet,title:state.title,name:state.name};}
function commit(){render();scheduleAutosave();updateHistoryButtons();}
function updateHistoryButtons(){if($('undoBtn'))$('undoBtn').disabled=!history.canUndo;if($('redoBtn'))$('redoBtn').disabled=!history.canRedo;}
function restoreSnapshot(s){if(!s)return;state.objects=structuredClone(s.objects||[]);state.templateId=s.templateId||state.templateId;state.sheet=structuredClone(s.sheet||state.sheet);state.title={...defaultTitle(),...(s.title||{})};state.name=s.name||state.name;writeTitleToUI();$('titleFormSelect').value=state.templateId;$('templateQuickSelect').value=state.templateId;$('filenameField').value=state.name;setSheet(state.sheet.format||'A3P');render();}
function undo(){const s=history.undo(snapshot());if(s){restoreSnapshot(s);setStatus('Отменено');}updateHistoryButtons();}
function redo(){const s=history.redo(snapshot());if(s){restoreSnapshot(s);setStatus('Повторено');}updateHistoryButtons();}
function layerFor(o){if(o.type==='reference')return 'reference';if(['dimension','dimH','dimV','dimDia','dimRad','dimAngle','text','leader','hatch','table','roughness','tolerance','weld','section','techReq'].includes(o.type))return 'annotation';if(o.type==='construction'||o.type==='xline'||o.type==='ray'||o.type==='ruler'||o.type==='centerline')return 'construction';return 'geometry';}
function styleFor(o){const dash=(o.role==='center'&&!o.dash)?'8 2 1 2':o.dash;return {stroke:o.color||'#20252a','stroke-width':o.width??.35,'stroke-dasharray':dash||null,'stroke-linecap':'round','stroke-linejoin':'round',fill:o.fill||'none',opacity:o.opacity??1};}
function drawArrow(parent,tip,from,size=2.5,color='#20252a'){
 const a=Math.atan2(tip.y-from.y,tip.x-from.x),back=a+Math.PI,half=size*Math.tan(14*Math.PI/180);
 const p1={x:tip.x+size*Math.cos(back-half),y:tip.y+size*Math.sin(back-half)},p2={x:tip.x+size*Math.cos(back+half),y:tip.y+size*Math.sin(back+half)};
 el('polygon',{points:`${tip.x},${tip.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`,fill:color,stroke:color,'stroke-width':.1},parent);
}
function addText(parent,x,y,text,size=3.5,attrs={}){
 const lines=String(text??'').split('\n');const t=el('text',{x,y,'font-size':size,'font-family':'Arial, sans-serif',fill:'#20252a','dominant-baseline':'auto',...attrs},parent);
 lines.forEach((line,i)=>el('tspan',{x,dy:i===0?0:size*1.25},t, line));return t;
}
function renderTemplate(){
 const g=layers.template;g.replaceChildren();
 if(!checked('templateVisible') && $('templateVisible'))return;
 if(!state.templateId||state.templateId==='blank')return;
 const {width:w,height:h}=state.sheet;const t=state.templateId;const blue=t==='lab8-reference-template';const ink=blue?'#162cff':'#161616';const sw=blue?.42:.35;
 const line=(x1,y1,x2,y2,width=sw)=>el('line',{x1,y1,x2,y2,stroke:ink,'stroke-width':width,fill:'none'},g);
 const rect=(x,y,ww,hh,width=sw)=>el('rect',{x,y,width:ww,height:hh,fill:'none',stroke:ink,'stroke-width':width},g);
 const txt=(x,y,s,z=2.6,anchor='start',key=null,rotate=null)=>{
  const a={x,y,'font-size':z,'text-anchor':anchor,fill:ink,'font-family':'Arial, sans-serif'};if(rotate)a.transform=`rotate(${rotate} ${x} ${y})`;
  const e=addText(g,x,y,s,z,a);if(key)e.setAttribute('data-template-key',key);return e;
 };
 // Common drawing border, with ESKD-style inner frame.
 const margin=t==='lab8-reference-template'?5:10;rect(margin,margin,w-2*margin,h-2*margin,sw);
 if(t==='lab8-reference-template'){
  // Reconstruction of the supplied blue A3 landscape frame (not a certified template).
  rect(11,5,12,h-10,.38);line(23,5,23,h-5);line(11,62,23,62);line(11,118,23,118);line(11,174,23,174);line(11,230,23,230);
  rect(23,5,76,14,.42);txt(61,14, state.title.code||'КТ-24.ЛР8.001',3.0,'middle','code');
  // left vertical archive and filing bands
  for(let i=0;i<4;i++){const y=62+i*42;rect(11,y,12,38,.28);txt(17,y+23,'Архив / ЛР8',1.6,'middle',null,-90);}
  const bx=w-195,by=h-61,bw=190,bh=56;rect(bx,by,bw,bh,.45);
  // top rows
  line(bx,by+8,bx+bw,by+8);line(bx,by+16,bx+bw,by+16);line(bx,by+24,bx+bw,by+24);
  line(bx+72,by,bx+72,by+24);line(bx+122,by,bx+122,by+24);line(bx+152,by,bx+152,by+24);
  // revision / signing rows
  line(bx,by+32,bx+bw,by+32);line(bx,by+40,bx+bw,by+40);line(bx,by+48,bx+bw,by+48);
  line(bx+13,by+24,bx+13,by+56);line(bx+40,by+24,bx+40,by+56);line(bx+112,by+24,bx+112,by+56);
  txt(bx+3,by+5,'Обозначение',1.8);txt(bx+76,by+5,'Масштаб',1.8);txt(bx+124,by+5,'Лист',1.8);txt(bx+154,by+5,'Листов',1.8);
  txt(bx+3,by+14,state.title.title||'Корпус',3.8,'start','title');txt(bx+76,by+14,state.title.scale||'1:1',3.1,'middle','scale');txt(bx+137,by+14,state.title.sheet||'1',3.0,'middle','sheet');txt(bx+171,by+14,state.title.sheets||'1',3.0,'middle','sheets');
  txt(bx+3,by+22,state.title.material||'',2.4,'start','material');txt(bx+74,by+22,'Лит. '+(state.title.liter||'У'),2.2,'start','liter');txt(bx+124,by+22,'Масса '+(state.title.mass||'—'),2.2,'start','mass');
  const roleX=bx+2,nameX=bx+43;txt(roleX,by+30,'Разраб.',1.8);txt(nameX,by+30,state.title.developer||'Кушвид О.',2.3,'start','developer');
  txt(roleX,by+38,'Пров.',1.8);txt(nameX,by+38,state.title.checker||'Базиль Б.',2.3,'start','checker');
  txt(roleX,by+46,'Т. контр.',1.6);txt(nameX,by+46,state.title.technical||'',2.1,'start','technical');
  txt(roleX,by+54,'Н. контр.',1.6);txt(nameX,by+54,state.title.normative||'',2.1,'start','normative');
  txt(bx+bw-4,by+30,'Корпус',3.5,'end');txt(bx+bw-4,by+43,'Вариант 8',3.1,'end');txt(bx+bw-4,by+53,'ШЦМГУ',2.7,'end');
  txt(17,h-8,'Лабораторная работа №8',1.6,'middle',null,-90);
 }else if(t==='lab4-reference-template'){
  const left=18;line(left,margin,left,h-margin);line(23,margin,23,h-margin);line(left,margin+38,23,margin+38);line(left,margin+76,23,margin+76);line(left,margin+114,23,margin+114);
  rect(23,margin,70,14);txt(58,margin+9,state.title.code||'КТ-24.ЛР4.001',2.6,'middle','code');
  // Tall left-side administrative column and lower title block.
  for(let i=0;i<5;i++){const y=margin+130+i*48;line(left,y,23,y);}
  for(let i=0;i<3;i++){const y=h-74+i*18;line(23,y,w-margin,y);}
  const bw=Math.min(185,w-34),bx=w-margin-bw,by=h-65;rect(bx,by,bw,55);line(bx,by+10,bx+bw,by+10);line(bx,by+20,bx+bw,by+20);line(bx,by+32,bx+bw,by+32);line(bx+80,by,bx+80,by+32);line(bx+125,by,bx+125,by+32);line(bx+150,by,bx+150,by+55);line(bx,by+42,bx+bw,by+42);
  txt(bx+3,by+7,'Обозначение',2);txt(bx+3,by+18,state.title.title||'Лабораторная работа №4',3.2,'start','title');txt(bx+83,by+7,'Масштаб',1.8);txt(bx+101,by+18,state.title.scale||'1:1',2.5,'middle','scale');txt(bx+128,by+7,'Лист',1.8);txt(bx+137,by+18,state.title.sheet||'1',2.4,'middle','sheet');
  txt(bx+3,by+30,'Разраб. '+(state.title.developer||'Кушвид О.'),2.2,'start','developer');txt(bx+83,by+30,'Пров. '+(state.title.checker||'Базиль Б.'),2.2,'start','checker');txt(bx+3,by+40,'Материал: '+(state.title.material||''),2.0,'start','material');txt(bx+3,by+50,state.title.company||'ШЦК',2.0,'start','company');txt(bx+bw-3,by+40,'ЛР №4',2.6,'end');
 }else if(t==='lab5-a4-reference-template'){
  const bw=Math.min(185,w-25),bx=w-10-bw,by=h-65;rect(bx,by,bw,55);line(bx,by+8,bx+bw,by+8);line(bx,by+17,bx+bw,by+17);line(bx,by+27,bx+bw,by+27);line(bx,by+38,bx+bw,by+38);line(bx+75,by,bx+75,by+38);line(bx+120,by,bx+120,by+38);line(bx+150,by,bx+150,by+55);
  txt(bx+3,by+6,'Обозначение документа',2);txt(bx+3,by+15,state.title.title||'Лабораторная работа №5',2.8,'start','title');txt(bx+78,by+6,'Масштаб',1.8);txt(bx+98,by+15,state.title.scale||'1:1',2.2,'middle','scale');txt(bx+3,by+25,'Разраб. '+(state.title.developer||'Кушвид О.'),2.1,'start','developer');txt(bx+78,by+25,'Пров. '+(state.title.checker||''),2.1,'start','checker');txt(bx+3,by+35,'Материал '+(state.title.material||''),2.0,'start','material');txt(bx+3,by+48,state.title.company||'Колледж',2,'start','company');txt(bx+bw-3,by+48,'ЛР №5',2.5,'end');
  line(18,10,18,h-10);line(18,35,10,35);
 }else{
  // Simplified, editable Form 1 title block. These are teaching layouts, not certified standards drawings.
  const bx=w-195,by=h-65,bw=185,bh=55;rect(bx,by,bw,bh);line(bx,by+8,bx+bw,by+8);line(bx,by+17,bx+bw,by+17);line(bx,by+27,bx+bw,by+27);line(bx,by+39,bx+bw,by+39);line(bx+75,by,bx+75,by+27);line(bx+115,by,bx+115,by+27);line(bx+145,by,bx+145,by+bh);line(bx+25,by+27,bx+25,by+bh);line(bx+75,by+27,bx+75,by+bh);
  txt(bx+3,by+6,'Обозначение',2.0);txt(bx+3,by+15,state.title.title|| (t.startsWith('lab5')?'Лабораторная работа №5':'Технический чертёж'),2.8,'start','title');txt(bx+78,by+6,'Масштаб',1.8);txt(bx+95,by+15,state.title.scale||'1:1',2.4,'middle','scale');txt(bx+118,by+6,'Лист',1.8);txt(bx+130,by+15,state.title.sheet||'1',2.3,'middle','sheet');
  txt(bx+3,by+24,'Материал: '+(state.title.material||''),2.0,'start','material');txt(bx+78,by+24,'Масса '+(state.title.mass||'—'),2.0,'start','mass');
  txt(bx+2,by+35,'Разраб.',1.8);txt(bx+28,by+35,state.title.developer||'Кушвид О.',2.1,'start','developer');txt(bx+78,by+35,'Пров.',1.8);txt(bx+98,by+35,state.title.checker||'Базиль Б.',2.1,'start','checker');
  txt(bx+2,by+47,'Т.контр.',1.8);txt(bx+28,by+47,state.title.technical||'',2.1,'start','technical');txt(bx+78,by+47,'Н.контр.',1.8);txt(bx+98,by+47,state.title.normative||'',2.1,'start','normative');
  txt(bx+bw-4,by+53,t.startsWith('lab5')?'ЛР №5':'Чертёж',2.2,'end');
 }
 // Protected drawing area hint boundary.
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
  if(o.type==='arrowLine')drawArrow(wrap,b,a,Math.max(1.8,(o.width||.5)*9.45),o.color||'#20252a');
  if(o.type==='centerline'){
   const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};add('line',{x1:mid.x-1,y1:mid.y-1,x2:mid.x+1,y2:mid.y+1,'stroke-width':sw});
  }
  break;
 }
 case 'circle':add('circle',{cx:o.center.x,cy:o.center.y,r:o.r});break;
 case 'ellipse':add('ellipse',{cx:o.center.x,cy:o.center.y,rx:o.rx,ry:o.ry,transform:o.rotation?`rotate(${o.rotation} ${o.center.x} ${o.center.y})`:null});break;
 case 'rect':add('rect',{x:o.x,y:o.y,width:o.w,height:o.h,rx:o.rx||0,ry:o.ry||0});break;
 case 'polygon':add('polygon',{points:o.points.map(p=>`${p.x},${p.y}`).join(' ')});break;
 case 'polyline':case 'freehand':case 'spline':case 'breakline':add('path',{d:pathData(o.points,false),fill:'none'});break;
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
   const a=o.a,b=o.b,offset=o.offset||10;let p1={...a},p2={...b};
   const kind=o.kind||o.type,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   if(kind==='dimDia') { p1={x:a.x-dx,y:a.y-dy};p2={...b}; }
   else if(kind==='dimH'){p1.y+=offset;p2.y+=offset;}
   else if(kind==='dimV'){p1.x+=offset;p2.x+=offset;}
   else if(kind!=='dimRad') {p1.x+=-dy/len*offset;p1.y+=dx/len*offset;p2.x+=-dy/len*offset;p2.y+=dx/len*offset;}
   if(kind!=='dimDia') {add('line',{x1:a.x,y1:a.y,x2:p1.x,y2:p1.y,'stroke-width':.2});add('line',{x1:b.x,y1:b.y,x2:p2.x,y2:p2.y,'stroke-width':.2});}
   add('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,'stroke-width':.25});
   const arrowSize=Math.max(1.8,o.arrowSize||2.5);drawArrow(wrap,p1,p2,arrowSize,o.color||'#20252a');drawArrow(wrap,p2,p1,arrowSize,o.color||'#20252a');
   const mid={x:(p1.x+p2.x)/2+(o.labelDx||0),y:(p1.y+p2.y)/2-1.2+(o.labelDy||0)};
   const label=o.label||(kind==='dimDia'?`⌀${fmt(len*2)}`:kind==='dimRad'?`R${fmt(len)}`:fmt(len));
   addText(wrap,mid.x,mid.y,label,o.textSize||getNum('defaultDimensionTextHeight',3.5),{fill:o.color||'#20252a','text-anchor':'middle','paint-order':'stroke','stroke':'#fff','stroke-width':.8});break;
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
   if(o.dataUrl){el('image',{href:o.dataUrl,x:o.x,y:o.y,width:o.w,height:o.h,opacity:o.opacity??.35,preserveAspectRatio:'none','data-reference-locked':o.locked?'true':'false'},wrap);el('rect',{x:o.x,y:o.y,width:o.w,height:o.h,fill:'none',stroke:'#168db2','stroke-dasharray':'2 2','stroke-width':.3},wrap);}break;
 }
 default:break;
 }
 // transparent hit strip makes thin geometry easy to select
 if(['line','arrowLine','construction','ray','xline','ruler','centerline','polyline','freehand','spline','arc','dimension','dimH','dimV'].includes(o.type)){
   const pts=o.points||[];let d='';if(o.a&&o.b)d=`M ${o.a.x} ${o.a.y} L ${o.b.x} ${o.b.y}`;else if(pts.length)d=pathData(pts,false);
   if(d)el('path',{d,fill:'none',stroke:'transparent','stroke-width':Math.max(3,sw+2),'pointer-events':'stroke'},wrap);
 }
}
function updateLayerVisibility(){layers.geometry.style.display=checked('geometryVisible')?'':'none';layers.annotation.style.display=checked('dimensionsVisible')?'':'none';layers.construction.style.display=checked('constructionVisible')?'':'none';layers.reference.style.display=checked('referenceVisibleToggleSecondary')?'':'none';}
function renderObjects(){
 for(const l of [layers.reference,layers.geometry,layers.construction,layers.annotation])l.replaceChildren();
 for(const o of state.objects){const parent=layers[layerFor(o)]||layers.geometry;renderObject(o,parent);}
 updateLayerVisibility();renderSelection();renderTree();
}
function objectBounds(o){const b=boundsOfObject(o);return{x:b.x+(o.dx||0),y:b.y+(o.dy||0),w:b.w,h:b.h};}
function bakeOffset(o){const dx=o.dx||0,dy=o.dy||0;if(!dx&&!dy)return o;if(o.points)o.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));for(const k of ['a','b','center'])if(o[k])o[k]={x:o[k].x+dx,y:o[k].y+dy};if(o.x!=null)o.x+=dx;if(o.y!=null)o.y+=dy;o.dx=0;o.dy=0;return o;}
function materializedObject(o){const q=structuredClone(o);return bakeOffset(q);}
function renderSelection(){
 const g=layers.selection;g.replaceChildren();
 for(const id of state.selected){const o=state.objects.find(v=>v.id===id);if(!o)continue;const b=objectBounds(o);el('rect',{x:b.x-1,y:b.y-1,width:Math.max(b.w,2)+2,height:Math.max(b.h,2)+2,fill:'none',stroke:'#13a9d1','stroke-width':.4,'stroke-dasharray':'2 1'},g);}
 $('selectedStatus').textContent=String(state.selected.size);
}
function renderTree(){
 const tree=$('objectTree');if(!tree)return;tree.replaceChildren();
 const counts={geometry:0,annotation:0,construction:0};
 for(const o of state.objects){counts[layerFor(o)]++;const b=document.createElement('button');b.type='button';b.className='tree-object'+(state.selected.has(o.id)?' selected':'');b.textContent=`${o.name||({line:'Отрезок',arrowLine:'Стрелка 1',circle:'Окружность',rect:'Прямоугольник',dimension:'Размер',text:'Текст',polygon:'Многоугольник',reference:'Референс'}[o.type]||o.type)} · ${o.id}`;b.addEventListener('click',()=>{state.selected=new Set([o.id]);renderObjects();showProperties();});tree.appendChild(b);}
 $('geometryCount').textContent=counts.geometry;$('annotationCount').textContent=counts.annotation;$('constructionCount').textContent=counts.construction;
}
function render(){
 updateSheetGeometry();renderTemplate();renderObjects();renderPreview();
 const doc=$('docName');if(doc)doc.textContent=state.name||'Чертёж БЕЗ ИМЕНИ';
 updateHistoryButtons();
}
function renderPreview(){const g=layers.preview;g.replaceChildren();if(state.preview){const o={...state.preview,color:'#168db2',width:.35,dash:'2 1',fill:'none'};renderObject(o,g);}}
function addObject(o){history.push(snapshot());o.id=o.id||nextId();o.color=o.color||getVal('objectColor','#20252a');o.width=o.width??getNum('drawingLineWidth',.35);o.layer=o.layer||'Основной';o.dx=o.dx||0;o.dy=o.dy||0;state.objects.push(o);state.selected=new Set([o.id]);commit();showProperties();setStatus('Объект создан');}
function selectObject(id,additive=false){if(!additive)state.selected.clear();if(id)state.selected.add(id);renderObjects();showProperties();}
function showProperties(){
 const o=state.objects.find(x=>state.selected.size===1&&x.id===[...state.selected][0]);
 $('noSelection')?.classList.toggle('hidden',!!o);$('selectionFields')?.classList.toggle('hidden',!o);
 if(!o){if($('quickReferenceLockBtn'))$('quickReferenceLockBtn').disabled=true;return;}if($('quickReferenceLockBtn'))$('quickReferenceLockBtn').disabled=o.type!=='reference';if($('quickReferenceLockBtn'))$('quickReferenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));if($('referenceLockStatus')&&o.type==='reference'){$('referenceLockStatus').textContent=o.locked?'● Перемещение запрещено':'● Перемещение разрешено';$('referenceLockStatus').className='reference-lock-status '+(o.locked?'locked':'unlocked');}if($('referenceLockBtn')&&o.type==='reference'){$('referenceLockBtn').textContent=o.locked?'🔓 Разрешить перемещение':'🔒 Запретить перемещение';$('referenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));}
 const put=(id,v)=>{if($(id))$(id).value=v??'';};const chk=(id,v)=>{if($(id))$(id).checked=!!v;};
 put('objectColor',o.color||'#20252a');put('objectWidth',o.width??.35);put('objectDash',o.dash||'');put('objectLayer',o.layer||'geometry');put('objectLineRole',o.role||'main');put('objectName',o.name||'');chk('objectLocked',o.locked);
 const b=objectBounds(o);put('objectBoxX',round(b.x));put('objectBoxY',round(b.y));put('objectBoxW',round(b.w));put('objectBoxH',round(b.h));put('objectRotationAngle',o.rotation||0);put('objectRotationSlider',o.rotation||0);
 $('objectGeometryFields')?.classList.toggle('hidden',false);$('dimensionSelectionFields')?.classList.toggle('hidden',!String(o.type).startsWith('dim')&&o.type!=='dimension');$('referenceSelectionFields')?.classList.toggle('hidden',o.type!=='reference');
 if(o.type==='reference'){put('referenceX',o.x);put('referenceY',o.y);put('referenceWidth',o.w);put('referenceHeight',o.h);put('referenceOpacity',Math.round((o.opacity??.35)*100));chk('referenceExportable',o.exportable);chk('objectLocked',o.locked);$('referenceOpacityValue').textContent=`${Math.round((o.opacity??.35)*100)}%`;}
}
function findSelected(){return state.objects.filter(o=>state.selected.has(o.id));}
function updateSelected(mutator){const picked=findSelected();if(!picked.length)return;history.push(snapshot());for(const o of picked)mutator(o);render();showProperties();scheduleAutosave();updateHistoryButtons();}
function currentStyle(){const role=getVal('drawingLineRole','main');const defaultWidth=role==='main'?getNum('gostMainLine',.5):getNum('gostThinLine',.25);return {color:getVal('objectColor','#20252a'),width:getNum('drawingLineWidth',defaultWidth)||defaultWidth,dash:getVal('objectDash','')||null,layer:getVal('objectLayer','geometry'),role};}
function setTool(tool){state.tool=tool;state.pending=null;state.preview=null;state.drawGesture=null;polylinePoints=[];drawing.dataset.tool=tool;renderPreview();document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));setStatus(`Инструмент: ${toolLabel(tool)}`);}
const toolNames={select:'Выбор',line:'Отрезок',arrowLine:'Стрелка 1',circle:'Окружность',rect:'Прямоугольник',dimension:'Размер',dimAuto:'Авторазмер',dimH:'Горизонтальный размер',dimV:'Вертикальный размер',dimRad:'Радиус',dimDia:'Диаметр',dimAngle:'Угловой размер',polyline:'Ломаная',polygon:'Многоугольник',text:'Текст',freehand:'Свободная линия',eraser:'Ластик',centerMark:'Центровые',innerCutout:'Внутренний контур',construction:'Вспомогательная линия',ray:'Луч',xline:'Прямая',arc:'Дуга',ellipse:'Эллипс',roundRect:'Скруглённый прямоугольник',measure:'Измерение',hatch:'Штриховка',leader:'Выноска'};
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
const dragDrawTools=new Set(['line','arrowLine','construction','xline','ray','centerline','circle','rect','roundRect','ellipse','polygon','star6','arc','breakline','table','roughness','tolerance','weld','section','techReq']);
function makeTwoPointObject(t,a,p,evt={}){
 const st=currentStyle();
 let b=p;
 if((state.ortho||checked('orthoToggle'))||evt.shiftKey)b=constrainAngle(a,p,getNum('angleStep',15));
 if(t==='line'||t==='arrowLine'||t==='construction'||t==='xline'||t==='ray'||t==='centerline'||t==='ruler')return {type:t,a,b,...st};
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
 if(t==='polyline'||t==='spline'){
  if(evt.detail>=2&&polylinePoints.length>=2){polylinePoints.push(p);addObject({type:t==='spline'?'spline':'polyline',points:polylinePoints,...st});polylinePoints=[];state.preview=null;setTool('select');return;}
  polylinePoints.push(p);state.preview={type:'polyline',points:[...polylinePoints,p]};renderPreview();setStatus(`Точек ломаной: ${polylinePoints.length}. Двойной щелчок — завершить, Enter — завершить.`);return;
 }
 if(t==='dimension'||t==='dimAuto'||t==='dimH'||t==='dimV'||t==='dimRad'||t==='dimDia'||t==='dimAngle'||t==='measure'){
  if(!state.pending){state.pending={start:p};state.preview={type:'line',a:p,b:p};renderPreview();setStatus('Укажите вторую точку размера');return;}
  if(!state.pending.end){state.pending.end=p;const kind=t==='dimAuto'?'dimension':t==='measure'?'dimension':t;state.preview={type:'line',a:state.pending.start,b:p};renderPreview();if(['dimRad','dimDia'].includes(t)){addObject({type:'dimension',kind:t,a:state.pending.start,b:p,offset:0,label:t==='dimDia'?`⌀${fmt(distance(state.pending.start,p)*2)}`:`R${fmt(distance(state.pending.start,p))}`,...st});state.pending=null;state.preview=null;return;}setStatus('Укажите положение размерной линии');return;}
  const a=state.pending.start,b=state.pending.end,base=state.pending.end,off=Math.abs(t==='dimV'?p.x-base.x:t==='dimH'?p.y-base.y:((p.x-base.x)+(p.y-base.y))/2)||getNum('dimensionOffset',10);
  addObject({type:'dimension',kind:t==='dimH'?'dimH':t==='dimV'?'dimV':t==='dimAngle'?'dimAngle':'dimension',a,b,offset:off,textSize:getNum('defaultDimensionTextHeight',3.5),...st});state.pending=null;state.preview=null;return;
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
function captureDrawingPointer(evt){
 try{if(drawing.setPointerCapture&&evt.pointerId!==undefined)drawing.setPointerCapture(evt.pointerId);}catch{}
}
function onPointerDown(evt){
 const isPanButton=evt.button===1||evt.button===2||(evt.button===0&&spaceDown);
 if(isPanButton){
  state.pan={clientX:evt.clientX,clientY:evt.clientY,view:{...state.view}};
  drawing.classList.add('dragging');captureDrawingPointer(evt);evt.preventDefault();return;
 }
 if(evt.button!==0)return;
 const raw=screenPoint(evt),p=applyPrecision(raw,evt);
 captureDrawingPointer(evt);
 if(state.tool==='freehand'){state.drag={type:'freehand',points:[p]};return;}
 if(state.tool==='selectRegion'){state.drag={type:'region',start:p,current:p};return;}
 if(state.tool==='select'){
   const target=evt.target.closest?.('[data-object-id]');const id=target?.getAttribute('data-object-id');
   if(id){if(evt.shiftKey)selectObject(id,true);else if(!state.selected.has(id))selectObject(id,false);const o=state.objects.find(v=>v.id===id);if(o&&!o.locked)state.drag={type:'objects',start:p,last:p,ids:[...state.selected],before:snapshot()};}
   else if(!evt.shiftKey){state.selected.clear();renderObjects();showProperties();}
   return;
 }
 state.drawGesture={tool:state.tool,start:p,last:p,clientX:evt.clientX,clientY:evt.clientY,moved:false,pendingAtStart:!!state.pending,target:evt.target};
}
function onPointerMove(evt){
 const p=screenPoint(evt);$('coordinates').textContent=`X: ${fmt(p.x)} · Y: ${fmt(p.y)} мм`;
 if(state.pan){const r=svg.getBoundingClientRect(),dx=(evt.clientX-state.pan.clientX)/Math.max(1,r.width)*state.pan.view.w,dy=(evt.clientY-state.pan.clientY)/Math.max(1,r.height)*state.pan.view.h;const v=state.pan.view;state.view={...v,x:v.x-dx,y:v.y-dy};applyView();return;}
 if(state.drawGesture){
  const g=state.drawGesture,distPx=Math.hypot(evt.clientX-g.clientX,evt.clientY-g.clientY);
  if(!g.pendingAtStart&&dragDrawTools.has(g.tool)&&distPx>=3){g.moved=true;g.last=applyPrecision(p,evt);updateDrawPreview(g,g.last);}
  return;
 }
 if(state.drag?.type==='objects'){
  const q=applyPrecision(p,evt),dx=q.x-state.drag.last.x,dy=q.y-state.drag.last.y;
  if(dx||dy){for(const id of state.drag.ids){const o=state.objects.find(v=>v.id===id);if(o){o.dx=(o.dx||0)+dx;o.dy=(o.dy||0)+dy;}}state.drag.last=q;renderObjects();}
  return;
 }
 if(state.drag?.type==='freehand'){state.drag.points.push(applyPrecision(p,evt));state.preview={type:'freehand',points:state.drag.points};renderPreview();return;}
 if(state.drag?.type==='region'){state.drag.current=p;const g=layers.preview;g.replaceChildren();const a=state.drag.start,b=p;el('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:'#168db2',opacity:.12,stroke:'#168db2','stroke-dasharray':'2 1'},g);return;}
 if(state.pending){const q=applyPrecision(p,evt);const t=state.tool;const o=makeTwoPointObject(t,state.pending.start,q,evt);if(o){state.preview=o;renderPreview();}}
}
function onPointerUp(evt){
 if(state.pan){state.pan=null;drawing.classList.remove('dragging');return;}
 if(state.drawGesture){
  const g=state.drawGesture,p=applyPrecision(screenPoint(evt),evt);state.drawGesture=null;
  const toolEvt={target:g.target||evt.target,shiftKey:evt.shiftKey,detail:evt.detail||1};
  if(g.moved&&!g.pendingAtStart){const o=makeTwoPointObject(g.tool,g.start,p,toolEvt);if(o){addObject(o);state.pending=null;state.preview=null;renderPreview();}else clickTool(p,toolEvt);}
  else clickTool(p,toolEvt);
  return;
 }
 if(state.drag?.type==='freehand'){const points=state.drag.points;if(points.length>1)addObject({type:'freehand',points,color:getVal('objectColor','#20252a'),width:getNum('freehandWidth',.25)});state.drag=null;state.preview=null;renderPreview();return;}
 if(state.drag?.type==='region'){const {start,current}=state.drag;const ids=state.objects.filter(o=>{const b=objectBounds(o);return b.x>=Math.min(start.x,current.x)&&b.y>=Math.min(start.y,current.y)&&b.x+b.w<=Math.max(start.x,current.x)&&b.y+b.h<=Math.max(start.y,current.y);}).map(o=>o.id);state.selected=new Set(ids);state.drag=null;renderPreview();renderObjects();showProperties();return;}
 if(state.drag?.type==='objects'){if(state.drag.last.x!==state.drag.start.x||state.drag.last.y!==state.drag.start.y){history.push(state.drag.before);scheduleAutosave();updateHistoryButtons();}state.drag=null;render();return;}
}
function onPointerCancel(){state.pan=null;state.drawGesture=null;state.drag=null;drawing.classList.remove('dragging');state.preview=null;renderPreview();}
function updateSelectionByProps(){const id=[...state.selected][0];const o=state.objects.find(v=>v.id===id);if(!o)return;history.push(snapshot());o.color=getVal('objectColor',o.color);o.width=getNum('objectWidth',o.width);o.dash=getVal('objectDash','solid');o.layer=getVal('objectLayer',o.layer);o.role=getVal('objectLineRole',o.role);o.name=getVal('objectName',o.name);o.locked=checked('objectLocked');render();scheduleAutosave();updateHistoryButtons();}
function applyBoxProps(){
 const id=[...state.selected][0],o=state.objects.find(v=>v.id===id);if(!o)return;
 history.push(snapshot());bakeOffset(o);const b=boundsOfObject(o),x=getNum('objectBoxX',b.x),y=getNum('objectBoxY',b.y),w=getNum('objectBoxW',b.w),h=getNum('objectBoxH',b.h);const sx=b.w? w/b.w:1,sy=b.h?h/b.h:1;
 const map=p=>({x:x+(p.x-b.x)*sx,y:y+(p.y-b.y)*sy});
 if(o.points)o.points=o.points.map(map);
 if(o.a)o.a=map(o.a);if(o.b)o.b=map(o.b);if(o.center)o.center=map(o.center);
 if(o.type==='rect'){o.x=x;o.y=y;o.w=w;o.h=h;}
 else if(o.type==='circle')o.r=Math.max(w,h)/2;
 else if(o.type==='ellipse'){o.rx=w/2;o.ry=h/2;}
 else if(o.type==='text'){o.x=x;o.y=y;}
 else if(o.type==='reference'){o.x=x;o.y=y;o.w=w;o.h=h;}
 render();showProperties();scheduleAutosave();updateHistoryButtons();
}
function deleteSelected(){if(!state.selected.size)return;history.push(snapshot());state.objects=state.objects.filter(o=>!state.selected.has(o.id));state.selected.clear();render();showProperties();scheduleAutosave();updateHistoryButtons();setStatus('Выбранное удалено');}
function duplicateSelected(){const picked=findSelected();if(!picked.length)return;history.push(snapshot());const copies=picked.map(o=>({...structuredClone(o),id:nextId(),dx:(o.dx||0)+5,dy:(o.dy||0)+5,name:o.name?`${o.name} копия`:''}));state.objects.push(...copies);state.selected=new Set(copies.map(o=>o.id));render();showProperties();scheduleAutosave();updateHistoryButtons();}
function transformSelected(fn){const picked=findSelected();if(!picked.length)return;history.push(snapshot());for(const o of picked)fn(o);render();showProperties();scheduleAutosave();updateHistoryButtons();}
function rotateObject(o,deg){bakeOffset(o);const b=objectBounds(o),cx=b.x+b.w/2,cy=b.y+b.h/2,rad=deg*Math.PI/180;const rot=p=>({x:cx+(p.x-cx)*Math.cos(rad)-(p.y-cy)*Math.sin(rad),y:cy+(p.x-cx)*Math.sin(rad)+(p.y-cy)*Math.cos(rad)});if(o.points)o.points=o.points.map(rot);if(o.a)o.a=rot(o.a);if(o.b)o.b=rot(o.b);if(o.center)o.center=rot(o.center);if(o.type==='text')o.rotation=(o.rotation||0)+deg;else if(o.type==='rect'){const pts=[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}].map(rot);o.type='polygon';o.points=pts;}o.rotation=(o.rotation||0)+deg;}
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
 const picked=findSelected();if(action==='centerMarks'){const circles=picked.filter(o=>o.type==='circle');if(!circles.length){setStatus('Выберите окружности');return;}history.push(snapshot());for(const c of circles)state.objects.push({id:nextId(),type:'centerMark',center:{x:c.center.x+(c.dx||0),y:c.center.y+(c.dy||0)},r:Math.max(c.r*.18,2),color:c.color,width:.25,layer:'construction',role:'center'});state.selected.clear();render();scheduleAutosave();updateHistoryButtons();return;}if(action==='duplicate')return duplicateSelected();if(action==='split')return setTool('split');if(action==='toggleLock'){transformSelected(o=>o.locked=!o.locked);showProperties();return;}if(action==='hideSelected'){transformSelected(o=>o.hidden=true);state.selected.clear();renderObjects();showProperties();return;}if(action==='showAll'){history.push(snapshot());state.objects.forEach(o=>o.hidden=false);render();scheduleAutosave();updateHistoryButtons();return;}if(action==='bringFront'||action==='sendBack'){history.push(snapshot());const ids=new Set(state.selected);const sel=state.objects.filter(o=>ids.has(o.id)),rest=state.objects.filter(o=>!ids.has(o.id));state.objects=action==='bringFront'?[...rest,...sel]:[...sel,...rest];commit();return;}if(action==='centerToSheet'){transformSelected(o=>{const b=objectBounds(o);o.dx+=(state.sheet.width/2-(b.x+b.w/2));o.dy+=(state.sheet.height/2-(b.y+b.h/2));});return;}if(action==='zoomSelected'){const b=picked.map(objectBounds);if(b.length){const x=Math.min(...b.map(x=>x.x)),y=Math.min(...b.map(x=>x.y)),r=Math.max(...b.map(x=>x.x+x.w)),d=Math.max(...b.map(x=>x.y+x.h));state.view={x:x-10,y:y-10,w:Math.max(20,r-x+20),h:Math.max(20,d-y+20)};svg.setAttribute('viewBox',`${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);}return;}
 if(action==='rotate'){const v=Number(prompt('Угол поворота, °','90'));if(Number.isFinite(v))transformSelected(o=>rotateObject(o,v));return;}
 if(action==='mirror'){openModal('mirrorModal');return;}
 if(action==='moveBy'){const dx=Number(prompt('Смещение X, мм','0')),dy=Number(prompt('Смещение Y, мм','0'));if(Number.isFinite(dx)&&Number.isFinite(dy))transformSelected(o=>{o.dx=(o.dx||0)+dx;o.dy=(o.dy||0)+dy;});return;}
 if(action==='scale'){const f=Number(prompt('Коэффициент масштаба','2'));if(Number.isFinite(f)&&f>0)transformSelected(o=>{bakeOffset(o);const b=objectBounds(o),cx=b.x+b.w/2,cy=b.y+b.h/2;if(o.points)o.points=o.points.map(p=>({x:cx+(p.x-cx)*f,y:cy+(p.y-cy)*f}));if(o.center)o.r*=f,o.rx*=f,o.ry*=f;if(o.type==='rect')o.w*=f,o.h*=f;});return;}
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
function loadProjectData(data){const p=parseProject(data);history.push(snapshot());state.name=p.name;state.sheet=p.sheet;state.templateId=p.templateId;state.grid=!!p.settings?.grid;state.snapGrid=!!p.settings?.snapGrid;state.ortho=!!p.settings?.ortho;state.title={...defaultTitle(),...p.title};state.objects=(p.objects||[]).map(o=>({...o,id:o.id||nextId()}));state.selected.clear();writeTitleToUI();$('gridToggle').checked=state.grid;$('snapToggle').checked=state.snapGrid;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';$('filenameField').value=state.name;$('titleFormSelect').value=state.templateId;$('templateQuickSelect').value=state.templateId;setSheet(state.sheet.format||'A3P');render();setStatus('Проект загружен');scheduleAutosave();}
function openLibrary(){const listNode=$('savedProjectsList');listNode.replaceChildren();let list=[];try{list=JSON.parse(localStorage.getItem('cad-geometry-library-v1')||'[]');}catch{}$('fileCount').textContent=String(list.length);if(!list.length){const d=document.createElement('div');d.className='file-empty';d.textContent='Пока нет сохранённых чертежей.';listNode.appendChild(d);}for(const item of list){const card=document.createElement('div');card.className='file-card';const info=document.createElement('div'),name=document.createElement('div'),meta=document.createElement('div');name.className='file-card-name';name.textContent=item.name;meta.className='file-card-meta';meta.textContent=new Date(item.savedAt).toLocaleString()+' · '+(item.data.sheet?.format||'');info.append(name,meta);const actions=document.createElement('div');actions.className='file-card-actions';const open=document.createElement('button');open.className='primary';open.textContent='Открыть';open.onclick=()=>{loadProjectData(item.data);closeModal('filesModal');};const del=document.createElement('button');del.className='danger';del.textContent='Удалить';del.onclick=()=>{localStorage.setItem('cad-geometry-library-v1',JSON.stringify(list.filter(x=>x.id!==item.id)));openLibrary();};actions.append(open,del);card.append(info,actions);listNode.append(card);}openModal('filesModal');}
function importFile(file,kind){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const text=String(reader.result);if(kind==='project'||kind==='json'||file.name.toLowerCase().endsWith('.kcad')||file.name.toLowerCase().endsWith('.json'))loadProjectData(text);else if(kind==='svg'||file.name.toLowerCase().endsWith('.svg'))importSVG(text);else if(kind==='dxf'||file.name.toLowerCase().endsWith('.dxf'))importDXF(text);else if(kind==='image')importReference(reader.result,file.name);else setStatus('Этот тип импорта пока не поддержан');}catch(e){alert(`Не удалось импортировать файл: ${e.message}`);}};if(kind==='image')reader.readAsDataURL(file);else reader.readAsText(file);}
function importReference(dataUrl,name){const img=new Image();img.onload=()=>{addObject({type:'reference',dataUrl,x:10,y:10,w:Math.min(100,img.width/4),h:Math.min(100,img.height/4),name,opacity:.35,exportable:false,locked:false});setStatus('Изображение добавлено как подложка');};img.src=dataUrl;}
function importSVG(text){history.push(snapshot());const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror'))throw new Error('Некорректный SVG');const root=doc.documentElement;const view=(root.getAttribute('viewBox')||`0 0 ${state.sheet.width} ${state.sheet.height}`).split(/[ ,]+/).map(Number);const sx=state.sheet.width/(view[2]||state.sheet.width),sy=state.sheet.height/(view[3]||state.sheet.height);const add=(o)=>{o.id=nextId();state.objects.push(o);};for(const node of root.querySelectorAll('line,circle,rect,ellipse,polyline,polygon,text')){const tag=node.tagName,attr=k=>Number(node.getAttribute(k)||0),style=node.getAttribute('style')||'';const color=node.getAttribute('stroke')||style.match(/stroke:([^;]+)/)?.[1]||'#20252a';if(tag==='line')add({type:'line',a:{x:attr('x1')*sx,y:attr('y1')*sy},b:{x:attr('x2')*sx,y:attr('y2')*sy},color});if(tag==='circle')add({type:'circle',center:{x:attr('cx')*sx,y:attr('cy')*sy},r:attr('r')*sx,color});if(tag==='rect')add({type:'rect',x:attr('x')*sx,y:attr('y')*sy,w:attr('width')*sx,h:attr('height')*sy,color});if(tag==='ellipse')add({type:'ellipse',center:{x:attr('cx')*sx,y:attr('cy')*sy},rx:attr('rx')*sx,ry:attr('ry')*sy,color});if(tag==='polyline'||tag==='polygon'){const vals=(node.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number),points=[];for(let i=0;i<vals.length;i+=2)points.push({x:vals[i]*sx,y:vals[i+1]*sy});add({type:tag==='polygon'?'polygon':'polyline',points,color});}if(tag==='text')add({type:'text',x:attr('x')*sx,y:attr('y')*sy,text:node.textContent,size:attr('font-size')*sx||4,color});}commit();setStatus('SVG импортирован (базовые фигуры)');}
function importDXF(text){history.push(snapshot());const lines=text.replace(/\r/g,'').split('\n');const pairs=[];for(let i=0;i+1<lines.length;i+=2)pairs.push([lines[i].trim(),lines[i+1].trim()]);let type=null,ent={};const flush=()=>{if(!type)return;const val=c=>ent[c]!==undefined?Number(ent[c]):0;if(type==='LINE')state.objects.push({id:nextId(),type:'line',a:{x:val('10'),y:-val('20')},b:{x:val('11'),y:-val('21')},color:'#20252a'});if(type==='CIRCLE')state.objects.push({id:nextId(),type:'circle',center:{x:val('10'),y:-val('20')},r:val('40'),color:'#20252a'});if(type==='TEXT')state.objects.push({id:nextId(),type:'text',x:val('10'),y:-val('20'),size:val('40'),text:ent['1']||'',color:'#20252a'});if(type==='LWPOLYLINE'){const pts=[];for(let i=0;i<ent._xs.length;i++)pts.push({x:ent._xs[i],y:-ent._ys[i]});if(pts.length)state.objects.push({id:nextId(),type:'polyline',points:pts,color:'#20252a'});}type=null;ent={_xs:[],_ys:[]};};for(const [c,v] of pairs){if(c==='0'){flush();type=v;continue;}if(c==='10'&&type==='LWPOLYLINE')ent._xs.push(Number(v));else if(c==='20'&&type==='LWPOLYLINE')ent._ys.push(Number(v));else ent[c]=v;}flush();commit();setStatus('DXF импортирован (LINE/CIRCLE/TEXT/LWPOLYLINE)');}
function applyTitle(){readTitleFromUI();renderTemplate();scheduleAutosave();setStatus('Данные основной надписи обновлены');}
function switchTemplate(id){state.templateId=id;const f=formatForTemplate(id);setSheet(f);$('titleFormSelect').value=id;$('templateQuickSelect').value=id;const t=TEMPLATES.find(v=>v.id===id);$('templateDescription').textContent=t?.description||'';document.querySelectorAll('[data-template-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.templatePreset===id)));renderTemplate();scheduleAutosave();}
function createNewDocument(){const name=getVal('newDocName','Новый чертёж');const format=getVal('newDocFormat','A3');const orient=getVal('newDocOrientation','P');const id=getVal('newDocTemplate','lab4-reference-template');state.objects=[];state.selected.clear();state.name=name;state.title=defaultTitle();state.title.title=name;state.templateId=id;let f=format+orient;if(!FORMATS[f])f=format==='A4'?'A4P':'A3P';state.sheet.format=f;state.sheet.width=FORMATS[f][0];state.sheet.height=FORMATS[f][1];writeTitleToUI();$('filenameField').value=name;switchTemplate(id);setSheet(f);history.undoStack.length=0;history.redoStack.length=0;closeModal('newDocModal');render();scheduleAutosave();setStatus('Создан новый чертёж');}
function showNewDoc(){const fm=$('newDocFormat');fm.innerHTML='';['A4','A3','A2'].forEach(f=>{const op=document.createElement('option');op.value=f;op.textContent=f;fm.append(op);});$('newDocTemplate').value=state.templateId;$('newDocFormat').value=state.sheet.format.slice(0,2);$('newDocOrientation').value=state.sheet.format.endsWith('L')?'L':'P';$('newDocName').value='Новый чертёж';renderNewDocPreview();openModal('newDocModal');}
function renderNewDocPreview(){const p=$('newDocPreview');if(!p)return;const w=210,h=297;p.setAttribute('viewBox',`0 0 ${w} ${h}`);p.replaceChildren();el('rect',{x:4,y:4,width:w-8,height:h-8,fill:'#fff',stroke:'#222','stroke-width':.6},p);el('rect',{x:w-105,y:h-35,width:100,height:30,fill:'none',stroke:'#222','stroke-width':.5},p);addText(p,w-102,h-24,'Основная надпись',4,{fill:'#222'});}
function doGostCheck(){const issues=[];if(state.objects.length===0)issues.push('На листе нет геометрии.');if(!state.title.title)issues.push('Не заполнено наименование документа.');if(!state.title.developer)issues.push('Не заполнен разработчик.');const widths=state.objects.filter(o=>o.width!=null).map(o=>o.width);if(widths.some(w=>w>1.2))issues.push('Есть линии толще 1,2 мм — проверьте назначение толщины.');const dims=state.objects.filter(o=>o.type==='dimension');if(!dims.length)issues.push('Размерные обозначения не найдены.');$('gostSummary').textContent=issues.length?`Проверка завершена: замечаний ${issues.length}. Это вспомогательная проверка, не сертификат соответствия.`:'Базовые проверки пройдены. Это не является официальным подтверждением соответствия стандартам.';$('gostCheckResults').replaceChildren();(issues.length?issues:['Базовые проверки завершены без замечаний.']).forEach(s=>{const d=document.createElement('div');d.className='gost-result';d.textContent='• '+s;$('gostCheckResults').append(d);});openModal('gostModal');}

// Menus and button bindings
function bind(){
 document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
 document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>performAction(b.dataset.action)));
 document.querySelectorAll('[data-template-preset]').forEach(b=>b.addEventListener('click',()=>switchTemplate(b.dataset.templatePreset)));
 document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('active',x===b));$('toolsPanel').classList.toggle('hidden',b.dataset.panel!=='tools');$('treePanel').classList.toggle('hidden',b.dataset.panel!=='tree');}));
 document.querySelectorAll('[data-tool-category]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tool-category]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));});const cat=b.dataset.toolCategory;setStatus(cat==='all'?'Показаны все категории инструментов':`Категория: ${b.textContent}`);}));
 document.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click',()=>{const m=b.dataset.menu;if(m==='help')openModal('helpModal');else if(m==='file')showNewDoc();else setStatus(`Раздел «${b.textContent}»: используйте соответствующие панели инструментов.`);}));
 $('newBtn').onclick=showNewDoc;$('closeNewDocModal').onclick=()=>closeModal('newDocModal');$('cancelNewDocBtn').onclick=()=>closeModal('newDocModal');$('createNewDocBtn').onclick=createNewDocument;
 $('newDocTemplate').onchange=()=>{$('templateQuickSelect').value=$('newDocTemplate').value;};$('newDocFormat').onchange=renderNewDocPreview;$('newDocOrientation').onchange=renderNewDocPreview;
 $('openBtn').onclick=openLibrary;$('openLibraryBtn').onclick=openLibrary;$('closeFilesModal').onclick=()=>closeModal('filesModal');$('saveBtn').onclick=saveProject;$('exportProjectBtn').onclick=exportProject;$('saveJsonBtn').onclick=exportProject;$('importProjectBtn').onclick=()=>$('fileInput').click();$('loadJsonBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>importFile(e.target.files[0],'project');
 $('saveToLibraryBtn').onclick=()=>saveToLibrary(false);$('saveAsLibraryBtn').onclick=()=>saveToLibrary(true);$('restoreAutosaveBtn').onclick=()=>{const s=localStorage.getItem('cad-geometry-autosave-v1');if(s)loadProjectData(s);else setStatus('Автосохранение не найдено');};
 $('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('deleteBtn').onclick=deleteSelected;$('deleteSelectedBtn').onclick=deleteSelected;$('fitBtn').onclick=fitSheet;$('zoomIn').onclick=()=>setZoom(1.25);$('zoomOut').onclick=()=>setZoom(.8);
 $('gridBtn').onclick=()=>{state.grid=!state.grid;$('gridToggle').checked=state.grid;updateSheetGeometry();};$('gridToggle').onchange=()=>{state.grid=checked('gridToggle');updateSheetGeometry();};$('snapToggle').onchange=()=>state.snapGrid=checked('snapToggle');$('snapBtn').onclick=()=>{$('objectSnapToggle').checked=!$('objectSnapToggle').checked;state.osnap=$('objectSnapToggle').checked;};$('objectSnapToggle').onchange=()=>state.osnap=checked('objectSnapToggle');$('orthoBtn').onclick=()=>{$('orthoToggle').checked=!checked('orthoToggle');state.ortho=checked('orthoToggle');$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';};$('orthoToggle').onchange=()=>{state.ortho=checked('orthoToggle');$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';};
 $('paperFormat').onchange=()=>{history.push(snapshot());setSheet(getVal('paperFormat','A3P'));scheduleAutosave();updateHistoryButtons();};$('templateQuickSelect').onchange=()=>{history.push(snapshot());switchTemplate(getVal('templateQuickSelect'));updateHistoryButtons();};$('titleFormSelect').onchange=()=>{history.push(snapshot());switchTemplate(getVal('titleFormSelect'));updateHistoryButtons();};$('templateVisible').onchange=renderTemplate;['geometryVisible','dimensionsVisible','constructionVisible','referenceVisibleToggleSecondary'].forEach(id=>$(id)?.addEventListener('change',updateLayerVisibility));layers.template.addEventListener('dblclick',e=>{const node=e.target.closest('[data-template-key]');if(!node)return;const key=node.getAttribute('data-template-key'),value=prompt(`Изменить поле «${key}»`,state.title[key]||'');if(value!==null){state.title[key]=value;writeTitleToUI();renderTemplate();scheduleAutosave();}});
 $('applyTitleBtn').onclick=applyTitle;Object.values(titleMap).forEach(id=>$(id)?.addEventListener('change',()=>{readTitleFromUI();renderTemplate();scheduleAutosave();}));
 ['objectColor','objectWidth','objectDash','objectLayer','objectLineRole','objectName','objectLocked'].forEach(id=>$(id)?.addEventListener('change',updateSelectedByProps));$('applyObjectGeometryBtn').onclick=applyBoxProps;$('applyObjectRotationBtn').onclick=()=>{const a=getNum('objectRotationAngle',0);transformSelected(o=>rotateObject(o,a));};$('objectRotationSlider').oninput=()=>{$('objectRotationAngle').value=$('objectRotationSlider').value;};
 $('coordinateApplyBtn').onclick=()=>{const p={x:getNum('coordinateX'),y:getNum('coordinateY')};state.pending=null;clickTool(p,{shiftKey:false,detail:1,target:svg});};
 $('circleInputMode').onchange=()=>setStatus(`Режим окружности: ${getVal('circleInputMode')}`);
 $('addReferenceRibbonBtn').onclick=()=>$('referenceInput').click();$('addReferenceBtn').onclick=()=>$('referenceInput').click();$('referenceInput').onchange=e=>importFile(e.target.files[0],'image');
 $('referenceLockBtn').onclick=()=>updateSelected(o=>{o.locked=!o.locked;});$('quickReferenceLockBtn').onclick=()=>updateSelected(o=>{if(o.type==='reference')o.locked=!o.locked;});$('referenceOpacity').oninput=()=>updateSelected(o=>{if(o.type==='reference')o.opacity=Number($('referenceOpacity').value)/100;});$('referenceExportable').onchange=()=>updateSelected(o=>{o.exportable=checked('referenceExportable');});$('referenceX').onchange=()=>updateSelected(o=>o.x=getNum('referenceX'));$('referenceY').onchange=()=>updateSelected(o=>o.y=getNum('referenceY'));$('referenceWidth').onchange=()=>updateSelected(o=>o.w=getNum('referenceWidth'));$('referenceHeight').onchange=()=>updateSelected(o=>o.h=getNum('referenceHeight'));$('centerReferenceBtn').onclick=()=>transformSelected(o=>{if(o.type==='reference'){o.x=(state.sheet.width-o.w)/2;o.y=(state.sheet.height-o.h)/2;}});
 $('addTextBtn').onclick=()=>setTool('text');$('editContentBtn').onclick=()=>{const o=findSelected()[0];if(o?.type==='text'){textInsertPoint={x:o.x,y:o.y};$('textContent').value=o.text;$('textSize').value=o.size;openModal('textModal');}else setStatus('Выберите текстовый объект');};$('editTextFormatBtn').onclick=()=>{const o=findSelected()[0];if(o?.type==='text'){editingTextId=o.id;$('textContent').value=o.text;$('textSize').value=o.size;openModal('textModal');}else setStatus('Выберите текстовый объект');};$('closeTextModal').onclick=()=>{closeModal('textModal');editingTextId=null;};$('cancelTextBtn').onclick=()=>{closeModal('textModal');editingTextId=null;};$('applyTextBtn').onclick=finishText;
 $('dxfBtn').onclick=exportDXF;$('exportDxfBtn').onclick=exportDXF;$('svgBtn').onclick=exportSVG;$('exportJpgBtn').onclick=()=>exportRaster('image/jpeg');$('exportWebpBtn').onclick=()=>exportRaster('image/webp');$('exportBmpBtn').onclick=()=>exportRaster('image/png');$('pngBtn').onclick=()=>exportRaster('image/png');$('exportCsvBtn').onclick=()=>{const rows=['id,type,x,y,width,height,color'];for(const o of state.objects){const b=objectBounds(o);rows.push([o.id,o.type,b.x,b.y,b.w,b.h,o.color||''].join(','));}downloadBlob(new Blob([rows.join('\n')],{type:'text/csv'}),`${state.name}.csv`);};$('exportHpglBtn').onclick=()=>setStatus('HPGL/PLT экспорт не реализован в восстановленной сборке.');
 $('importDxfBtn').onclick=()=>$('dxfInput').click();$('dxfInput').onchange=e=>importFile(e.target.files[0],'dxf');$('importSvgBtn').onclick=()=>$('svgInput').click();$('svgInput').onchange=e=>importFile(e.target.files[0],'svg');$('importCsvBtn').onclick=()=>$('csvInput').click();$('csvInput').onchange=e=>setStatus('Импорт CSV пока не реализован');$('importHpglBtn').onclick=()=>$('hpglInput').click();$('hpglInput').onchange=e=>setStatus('Импорт HPGL пока не реализован');
 $('printBtn').onclick=()=>{const p=$('printPageDimensions');if(p)p.textContent=`Лист ${state.sheet.width} × ${state.sheet.height} мм`;openModal('printModal');};$('closePrintModal').onclick=()=>closeModal('printModal');$('printNowBtn').onclick=()=>{closeModal('printModal');window.print();};$('printPreflightBtn').onclick=doGostCheck;$('printCalibrationBtn').onclick=()=>{addObject({type:'line',a:{x:20,y:30},b:{x:120,y:30},color:'#000',width:.35});addObject({type:'text',x:20,y:25,text:'Контрольный отрезок 100 мм',size:4,color:'#000'});};
 $('kompasBridgeBtn').onclick=()=>openModal('kompasBridgeModal');$('closeKompasBridgeBtn').onclick=()=>closeModal('kompasBridgeModal');$('closeBridgeBottomBtn').onclick=()=>closeModal('kompasBridgeModal');$('bridgeExportDxfBtn').onclick=()=>{closeModal('kompasBridgeModal');exportDXF();};
 $('gostRibbonBtn').onclick=doGostCheck;$('checkGostBtn').onclick=doGostCheck;$('closeGostModal').onclick=()=>closeModal('gostModal');$('closeGostModalBottom').onclick=()=>closeModal('gostModal');$('helpBtn').onclick=()=>openModal('helpModal');$('closeHelp').onclick=()=>closeModal('helpModal');
 $('applyMirrorBtn').onclick=()=>mirrorSelected(getVal('mirrorAxisMode','vertical'));$('closeMirrorModal').onclick=()=>closeModal('mirrorModal');$('cancelMirrorBtn').onclick=()=>closeModal('mirrorModal');$('mirrorAxisMode').onchange=()=>$('mirrorCustomPoints').classList.toggle('hidden',getVal('mirrorAxisMode')!=='custom');
 $('applyPolarArrayBtn').onclick=()=>applyPolarArray({count:getNum('polarCount',6),cx:getNum('polarCenterX',state.sheet.width/2),cy:getNum('polarCenterY',state.sheet.height/2),angle:getNum('polarAngle',360)});$('closePolarArrayBtn').onclick=()=>closeModal('polarArrayModal');$('cancelPolarArrayBtn').onclick=()=>closeModal('polarArrayModal');$('polarSheetCenterBtn').onclick=()=>{$('polarCenterX').value=state.sheet.width/2;$('polarCenterY').value=state.sheet.height/2;};$('polarSelectionCenterBtn').onclick=()=>{const b=findSelected().map(objectBounds);if(b.length){$('polarCenterX').value=(Math.min(...b.map(v=>v.x))+Math.max(...b.map(v=>v.x+v.w)))/2;$('polarCenterY').value=(Math.min(...b.map(v=>v.y))+Math.max(...b.map(v=>v.y+v.h)))/2;}};
 $('hatchSelectedRegionBtn').onclick=()=>{if(state.tool!=='hatch')setTool('hatch');const o=findSelected()[0];if(o){clickTool({x:0,y:0},{target:svg});}};$('hatchSelectedBoundaryBtn').onclick=$('hatchSelectedRegionBtn').onclick;$('findClosedLoopsHatchBtn').onclick=()=>setStatus('Автоматический поиск замкнутых контуров из отдельных рёбер пока не включён; выберите готовую ломаную/контур и инструмент штриховки.');
 $('placeInnerCutoutBtn').onclick=()=>setTool('innerCutout');$('applyPolygonFaceOffsetBtn').onclick=()=>setStatus('Редактирование отдельных граней многоугольника пока не включено.');$('lockAllObjectsBtn').onclick=()=>{if(!state.objects.length)return;history.push(snapshot());state.objects.forEach(o=>o.locked=true);render();scheduleAutosave();updateHistoryButtons();};$('unlockAllObjectsBtn').onclick=()=>{if(!state.objects.length)return;history.push(snapshot());state.objects.forEach(o=>o.locked=false);render();scheduleAutosave();updateHistoryButtons();};$('clearRulerBtn').onclick=()=>{history.push(snapshot());state.objects=state.objects.filter(o=>o.type!=='ruler');commit();};$('saveGostSettingsBtn').onclick=()=>setStatus('Параметры ГОСТ применены к новым объектам.');$('applyGostBtn').onclick=()=>setStatus('Новые объекты используют миллиметры и заданную толщину линий.');$('normalizeGostBtn').onclick=()=>updateSelected(o=>{o.width=.35;});$('increaseDrawingTextBtn').onclick=()=>transformSelected(o=>{if(o.type==='text')o.size=5;});$('saveAssignmentDimensionsBtn').onclick=()=>localStorage.setItem('cad-assignment-dimensions',getVal('assignmentDimensions'));
 $('hatchAngle').onchange=()=>{$('hatchAngleSlider').value=getNum('hatchAngle',45);};$('hatchAngleSlider').oninput=()=>{$('hatchAngle').value=$('hatchAngleSlider').value;};document.querySelectorAll('[data-hatch-angle]').forEach(b=>b.onclick=()=>{$('hatchAngle').value=b.dataset.hatchAngle;$('hatchAngleSlider').value=b.dataset.hatchAngle;});
 $('saveState').title='Локальное автосохранение включено';
 // keyboard, canvas pointer and wheel navigation
 drawing.addEventListener('pointerdown',onPointerDown);window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);window.addEventListener('pointercancel',onPointerCancel);drawing.addEventListener('dblclick',evt=>{if(['polyline','spline'].includes(state.tool)&&polylinePoints.length>=2){addObject({type:state.tool,points:polylinePoints,...currentStyle()});polylinePoints=[];state.preview=null;setTool('select');}});drawing.addEventListener('wheel',evt=>{evt.preventDefault();if(evt.shiftKey){state.view.x+=Math.sign(evt.deltaY)*state.view.w*.05;applyView();}else if(evt.altKey){state.view.y+=Math.sign(evt.deltaY)*state.view.h*.05;applyView();}else zoomFromWheel(evt);},{passive:false});drawing.addEventListener('contextmenu',e=>e.preventDefault());drawing.addEventListener('auxclick',e=>e.preventDefault());
 document.addEventListener('keydown',e=>{if(e.key===' '&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){spaceDown=true;return;}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='Escape'){state.pending=null;state.preview=null;polylinePoints=[];state.drag=null;state.drawGesture=null;renderPreview();setTool('select');}if(e.key==='Enter'&&polylinePoints.length>=2){addObject({type:'polyline',points:polylinePoints,...currentStyle()});polylinePoints=[];state.preview=null;setTool('select');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if(e.key==='F8'){$('orthoToggle').checked=!checked('orthoToggle');state.ortho=checked('orthoToggle');$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';}if(e.key==='Delete'||e.key==='Backspace')deleteSelected();if(e.key===' '&&!e.repeat){drawing.dataset.space='1';}});document.addEventListener('keyup',e=>{if(e.key===' ')spaceDown=false;});
 window.addEventListener('resize',()=>{const v={...state.view};if(state.zoom===1)fitSheet();else{const {width:w,height:h}=state.sheet;const a=Math.min((drawing.clientWidth-70)/w,(drawing.clientHeight-88)/h);svg.style.width=`${w*a}px`;svg.style.height=`${h*a}px`;}});
 document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)m.classList.add('hidden');}));
}

// Initial UI state
function init(){
 writeTitleToUI();$('paperFormat').value=state.sheet.format;$('titleFormSelect').value=state.templateId;$('templateQuickSelect').value=state.templateId;$('filenameField').value=state.name;$('templateDescription').textContent=TEMPLATES.find(t=>t.id===state.templateId)?.description||'';
 $('gridPattern').setAttribute('width',getNum('gridStep',5));$('gridPattern').setAttribute('height',getNum('gridStep',5));
 bind();setTool('select');fitSheet();render();
 try{const auto=localStorage.getItem('cad-geometry-autosave-v1');if(auto){const d=JSON.parse(auto);if(d?.objects?.length||d?.name){setStatus('Найдено локальное автосохранение. Нажмите «Восстановить автосохранение» для загрузки.');}}}catch{}
}
init();
