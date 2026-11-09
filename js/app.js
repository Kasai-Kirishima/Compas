(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('sheetSvg'), drawingArea = $('drawingArea');
  const templateLayer = $('templateLayer'), geometryLayer = $('geometryLayer'), constructionLayer = $('constructionLayer'), annotationLayer = $('annotationLayer'), previewLayer = $('previewLayer');
  const annotationTypes = new Set(['text','dimension','leader','centerMark','roughness','tolerance','weld','table','section','techReq']);
  const constructionTypes = new Set(['construction','centerline']);
  const supportedTypes = new Set(['point','line','rect','circle','ellipse','arc','polyline','spline','text','dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','breakline','construction','centerline','section','techReq']);
  const state = {
    format:'A4P', tool:'select', objects:[], selectedIds:[], points:[], zoom:1.8, grid:false, snap:false,
    objectSnap:true, ortho:false, template:true, space:false, pan:null, drag:null, selectionRect:null,
    history:[], redo:[], clipboard:[],
    title:{title:'Наименование детали',code:'ЧЕРТЁЖ.001',material:'Материал не указан',scale:'1:1',sheet:'1',sheets:'1',company:'Учебный чертёж',liter:'У',mass:'—',developer:'',checker:'',technical:'',normative:'',approved:''},
    fileName:'Чертёж_1', dirty:false
  };
  const visible = {geometry:true,dimensions:true,construction:true,template:true};
  const deep = o => JSON.parse(JSON.stringify(o));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const mm = v => Number((Number(v)||0).toFixed(2));
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const layerFor = o => o.layer || (annotationTypes.has(o.type) ? 'annotation' : constructionTypes.has(o.type) ? 'construction' : 'geometry');
  const isAnnotation = o => layerFor(o) === 'annotation';

  function setMessage(message){ $('statusMessage').textContent = message; }
  function dimensions(){ return window.KompasTemplate.dimensions(state.format); }
  function gridStep(){ return clamp(Number($('gridStep')?.value)||5,.1,100); }
  function updateZoom(){ const d=dimensions(); svg.style.width=`${d.w*state.zoom}px`; svg.style.height=`${d.h*state.zoom}px`; $('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`; }
  function setZoom(z){ state.zoom=clamp(z,.25,6); updateZoom(); }
  function templateData(){ return state.title; }
  function renderTemplate(){
    const d=dimensions(); svg.setAttribute('viewBox',`0 0 ${d.w} ${d.h}`);
    $('paperRect').setAttribute('width',d.w); $('paperRect').setAttribute('height',d.h);
    $('gridRect').setAttribute('width',d.w); $('gridRect').setAttribute('height',d.h);
    window.KompasTemplate.render(templateLayer,state.format,templateData());
    templateLayer.style.display=(state.template&&visible.template)?'':'none';
    $('docName').textContent=state.fileName.replaceAll('_',' ');
    const formatLabel=state.format.replace(/[PL]$/,'');
    document.querySelector('.doc-meta').textContent=`${formatLabel} · ${state.title.scale||'1:1'} · мм`;
    updateZoom();
  }
  function svgEl(name,attrs={}){ const el=document.createElementNS(NS,name); Object.entries(attrs).forEach(([k,v])=>{if(v!==undefined&&v!==null)el.setAttribute(k,String(v));}); return el; }
  function add(parent,name,attrs){ const el=svgEl(name,attrs); parent.appendChild(el); return el; }
  function objectLayer(o){ const l=layerFor(o); return l==='annotation'?annotationLayer:l==='construction'?constructionLayer:geometryLayer; }
  function applyStyle(el,o,selected=false){
    el.setAttribute('stroke',selected?'#078db2':(o.color||'#20252a'));
    el.setAttribute('stroke-width',selected?Math.max(.55,(o.width||.35)*1.8):(o.width||.35));
    el.setAttribute('fill',o.fill||'none'); el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round');
    if(o.dash) el.setAttribute('stroke-dasharray',o.dash);
  }
  function arrow(g,x,y,ux,uy,color,size=1.6){
    const nx=-uy,ny=ux,w=size*.32;
    add(g,'path',{d:`M ${x} ${y} l ${-ux*size+nx*w} ${-uy*size+ny*w} l ${-ux*size-nx*w} ${-uy*size-ny*w} z`,fill:color,stroke:'none'});
  }
  function addText(g,x,y,text,size=2.8,color='#20252a',anchor='middle',rotate=0,extra={}){
    const el=add(g,'text',{x,y,'font-family':'Arial,sans-serif','font-size':size,'text-anchor':anchor,fill:color,stroke:'none',transform:rotate?`rotate(${rotate} ${x} ${y})`:null,'font-weight':extra.weight||null,'font-style':extra.italic?'italic':null});
    el.textContent=String(text??''); return el;
  }
  function renderDimension(g,o,selected){
    const color=selected?'#078db2':(o.color||'#20252a'), kind=o.kind||'linear';
    if(kind==='radius'||kind==='diameter'){
      const cx=o.x,cy=o.y,dx=o.x2-cx,dy=o.y2-cy,r=Math.hypot(dx,dy)||1,ux=dx/r,uy=dy/r;
      const x1=kind==='diameter'?cx-ux*r:cx, y1=kind==='diameter'?cy-uy*r:cy;
      const x2=kind==='diameter'?cx+ux*r:o.x2, y2=kind==='diameter'?cy+uy*r:o.y2;
      add(g,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':.25});
      arrow(g,kind==='diameter'?x1:x2,kind==='diameter'?y1:y2,kind==='diameter'?-ux:ux,kind==='diameter'?-uy:uy,color,1.5);
      if(kind==='diameter') arrow(g,x2,y2,ux,uy,color,1.5);
      addText(g,(x1+x2)/2+(-uy)*2,(y1+y2)/2+ux*2,`${kind==='diameter'?'Ø':'R'}${o.label||r.toFixed(1)}`,2.8,color);
      return;
    }
    if(kind==='angular'){
      const vx=o.x,vy=o.y,a1=Math.atan2(o.y2-vy,o.x2-vx),a2=Math.atan2(o.y3-vy,o.x3-vx),rad=o.radius||12;
      let delta=a2-a1; while(delta<0)delta+=Math.PI*2; while(delta>=Math.PI*2)delta-=Math.PI*2;
      const p1={x:vx+Math.cos(a1)*rad,y:vy+Math.sin(a1)*rad},p2={x:vx+Math.cos(a1+delta)*rad,y:vy+Math.sin(a1+delta)*rad};
      add(g,'line',{x1:vx,y1:vy,x2:vx+Math.cos(a1)*(rad+3),y2:vy+Math.sin(a1)*(rad+3),stroke:color,'stroke-width':.18});
      add(g,'line',{x1:vx,y1:vy,x2:vx+Math.cos(a2)*(rad+3),y2:vy+Math.sin(a2)*(rad+3),stroke:color,'stroke-width':.18});
      add(g,'path',{d:`M ${p1.x} ${p1.y} A ${rad} ${rad} 0 ${delta>Math.PI?1:0} 1 ${p2.x} ${p2.y}`,fill:'none',stroke:color,'stroke-width':.25});
      const deg=delta*180/Math.PI; addText(g,vx+Math.cos(a1+delta/2)*(rad+3),vy+Math.sin(a1+delta/2)*(rad+3),o.label||`${deg.toFixed(1)}°`,2.8,color);
      return;
    }
    const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    const off=o.offset??5;let ax,ay,bx,by,tx,ty,value;
    if(kind==='horizontal'){
      const dimY=Math.max(o.y,o.y2)+off;ax=o.x;bx=o.x2;ay=by=dimY;tx=1;ty=0;value=Math.abs(dx);
    } else if(kind==='vertical'){
      const dimX=Math.max(o.x,o.x2)+off;ay=o.y;by=o.y2;ax=bx=dimX;tx=0;ty=1;value=Math.abs(dy);
    } else {
      const nx=-uy,ny=ux;ax=o.x+nx*off;ay=o.y+ny*off;bx=o.x2+nx*off;by=o.y2+ny*off;tx=ux;ty=uy;value=len;
    }
    add(g,'line',{x1:o.x,y1:o.y,x2:ax,y2:ay,stroke:color,'stroke-width':.18});
    add(g,'line',{x1:o.x2,y1:o.y2,x2:bx,y2:by,stroke:color,'stroke-width':.18});
    add(g,'line',{x1:ax,y1:ay,x2:bx,y2:by,stroke:color,'stroke-width':.25});
    arrow(g,ax,ay,tx,ty,color,1.5); arrow(g,bx,by,-tx,-ty,color,1.5);
    addText(g,(ax+bx)/2,(ay+by)/2-1.3,o.label||value.toFixed(1),2.8,color);
  }
  function renderObject(o){
    const layer=layerFor(o); if((layer==='geometry'&&!visible.geometry)||(layer==='annotation'&&!visible.dimensions)||(layer==='construction'&&!visible.construction))return;
    const g=add(objectLayer(o),'g',{'data-id':o.id,'class':'drawing-object'}), selected=state.selectedIds.includes(o.id);
    const bHit=objectBounds(o);if(bHit){add(g,'rect',{x:bHit.x-1.5,y:bHit.y-1.5,width:Math.max(3,bHit.w+3),height:Math.max(3,bHit.h+3),fill:'transparent',stroke:'none','pointer-events':'all','data-hit-area':'true'});}
    const c=selected?'#078db2':(o.color||'#20252a');
    if(o.type==='point'){add(g,'circle',{cx:o.x,cy:o.y,r:o.size||.6,fill:c,stroke:'none'});add(g,'line',{x1:o.x-1.5,y1:o.y,x2:o.x+1.5,y2:o.y,stroke:c,'stroke-width':.2});add(g,'line',{x1:o.x,y1:o.y-1.5,x2:o.x,y2:o.y+1.5,stroke:c,'stroke-width':.2});
    } else if(o.type==='line'||o.type==='construction'||o.type==='centerline'){
      const el=add(g,'line',{x1:o.x,y1:o.y,x2:o.x2,y2:o.y2});
      applyStyle(el,{...o,dash:o.dash||(o.type==='construction'?'3 2':o.type==='centerline'?'8 1.5 1.5 1':''),color:o.color||(o.type==='construction'?'#8c969d':c)},selected);
    } else if(o.type==='rect'){
      const x=Math.min(o.x,o.x2),y=Math.min(o.y,o.y2),w=Math.abs(o.x2-o.x),h=Math.abs(o.y2-o.y),el=add(g,'rect',{x,y,width:w,height:h,rx:o.rx||0});applyStyle(el,o,selected);
    } else if(o.type==='circle'){
      const el=add(g,'circle',{cx:o.x,cy:o.y,r:Math.hypot(o.x2-o.x,o.y2-o.y)});applyStyle(el,o,selected);
    } else if(o.type==='ellipse'){
      const el=add(g,'ellipse',{cx:(o.x+o.x2)/2,cy:(o.y+o.y2)/2,rx:Math.abs(o.x2-o.x)/2,ry:Math.abs(o.y2-o.y)/2});applyStyle(el,o,selected);
    } else if(o.type==='arc'){
      const a1=o.start,a2=o.end,delta=((a2-a1)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),r=o.r||1;
      const p1={x:o.x+Math.cos(a1)*r,y:o.y+Math.sin(a1)*r},p2={x:o.x+Math.cos(a2)*r,y:o.y+Math.sin(a2)*r};
      const el=add(g,'path',{d:`M ${p1.x} ${p1.y} A ${r} ${r} 0 ${delta>Math.PI?1:0} 1 ${p2.x} ${p2.y}`});applyStyle(el,o,selected);
    } else if(o.type==='polyline'||o.type==='spline'||o.type==='breakline'){
      const pts=o.points||[]; if(pts.length<2)return;
      let d=`M ${pts[0].x} ${pts[0].y}`;
      if(o.type==='spline'&&pts.length>2){for(let i=1;i<pts.length-1;i++){const mid={x:(pts[i].x+pts[i+1].x)/2,y:(pts[i].y+pts[i+1].y)/2};d+=` Q ${pts[i].x} ${pts[i].y} ${mid.x} ${mid.y}`;}const last=pts[pts.length-1];d+=` T ${last.x} ${last.y}`;}
      else if(o.type==='breakline'&&pts.length===2){const a=pts[0],b=pts[1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;const count=8,amp=Math.min(1.4,len/12);for(let i=1;i<=count;i++){const t=i/count,v=(i%2?1:-1)*amp;d+=` L ${a.x+dx*t+nx*v} ${a.y+dy*t+ny*v}`;}}
      else {pts.slice(1).forEach(p=>d+=` L ${p.x} ${p.y}`);}
      if(o.closed)d+=' Z';const el=add(g,'path',{d});applyStyle(el,o,selected);
    } else if(o.type==='text'||o.type==='techReq'){
      const t=add(g,'text',{x:o.x,y:o.y,'font-family':o.font||'Arial,sans-serif','font-size':o.size||4,fill:c,stroke:'none',transform:o.rotation?`rotate(${o.rotation} ${o.x} ${o.y})`:null,'font-weight':o.bold?'bold':'normal','font-style':o.italic?'italic':'normal'});
      String(o.text||'Текст').split('\n').forEach((line,i)=>{const sp=add(t,'tspan',{x:o.x,dy:i===0?0:(o.lineHeight||4)});sp.textContent=line;});
    } else if(o.type==='dimension') renderDimension(g,o,selected);
    else if(o.type==='section'){
      const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1;
      add(g,'line',{x1:o.x,y1:o.y,x2:o.x2,y2:o.y2,stroke:c,'stroke-width':.3});
      arrow(g,o.x,o.y,-dx/len,-dy/len,c,2.2);arrow(g,o.x2,o.y2,dx/len,dy/len,c,2.2);
      addText(g,o.x-2,o.y-2,o.label||'А',3,c);addText(g,o.x2+2,o.y2-2,o.label||'А',3,c);
    } else if(o.type==='leader'){
      const pts=o.points||[];if(pts.length>=2){const d=pts.map((p,i)=>(i?'L':'M')+` ${p.x} ${p.y}`).join(' ');add(g,'path',{d,fill:'none',stroke:c,'stroke-width':.25});const a=pts[0],b=pts[1],len=Math.hypot(b.x-a.x,b.y-a.y)||1;arrow(g,a.x,a.y,(b.x-a.x)/len,(b.y-a.y)/len,c,1.8);const end=pts[pts.length-1];add(g,'line',{x1:end.x,y1:end.y,x2:end.x+12,y2:end.y,stroke:c,'stroke-width':.2});addText(g,end.x+1,end.y-1,o.text||'Примечание',2.5,c,'start');}
    } else if(o.type==='centerMark'){
      const s=o.size||5;add(g,'line',{x1:o.x-s,y1:o.y,x2:o.x+s,y2:o.y,stroke:c,'stroke-width':.22});add(g,'line',{x1:o.x,y1:o.y-s,x2:o.x,y2:o.y+s,stroke:c,'stroke-width':.22});
    } else if(o.type==='hatch'){
      const x=Math.min(o.x,o.x2),y=Math.min(o.y,o.y2),w=Math.abs(o.x2-o.x),h=Math.abs(o.y2-o.y),pid=`pat_${String(o.id).replace(/[^a-z0-9]/gi,'')}`;
      if(o.pattern==='solid')add(g,'rect',{x,y,width:w,height:h,fill:c,'fill-opacity':.14,stroke:c,'stroke-width':.2});
      else {const spacing=Math.max(.5,o.spacing||4),defs=add(g,'defs',{}),pat=add(defs,'pattern',{id:pid,width:spacing,height:spacing,patternUnits:'userSpaceOnUse',patternTransform:`rotate(${o.angle??45})`});add(pat,'path',{d:`M 0 0 L 0 ${spacing}`,stroke:c,'stroke-width':o.width||.2});if(o.pattern==='cross')add(pat,'path',{d:`M 0 0 L ${spacing} 0`,stroke:c,'stroke-width':o.width||.2});add(g,'rect',{x,y,width:w,height:h,fill:`url(#${pid})`,stroke:c,'stroke-width':.2});}
    } else if(o.type==='roughness'){
      const s=o.size||5;add(g,'path',{d:`M ${o.x-s*.45} ${o.y+s*.25} L ${o.x} ${o.y-s*.45} L ${o.x+s*.45} ${o.y+s*.25} L ${o.x+s*1.8} ${o.y+s*.25}`,fill:'none',stroke:c,'stroke-width':.3});if(o.label)addText(g,o.x+s*.8,o.y-s*.5,o.label,2.2,c,'middle');
    } else if(o.type==='tolerance'){
      const w=Math.max(16,(o.text||'⌀0.05 | A').length*2.6+4),h=6;add(g,'rect',{x:o.x,y:o.y-h,width:w,height:h,fill:'none',stroke:c,'stroke-width':.25});addText(g,o.x+w/2,o.y-2,o.text||'⌀0.05 | A',2.5,c);
    } else if(o.type==='weld'){
      add(g,'line',{x1:o.x,y1:o.y,x2:o.x+18,y2:o.y,stroke:c,'stroke-width':.25});add(g,'path',{d:`M ${o.x+5} ${o.y} L ${o.x+9} ${o.y-5} L ${o.x+13} ${o.y} Z`,fill:'none',stroke:c,'stroke-width':.25});addText(g,o.x+19,o.y-1,o.text||'a4',2.3,c,'start');
    } else if(o.type==='table'){
      const rows=o.rows||3,cols=o.cols||3,w=o.w||60,h=o.h||25,x=o.x,y=o.y;add(g,'rect',{x,y,width:w,height:h,fill:'none',stroke:c,'stroke-width':.25});for(let i=1;i<cols;i++)add(g,'line',{x1:x+w*i/cols,y1:y,x2:x+w*i/cols,y2:y+h,stroke:c,'stroke-width':.2});for(let i=1;i<rows;i++)add(g,'line',{x1:x,y1:y+h*i/rows,x2:x+w,y2:y+h*i/rows,stroke:c,'stroke-width':.2});(o.cells||[]).forEach((v,i)=>{if(v)addText(g,x+w*((i%cols)+.5)/cols,y+h*(Math.floor(i/cols)+.65)/rows,v,2,c);});
    }
    if(selected){const b=objectBounds(o);if(b){const box=add(g,'rect',{x:b.x-1.5,y:b.y-1.5,width:Math.max(3,b.w+3),height:Math.max(3,b.h+3),fill:'none',stroke:'#078db2','stroke-width':.3,'stroke-dasharray':'1.2 1'});box.setAttribute('pointer-events','none');}}
  }
  function objectBounds(o){
    let pts=[];
    if(o.points)pts=o.points;
    else if(o.type==='arc'){const r=o.r||1;pts=[{x:o.x-r,y:o.y-r},{x:o.x+r,y:o.y+r}];}
    else if(o.type==='dimension'&&o.kind==='angular')pts=[{x:o.x,y:o.y},{x:o.x2,y:o.y2},{x:o.x3,y:o.y3}];
    else if(o.type==='text'||o.type==='techReq')return{x:o.x,y:o.y-(o.size||4),w:Math.max(5,(o.text||'').length*(o.size||4)*.55),h:Math.max(o.size||4,String(o.text||'').split('\n').length*(o.lineHeight||4))};
    else if(o.type==='point')return{x:o.x-1.5,y:o.y-1.5,w:3,h:3};
    else if(o.type==='circle'){const r=Math.hypot(o.x2-o.x,o.y2-o.y);return{x:o.x-r,y:o.y-r,w:r*2,h:r*2};}
    else if(o.type==='table')return{x:o.x,y:o.y,w:o.w||60,h:o.h||25};
    else if(o.type==='ellipse')return{x:Math.min(o.x,o.x2),y:Math.min(o.y,o.y2),w:Math.abs(o.x2-o.x),h:Math.abs(o.y2-o.y)};
    else pts=[{x:o.x,y:o.y},{x:o.x2??o.x,y:o.y2??o.y}];
    if(!pts.length)return null;const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  function renderTree(){const el=$('objectTree');el.innerHTML='';state.objects.forEach((o,i)=>{const b=document.createElement('button');b.className='tree-object'+(state.selectedIds.includes(o.id)?' selected':'');b.textContent=`${i+1}. ${o.name||({point:'Точка',section:'Линия разреза',techReq:'Тех. требования',line:'Отрезок',rect:'Прямоугольник',circle:'Окружность',ellipse:'Эллипс',arc:'Дуга',polyline:'Ломаная',spline:'Сплайн',text:'Текст',dimension:'Размер',leader:'Выноска',hatch:'Штриховка',centerMark:'Обозначение центра',roughness:'Шероховатость',tolerance:'Допуск',weld:'Сварка',table:'Таблица',breakline:'Линия обрыва',construction:'Вспомогательная линия',centerline:'Осевая линия'}[o.type]||o.type)}`;b.addEventListener('click',()=>{state.selectedIds=[o.id];renderAll();});el.appendChild(b);});}
  function renderAll(){geometryLayer.innerHTML='';constructionLayer.innerHTML='';annotationLayer.innerHTML='';previewLayer.innerHTML='';state.objects.forEach(renderObject);$('geometryCount').textContent=state.objects.filter(o=>layerFor(o)==='geometry').length;$('annotationCount').textContent=state.objects.filter(o=>layerFor(o)==='annotation').length;$('constructionCount').textContent=state.objects.filter(o=>layerFor(o)==='construction').length;$('selectedStatus').textContent=state.selectedIds.length;renderTree();updateSelectionPanel();}
  function updateSelectionPanel(){
    const arr=state.objects.filter(o=>state.selectedIds.includes(o.id)),o=arr.length===1?arr[0]:null;
    $('noSelection').classList.toggle('hidden',arr.length>0);$('selectionFields').classList.toggle('hidden',arr.length===0);
    if(arr.length>1)$('noSelection').textContent=`Выбрано объектов: ${arr.length}`;
    else $('noSelection').textContent='Объект не выбран';
    if(o){$('objectColor').value=o.color||'#20252a';$('objectWidth').value=o.width||.35;$('objectDash').value=o.dash||'';$('objectLayer').value=layerFor(o);$('objectName').value=o.name||'';$('objectTextSize').value=o.size||o.textSize||3;}
  }
  function snapshot(){return{format:state.format,objects:deep(state.objects),title:deep(state.title),fileName:state.fileName};}
  function persistAutosave(){try{localStorage.setItem('kompasOnlineAutosave',JSON.stringify(snapshot()));}catch(e){setMessage('Автосохранение недоступно: память браузера заполнена или отключена');}}
  function commit(){state.history.push(snapshot());if(state.history.length>100)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';Promise.resolve().then(persistAutosave);}
  function restore(s){state.format=s.format;state.objects=deep(s.objects);state.title=deep(s.title);state.fileName=s.fileName;state.selectedIds=[];syncTitleInputs();$('paperFormat').value=state.format;renderTemplate();renderAll();}
  function undo(){if(!state.history.length){setMessage('Нет действий для отмены');return;}state.redo.push(snapshot());restore(state.history.pop());state.dirty=true;persistAutosave();setMessage('Действие отменено');}
  function redo(){if(!state.redo.length){setMessage('Нет действий для повтора');return;}state.history.push(snapshot());restore(state.redo.pop());state.dirty=true;persistAutosave();setMessage('Действие повторено');}
  function addObject(o){o.id=`obj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;o.name=o.name||'';o.color=o.color||(o.type==='construction'?'#8c969d':o.type==='dimension'?'#20252a':'#20252a');o.width=o.width||.35;o.layer=o.layer|| (annotationTypes.has(o.type)?'annotation':constructionTypes.has(o.type)?'construction':'geometry');state.objects.push(o);state.selectedIds=[o.id];commit();renderAll();setMessage('Объект добавлен');}
  function selectTool(tool){state.tool=tool;state.points=[];previewLayer.innerHTML='';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const names={select:'Выбор: щелчок — объект, Shift — добавить, рамка — выделить область',line:'Отрезок: укажите две точки',construction:'Вспомогательная прямая: две точки',centerline:'Осевая линия: две точки',point:'Точка: щёлкните по листу',section:'Обозначение разреза: две точки линии сечения',techReq:'Технические требования: точка вставки и многострочный текст',polyline:'Ломаная: точки; двойной щелчок или Enter — завершить',spline:'Сплайн: точки; двойной щелчок или Enter — завершить',rect:'Прямоугольник: два противоположных угла',roundRect:'Скруглённый прямоугольник: два угла; радиус задаётся параметром',circle:'Окружность: центр и радиус',arc:'Дуга: центр, начало, конец',ellipse:'Эллипс: два угла габаритной рамки',polygon:'Многоугольник: центр и радиус',breakline:'Линия обрыва: две точки',dimAuto:'Авторазмер: две точки; тип определяется направлением',dimension:'Линейный размер: две точки',dimH:'Горизонтальный размер: две точки',dimV:'Вертикальный размер: две точки',dimRad:'Радиальный размер: центр и точка на окружности',dimDia:'Диаметральный размер: центр и точка на окружности',dimAngle:'Угловой размер: вершина и две точки на сторонах угла',measure:'Измерение: две точки',text:'Текст: щёлкните на листе',leader:'Выноска: точка объекта, излом, конец текста',centerMark:'Обозначение центра: щёлкните по центру',hatch:'Штриховка прямоугольной области: два угла',roughness:'Шероховатость: точка размещения',tolerance:'Допуск формы: точка размещения',weld:'Обозначение сварки: точка размещения',table:'Таблица: точка вставки'};setMessage(names[tool]||'Готово');$('canvasHint').textContent=names[tool]||'Выберите инструмент';$('canvasHint').classList.toggle('hide',tool==='select');}
  function snapToObjects(p){if(!state.objectSnap)return p;const candidates=[];for(const o of state.objects){if(o.points){o.points.forEach(q=>candidates.push(q));}else if(o.type==='circle'){candidates.push({x:o.x,y:o.y});candidates.push({x:(o.x+o.x2)/2,y:(o.y+o.y2)/2});}else if(o.type==='rect'||o.type==='line'||o.type==='construction'||o.type==='centerline'){const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2};candidates.push(a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});}else if(o.type==='ellipse'){candidates.push({x:(o.x+o.x2)/2,y:(o.y+o.y2)/2});}}
    let best=null,dist=2.1;candidates.forEach(q=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<dist){dist=d;best=q;}});return best?{x:mm(best.x),y:mm(best.y)}:p;}
  function pointFromEvent(e,raw=false){const r=svg.getBoundingClientRect(),d=dimensions();let x=(e.clientX-r.left)/r.width*d.w,y=(e.clientY-r.top)/r.height*d.h;const step=gridStep();if(state.snap){x=Math.round(x/step)*step;y=Math.round(y/step)*step;}if(state.ortho&&state.points.length){const a=state.points[state.points.length-1];if(Math.abs(x-a.x)>=Math.abs(y-a.y))y=a.y;else x=a.x;}const p={x:mm(x),y:mm(y)};return raw?p:snapToObjects(p);}
  function drawPreview(p){previewLayer.innerHTML='';const pts=state.points;if(state.tool==='select'&&state.selectionRect){const r=state.selectionRect;add(previewLayer,'rect',{x:Math.min(r.start.x,p.x),y:Math.min(r.start.y,p.y),width:Math.abs(p.x-r.start.x),height:Math.abs(p.y-r.start.y),fill:'#0b91b4','fill-opacity':.08,stroke:'#078db2','stroke-width':.25,'stroke-dasharray':'1 1'});return;}if(!pts.length)return;const a=pts[0];let el;
    if(['line','construction','centerline','rect','roundRect','circle','ellipse','dimension','dimAuto','dimH','dimV','dimRad','dimDia','breakline','hatch'].includes(state.tool)){if(state.tool==='rect'||state.tool==='roundRect'||state.tool==='hatch')el=add(previewLayer,'rect',{x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y),rx:state.tool==='roundRect'?Number($('roundingRadius').value)||0:0});else if(state.tool==='circle')el=add(previewLayer,'circle',{cx:a.x,cy:a.y,r:Math.hypot(p.x-a.x,p.y-a.y)});else if(state.tool==='ellipse')el=add(previewLayer,'ellipse',{cx:(a.x+p.x)/2,cy:(a.y+p.y)/2,rx:Math.abs(p.x-a.x)/2,ry:Math.abs(p.y-a.y)/2});else el=add(previewLayer,'line',{x1:a.x,y1:a.y,x2:p.x,y2:p.y});}
    else if(state.tool==='polyline'||state.tool==='spline'||state.tool==='leader'){const all=[...pts,p],d=all.map((q,i)=>(i?'L':'M')+` ${q.x} ${q.y}`).join(' ');el=add(previewLayer,'path',{d});}
    else if(state.tool==='polygon'){el=add(previewLayer,'circle',{cx:a.x,cy:a.y,r:Math.hypot(p.x-a.x,p.y-a.y)});}
    else if(state.tool==='arc'&&pts.length>=2){const center=pts[0],start=pts[1],r=Math.hypot(start.x-center.x,start.y-center.y),sa=Math.atan2(start.y-center.y,start.x-center.x),ea=Math.atan2(p.y-center.y,p.x-center.x);const s={x:center.x+Math.cos(sa)*r,y:center.y+Math.sin(sa)*r},e={x:center.x+Math.cos(ea)*r,y:center.y+Math.sin(ea)*r},delta=(ea-sa+Math.PI*2)%(Math.PI*2);el=add(previewLayer,'path',{d:`M ${s.x} ${s.y} A ${r} ${r} 0 ${delta>Math.PI?1:0} 1 ${e.x} ${e.y}`});}
    if(el){el.setAttribute('fill','none');el.setAttribute('stroke','#078db2');el.setAttribute('stroke-width','.45');el.setAttribute('stroke-dasharray','1.5 1');}
  }
  function translateObject(o,dx,dy){['x','x2','x3'].forEach(k=>{if(o[k]!==undefined)o[k]=mm(o[k]+dx);});['y','y2','y3'].forEach(k=>{if(o[k]!==undefined)o[k]=mm(o[k]+dy);});if(o.points)o.points=o.points.map(p=>({x:mm(p.x+dx),y:mm(p.y+dy)}));}
  function getSelected(){return state.objects.filter(o=>state.selectedIds.includes(o.id));}
  function newId(){return`obj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;}
  function deleteSelected(){if(!state.selectedIds.length){setMessage('Сначала выберите объект');return;}commit();state.objects=state.objects.filter(o=>!state.selectedIds.includes(o.id));state.selectedIds=[];renderAll();setMessage('Выбранные объекты удалены');}
  function selectByPoint(p){
    if(state.tool==='split'||state.tool==='trim'){const o=state.objects.find(x=>state.selectedIds.includes(x.id));if(!o||o.type!=='line'){setMessage('Выберите один отрезок для операции');return;}if(state.tool==='split')splitLineAt(o,p);else trimLineAt(o,p);return;}
    const target=state.lastTarget; if(!target)return;
  }
  function onCanvasPointerDown(e){
    if(e.button===1||state.space){e.preventDefault();state.pan={x:e.clientX,y:e.clientY,left:drawingArea.scrollLeft,top:drawingArea.scrollTop};drawingArea.classList.add('dragging');return;}
    const target=e.target.closest('[data-id]');
    if(state.tool==='select'){
      if(target){const id=target.getAttribute('data-id');if(e.shiftKey){state.selectedIds=state.selectedIds.includes(id)?state.selectedIds.filter(x=>x!==id):[...state.selectedIds,id];}else if(!state.selectedIds.includes(id))state.selectedIds=[id];renderAll();const objs=getSelected();state.drag={ids:objs.map(o=>o.id),start:pointFromEvent(e),originals:deep(objs),historyBefore:snapshot(),moved:false};}
      else{if(!e.shiftKey)state.selectedIds=[];state.selectionRect={start:pointFromEvent(e,true),current:pointFromEvent(e,true),initial:[...state.selectedIds]};renderAll();}return;
    }
    const p=pointFromEvent(e);if(state.tool==='point'){addObject({type:'point',x:p.x,y:p.y,size:.7});return;}
    if(state.tool==='techReq'){const value=prompt('Технические требования (каждая строка — отдельный пункт):','1. Неуказанные радиусы 2 мм.\n2. Острые кромки притупить.');if(value!==null&&value.trim())addObject({type:'techReq',x:p.x,y:p.y,text:value,size:clamp(Number($('defaultTextSize').value)||3,.5,50),lineHeight:4,layer:'annotation'});return;}
    if(state.tool==='text'||state.tool==='roughness'||state.tool==='tolerance'||state.tool==='weld'||state.tool==='centerMark'||state.tool==='table'){
      if(state.tool==='text'){const value=prompt('Текст надписи:','Текст');if(value!==null&&value.trim())addObject({type:'text',x:p.x,y:p.y,text:value.trim(),size:clamp(Number($('defaultTextSize').value)||4,.5,50),layer:'annotation'});}
      if(state.tool==='roughness'){const value=prompt('Обозначение шероховатости:','Ra 3,2');if(value!==null)addObject({type:'roughness',x:p.x,y:p.y,label:value,size:5,layer:'annotation'});}
      if(state.tool==='tolerance'){const value=prompt('Значение допуска (например ⌀0.05 | A):','⌀0.05 | A');if(value!==null)addObject({type:'tolerance',x:p.x,y:p.y,text:value,layer:'annotation'});}
      if(state.tool==='weld'){const value=prompt('Параметр сварного шва:','a4');if(value!==null)addObject({type:'weld',x:p.x,y:p.y,text:value,layer:'annotation'});}
      if(state.tool==='centerMark')addObject({type:'centerMark',x:p.x,y:p.y,size:5,layer:'annotation'});
      if(state.tool==='table'){const rows=clamp(Number(prompt('Количество строк:','3'))||3,1,20),cols=clamp(Number(prompt('Количество столбцов:','3'))||3,1,12);addObject({type:'table',x:p.x,y:p.y,rows,cols,w:60,h:Math.max(10,rows*7),cells:Array(rows*cols).fill(''),layer:'annotation'});}
      return;
    }
    if(state.tool==='measure'){
      if(!state.points.length){state.points=[p];setMessage('Укажите вторую точку для измерения');}else{const a=state.points[0],len=Math.hypot(p.x-a.x,p.y-a.y);state.points=[];previewLayer.innerHTML='';setMessage(`Расстояние: ${len.toFixed(2)} мм · ΔX ${(p.x-a.x).toFixed(2)} мм · ΔY ${(p.y-a.y).toFixed(2)} мм`);}return;
    }
    if(state.tool==='polyline'||state.tool==='spline'){
      state.points.push(p);drawPreview(p);setMessage(`Точек: ${state.points.length}. Двойной щелчок или Enter — завершить`);return;
    }
    if(state.tool==='leader'){
      state.points.push(p);if(state.points.length<3){setMessage(`Точка ${state.points.length+1} выноски`);return;}const label=prompt('Текст выноски:','Примечание')||'';if(label)addObject({type:'leader',points:deep(state.points),text:label,layer:'annotation'});state.points=[];previewLayer.innerHTML='';return;
    }
    if(state.tool==='arc'){
      state.points.push(p);if(state.points.length<3){setMessage(['Укажите центр дуги','Укажите начальную точку дуги','Укажите конечную точку дуги'][state.points.length]);return;}const [c,s,t]=state.points,r=Math.hypot(s.x-c.x,s.y-c.y);if(r>.1)addObject({type:'arc',x:c.x,y:c.y,r,start:Math.atan2(s.y-c.y,s.x-c.x),end:Math.atan2(t.y-c.y,t.x-c.x),layer:'geometry'});state.points=[];return;
    }
    if(state.tool==='dimAngle'){
      state.points.push(p);if(state.points.length<3){setMessage(`Точка ${state.points.length+1} углового размера`);return;}const [v,a,b]=state.points;addObject({type:'dimension',kind:'angular',x:v.x,y:v.y,x2:a.x,y2:a.y,x3:b.x,y3:b.y,radius:12,layer:'annotation'});state.points=[];return;
    }
    if(state.tool==='polygon'){
      state.points.push(p);if(state.points.length<2){setMessage('Укажите радиус многоугольника');return;}const [c,rp]=state.points,r=Math.hypot(rp.x-c.x,rp.y-c.y),n=clamp(Number($('polygonSides').value)||6,3,24),a0=Math.atan2(rp.y-c.y,rp.x-c.x),pts=Array.from({length:n},(_,i)=>({x:mm(c.x+Math.cos(a0+i*2*Math.PI/n)*r),y:mm(c.y+Math.sin(a0+i*2*Math.PI/n)*r)}));addObject({type:'polyline',points:pts,closed:true,layer:'geometry'});state.points=[];return;
    }
    if(state.tool==='split'||state.tool==='trim'){
      const o=state.objects.find(x=>state.selectedIds.includes(x.id));if(!o||o.type!=='line'){setMessage('Сначала выберите отрезок');return;}if(state.tool==='split')splitLineAt(o,p);else trimLineAt(o,p);return;
    }
    if(!state.points.length){state.points=[p];setMessage('Укажите вторую точку');return;}
    const a=state.points[0];state.points=[];previewLayer.innerHTML='';const len=Math.hypot(p.x-a.x,p.y-a.y);if(len<.05)return;
    if(state.tool==='line')addObject({type:'line',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='construction')addObject({type:'construction',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'construction',dash:'3 2'});
    else if(state.tool==='centerline')addObject({type:'centerline',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'construction',dash:'8 1.5 1.5 1'});
    else if(state.tool==='rect')addObject({type:'rect',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='roundRect')addObject({type:'rect',x:a.x,y:a.y,x2:p.x,y2:p.y,rx:clamp(Number($('roundingRadius').value)||0,0,Math.min(Math.abs(p.x-a.x),Math.abs(p.y-a.y))/2)});
    else if(state.tool==='circle')addObject({type:'circle',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='ellipse')addObject({type:'ellipse',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='breakline')addObject({type:'breakline',points:[a,p]});
    else if(state.tool==='section')addObject({type:'section',x:a.x,y:a.y,x2:p.x,y2:p.y,label:'А',layer:'annotation'});
    else if(state.tool==='hatch')addObject({type:'hatch',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'annotation',spacing:clamp(Number($('hatchSpacing').value)||4,.5,100),angle:Number($('hatchAngle').value)||45,pattern:$('hatchPattern').value});
    else if(['dimension','dimAuto','dimH','dimV','dimRad','dimDia'].includes(state.tool)){
      const kind=state.tool==='dimAuto'?(Math.abs(p.x-a.x)>=Math.abs(p.y-a.y)*2?'horizontal':Math.abs(p.y-a.y)>=Math.abs(p.x-a.x)*2?'vertical':'linear'):state.tool==='dimH'?'horizontal':state.tool==='dimV'?'vertical':state.tool==='dimRad'?'radius':state.tool==='dimDia'?'diameter':'linear';
      addObject({type:'dimension',kind,x:a.x,y:a.y,x2:p.x,y2:p.y,offset:clamp(Number($('dimensionOffset').value)||5,-100,100),layer:'annotation'});
    }
  }
  function finishPath(){if((state.tool==='polyline'||state.tool==='spline')&&state.points.length>=2){addObject({type:state.tool==='spline'?'spline':'polyline',points:deep(state.points),closed:false});state.points=[];previewLayer.innerHTML='';}else if(state.tool==='polyline'||state.tool==='spline'){state.points=[];previewLayer.innerHTML='';setMessage('Нужно минимум две точки');}}
  function onPointerMove(e){const raw=pointFromEvent(e,true),p=pointFromEvent(e);$('coordinates').textContent=`X: ${p.x.toFixed(2)} · Y: ${p.y.toFixed(2)} мм`;
    if(state.pan){drawingArea.scrollLeft=state.pan.left-(e.clientX-state.pan.x);drawingArea.scrollTop=state.pan.top-(e.clientY-state.pan.y);return;}
    if(state.drag){const dx=p.x-state.drag.start.x,dy=p.y-state.drag.start.y;if(Math.abs(dx)+Math.abs(dy)>.03){state.drag.moved=true;state.drag.ids.forEach((id,i)=>{const o=state.objects.find(x=>x.id===id);if(o){Object.assign(o,deep(state.drag.originals[i]));translateObject(o,dx,dy);}});renderAll();}return;}
    if(state.selectionRect){state.selectionRect.current=raw;drawPreview(raw);return;}
    if(state.points.length)drawPreview(p);
  }
  function onPointerUp(){if(state.pan){state.pan=null;drawingArea.classList.remove('dragging');}if(state.drag){if(state.drag.moved){state.history.push(state.drag.historyBefore);if(state.history.length>100)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';try{localStorage.setItem('kompasOnlineAutosave',JSON.stringify(snapshot()));}catch(e){}setMessage('Объекты перемещены');}state.drag=null;}if(state.selectionRect){const r=state.selectionRect,a=r.start,b=r.current||r.start,minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);const ids=state.objects.filter(o=>{const bb=objectBounds(o);return bb&&bb.x>=minX&&bb.y>=minY&&bb.x+bb.w<=maxX&&bb.y+bb.h<=maxY;}).map(o=>o.id);state.selectedIds=r.initial.concat(ids).filter((id,i,a)=>a.indexOf(id)===i);state.selectionRect=null;previewLayer.innerHTML='';renderAll();setMessage(`Выделено объектов: ${state.selectedIds.length}`);}}
  function intersectLines(a,b,c,d){const den=(a.x-b.x)*(c.y-d.y)-(a.y-b.y)*(c.x-d.x);if(Math.abs(den)<1e-8)return null;const t=((a.x-c.x)*(c.y-d.y)-(a.y-c.y)*(c.x-d.x))/den,u=-((a.x-b.x)*(a.y-c.y)-(a.y-b.y)*(a.x-c.x))/den;if(t<0||t>1||u<0||u>1)return null;return{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y),t};}
  function splitLineAt(o,p){const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2},dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(len2||1),0,1),q={x:mm(a.x+t*dx),y:mm(a.y+t*dy)};if(t<.02||t>.98){setMessage('Точка разбиения слишком близко к концу отрезка');return;}commit();const idx=state.objects.findIndex(x=>x.id===o.id);state.objects.splice(idx,1,{...deep(o),id:newId(),x:a.x,y:a.y,x2:q.x,y2:q.y},{...deep(o),id:newId(),x:q.x,y:q.y,x2:b.x,y2:b.y});state.selectedIds=[];renderAll();setMessage('Отрезок разбит на два');}
  function trimLineAt(o,p){const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2},hits=[];state.objects.filter(x=>x.id!==o.id).forEach(x=>{if(x.type==='line'||x.type==='construction'||x.type==='centerline'){const h=intersectLines(a,b,{x:x.x,y:x.y},{x:x.x2,y:x.y2});if(h)hits.push(h);}else if(x.type==='rect'){const l=x.x,t=x.y,r=x.x2,bt=x.y2;[[{x:l,y:t},{x:r,y:t}],[{x:r,y:t},{x:r,y:bt}],[{x:r,y:bt},{x:l,y:bt}],[{x:l,y:bt},{x:l,y:t}]].forEach(pair=>{const h=intersectLines(a,b,pair[0],pair[1]);if(h)hits.push(h);});}});if(!hits.length){setMessage('Не найдено пересечений с другими линиями');return;}const dx=b.x-a.x,dy=b.y-a.y,tClick=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),hit=hits.sort((u,v)=>Math.abs(u.t-tClick)-Math.abs(v.t-tClick))[0];commit();if(tClick<hit.t){o.x2=mm(hit.x);o.y2=mm(hit.y);}else{o.x=mm(hit.x);o.y=mm(hit.y);}renderAll();setMessage('Отрезок усечён до ближайшего пересечения');}
  function selectionCenter(objs){const boxes=objs.map(objectBounds).filter(Boolean);if(!boxes.length)return{x:0,y:0};const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),r=Math.max(...boxes.map(b=>b.x+b.w)),bt=Math.max(...boxes.map(b=>b.y+b.h));return{x:(x+r)/2,y:(y+bt)/2};}
  function transformPoint(p,c,angle,scale=1,flip=null){let x=p.x-c.x,y=p.y-c.y;if(flip==='vertical')x=-x;if(flip==='horizontal')y=-y;const cs=Math.cos(angle),sn=Math.sin(angle);return{x:mm(c.x+(x*cs-y*sn)*scale),y:mm(c.y+(x*sn+y*cs)*scale)};}
  function transformObj(o,c,angle,scale=1,flip=null){
    const rotating=Math.abs(angle)>1e-7;
    if(o.type==='rect'&&(rotating||flip)){
      const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2);
      o.points=[[x1,y1],[x2,y1],[x2,y2],[x1,y2]].map(([x,y])=>transformPoint({x,y},c,angle,scale,flip));
      o.type='polyline';o.closed=true;delete o.x;delete o.y;delete o.x2;delete o.y2;delete o.rx;
    } else if(o.type==='ellipse'&&(rotating||flip)){
      const cx=(o.x+o.x2)/2,cy=(o.y+o.y2)/2,rx=Math.abs(o.x2-o.x)/2,ry=Math.abs(o.y2-o.y)/2;
      o.points=Array.from({length:48},(_,i)=>transformPoint({x:cx+Math.cos(i*Math.PI/24)*rx,y:cy+Math.sin(i*Math.PI/24)*ry},c,angle,scale,flip));
      o.type='polyline';o.closed=true;delete o.x;delete o.y;delete o.x2;delete o.y2;
    } else {
      if(o.points)o.points=o.points.map(p=>transformPoint(p,c,angle,scale,flip));
      ['x','x2','x3'].forEach((k,i)=>{const yk=['y','y2','y3'][i];if(o[k]!==undefined&&o[yk]!==undefined){const p=transformPoint({x:o[k],y:o[yk]},c,angle,scale,flip);o[k]=p.x;o[yk]=p.y;}});
    }
    if(o.type==='arc'){
      if(flip==='vertical'){o.start=Math.PI-o.start;o.end=Math.PI-o.end;}
      else if(flip==='horizontal'){o.start=-o.start;o.end=-o.end;}
      else{o.start+=angle;o.end+=angle;}
      o.r*=scale;
    }
    if(o.type==='text'||o.type==='techReq'){
      if(o.rotation===undefined)o.rotation=0;
      o.rotation=flip==='vertical'?180-o.rotation:flip==='horizontal'?-o.rotation:o.rotation+angle*180/Math.PI;
    }
    if(o.radius)o.radius*=scale;if(o.size)o.size*=scale;if(o.w)o.w*=scale;if(o.h)o.h*=scale;if(o.offset)o.offset*=scale;
  }
  function applyAction(action){const objs=getSelected();if(!objs.length){setMessage('Сначала выберите один или несколько объектов');return;}
    if(action==='zoomSelected'){const b=objs.map(objectBounds).filter(Boolean);if(!b.length)return;const x=Math.min(...b.map(q=>q.x)),y=Math.min(...b.map(q=>q.y)),r=Math.max(...b.map(q=>q.x+q.w)),bt=Math.max(...b.map(q=>q.y+q.h)),d=dimensions(),w=drawingArea.clientWidth-80,h=drawingArea.clientHeight-80;setZoom(clamp(Math.min(w/Math.max(1,r-x+16),h/Math.max(1,bt-y+16)),.25,6));drawingArea.scrollLeft=Math.max(0,(x+(r-x)/2)*state.zoom-drawingArea.clientWidth/2);drawingArea.scrollTop=Math.max(0,(y+(bt-y)/2)*state.zoom-drawingArea.clientHeight/2);setMessage('Выбранные объекты показаны крупнее');return;}
    if(action==='moveBy'){const dx=Number(prompt('Смещение по X, мм:','10')),dy=Number(prompt('Смещение по Y, мм:','0'));if(!Number.isFinite(dx)||!Number.isFinite(dy))return;commit();objs.forEach(o=>translateObject(o,dx,dy));renderAll();setMessage(`Сдвиг выполнен: ΔX ${dx} мм, ΔY ${dy} мм`);return;}
    if(action==='duplicate'){commit();const clones=objs.map(o=>({...deep(o),id:newId(),name:o.name?`${o.name} копия`:''}));clones.forEach(o=>translateObject(o,5,5));state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage('Копия создана со смещением 5 мм');return;}
    if(action==='rotate'){const deg=Number(prompt('Угол поворота в градусах:','90'));if(!Number.isFinite(deg))return;commit();const c=selectionCenter(objs);objs.forEach(o=>transformObj(o,c,deg*Math.PI/180));renderAll();setMessage(`Поворот ${deg}° выполнен`);return;}
    if(action==='mirror'){const vertical=confirm('Ось симметрии вертикальная? ОК — вертикальная, Отмена — горизонтальная.');commit();const c=selectionCenter(objs);objs.forEach(o=>transformObj(o,c,0,1,vertical?'vertical':'horizontal'));renderAll();setMessage('Зеркальное отражение выполнено');return;}
    if(action==='scale'){const k=Number(prompt('Коэффициент масштабирования:','2'));if(!Number.isFinite(k)||k<=0)return;commit();const c=selectionCenter(objs);objs.forEach(o=>transformObj(o,c,0,k));renderAll();setMessage(`Масштабирование ×${k} выполнено`);return;}
    if(action==='offset'){const dist=Number(prompt('Расстояние эквидистанты, мм:','2'));if(!Number.isFinite(dist)||!dist)return;commit();const clones=[];objs.forEach(o=>{const n=deep(o);n.id=newId();if(o.type==='line'){const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1,ox=-dy/len*dist,oy=dx/len*dist;translateObject(n,ox,oy);clones.push(n);}else if(o.type==='circle'){const r=Math.hypot(o.x2-o.x,o.y2-o.y)+dist;if(r>0){n.x2=n.x+(o.x2-o.x)/Math.hypot(o.x2-o.x,o.y2-o.y)*r;n.y2=n.y+(o.y2-o.y)/Math.hypot(o.x2-o.x,o.y2-o.y)*r;clones.push(n);}}else if(o.type==='rect'){const sign=dist>0?1:-1;n.x-=sign*Math.abs(dist);n.y-=sign*Math.abs(dist);n.x2+=sign*Math.abs(dist);n.y2+=sign*Math.abs(dist);clones.push(n);}});if(clones.length){state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);}renderAll();setMessage('Эквидистанта создана для поддерживаемых объектов');return;}
    if(action==='fillet'||action==='chamfer'){const value=Number(prompt(action==='fillet'?'Радиус скругления, мм:':'Размер фаски, мм:','2'));if(!Number.isFinite(value)||value<=0)return;let changed=0;commit();objs.forEach(o=>{if(o.type==='rect'){const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2);if(action==='fillet'){o.rx=Math.min(value,(x2-x1)/2,(y2-y1)/2);}else{o.type='polyline';o.closed=true;o.points=[{x:x1+value,y:y1},{x:x2-value,y:y1},{x:x2,y:y1+value},{x:x2,y:y2-value},{x:x2-value,y:y2},{x:x1+value,y:y2},{x:x1,y:y2-value},{x:x1,y:y1+value}];delete o.x;delete o.y;delete o.x2;delete o.y2;}changed++;}});renderAll();setMessage(`${action==='fillet'?'Скругление':'Фаска'}: обработано ${changed} прямоугольников`);return;}
    if(action==='arrayRect'){const cols=clamp(Number(prompt('Количество столбцов:','3'))||3,1,30),rows=clamp(Number(prompt('Количество строк:','2'))||2,1,30),dx=Number(prompt('Шаг по X, мм:','15')),dy=Number(prompt('Шаг по Y, мм:','15'));if(!Number.isFinite(dx)||!Number.isFinite(dy))return;commit();const clones=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(r===0&&c===0)continue;objs.forEach(o=>{const n={...deep(o),id:newId()};translateObject(n,c*dx,r*dy);clones.push(n);});}state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Создан прямоугольный массив: ${cols} × ${rows}`);return;}
    if(action==='arrayPolar'){const count=clamp(Number(prompt('Количество экземпляров вместе с исходным:','6'))||6,2,60),c=selectionCenter(objs),cx=Number(prompt('Координата центра X, мм:',c.x.toFixed(1))),cy=Number(prompt('Координата центра Y, мм:',c.y.toFixed(1)));if(!Number.isFinite(cx)||!Number.isFinite(cy))return;commit();const clones=[];for(let i=1;i<count;i++)objs.forEach(o=>{const n={...deep(o),id:newId()};transformObj(n,{x:cx,y:cy},i*2*Math.PI/count);clones.push(n);});state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Создан круговой массив: ${count} экземпляров`);return;}
    if(action==='split'||action==='trim'){selectTool(action);setMessage(`Укажите на выбранном отрезке место операции «${action==='split'?'Разбить':'Усечь'}»`);}
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  function saveProject(){const doc={app:'Kompas Online',version:2,format:state.format,fileName:state.fileName,title:state.title,objects:state.objects};downloadBlob(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),`${state.fileName||'drawing'}.json`);state.dirty=false;$('saveState').textContent='Сохранено';setMessage('Проект сохранён в JSON');}
  function loadProject(file){const reader=new FileReader();reader.onload=()=>{try{const doc=JSON.parse(reader.result);if(!doc||!Array.isArray(doc.objects)||!window.KompasTemplate.dimensions(doc.format))throw new Error('Неверный формат проекта');commit();state.format=doc.format;$('paperFormat').value=doc.format;state.fileName=doc.fileName||'Импортированный_чертёж';state.title=Object.assign({},state.title,doc.title||{});state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];syncTitleInputs();renderTemplate();renderAll();state.dirty=false;$('saveState').textContent='Проект открыт';setMessage('Проект успешно открыт');}catch(err){alert(`Не удалось открыть проект: ${err.message}`);}};reader.readAsText(file);}
  function exportSvg(){const clone=svg.cloneNode(true);clone.querySelector('#previewLayer')?.remove();clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);const d=dimensions();clone.setAttribute('width',d.w+'mm');clone.setAttribute('height',d.h+'mm');const source='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);downloadBlob(new Blob([source],{type:'image/svg+xml;charset=utf-8'}),`${state.fileName||'drawing'}.svg`);setMessage('SVG экспортирован');}
  function exportPng(){const clone=svg.cloneNode(true);clone.querySelector('#previewLayer')?.remove();clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);const source=new XMLSerializer().serializeToString(clone),blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas'),d=dimensions();c.width=Math.round(d.w*10);c.height=Math.round(d.h*10);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{downloadBlob(b,`${state.fileName||'drawing'}.png`);URL.revokeObjectURL(url);setMessage('PNG экспортирован');},'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);alert('Не удалось создать PNG. Попробуйте экспорт SVG.');};img.src=url;}
  function printDocument(){const d=dimensions();let style=document.getElementById('dynamicPrintStyle');if(!style){style=document.createElement('style');style.id='dynamicPrintStyle';document.head.appendChild(style);}style.textContent=`@page{size:${d.w}mm ${d.h}mm;margin:0}@media print{.drawing-area svg{width:${d.w}mm!important;height:${d.h}mm!important}}`;window.print();}
  function dxfPair(code,value){return`${code}\n${value}\n`;}
  function exportDxf(){
    let s='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
    const y=v=>-v;
    const writeLine=(a,b,layer='geometry')=>{s+='0\nLINE\n'+dxfPair(8,layer)+dxfPair(10,a.x)+dxfPair(20,y(a.y))+dxfPair(30,0)+dxfPair(11,b.x)+dxfPair(21,y(b.y))+dxfPair(31,0);};
    const writeText=(x,yy,text,size=3,layer='annotation')=>{s+='0\nTEXT\n'+dxfPair(8,layer)+dxfPair(10,x)+dxfPair(20,y(yy))+dxfPair(30,0)+dxfPair(40,size)+dxfPair(1,text||'');};
    state.objects.forEach(o=>{
      const layer=layerFor(o);
      if(o.type==='point'){
        s+='0\nPOINT\n'+dxfPair(8,layer)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0);
      } else if(['line','construction','centerline','section'].includes(o.type)){
        writeLine({x:o.x,y:o.y},{x:o.x2,y:o.y2},layer);
        if(o.type==='section'){writeText(o.x-2,o.y-2,o.label||'А',3,layer);writeText(o.x2+2,o.y2-2,o.label||'А',3,layer);}
      } else if(o.type==='circle'){
        s+='0\nCIRCLE\n'+dxfPair(8,layer)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0)+dxfPair(40,Math.hypot(o.x2-o.x,o.y2-o.y));
      } else if(o.type==='arc'){
        s+='0\nARC\n'+dxfPair(8,layer)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0)+dxfPair(40,o.r)+dxfPair(50,(-o.start*180/Math.PI+360)%360)+dxfPair(51,(-o.end*180/Math.PI+360)%360);
      } else if(o.type==='text'||o.type==='techReq'){
        String(o.text||'').split('\n').forEach((line,i)=>writeText(o.x,o.y+i*(o.lineHeight||4),line,o.size||4,layer));
      } else if(o.type==='rect'||o.type==='polyline'||o.type==='spline'||o.type==='breakline'||o.type==='ellipse'){
        let pts=o.points?o.points.slice():o.type==='ellipse'?Array.from({length:48},(_,i)=>({x:(o.x+o.x2)/2+Math.cos(i*2*Math.PI/48)*Math.abs(o.x2-o.x)/2,y:(o.y+o.y2)/2+Math.sin(i*2*Math.PI/48)*Math.abs(o.y2-o.y)/2})):[{x:o.x,y:o.y},{x:o.x2,y:o.y},{x:o.x2,y:o.y2},{x:o.x,y:o.y2}];
        s+='0\nLWPOLYLINE\n'+dxfPair(8,layer)+dxfPair(90,pts.length)+dxfPair(70,(o.closed||o.type==='rect'||o.type==='ellipse')?1:0);
        pts.forEach(p=>{s+=dxfPair(10,p.x)+dxfPair(20,y(p.y));});
      } else if(o.type==='dimension'){
        if(o.kind==='angular'){
          const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2},c={x:o.x3,y:o.y3};writeLine(a,b,layer);writeLine(a,c,layer);writeText(a.x,a.y-3,o.label||'угол',2.8,layer);
        } else {writeLine({x:o.x,y:o.y},{x:o.x2,y:o.y2},layer);writeText((o.x+o.x2)/2,(o.y+o.y2)/2-2,o.label||'размер',2.8,layer);}
      } else if(o.type==='leader'){
        (o.points||[]).slice(1).forEach((p,i)=>writeLine(o.points[i],p,layer));const end=(o.points||[]).slice(-1)[0];if(end)writeText(end.x+1,end.y-1,o.text||'',2.5,layer);
      } else if(o.type==='centerMark'){
        writeLine({x:o.x-3,y:o.y},{x:o.x+3,y:o.y},layer);writeLine({x:o.x,y:o.y-3},{x:o.x,y:o.y+3},layer);
      } else if(o.type==='hatch'){
        const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2),step=Math.max(.5,o.spacing||4);
        const emitFamily=(ang)=>{const a=ang*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),extent=Math.hypot(x2-x1,y2-y1),cx=(x1+x2)/2,cy=(y1+y2)/2;for(let k=-extent;k<=extent;k+=step){const px=cx-sn*k,py=cy+cs*k,dx=cs*extent,dy=sn*extent;const p1={x:px-dx,y:py-dy},p2={x:px+dx,y:py+dy};const hits=[];[[{x:x1,y:y1},{x:x2,y:y1}],[{x:x2,y:y1},{x:x2,y:y2}],[{x:x2,y:y2},{x:x1,y:y2}],[{x:x1,y:y2},{x:x1,y:y1}]].forEach(e=>{const h=intersectLines(p1,p2,e[0],e[1]);if(h)hits.push({x:h.x,y:h.y});});if(hits.length>=2)writeLine(hits[0],hits[1],layer);}};
        if(o.pattern!=='solid'){emitFamily(o.angle??45);if(o.pattern==='cross')emitFamily((o.angle??45)+90);}
      } else if(o.type==='roughness'){
        writeText(o.x,o.y,o.label||'Ra',2.5,layer);
      } else if(o.type==='tolerance'||o.type==='weld'){
        writeText(o.x,o.y,o.text||'',2.5,layer);
      } else if(o.type==='table'){
        const rows=o.rows||3,cols=o.cols||3,w=o.w||60,h=o.h||25;for(let i=0;i<=cols;i++)writeLine({x:o.x+w*i/cols,y:o.y},{x:o.x+w*i/cols,y:o.y+h},layer);for(let i=0;i<=rows;i++)writeLine({x:o.x,y:o.y+h*i/rows},{x:o.x+w,y:o.y+h*i/rows},layer);
      }
    });
    s+='0\nENDSEC\n0\nEOF\n';downloadBlob(new Blob([s],{type:'application/dxf'}),`${state.fileName||'drawing'}.dxf`);setMessage('DXF экспортирован: базовая геометрия и упрощённые обозначения');
  }
  function parseDxf(text){const lines=text.replace(/\r/g,'').split('\n'),pairs=[];for(let i=0;i+1<lines.length;i+=2)pairs.push([Number(lines[i].trim()),lines[i+1].trim()]);const out=[];let i=0;const val=(p,c,def=0)=>{const f=p.find(x=>x[0]===c);return f?Number(f[1]):def;};
    while(i<pairs.length){if(pairs[i][0]!==0){i++;continue;}const type=pairs[i][1];i++;if(type==='ENDSEC'||type==='EOF')continue;const p=[];while(i<pairs.length&&pairs[i][0]!==0)p.push(pairs[i++]);const get=(c,d=0)=>val(p,c,d),layer=p.find(x=>x[0]===8)?.[1]||'geometry';const base={color:'#20252a',width:.35,layer:layer==='annotation'?'annotation':layer==='construction'?'construction':'geometry'};
      if(type==='POINT')out.push({...base,type:'point',x:get(10),y:-get(20)});
      else if(type==='LINE')out.push({...base,type:'line',x:get(10),y:-get(20),x2:get(11),y2:-get(21)});
      else if(type==='CIRCLE'){const x=get(10),y=-get(20),r=get(40);out.push({...base,type:'circle',x,y,x2:x+r,y2:y});}
      else if(type==='ARC'){const x=get(10),y=-get(20),r=get(40),a=-get(50)*Math.PI/180,b=-get(51)*Math.PI/180;out.push({...base,type:'arc',x,y,r,start:a,end:b});}
      else if(type==='TEXT')out.push({...base,type:'text',x:get(10),y:-get(20),size:get(40,3),text:p.find(x=>x[0]===1)?.[1]||'Текст',layer:'annotation'});
      else if(type==='LWPOLYLINE'){const xs=p.filter(x=>x[0]===10).map(x=>Number(x[1])),ys=p.filter(x=>x[0]===20).map(x=>-Number(x[1])),pts=xs.map((x,k)=>({x,y:ys[k]??0}));out.push({...base,type:'polyline',points:pts,closed:(get(70)&1)===1});}
    }return out;}
  function importDxf(file){const reader=new FileReader();reader.onload=()=>{try{const imported=parseDxf(reader.result);if(!imported.length)throw new Error('Поддерживаемых сущностей не найдено');commit();imported.forEach(o=>{o.id=newId();state.objects.push(o);});state.selectedIds=[];renderAll();setMessage(`Импортировано объектов DXF: ${imported.length}`);}catch(e){alert('Ошибка импорта DXF: '+e.message);}};reader.readAsText(file);}
  function syncTitleInputs(){const t=state.title;$('titleField').value=t.title||'';$('codeField').value=t.code||'';$('materialField').value=t.material||'';$('scaleField').value=t.scale||'1:1';$('sheetField').value=t.sheet||'1';$('sheetsField').value=t.sheets||'1';$('companyField').value=t.company||'';$('literField').value=t.liter||'У';$('massField').value=t.mass||'—';$('developerField').value=t.developer||'';$('checkerField').value=t.checker||'';$('technicalField').value=t.technical||'';$('normativeField').value=t.normative||'';$('approvedField').value=t.approved||'';$('filenameField').value=state.fileName||'Чертёж_1';}
  function applyTitle(){commit();state.title={title:$('titleField').value,code:$('codeField').value,material:$('materialField').value,scale:$('scaleField').value,sheet:$('sheetField').value,sheets:$('sheetsField').value,company:$('companyField').value,liter:$('literField').value,mass:$('massField').value,developer:$('developerField').value,checker:$('checkerField').value,technical:$('technicalField').value,normative:$('normativeField').value,approved:$('approvedField').value};state.fileName=$('filenameField').value.trim()||'Чертёж_1';renderTemplate();renderAll();setMessage('Основная надпись обновлена');}
  function setFormat(fmt){commit();state.format=fmt;renderTemplate();setZoom(Math.min(state.zoom,2.5));$('paperFormat').value=fmt;setMessage(`Формат листа: ${fmt}`);}
  function newDocument(){if((state.objects.length||state.dirty)&&!confirm('Создать новый чертёж? Несохранённые изменения будут потеряны.'))return;commit();state.objects=[];state.selectedIds=[];state.format='A4P';state.fileName='Чертёж_1';$('paperFormat').value='A4P';state.title={title:'Наименование детали',code:'ЧЕРТЁЖ.001',material:'Материал не указан',scale:'1:1',sheet:'1',sheets:'1',company:'Учебный чертёж',liter:'У',mass:'—',developer:'',checker:'',technical:'',normative:'',approved:''};syncTitleInputs();renderTemplate();renderAll();state.dirty=false;$('saveState').textContent='Новый чертёж';setMessage('Создан новый чертёж');}

  function applyNumericCoordinate(){
    if(state.tool==='select'){setMessage('Сначала выберите инструмент построения');return;}
    const x=Number($('coordinateX').value),y=Number($('coordinateY').value);
    if(!Number.isFinite(x)||!Number.isFinite(y)){setMessage('Введите корректные координаты X и Y');return;}
    const r=svg.getBoundingClientRect(),d=dimensions(),oldSnap=state.snap,oldObj=state.objectSnap;
    state.snap=false;state.objectSnap=false;
    onCanvasPointerDown({button:0,clientX:r.left+(x/d.w)*r.width,clientY:r.top+(y/d.h)*r.height,target:svg,shiftKey:false,preventDefault(){}});
    state.snap=oldSnap;state.objectSnap=oldObj;
    setMessage(`Принята точка X ${mm(x)} · Y ${mm(y)} мм`);
  }
  function restoreAutosave(){
    try{const raw=localStorage.getItem('kompasOnlineAutosave');if(!raw){setMessage('Автосохранение не найдено');return;}const doc=JSON.parse(raw);if(!doc||!Array.isArray(doc.objects))throw new Error('Повреждённый файл автосохранения');commit();state.format=doc.format||'A4P';state.fileName=doc.fileName||'Автовосстановление';state.title=Object.assign({},state.title,doc.title||{});state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];$('paperFormat').value=state.format;syncTitleInputs();renderTemplate();renderAll();setMessage('Автосохранение восстановлено');}catch(e){alert('Не удалось восстановить автосохранение: '+e.message);}
  }
  function copySelected(){const objs=getSelected();if(!objs.length){setMessage('Сначала выберите объекты для копирования');return;}state.clipboard=deep(objs);setMessage(`Скопировано объектов: ${objs.length}`);}
  function pasteClipboard(){if(!state.clipboard.length){setMessage('Буфер обмена пуст');return;}commit();const clones=state.clipboard.map(o=>({...deep(o),id:newId()}));clones.forEach(o=>translateObject(o,5,5));state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Вставлено объектов: ${clones.length}`);}
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>selectTool(b.dataset.tool)));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>applyAction(b.dataset.action)));
  $('newBtn').addEventListener('click',newDocument);$('coordinateApplyBtn').addEventListener('click',applyNumericCoordinate);$('restoreAutosaveBtn').addEventListener('click',restoreAutosave);$('saveBtn').addEventListener('click',saveProject);$('saveJsonBtn').addEventListener('click',saveProject);$('openBtn').addEventListener('click',()=>$('fileInput').click());$('loadJsonBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>{if(e.target.files[0])loadProject(e.target.files[0]);e.target.value='';});
  $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);$('deleteBtn').addEventListener('click',deleteSelected);$('deleteSelectedBtn').addEventListener('click',deleteSelected);
  $('gridBtn').addEventListener('click',()=>{$('gridToggle').checked=!$('gridToggle').checked;$('gridToggle').dispatchEvent(new Event('change'));});$('snapBtn').addEventListener('click',()=>{$('objectSnapToggle').checked=!$('objectSnapToggle').checked;state.objectSnap=$('objectSnapToggle').checked;setMessage(`Привязки к объектам ${state.objectSnap?'включены':'выключены'}`);});$('orthoBtn').addEventListener('click',()=>{$('orthoToggle').checked=!$('orthoToggle').checked;state.ortho=$('orthoToggle').checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  $('gridToggle').addEventListener('change',e=>{state.grid=e.target.checked;$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');});$('gridStep').addEventListener('change',()=>{const pattern=svg.querySelector('#gridPattern');const step=gridStep();pattern.setAttribute('width',step);pattern.setAttribute('height',step);pattern.querySelector('path').setAttribute('d',`M ${step} 0 L 0 0 0 ${step}`);});$('snapToggle').addEventListener('change',e=>state.snap=e.target.checked);$('objectSnapToggle').addEventListener('change',e=>state.objectSnap=e.target.checked);$('orthoToggle').addEventListener('change',e=>{state.ortho=e.target.checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  $('templateToggle').addEventListener('change',e=>{state.template=e.target.checked;renderTemplate();});$('geometryVisible').addEventListener('change',e=>{visible.geometry=e.target.checked;renderAll();});$('dimensionsVisible').addEventListener('change',e=>{visible.dimensions=e.target.checked;renderAll();});$('constructionVisible').addEventListener('change',e=>{visible.construction=e.target.checked;renderAll();});$('templateVisible').addEventListener('change',e=>{visible.template=e.target.checked;renderTemplate();});
  $('paperFormat').addEventListener('change',e=>setFormat(e.target.value));$('fitBtn').addEventListener('click',()=>{const d=dimensions(),w=drawingArea.clientWidth-70,h=drawingArea.clientHeight-70;setZoom(Math.min(w/d.w,h/d.h));});$('zoomIn').addEventListener('click',()=>setZoom(state.zoom*1.15));$('zoomOut').addEventListener('click',()=>setZoom(state.zoom/1.15));
  $('applyTitleBtn').addEventListener('click',applyTitle);$('svgBtn').addEventListener('click',exportSvg);$('dxfBtn').addEventListener('click',exportDxf);$('exportDxfBtn').addEventListener('click',exportDxf);$('importDxfBtn').addEventListener('click',()=>$('dxfInput').click());$('dxfInput').addEventListener('change',e=>{if(e.target.files[0])importDxf(e.target.files[0]);e.target.value='';});$('pngBtn').addEventListener('click',exportPng);$('printBtn').addEventListener('click',printDocument);$('addTextBtn').addEventListener('click',()=>selectTool('text'));
  $('objectColor').addEventListener('change',e=>{const o=getSelected()[0];if(o){commit();getSelected().forEach(x=>x.color=e.target.value);renderAll();}});
  $('objectTextSize').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>{o.size=clamp(Number(e.target.value)||3,.5,50);o.textSize=o.size;});renderAll();}});
  $('editContentBtn').addEventListener('click',()=>{const objs=getSelected().filter(o=>['text','techReq','leader','roughness','tolerance','weld','dimension','section'].includes(o.type));if(!objs.length){setMessage('Выберите надпись или обозначение для редактирования');return;}const o=objs[0],key=['roughness','section','dimension'].includes(o.type)?'label':'text',value=o[key]??(o.type==='roughness'?'Ra 3,2':o.type==='section'?'А':'');const edited=prompt('Новое содержимое:',value);if(edited===null)return;commit();objs.forEach(x=>x[key]=edited);renderAll();setMessage('Содержимое обозначения изменено');});$('objectWidth').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.width=clamp(Number(e.target.value)||.35,.05,3));renderAll();}});$('objectDash').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.dash=e.target.value);renderAll();}});$('objectLayer').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.layer=e.target.value);renderAll();}});$('objectName').addEventListener('change',e=>{if(getSelected().length===1){commit();getSelected()[0].name=e.target.value;renderAll();}});
  svg.addEventListener('pointerdown',onCanvasPointerDown);svg.addEventListener('dblclick',e=>{e.preventDefault();finishPath();});svg.addEventListener('contextmenu',e=>{if(state.tool==='polyline'||state.tool==='spline'){e.preventDefault();finishPath();}else e.preventDefault();});window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);
  drawingArea.addEventListener('wheel',e=>{e.preventDefault();setZoom(state.zoom*(e.deltaY<0?1.1:.9));},{passive:false});
  window.addEventListener('keydown',e=>{const tag=document.activeElement.tagName;if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){state.space=true;e.preventDefault();}if(e.key==='Enter'&&(state.tool==='polyline'||state.tool==='spline'))finishPath();if(e.key==='F8'){state.ortho=!state.ortho;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';}if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA','SELECT'].includes(tag))deleteSelected();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();$('openBtn').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newDocument();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();copySelected();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();pasteClipboard();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();applyAction('duplicate');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!['INPUT','TEXTAREA'].includes(tag)){e.preventDefault();state.selectedIds=state.objects.map(o=>o.id);renderAll();}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!['INPUT','TEXTAREA','SELECT'].includes(tag)&&state.selectedIds.length&&!e.repeat){e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;commit();getSelected().forEach(o=>translateObject(o,dx,dy));renderAll();}if(e.key==='Escape'){state.points=[];state.selectionRect=null;previewLayer.innerHTML='';selectTool('select');}});
  window.addEventListener('keyup',e=>{if(e.code==='Space')state.space=false;});
  document.querySelectorAll('.panel-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.panel-tab').forEach(t=>t.classList.toggle('active',t===tab));$('toolsPanel').classList.toggle('hidden',tab.dataset.panel!=='tools');$('treePanel').classList.toggle('hidden',tab.dataset.panel!=='tree');}));
  $('helpBtn').addEventListener('click',()=>$('helpModal').classList.remove('hidden'));$('closeHelp').addEventListener('click',()=>$('helpModal').classList.add('hidden'));$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.add('hidden');});
  document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{const menu=btn.dataset.menu;if(menu==='file')saveProject();else if(menu==='edit')undo();else if(menu==='view')$('fitBtn').click();else if(menu==='insert')selectTool('text');else if(menu==='draw')selectTool('line');else if(menu==='format')$('applyTitleBtn').click();else $('helpBtn').click();}));
  syncTitleInputs();renderTemplate();renderAll();updateZoom();selectTool('select');
})();
