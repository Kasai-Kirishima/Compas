(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const $=id=>document.getElementById(id);
  const svg=$('sheetSvg'), drawingArea=$('drawingArea');
  const templateLayer=$('templateLayer'), geometryLayer=$('geometryLayer'), annotationLayer=$('annotationLayer'), previewLayer=$('previewLayer');
  const state={format:'A4P',tool:'select',objects:[],selected:null,firstPoint:null,zoom:1.8,grid:false,snap:false,template:true,space:false,pan:null,drag:null,history:[],redo:[],title:{title:'Наименование детали',code:'ЧЕРТЁЖ.001',material:'Материал не указан',scale:'1:1',sheet:'1',company:'Учебный чертёж'},fileName:'Чертёж_1',dirty:false};
  const visible={geometry:true,dimensions:true,template:true};
  const deep=o=>JSON.parse(JSON.stringify(o));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mm=(v)=>Number(v.toFixed(2));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

  function setMessage(message){$('statusMessage').textContent=message;}
  function dimensions(){return window.KompasTemplate.dimensions(state.format);}
  function pointFromEvent(e){const r=svg.getBoundingClientRect(),d=dimensions();let x=(e.clientX-r.left)/r.width*d.w,y=(e.clientY-r.top)/r.height*d.h;if(state.snap){x=Math.round(x/5)*5;y=Math.round(y/5)*5;}return{x:mm(x),y:mm(y)};}
  function updateZoom(){const d=dimensions();svg.style.width=`${d.w*state.zoom}px`;svg.style.height=`${d.h*state.zoom}px`;$('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;}
  function setZoom(z){state.zoom=clamp(z,.65,4.2);updateZoom();}
  function templateData(){return state.title;}
  function renderTemplate(){const d=dimensions();svg.setAttribute('viewBox',`0 0 ${d.w} ${d.h}`);$('paperRect').setAttribute('width',d.w);$('paperRect').setAttribute('height',d.h);$('gridRect').setAttribute('width',d.w);$('gridRect').setAttribute('height',d.h);window.KompasTemplate.render(templateLayer,state.format,templateData());templateLayer.style.display=(state.template&&visible.template)?'':'none';$('docName').textContent=state.fileName.replaceAll('_',' ');updateZoom();}
  function svgEl(name,attrs={}){const el=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>{if(v!==undefined&&v!==null)el.setAttribute(k,String(v));});return el;}
  function add(parent,name,attrs){const el=svgEl(name,attrs);parent.appendChild(el);return el;}
  function objectLayer(o){return o.layer==='annotation'?annotationLayer:geometryLayer;}
  function isAnnotation(o){return o.layer==='annotation';}
  function applyStyle(el,o,selected=false){el.setAttribute('stroke',selected?'#078db2':(o.color||'#20252a'));el.setAttribute('stroke-width',selected?Math.max(.55,(o.width||.35)*1.8):(o.width||.35));el.setAttribute('fill','none');el.setAttribute('stroke-linecap','round');el.setAttribute('stroke-linejoin','round');if(o.dash)el.setAttribute('stroke-dasharray',o.dash);}
  function renderObject(o){const parent=objectLayer(o);if((isAnnotation(o)&&!visible.dimensions)||(!isAnnotation(o)&&!visible.geometry))return;const g=add(parent,'g',{'data-id':o.id,'class':'drawing-object'});const selected=state.selected===o.id;
    if(o.type==='line') {const el=add(g,'line',{x1:o.x,y1:o.y,x2:o.x2,y2:o.y2});applyStyle(el,o,selected);}
    else if(o.type==='rect'){const x=Math.min(o.x,o.x2),y=Math.min(o.y,o.y2),w=Math.abs(o.x2-o.x),h=Math.abs(o.y2-o.y);const el=add(g,'rect',{x,y,width:w,height:h});applyStyle(el,o,selected);}
    else if(o.type==='circle'){const r=Math.hypot(o.x2-o.x,o.y2-o.y);const el=add(g,'circle',{cx:o.x,cy:o.y,r});applyStyle(el,o,selected);}
    else if(o.type==='text'){const t=add(g,'text',{x:o.x,y:o.y,'font-family':'Arial,sans-serif','font-size':o.size||4,fill:selected?'#078db2':(o.color||'#20252a'),stroke:'none'});t.textContent=o.text||'Текст';}
    else if(o.type==='dimension'){
      const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,nx=-uy,ny=ux,off=o.offset||5;
      const ax=o.x+nx*off,ay=o.y+ny*off,bx=o.x2+nx*off,by=o.y2+ny*off;
      const ext1=add(g,'line',{x1:o.x,y1:o.y,x2:ax,y2:ay,stroke:o.color||'#a36b17','stroke-width':.2});
      const ext2=add(g,'line',{x1:o.x2,y1:o.y2,x2:bx,y2:by,stroke:o.color||'#a36b17','stroke-width':.2});
      const dl=add(g,'line',{x1:ax,y1:ay,x2:bx,y2:by,stroke:o.color||'#a36b17','stroke-width':.25});
      const ah=Math.min(1.6,len/5),aw=.55;
      add(g,'path',{d:`M ${ax} ${ay} l ${ux*ah+nx*aw} ${uy*ah+ny*aw} l ${-ux*ah*1.6} ${-uy*ah*1.6} z`,fill:o.color||'#a36b17',stroke:'none'});
      add(g,'path',{d:`M ${bx} ${by} l ${-ux*ah+nx*aw} ${-uy*ah+ny*aw} l ${ux*ah*1.6} ${uy*ah*1.6} z`,fill:o.color||'#a36b17',stroke:'none'});
      const value=o.label||`${len.toFixed(1)}`;const text=add(g,'text',{x:(ax+bx)/2,y:(ay+by)/2-1.2,'font-family':'Arial,sans-serif','font-size':2.8,'text-anchor':'middle',fill:o.color||'#a36b17',stroke:'none'});text.textContent=value;
      if(selected){[ext1,ext2,dl].forEach(el=>el.setAttribute('stroke','#078db2'));}
    }
    if(selected){const b=objectBounds(o);if(b){const box=add(g,'rect',{x:b.x-1.5,y:b.y-1.5,width:Math.max(3,b.w+3),height:Math.max(3,b.h+3),fill:'none',stroke:'#078db2','stroke-width':.3,'stroke-dasharray':'1.2 1'});box.setAttribute('pointer-events','none');}}
  }
  function objectBounds(o){if(o.type==='text')return{x:o.x,y:o.y-(o.size||4),w:Math.max(5,(o.text||'').length*(o.size||4)*.55),h:o.size||4};const x2=o.x2??o.x,y2=o.y2??o.y;return{x:Math.min(o.x,x2),y:Math.min(o.y,y2),w:Math.abs(x2-o.x),h:Math.abs(y2-o.y)};}
  function renderAll(){geometryLayer.innerHTML='';annotationLayer.innerHTML='';previewLayer.innerHTML='';state.objects.forEach(renderObject);$('geometryCount').textContent=state.objects.filter(o=>!isAnnotation(o)).length;$('annotationCount').textContent=state.objects.filter(isAnnotation).length;updateSelectionPanel();}
  function updateSelectionPanel(){const o=state.objects.find(x=>x.id===state.selected);$('noSelection').classList.toggle('hidden',!!o);$('selectionFields').classList.toggle('hidden',!o);if(o){$('objectColor').value=o.color||'#20252a';$('objectWidth').value=o.width||.35;$('objectDash').value=o.dash||'';}}
  function snapshot(){return {format:state.format,objects:deep(state.objects),title:deep(state.title),fileName:state.fileName};}
  function commit(){state.history.push(snapshot());if(state.history.length>80)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';}
  function restore(s){state.format=s.format;state.objects=deep(s.objects);state.title=deep(s.title);state.fileName=s.fileName;state.selected=null;syncTitleInputs();renderTemplate();renderAll();}
  function undo(){if(!state.history.length){setMessage('Нет действий для отмены');return;}state.redo.push(snapshot());restore(state.history.pop());state.dirty=true;setMessage('Действие отменено');}
  function redo(){if(!state.redo.length){setMessage('Нет действий для повтора');return;}state.history.push(snapshot());restore(state.redo.pop());state.dirty=true;setMessage('Действие повторено');}
  function addObject(o){o.id=`obj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;o.color=o.color||'#20252a';o.width=o.width||.35;o.layer=o.layer||(o.type==='text'||o.type==='dimension'?'annotation':'geometry');state.objects.push(o);state.selected=o.id;commit();renderAll();setMessage('Объект добавлен');}
  function selectTool(tool){state.tool=tool;state.firstPoint=null;previewLayer.innerHTML='';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const names={select:'Выбор объекта',line:'Отрезок: укажите первую и вторую точки',rect:'Прямоугольник: укажите противоположные углы',circle:'Окружность: укажите центр и радиус',text:'Текст: щёлкните по листу',dimension:'Размер: укажите две точки'};setMessage(names[tool]||'Готово');$('canvasHint').textContent=names[tool]||'Выберите инструмент';$('canvasHint').classList.toggle('hide',tool==='select');}
  function drawPreview(p){previewLayer.innerHTML='';if(!state.firstPoint)return;const a=state.firstPoint;let el;if(state.tool==='line')el=add(previewLayer,'line',{x1:a.x,y1:a.y,x2:p.x,y2:p.y});else if(state.tool==='rect')el=add(previewLayer,'rect',{x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y)});else if(state.tool==='circle')el=add(previewLayer,'circle',{cx:a.x,cy:a.y,r:Math.hypot(p.x-a.x,p.y-a.y)});if(el){el.setAttribute('fill','none');el.setAttribute('stroke','#078db2');el.setAttribute('stroke-width','.45');el.setAttribute('stroke-dasharray','1.5 1');}}
  function translateObject(o,dx,dy){o.x=mm(o.x+dx);o.y=mm(o.y+dy);if(o.x2!==undefined)o.x2=mm(o.x2+dx);if(o.y2!==undefined)o.y2=mm(o.y2+dy);}
  function deleteSelected(){if(!state.selected){setMessage('Сначала выберите объект');return;}commit();state.objects=state.objects.filter(o=>o.id!==state.selected);state.selected=null;renderAll();setMessage('Объект удалён');}
  function onCanvasPointerDown(e){if(e.button===1||state.space){e.preventDefault();state.pan={x:e.clientX,y:e.clientY,left:drawingArea.scrollLeft,top:drawingArea.scrollTop};drawingArea.classList.add('dragging');return;}
    const target=e.target.closest('[data-id]');
    if(state.tool==='select'){
      if(target){const id=target.getAttribute('data-id');state.selected=id;renderAll();const o=state.objects.find(x=>x.id===id);state.drag={id,start:pointFromEvent(e),original:deep(o),historyBefore:snapshot(),moved:false};}
      else{state.selected=null;renderAll();}return;
    }
    if(state.tool==='text'){const p=pointFromEvent(e);const value=window.prompt('Введите текст надписи:','Текст');if(value!==null&&value.trim()){addObject({type:'text',x:p.x,y:p.y,text:value.trim(),size:4,layer:'annotation'});}return;}
    const p=pointFromEvent(e);if(!state.firstPoint){state.firstPoint=p;setMessage('Укажите вторую точку');return;}
    const a=state.firstPoint;state.firstPoint=null;previewLayer.innerHTML='';if(state.tool==='line')addObject({type:'line',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='rect')addObject({type:'rect',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='circle')addObject({type:'circle',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='dimension'){const len=Math.hypot(p.x-a.x,p.y-a.y);if(len>.1)addObject({type:'dimension',x:a.x,y:a.y,x2:p.x,y2:p.y,offset:5,label:len.toFixed(1),layer:'annotation',color:'#9a681c',width:.25});}
  }
  function onPointerMove(e){const p=pointFromEvent(e);$('coordinates').textContent=`X: ${p.x.toFixed(2)} · Y: ${p.y.toFixed(2)} мм`;
    if(state.pan){drawingArea.scrollLeft=state.pan.left-(e.clientX-state.pan.x);drawingArea.scrollTop=state.pan.top-(e.clientY-state.pan.y);return;}
    if(state.drag){const dx=p.x-state.drag.start.x,dy=p.y-state.drag.start.y;if(Math.abs(dx)+Math.abs(dy)>.03){state.drag.moved=true;const o=state.objects.find(x=>x.id===state.drag.id);if(o){Object.assign(o,deep(state.drag.original));translateObject(o,dx,dy);renderAll();}}return;}
    if(state.firstPoint)drawPreview(p);
  }
  function onPointerUp(){if(state.pan){state.pan=null;drawingArea.classList.remove('dragging');}if(state.drag){if(state.drag.moved){state.history.push(state.drag.historyBefore);if(state.history.length>80)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';setMessage('Объект перемещён');}state.drag=null;}}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  function saveProject(){const doc={app:'Kompas Online',version:1,format:state.format,fileName:state.fileName,title:state.title,objects:state.objects};downloadBlob(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),`${state.fileName||'drawing'}.json`);state.dirty=false;$('saveState').textContent='Сохранено';setMessage('Проект сохранён в JSON');}
  function loadProject(file){const reader=new FileReader();reader.onload=()=>{try{const doc=JSON.parse(reader.result);if(!doc||!Array.isArray(doc.objects)||!['A4P','A4L','A3L'].includes(doc.format))throw new Error('Неверный формат проекта');commit();state.format=doc.format;$('paperFormat').value=doc.format;state.fileName=doc.fileName||'Импортированный_чертёж';state.title=Object.assign({},state.title,doc.title||{});state.objects=doc.objects.filter(o=>o&&['line','rect','circle','text','dimension'].includes(o.type));state.selected=null;syncTitleInputs();renderTemplate();renderAll();state.dirty=false;$('saveState').textContent='Проект открыт';setMessage('Проект успешно открыт');}catch(err){alert(`Не удалось открыть проект: ${err.message}`);}};reader.readAsText(file);}
  function exportSvg(){const clone=svg.cloneNode(true);clone.querySelector('#previewLayer')?.remove();clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);clone.setAttribute('width',dimensions().w+'mm');clone.setAttribute('height',dimensions().h+'mm');const source='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);downloadBlob(new Blob([source],{type:'image/svg+xml;charset=utf-8'}),`${state.fileName||'drawing'}.svg`);setMessage('SVG экспортирован');}
  function exportPng(){const clone=svg.cloneNode(true);clone.querySelector('#previewLayer')?.remove();clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);const source=new XMLSerializer().serializeToString(clone),blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas'),d=dimensions();c.width=Math.round(d.w*10);c.height=Math.round(d.h*10);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{downloadBlob(b,`${state.fileName||'drawing'}.png`);URL.revokeObjectURL(url);setMessage('PNG экспортирован');},'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);alert('Не удалось создать PNG. Попробуйте экспорт SVG.');};img.src=url;}
  function printDocument(){const d=dimensions();let style=document.getElementById('dynamicPrintStyle');if(!style){style=document.createElement('style');style.id='dynamicPrintStyle';document.head.appendChild(style);}style.textContent=`@page{size:${d.w}mm ${d.h}mm;margin:0}@media print{.drawing-area svg{width:${d.w}mm!important;height:${d.h}mm!important}}`;window.print();}
  function syncTitleInputs(){$('titleField').value=state.title.title||'';$('codeField').value=state.title.code||'';$('materialField').value=state.title.material||'';$('scaleField').value=state.title.scale||'';$('sheetField').value=state.title.sheet||'1';$('companyField').value=state.title.company||'';$('filenameField').value=state.fileName||'Чертёж_1';}
  function applyTitle(){commit();state.title={title:$('titleField').value,code:$('codeField').value,material:$('materialField').value,scale:$('scaleField').value,sheet:$('sheetField').value,company:$('companyField').value};state.fileName=$('filenameField').value.trim()||'Чертёж_1';renderTemplate();renderAll();setMessage('Основная надпись обновлена');}
  function setFormat(fmt){commit();state.format=fmt;renderTemplate();setZoom(Math.min(state.zoom,2.5));$('docName').textContent=`Чертёж ${fmt}`;setMessage(`Формат листа: ${fmt}`);}
  function newDocument(){if(state.objects.length&&!confirm('Создать новый чертёж? Несохранённые изменения будут потеряны.'))return;commit();state.objects=[];state.selected=null;state.format='A4P';state.fileName='Чертёж_1';$('paperFormat').value='A4P';state.title={title:'Наименование детали',code:'ЧЕРТЁЖ.001',material:'Материал не указан',scale:'1:1',sheet:'1',company:'Учебный чертёж'};syncTitleInputs();$('paperFormat').value='A4P';renderTemplate();renderAll();state.dirty=false;$('saveState').textContent='Новый чертёж';setMessage('Создан новый чертёж');}

  // Tool buttons in both ribbon and left toolbox.
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>selectTool(b.dataset.tool)));
  $('newBtn').addEventListener('click',newDocument);$('saveBtn').addEventListener('click',saveProject);$('saveJsonBtn').addEventListener('click',saveProject);$('openBtn').addEventListener('click',()=>$('fileInput').click());$('loadJsonBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>{if(e.target.files[0])loadProject(e.target.files[0]);e.target.value='';});
  $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);$('deleteBtn').addEventListener('click',deleteSelected);$('deleteSelectedBtn').addEventListener('click',deleteSelected);
  $('gridBtn').addEventListener('click',()=>{state.grid=!state.grid;$('gridToggle').checked=state.grid;$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');});$('snapBtn').addEventListener('click',()=>{state.snap=!state.snap;$('snapToggle').checked=state.snap;setMessage(`Привязка ${state.snap?'включена':'выключена'}`);});
  $('gridToggle').addEventListener('change',e=>{state.grid=e.target.checked;$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');});$('snapToggle').addEventListener('change',e=>state.snap=e.target.checked);
  $('templateToggle').addEventListener('change',e=>{state.template=e.target.checked;renderTemplate();});$('geometryVisible').addEventListener('change',e=>{visible.geometry=e.target.checked;renderAll();});$('dimensionsVisible').addEventListener('change',e=>{visible.dimensions=e.target.checked;renderAll();});$('templateVisible').addEventListener('change',e=>{visible.template=e.target.checked;renderTemplate();});
  $('paperFormat').addEventListener('change',e=>setFormat(e.target.value));$('fitBtn').addEventListener('click',()=>{const d=dimensions(),w=drawingArea.clientWidth-70,h=drawingArea.clientHeight-70;setZoom(Math.min(w/d.w,h/d.h));});$('zoomIn').addEventListener('click',()=>setZoom(state.zoom*1.15));$('zoomOut').addEventListener('click',()=>setZoom(state.zoom/1.15));
  $('applyTitleBtn').addEventListener('click',applyTitle);$('svgBtn').addEventListener('click',exportSvg);$('pngBtn').addEventListener('click',exportPng);$('printBtn').addEventListener('click',printDocument);$('addTextBtn').addEventListener('click',()=>selectTool('text'));
  $('objectColor').addEventListener('change',e=>{const o=state.objects.find(x=>x.id===state.selected);if(o){commit();o.color=e.target.value;renderAll();}});$('objectWidth').addEventListener('change',e=>{const o=state.objects.find(x=>x.id===state.selected);if(o){commit();o.width=clamp(Number(e.target.value)||.35,.05,3);renderAll();}});$('objectDash').addEventListener('change',e=>{const o=state.objects.find(x=>x.id===state.selected);if(o){commit();o.dash=e.target.value;renderAll();}});
  $('sheetSvg').addEventListener('pointerdown',onCanvasPointerDown);window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);$('sheetSvg').addEventListener('contextmenu',e=>e.preventDefault());
  drawingArea.addEventListener('wheel',e=>{e.preventDefault();setZoom(state.zoom*(e.deltaY<0?1.1:.9));},{passive:false});
  window.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){state.space=true;e.preventDefault();}if(e.key==='Delete'||e.key==='Backspace'){if(!['INPUT','TEXTAREA'].includes(document.activeElement.tagName))deleteSelected();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}if(e.key==='Escape'){state.firstPoint=null;previewLayer.innerHTML='';selectTool('select');}});
  window.addEventListener('keyup',e=>{if(e.code==='Space'){state.space=false;}});
  document.querySelectorAll('.panel-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.panel-tab').forEach(t=>t.classList.toggle('active',t===tab));$('toolsPanel').classList.toggle('hidden',tab.dataset.panel!=='tools');$('treePanel').classList.toggle('hidden',tab.dataset.panel!=='tree');}));
  $('helpBtn').addEventListener('click',()=>$('helpModal').classList.remove('hidden'));$('closeHelp').addEventListener('click',()=>$('helpModal').classList.add('hidden'));$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.add('hidden');});
  document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{const menu=btn.dataset.menu;if(menu==='file')saveProject();else if(menu==='edit')undo();else if(menu==='view')$('fitBtn').click();else if(menu==='insert')selectTool('text');else if(menu==='draw')selectTool('line');else if(menu==='format')$('applyTitleBtn').click();else $('helpBtn').click();}));

  // Start screen state.
  syncTitleInputs();renderTemplate();renderAll();updateZoom();selectTool('select');
})();
