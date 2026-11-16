import {
  Line, Centerline, Circle, Arc, Polygon, trimAtPoint, applyEditTransaction,
  hitTest, drawPrimitive, serializeScene, deserializeScene,
  eraseAlongPath, SceneHistory, createTemplate, eraserRadiusInWorld
} from '../src/index.mjs';

const canvas = document.querySelector('#cad');
const ctx = canvas.getContext('2d');
const status = document.querySelector('#status');
const brush = document.querySelector('#brush');
const brushValue = document.querySelector('#brushValue');
const selectedOnly = document.querySelector('#selectedOnly');
const history = new SceneHistory([]);
let mode = 'erase', drawing = false, path = [], firstPoint = null, selectedId = null, cursor = null;

function resetScene() {
  const items = [
    new Line({x:80,y:170},{x:500,y:170},{style:{stroke:'#111',lineWidth:2.4}}),
    new Line({x:250,y:90},{x:250,y:260},{style:{stroke:'#c44a4a',lineWidth:2}}),
    new Line({x:390,y:90},{x:390,y:260},{style:{stroke:'#c44a4a',lineWidth:2}}),
    new Circle({x:720,y:190},105,{style:{stroke:'#111',lineWidth:2.4}}),
    new Centerline({x:600,y:190},{x:840,y:190}),
    new Arc({x:720,y:485},100,Math.PI*.08,Math.PI*1.55,{style:{stroke:'#2877bd',lineWidth:2.6}}),
    Polygon.regular({x:1010,y:480},6,85,Math.PI/6,{style:{stroke:'#2877bd',lineWidth:2.4}}),
    new Line({x:80,y:410},{x:500,y:410},{style:{stroke:'#111',lineWidth:2}})
  ];
  history.replace(items,{record:false}); history.clear(); selectedId=null; render(); updateHistoryButtons();
  status.textContent='Пример восстановлен. Проведите ластиком поперёк отрезка или по части окружности.';
}

