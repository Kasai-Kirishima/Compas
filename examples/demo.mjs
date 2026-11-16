import {
  Line, Centerline, Circle, Arc, Polygon, trimAtPoint, applyEditTransaction,
  hitTest, drawPrimitive, serializeScene, eraseAlongPath, SceneHistory
} from '../src/index.mjs';

const canvas = document.querySelector('#cad');
const ctx = canvas.getContext('2d');
const status = document.querySelector('#status');
const brush = document.querySelector('#brush');
const brushValue = document.querySelector('#brushValue');
const history = new SceneHistory([]);
let mode = 'erase', drawing = false, path = [], firstPoint = null, selectedId = null;
const worldScale = 1;

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
  status.textContent='Пример восстановлен. Попробуйте стирать середину отрезка или часть окружности.';
}
function toWorld(event) {
  const rect=canvas.getBoundingClientRect();
  return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:canvas.height-(event.clientY-rect.top)*canvas.height/rect.height };
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
  if(drawing && mode==='erase' && path.length){
    ctx.save();ctx.strokeStyle='rgba(220,55,55,.75)';ctx.fillStyle='rgba(220,55,55,.12)';ctx.lineWidth=Number(brush.value)*2;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();
    const p=path[path.length-1];ctx.beginPath();ctx.arc(p.x,p.y,Number(brush.value),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
  }
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#64748b';ctx.font='12px system-ui';ctx.fillText('Красные линии — границы Trim; синий — дуга/многоугольник; штрихпунктир — осевая.',14,18);ctx.restore();
}
function updateHistoryButtons(){document.querySelector('#undoBtn').disabled=!history.canUndo;document.querySelector('#redoBtn').disabled=!history.canRedo;}
function setMode(next){mode=next;firstPoint=null;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));status.textContent=({select:'Выбор: щёлкните по объекту.',erase:'Ластик: зажмите кнопку мыши и проведите по нужному участку.',trim:'Trim: щёлкните по отрезку между пересечениями.',line:'Отрезок: укажите начальную и конечную точки.',circle:'Окружность: укажите центр, затем точку радиуса.',polygon:'Многоугольник: укажите центр, затем радиус.'})[next];}
for(const [id,m] of [['selectBtn','select'],['eraseBtn','erase'],['trimBtn','trim'],['lineBtn','line'],['circleBtn','circle'],['polygonBtn','polygon']]){
  const b=document.querySelector('#'+id); b.dataset.mode=m; b.addEventListener('click',()=>setMode(m));
}
canvas.addEventListener('pointerdown',event=>{
  const p=toWorld(event); canvas.setPointerCapture(event.pointerId);
  if(mode==='erase'){drawing=true;path=[p];render();return;}
  if(mode==='line'||mode==='circle'||mode==='polygon'){
    if(!firstPoint){firstPoint=p;status.textContent='Теперь укажите вторую точку или радиус.';return;}
    let object;
    if(mode==='line') object=new Line(firstPoint,p);
    if(mode==='circle'){const r=Math.hypot(p.x-firstPoint.x,p.y-firstPoint.y);if(r<1){status.textContent='Радиус слишком мал.';return;}object=new Circle(firstPoint,r);}
    if(mode==='polygon'){const r=Math.hypot(p.x-firstPoint.x,p.y-firstPoint.y);if(r<1){status.textContent='Радиус слишком мал.';return;}object=Polygon.regular(firstPoint,6,r);}
    history.replace([...history.scene,object]);firstPoint=null;render();updateHistoryButtons();status.textContent='Объект построен.';return;
  }
  const target=[...history.scene].reverse().find(o=>o.visible&&hitTest(o,p,8));
  if(!target){status.textContent='Объект под курсором не найден.';return;}
  if(mode==='select'){selectedId=target.id;status.textContent=`Выбран ${target.type} (${target.id}).`;render();return;}
  if(mode==='trim'){
    if(target.locked){status.textContent='Объект заблокирован.';return;}
    const tx=trimAtPoint(target,p,history.scene,{hitTolerance:8});
    if(!tx.ok){status.textContent=tx.reason;return;}
    history.apply(tx);render();updateHistoryButtons();status.textContent='Участок Trim удалён.';
  }
});
canvas.addEventListener('pointermove',event=>{if(!drawing||mode!=='erase')return;const p=toWorld(event);const last=path[path.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>=2)path.push(p);render();});
canvas.addEventListener('pointerup',()=>{
  if(!drawing)return;drawing=false;
  const tx=eraseAlongPath(history.scene,path,Number(brush.value),{minFragmentLength:1,minArcSweep:.005});
  if(tx.ok){history.apply(tx);status.textContent=`Стерто частичных участков: ${tx.removed.length}; создано фрагментов: ${tx.add.length}.`;}else status.textContent=tx.reason;
  path=[];render();updateHistoryButtons();
});
canvas.addEventListener('pointercancel',()=>{drawing=false;path=[];render();});
document.querySelector('#undoBtn').addEventListener('click',()=>{history.undo();render();updateHistoryButtons();status.textContent='Отмена выполнена.';});
document.querySelector('#redoBtn').addEventListener('click',()=>{history.redo();render();updateHistoryButtons();status.textContent='Повтор выполнен.';});
document.querySelector('#resetBtn').addEventListener('click',resetScene);
document.querySelector('#exportBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(serializeScene(history.scene),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cad-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
brush.addEventListener('input',()=>{brushValue.value=brush.value;});
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history.undo();render();updateHistoryButtons();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();history.redo();render();updateHistoryButtons();}});
resetScene();setMode('erase');
