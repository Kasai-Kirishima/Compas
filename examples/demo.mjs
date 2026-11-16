import {
  Line, Centerline, Circle, Arc, Polygon, LinearDimension, DiameterDimension,
  trimAtPoint, hitTest, drawPrimitive, serializeScene, deserializeScene, normAngle, snapPoints, intersectionSnapPoints,
  eraseAlongPath, eraseTargetAlongPath, SceneHistory, createTemplate, eraserRadiusInWorld, translatePrimitive,
  cutPolygonNotchAtPoint, createRectangularPocket, createCircularCutout, createObroundCutout
} from '../src/index.mjs';

const canvas = document.querySelector('#cad');
const ctx = canvas.getContext('2d');
const status = document.querySelector('#status');
const brush = document.querySelector('#brush');
const brushValue = document.querySelector('#brushValue');
const history = new SceneHistory([]);
let mode = 'erase';
let drawing = false;
let path = [];
let constructPoints = [];
let selectedId = null;
let eraseTargetId = null;
let eraseAllForCurrentStroke = false;
let pendingPocketKind = null;
let cursor = null;
let snapCursor = null;

const $ = id => document.getElementById(id);
const selectedObject = () => history.scene.find(o => o.id === selectedId) ?? null;
const pointDistance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function resetScene() {
  const items = [
    new Line({x:80,y:170},{x:500,y:170},{style:{stroke:'#111',lineWidth:2.4}}),
    new Line({x:250,y:90},{x:250,y:260},{style:{stroke:'#c44a4a',lineWidth:2}}),
    new Line({x:390,y:90},{x:390,y:260},{style:{stroke:'#c44a4a',lineWidth:2}}),
    new Circle({x:720,y:190},105,{style:{stroke:'#111',lineWidth:2.4}}),
    new Centerline({x:600,y:190},{x:840,y:190}),
    new Arc({x:720,y:485},100,Math.PI*.08,Math.PI*1.55,{style:{stroke:'#2877bd',lineWidth:2.6}}),
    Polygon.regular({x:1010,y:480},6,85,Math.PI/6,{style:{stroke:'#2877bd',lineWidth:2.4}}),
    new Line({x:80,y:410},{x:500,y:410},{style:{stroke:'#111',lineWidth:2}}),
    new LinearDimension({x:80,y:170},{x:500,y:170},38,{textHeight:7}),
    new LinearDimension({x:545,y:90},{x:545,y:270},-28,{textHeight:7}),
    new DiameterDimension({x:720,y:190},105,{angle:Math.PI/6,textHeight:7}),
    Polygon.regular({x:270,y:560},4,72,Math.PI/4,{style:{stroke:'#2979b8',lineWidth:2}})
  ];
  history.replace(items,{record:false}); history.clear(); selectedId=null; constructPoints=[]; render(); updateHistoryButtons();
  status.textContent='Пример восстановлен. Для ластика начните штрих на нужном объекте: по умолчанию обрабатывается только этот объект.';
}