function viewScale() {
  const rect = canvas.getBoundingClientRect();
  // Canvas world coordinates use its intrinsic pixel-sized drawing plane.
  // One CSS pixel maps to this many world units. Radius slider stays visually constant on resize/HiDPI.
  return canvas.width / Math.max(1, rect.width);
}
function brushRadiusWorld() { return eraserRadiusInWorld(Number(brush.value), 1 / viewScale()); }
function toWorld(event) {
  const rect=canvas.getBoundingClientRect();
  return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:canvas.height-(event.clientY-rect.top)*canvas.height/rect.height };
}
function appendPoint(p) {
  const last=path[path.length-1];
  if (!last || Math.hypot(p.x-last.x,p.y-last.y) >= Math.max(.25, viewScale()*.45)) path.push(p);
}
function render() {
  ctx.setTransform(1,0,0,-1,0,canvas.height); ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save(); ctx.strokeStyle='#edf0f3';ctx.lineWidth=1;ctx.setLineDash([]);
  for(let x=0;x<=canvas.width;x+=25){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  for(let y=0;y<=canvas.height;y+=25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();} ctx.restore();
  for(const o of history.scene){
    if(o.id===selectedId){ctx.save();ctx.strokeStyle='#2680d9';ctx.lineWidth=1.2;ctx.setLineDash([5,4]);drawPrimitive(ctx,o);ctx.restore();}
    else drawPrimitive(ctx,o);
  }
  if (mode==='erase' && cursor) {
    const r=brushRadiusWorld();
    ctx.save(); ctx.strokeStyle='rgba(215,55,55,.85)'; ctx.fillStyle='rgba(215,55,55,.09)'; ctx.lineWidth=1.2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cursor.x,cursor.y,r,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  if(drawing && path.length){
    ctx.save();ctx.strokeStyle='rgba(220,55,55,.8)';ctx.lineWidth=Math.max(.5,brushRadiusWorld()*2);ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
  }
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#64748b';ctx.font='12px system-ui';ctx.fillText('Червоний — слід ластика; синій — вибраний об’єкт; штрихпунктир — осьова.',14,18);ctx.restore();
}
function updateHistoryButtons(){document.querySelector('#undoBtn').disabled=!history.canUndo;document.querySelector('#redoBtn').disabled=!history.canRedo;}
function setMode(next){mode=next;firstPoint=null;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));status.textContent=({select:'Выбор: щёлкните по объекту.',erase:'Ластик: нажмите и проведите по участку. Кисть стирает только пересечённую геометрию.',trim:'Trim: щёлкните по участку между соседними пересечениями.',line:'Отрезок: укажите начальную и конечную точки.',circle:'Окружность: укажите центр, затем точку радиуса.',polygon:'Многоугольник: укажите центр, затем радиус.'})[next];render();}
for(const [id,m] of [['selectBtn','select'],['eraseBtn','erase'],['trimBtn','trim'],['lineBtn','line'],['circleBtn','circle'],['polygonBtn','polygon']]){
  const b=document.querySelector('#'+id);b.dataset.mode=m;b.addEventListener('click',()=>setMode(m));
}
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const p=toWorld(event);cursor=p;canvas.setPointerCapture(event.pointerId);
  if(mode==='erase'){event.preventDefault();drawing=true;path=[p];render();return;}
  if(mode==='line'||mode==='circle'||mode==='polygon'){
    if(!firstPoint){firstPoint=p;status.textContent='Теперь укажите вторую точку или радиус.';return;}
    let object;
    if(mode==='line') object=new Line(firstPoint,p);
    if(mode==='circle'){const r=Math.hypot(p.x-firstPoint.x,p.y-firstPoint.y);if(r<1){status.textContent='Радиус слишком мал.';return;}object=new Circle(firstPoint,r);}
    if(mode==='polygon'){const r=Math.hypot(p.x-firstPoint.x,p.y-firstPoint.y);if(r<1){status.textContent='Радиус слишком мал.';return;}object=Polygon.regular(firstPoint,6,r);}
    history.replace([...history.scene,object]);firstPoint=null;render();updateHistoryButtons();status.textContent='Объект построен.';return;
  }
  const target=[...history.scene].reverse().find(o=>o.visible!==false&&hitTest(o,p,8));
  if(!target){status.textContent='Объект под курсором не найден.';return;}
  if(mode==='select'){selectedId=target.id;status.textContent=`Выбран ${target.type}.`;render();return;}
  if(mode==='trim'){
    if(target.locked){status.textContent='Объект заблокирован.';return;}
    const tx=trimAtPoint(target,p,history.scene,{hitTolerance:8});
    if(!tx.ok){status.textContent=tx.reason;return;}
    history.apply(tx);selectedId=null;render();updateHistoryButtons();status.textContent='Участок Trim удалён.';
  }
});
canvas.addEventListener('pointermove',event=>{
  const samples=typeof event.getCoalescedEvents==='function'?event.getCoalescedEvents():[event];
  const lastSample=samples.at(-1)||event;cursor=toWorld(lastSample);
  if(drawing&&mode==='erase'){for(const sample of samples)appendPoint(toWorld(sample));render();}
  else if(mode==='erase')render();
});
canvas.addEventListener('pointerup',event=>{
  if(!drawing)return;appendPoint(toWorld(event));drawing=false;
  const radiusWorld=brushRadiusWorld();
  const filter=selectedOnly.checked?(o=>o.id===selectedId):undefined;
  const tx=eraseAlongPath(history.scene,path,radiusWorld,{minFragmentLength:0.01,minArcSweep:0.001,filter});
  if(tx.ok){history.apply(tx);if(selectedId&&tx.remove.includes(selectedId))selectedId=null;status.textContent=`Удалено участков: ${tx.removed.length}; создано частей: ${tx.add.length}.`;} 
  else status.textContent=tx.skippedLocked?.length?`Объекты заблокированы: ${tx.skippedLocked.length}.` : tx.reason;
  path=[];render();updateHistoryButtons();
});
function cancelStroke(){if(!drawing)return;drawing=false;path=[];render();}
canvas.addEventListener('pointercancel',cancelStroke);
canvas.addEventListener('lostpointercapture',cancelStroke);
canvas.addEventListener('pointerleave',()=>{if(!drawing){cursor=null;render();}});
brush.addEventListener('input',()=>{brushValue.value=`${brush.value} px`;render();});
document.querySelector('#undoBtn').addEventListener('click',()=>{history.undo();render();updateHistoryButtons();status.textContent='Отмена выполнена.';});
document.querySelector('#redoBtn').addEventListener('click',()=>{history.redo();render();updateHistoryButtons();status.textContent='Повтор выполнен.';});
document.querySelector('#resetBtn').addEventListener('click',resetScene);
document.querySelector('#deleteBtn').addEventListener('click',()=>{
  if(!selectedId){status.textContent='Сначала выберите объект.';return;}
  const obj=history.scene.find(x=>x.id===selectedId);if(!obj){selectedId=null;return;}
  if(obj.locked){status.textContent='Объект заблокирован.';return;}
  history.replace(history.scene.filter(x=>x.id!==selectedId));selectedId=null;render();updateHistoryButtons();status.textContent='Объект удалён.';
});
document.querySelector('#addTemplateBtn').addEventListener('click',()=>{
  const id=document.querySelector('#templateSelect').value;
  const options=id==='holeArray'?{origin:{x:700,y:320}}:{center:{x:820,y:360}};
  if(id==='plate')options.holes=[{x:-35,y:-15,radius:4},{x:35,y:-15,radius:4},{x:35,y:15,radius:4},{x:-35,y:15,radius:4}];
  const objects=createTemplate(id,options);
  history.replace([...history.scene,...objects]);render();updateHistoryButtons();
  status.textContent=`Добавлен шаблон: ${document.querySelector('#templateSelect').selectedOptions[0].text} (${objects.length} объектов).`;
});
document.querySelector('#exportBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(serializeScene(history.scene),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cad-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.querySelector('#importBtn').addEventListener('click',()=>document.querySelector('#importFile').click());
document.querySelector('#importFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{const data=JSON.parse(await file.text());const objects=deserializeScene(data);history.replace(objects);selectedId=null;render();updateHistoryButtons();status.textContent=`Импортировано объектов: ${objects.length}.`;}
  catch(error){status.textContent=`Ошибка импорта: ${error.message}`;}
  event.target.value='';
});
window.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history.undo();render();updateHistoryButtons();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();history.redo();render();updateHistoryButtons();}
  else if(e.key==='Delete')document.querySelector('#deleteBtn').click();
});
resetScene();brushValue.value=`${brush.value} px`;setMode('erase');