function viewScale() {
  const rect = canvas.getBoundingClientRect();
  return canvas.width / Math.max(1, rect.width);
}
function brushRadiusWorld() { return eraserRadiusInWorld(Number(brush.value), 1 / viewScale()); }
function toWorld(event) {
  const rect=canvas.getBoundingClientRect();
  return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:canvas.height-(event.clientY-rect.top)*canvas.height/rect.height };
}
function appendPoint(p) {
  const last=path[path.length-1];
  if (!last || pointDistance(p,last) >= Math.max(.12, viewScale()*.2)) path.push(p);
}
function resolveSnap(point) {
  if (!$('osnap').checked) return null;
  const candidates=[];
  for (const object of history.scene) if (object.visible!==false) candidates.push(...snapPoints(object));
  candidates.push(...intersectionSnapPoints(history.scene));
  let best=null;
  for (const candidate of candidates) {
    const d=pointDistance(candidate.point,point);
    if (d <= 10*viewScale() && (!best || d<best.distance)) best={...candidate,distance:d};
  }
  return best;
}
function constructionPoint(point) {
  const snap=resolveSnap(point);
  snapCursor=snap?.point??null;
  return snap?.point??point;
}
function render() {
  ctx.setTransform(1,0,0,-1,0,canvas.height); ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save(); ctx.strokeStyle='#edf0f3';ctx.lineWidth=1;ctx.setLineDash([]);
  for(let x=0;x<=canvas.width;x+=25){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  for(let y=0;y<=canvas.height;y+=25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
  ctx.restore();
  for(const o of history.scene){
    if(o.id===selectedId){ctx.save();ctx.strokeStyle='#2680d9';ctx.lineWidth=Math.max(1.1,(o.style?.lineWidth??.25)+.8);ctx.setLineDash([5,4]);drawPrimitive(ctx,o);ctx.restore();}
    else drawPrimitive(ctx,o);
  }
  if (mode==='erase' && cursor) {
    const r=brushRadiusWorld();
    ctx.save();ctx.strokeStyle='rgba(215,55,55,.85)';ctx.fillStyle='rgba(215,55,55,.08)';ctx.lineWidth=1.2;ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(cursor.x,cursor.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
  }
  if(snapCursor){ctx.save();ctx.strokeStyle='#0f9d68';ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.beginPath();ctx.rect(snapCursor.x-5,snapCursor.y-5,10,10);ctx.stroke();ctx.restore();}
  if(drawing && path.length){
    ctx.save();ctx.strokeStyle='rgba(220,55,55,.75)';ctx.lineWidth=Math.max(.5,brushRadiusWorld()*2);ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
  }
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#64748b';ctx.font='12px system-ui';
  ctx.fillText('Синій — вибраний об’єкт · штрихпунктир — осьова · червоний — слід часткового ластика',14,18);ctx.restore();
}
function updateHistoryButtons(){ $('undoBtn').disabled=!history.canUndo; $('redoBtn').disabled=!history.canRedo; }
function updateStatus(message){ status.textContent=message; }
function setMode(next){
  mode=next; constructPoints=[]; path=[]; drawing=false;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
  const text={
    select:'Выбор: щёлкните по примитиву.', erase:'Частичный ластик: начните штрих на нужном объекте. По умолчанию стирается только объект под началом штриха.',
    trim:'Trim: щёлкните по сегменту между соседними пересечениями.', cutout:'Вырез по краю: щёлкните по ребру замкнутого многоугольника. Ширина и глубина задаются справа.',
    line:'Отрезок: укажите начальную и конечную точки.', axis:'Осевая линия: укажите две точки.', circle:'Окружность: центр и точка радиуса.',
    arc:'Дуга: последовательно укажите центр, начальную и конечную точки.', rect:'Прямоугольник: укажите два противоположных угла.',
    polygon:'Правильный многоугольник: укажите центр и радиус.', dimension:'Линейный размер: укажите две точки измерения.', diameter:'Диаметральный размер: щёлкните по окружности.'
  };
  updateStatus(text[next]??'Выберите инструмент.'); render();
}
function addObject(object){ history.replace([...history.scene,object]); selectedId=object.id; render(); updateHistoryButtons(); }
function findTarget(p, tolerance=8){
  return [...history.scene].reverse().find(o=>o.visible!==false && !o.locked && hitTest(o,p,tolerance)) ?? null;
}
function finishTwoPoint(p, factory, label){
  if(!constructPoints.length){constructPoints=[p];updateStatus('Начальная точка задана. Укажите конечную точку.');return;}
  const a=constructPoints[0];constructPoints=[];
  try { addObject(factory(a,p)); updateStatus(`${label} построен.`); }
  catch(error){ updateStatus(error.message); }
}
function handleConstructionClick(p){
  if(mode==='line') return finishTwoPoint(p,(a,b)=>new Line(a,b),'Отрезок');
  if(mode==='axis') return finishTwoPoint(p,(a,b)=>new Centerline(a,b),'Осевая линия');
  if(mode==='circle') return finishTwoPoint(p,(c,q)=>new Circle(c,pointDistance(c,q)),'Окружность');
  if(mode==='rect') return finishTwoPoint(p,(a,b)=>new Polygon([{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y}]),'Прямоугольник');
  if(mode==='polygon') return finishTwoPoint(p,(c,q)=>Polygon.regular(c,Math.max(3,Math.min(24,Number($('vertexCount').value)||6)),pointDistance(c,q)),'Многоугольник');
  if(mode==='dimension') return finishTwoPoint(p,(a,b)=>new LinearDimension(a,b,Number($('dimOffset').value)||24,{textHeight:Number($('dimTextHeight').value)||7}),'Линейный размер');
  if(mode==='arc'){
    constructPoints.push(p);
    if(constructPoints.length===1){updateStatus('Центр дуги задан. Укажите начальную точку.');return;}
    if(constructPoints.length===2){updateStatus('Начало дуги задано. Укажите конечную точку.');return;}
    const [center,start,end]=constructPoints;constructPoints=[];
    const radius=pointDistance(center,start), startAngle=Math.atan2(start.y-center.y,start.x-center.x), endAngle=Math.atan2(end.y-center.y,end.x-center.x), sweep=normAngle(endAngle-startAngle);
    if(radius<=1e-8||sweep<=1e-8){updateStatus('Дуга имеет нулевой радиус или угол. Повторите построение.');return;}
    addObject(new Arc(center,radius,startAngle,sweep));updateStatus('Дуга построена по трём точкам.');
  }
}

for(const [id,m] of [['selectBtn','select'],['eraseBtn','erase'],['trimBtn','trim'],['cutoutBtn','cutout'],['lineBtn','line'],['axisBtn','axis'],['circleBtn','circle'],['arcBtn','arc'],['rectBtn','rect'],['polygonBtn','polygon'],['dimBtn','dimension'],['diamBtn','diameter']]) $(id).addEventListener('click',()=>setMode(m));

canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const p=toWorld(event);cursor=p;
  if(mode==='erase'){
    event.preventDefault();
    // Capture the erase scope at pointer-down. The primitive under the cursor
    // always wins over a stale selection from a previous operation.
    eraseAllForCurrentStroke = $('eraseAllTargets').checked;
    const target = eraseAllForCurrentStroke ? null : findTarget(p, Math.max(3 * viewScale(), brushRadiusWorld()));
    eraseTargetId = target?.id ?? null;
    if(!eraseAllForCurrentStroke && !eraseTargetId){
      selectedId = null;
      updateStatus('Начните штрих прямо на контуре объекта. Выбранный ранее объект автоматически не стирается. Для нескольких объектов включите режим «Все объекты под штрихом».');
      render(); return;
    }
    drawing=true;path=[p];canvas.setPointerCapture(event.pointerId);render();return;
  }
  if(mode==='placePocket'){
    const center=constructionPoint(p), kind=pendingPocketKind;
    if(!kind){setMode('select');return;}
    let objects;
    try{
      const w=Number($('pocketWidth').value), h=Number($('pocketHeight').value);
      const r=Number($('pocketRadius').value), len=Number($('pocketLength').value), angle=Number($('pocketAngle').value)*Math.PI/180;
      if(kind==='rect') objects=createRectangularPocket(center,w,h,angle);
      else if(kind==='circle') objects=createCircularCutout(center,r);
      else objects=createObroundCutout(center,len,w,angle);
      history.replace([...history.scene,...objects]); selectedId=objects[0]?.id??null;
      pendingPocketKind=null; setMode('select'); updateHistoryButtons();
      updateStatus(`Внутренний контур добавлен в точке X=${center.x.toFixed(2)}, Y=${center.y.toFixed(2)}. Это 2D-обозначение отверстия/кармана.`);
    }catch(error){updateStatus(error.message);}
    render(); return;
  }
  if(['line','axis','circle','rect','polygon','arc','dimension'].includes(mode)){canvas.setPointerCapture(event.pointerId);handleConstructionClick(constructionPoint(p));render();updateHistoryButtons();return;}
  const target=findTarget(p,10);
  if(mode==='select'){
    selectedId=target?.id??null;updateStatus(target?`Выбран объект: ${target.type}.`:'Под объектом курсора ничего нет.');render();return;
  }
  if(mode==='diameter'){
    const circle=[...history.scene].reverse().find(o=>o instanceof Circle && !o.locked && hitTest(o,p,10));
    if(!circle){updateStatus('Щёлкните рядом с окружностью, чтобы поставить диаметральный размер.');return;}
    addObject(new DiameterDimension(circle.center,circle.radius,{angle:0,textHeight:Number($('dimTextHeight').value)||7}));updateStatus('Диаметральный размер Ø добавлен.');return;
  }
  if(mode==='trim'){
    if(!target){updateStatus('Объект под курсором не найден.');return;}
    const tx=trimAtPoint(target,p,history.scene,{hitTolerance:10});
    if(!tx.ok){updateStatus(tx.reason);return;}
    history.apply(tx);selectedId=null;render();updateHistoryButtons();updateStatus('Участок Trim удалён.');return;
  }
  if(mode==='cutout'){
    const polygon=[...history.scene].reverse().find(o=>o instanceof Polygon && !o.locked && hitTest(o,p,12));
    if(!polygon){updateStatus('Для выреза выберите замкнутый контур многоугольника и щёлкните по его ребру.');return;}
    const tx=cutPolygonNotchAtPoint(polygon,p,Number($('notchWidth').value),Number($('notchDepth').value),{hitTolerance:14,minWeb:Number($('minWeb').value)||0});
    if(!tx.ok){updateStatus(tx.reason);return;}
    history.apply(tx);selectedId=tx.add[0]?.id??null;render();updateHistoryButtons();updateStatus(`Вырез создан. Удалённая площадь контура: ${tx.metadata.removedArea.toFixed(2)} кв. мм.`);return;
  }
});

canvas.addEventListener('pointermove',event=>{
  const samples=typeof event.getCoalescedEvents==='function'?event.getCoalescedEvents():[event];
  const last=samples.at(-1)||event;cursor=toWorld(last);
  if(['line','axis','circle','rect','polygon','arc','dimension'].includes(mode))constructionPoint(cursor);else snapCursor=null;
  if(drawing&&mode==='erase'){for(const sample of samples)appendPoint(toWorld(sample));render();}
  else if(mode==='erase')render();
  else render();
});
canvas.addEventListener('pointerup',event=>{
  if(!drawing)return;
  appendPoint(toWorld(event));drawing=false;
  const eraseOptions={minFragmentLength:0.001,minArcSweep:0.0005,simplifyTolerance:0,allowCompleteErase:false,eraseAnnotations:'partial'};
  const tx=eraseAllForCurrentStroke
    ? eraseAlongPath(history.scene,path,brushRadiusWorld(),eraseOptions)
    : eraseTargetAlongPath(history.scene,eraseTargetId,path,brushRadiusWorld(),eraseOptions);
  if(tx.ok){history.apply(tx);if(selectedId&&tx.remove.includes(selectedId))selectedId=null;updateStatus(`Частично стёрто: объектов ${tx.stats.objectsChanged}, новых фрагментов ${tx.stats.fragmentsCreated}.`);}
  else updateStatus(tx.skippedLocked?.length?`Объект заблокирован: ${tx.skippedLocked.length}.`:tx.reason);
  if(tx.protectedComplete?.length)updateStatus('Весь объект покрыт кистью — полное удаление запрещено. Уменьшите кисть или используйте «Удалить объект».');
  path=[];eraseTargetId=null;eraseAllForCurrentStroke=false;render();updateHistoryButtons();
});
function cancelStroke(){if(!drawing)return;drawing=false;path=[];eraseTargetId=null;eraseAllForCurrentStroke=false;render();}
canvas.addEventListener('pointercancel',cancelStroke);
canvas.addEventListener('lostpointercapture',cancelStroke);
canvas.addEventListener('pointerleave',()=>{if(!drawing){cursor=null;render();}});
brush.addEventListener('input',()=>{brushValue.value=`${brush.value} px`;render();});

$('undoBtn').addEventListener('click',()=>{history.undo();render();updateHistoryButtons();updateStatus('Отмена выполнена.');});
$('redoBtn').addEventListener('click',()=>{history.redo();render();updateHistoryButtons();updateStatus('Повтор выполнен.');});
$('resetBtn').addEventListener('click',resetScene);
$('loadSampleBtn').addEventListener('click',async()=>{
  try{
    const response=await fetch('./sample-machined-part.json');
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const raw=deserializeScene(data);
    // The packaged sample is authored around world origin. Translate it to the
    // visible canvas centre so the negative-coordinate half is not clipped.
    const objects=raw.map(object=>translatePrimitive(object,{x:canvas.width/2,y:canvas.height/2}));
    history.replace(objects);selectedId=null;setMode('select');render();updateHistoryButtons();
    updateStatus(`Учебная деталь загружена и центрирована: ${objects.length} объектов.`);
  }catch(error){updateStatus(`Не удалось загрузить пример: ${error.message}`);}
});
$('deleteBtn').addEventListener('click',()=>{
  if(!selectedId){updateStatus('Сначала выберите объект.');return;}
  const obj=selectedObject();if(!obj){selectedId=null;return;}
  if(obj.locked){updateStatus('Объект заблокирован.');return;}
  history.replace(history.scene.filter(x=>x.id!==selectedId));selectedId=null;render();updateHistoryButtons();updateStatus('Объект полностью удалён отдельной командой Delete.');
});
$('addTemplateBtn').addEventListener('click',()=>{
  const id=$('templateSelect').value;
  const options=id==='holeArray'?{origin:{x:700,y:320}}:{center:{x:820,y:360}};
  if(id==='radialSlotCover')options.center={x:canvas.width/2,y:canvas.height/2};
  if(id==='plate')options.holes=[{x:-35,y:-15,radius:4},{x:35,y:-15,radius:4},{x:35,y:15,radius:4},{x:-35,y:15,radius:4}];
  try{const objects=createTemplate(id,options);history.replace([...history.scene,...objects]);selectedId=null;render();updateHistoryButtons();updateStatus(`Добавлен шаблон: ${$('templateSelect').selectedOptions[0].text} (${objects.length} объектов).`);}
  catch(error){updateStatus(error.message);}
});
$('addPocketBtn').addEventListener('click',()=>{
  pendingPocketKind=$('cutoutShape').value; mode='placePocket'; constructPoints=[]; path=[];
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.remove('active'));
  updateStatus('Щёлкните в точке центра будущего внутреннего контура. Размер и угол задаются полями рядом. Никакой контур не вставляется в фиксированную координату.');
  render();
});
$('loadCoverBtn').addEventListener('click',()=>{
  try{
    const objects=createTemplate('radialSlotCover',{center:{x:canvas.width/2,y:canvas.height/2}});
    history.replace(objects); selectedId=null; setMode('select'); render(); updateHistoryButtons();
    updateStatus(`Кришка, варіант №6 побудована: ${objects.length} примітивів. Параметри за ескізом: Ø84, Ø46, Ø16, паз 6, шестикутник 20.`);
  }catch(error){updateStatus(error.message);}
});
$('exportBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(serializeScene(history.scene),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cad-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{const data=JSON.parse(await file.text());const objects=deserializeScene(data);history.replace(objects);selectedId=null;render();updateHistoryButtons();updateStatus(`Импортировано объектов: ${objects.length}.`);}
  catch(error){updateStatus(`Ошибка импорта: ${error.message}`);}
  event.target.value='';
});
window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if(tag==='INPUT'||tag==='SELECT')return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history.undo();render();updateHistoryButtons();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();history.redo();render();updateHistoryButtons();}
  else if(e.key==='Delete')$('deleteBtn').click();
  else if(e.key==='Escape'){
    constructPoints=[]; pendingPocketKind=null; cancelStroke();
    if(mode==='placePocket') setMode('select');
    updateStatus('Побудову або розміщення скасовано.');
  }
});

resetScene();brushValue.value=`${brush.value} px`;setMode('select');
window.__CAD_GEOMETRY_CORE_READY__ = true;
