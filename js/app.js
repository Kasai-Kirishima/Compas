(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('sheetSvg'), drawingArea = $('drawingArea');
  const templateLayer = $('templateLayer'), sheetFrameLayer = $('sheetFrameLayer'), referenceLayer = $('referenceLayer'), geometryLayer = $('geometryLayer'), constructionLayer = $('constructionLayer'), annotationLayer = $('annotationLayer'), rulerLayer = $('rulerLayer'), previewLayer = $('previewLayer'), selectionLayer = $('selectionLayer');
  const annotationTypes = new Set(['text','dimension','leader','centerMark','roughness','tolerance','weld','table','section','techReq']);
  const constructionTypes = new Set(['construction','centerline']);
  const supportedTypes = new Set(['point','line','rect','circle','ellipse','arc','polyline','spline','freehand','text','dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','breakline','construction','centerline','section','techReq','reference']);
  const state = {
    referenceCalibration:null,
    format:'A4P', tool:'select', objects:[], selectedIds:[], points:[], zoom:1.8, grid:false, snap:false,
    objectSnap:true, ortho:false, template:true, space:false, pan:null, viewPan:{x:0,y:0}, drag:null, selectionRect:null,
    history:[], redo:[], clipboard:[], ruler:null, rulerMode:'off', rulerVisible:true, freehandDraft:null, resize:null, rotateDrag:null,
    gost:{profile:'dstu-gost-ua',mainLine:.5,thinLine:.25,textHeight:3.5,arrowLength:3.5,precision:1,lettering:'B-V',fontFamily:'GOST type B,Arial,sans-serif'},
    title:{title:'Лабораторна робота 5',code:'КРЕСЛЕННЯ.001',material:'Матеріал не зазначено',scale:'1:1',sheet:'1',sheets:'1',company:'Навчальний кресленик',liter:'У',mass:'—',developer:'Щербенко М.',checker:'',technical:'',normative:'',approved:''},
    titleForm:'lab5-template', projectId:null, fileName:'Кресленик_1', dirty:false
  };
  const visible = {geometry:true,dimensions:true,construction:true,template:true,reference:true};
  const deep = o => JSON.parse(JSON.stringify(o));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const mm = v => Number((Number(v)||0).toFixed(2));
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const layerFor = o => o.type==='reference'?'reference':(o.layer || (annotationTypes.has(o.type) ? 'annotation' : constructionTypes.has(o.type) ? 'construction' : 'geometry'));
  const isAnnotation = o => layerFor(o) === 'annotation';

  function setMessage(message){ $('statusMessage').textContent = message; }
  function dimensions(){ return window.KompasTemplate.dimensions(state.format); }
  function gridStep(){ return clamp(Number($('gridStep')?.value)||5,.1,100); }
  function updateZoom(){ const d=dimensions(); svg.style.width=`${d.w*state.zoom}px`; svg.style.height=`${d.h*state.zoom}px`; svg.style.transform=`translate(${state.viewPan.x}px, ${state.viewPan.y}px)`; $('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`; }
  function setZoom(z){ state.zoom=clamp(z,.25,6); updateZoom(); }
  function setZoomAt(z,clientX,clientY){const before=svg.getBoundingClientRect(),fx=clamp((clientX-before.left)/before.width,0,1),fy=clamp((clientY-before.top)/before.height,0,1);state.zoom=clamp(z,.25,6);updateZoom();const after=svg.getBoundingClientRect();state.viewPan.x+=clientX-(after.left+fx*after.width);state.viewPan.y+=clientY-(after.top+fy*after.height);updateZoom();}
  function resetViewPan(){state.viewPan={x:0,y:0};updateZoom();}
  function templateData(){ return state.title; }
  function renderTemplate(){
    const d=dimensions(); svg.setAttribute('viewBox',`0 0 ${d.w} ${d.h}`);
    $('paperRect').setAttribute('width',d.w); $('paperRect').setAttribute('height',d.h);
    $('gridRect').setAttribute('width',d.w); $('gridRect').setAttribute('height',d.h);
    window.KompasTemplate.render(templateLayer,state.format,templateData(),state.titleForm||'user-template');
    if($('titleFormSelect'))$('titleFormSelect').value=state.titleForm||'user-template';
    if($('templateQuickSelect'))$('templateQuickSelect').value=state.titleForm||'user-template';
    const templateDescriptions={'lab5-template':'Шаблон за фото лабораторної роботи №5: книжковий A4, ліві архівні поля, верхня комірка та нижній штамп. Центральне поле повністю порожнє — без моделі, розмірів і штриховки.','user-template':'Ваш початковий шаблон: бокові службові графи, верхня комірка й нижній основний напис.','gost-form1':'Форма 1 — перший аркуш графічного документа (креслення або схема).','form2':'Форма 2 — перший аркуш текстового конструкторського документа.','form2a':'Форма 2а — наступні аркуші графічних і текстових документів.','form2b-odd':'Форма 2б для текстового документа з додатковими графами ліворуч; варіант компонування для двостороннього копіювання.','form2b-even':'Форма 2б для текстового документа з додатковими графами праворуч; дзеркальний варіант компонування для двостороннього копіювання.','spec-form1':'Навчальна форма специфікації за традиційною ЄСКД / ГОСТ 2.106-96: перший аркуш із групами документації, деталей, стандартних виробів та матеріалів.','spec-form1a':'Навчальна форма специфікації за традиційною ЄСКД / ГОСТ 2.106-96: продовження таблиці на наступному аркуші.','blank':'Чистий аркуш зі стандартною рамкою без основного напису.'};
    if($('templateDescription'))$('templateDescription').textContent=(state.titleForm==='user-template'&&d.h<280)?'На форматі A5 ваш розширений шаблон не вміщується; застосовано компактний варіант форми 1.':(templateDescriptions[state.titleForm]||templateDescriptions['user-template']);
    templateLayer.style.display=(state.template&&visible.template)?'':'none';
    renderSheetFrame(d);
    $('docName').textContent=state.fileName.replaceAll('_',' ');
    const formatLabel=state.format.replace(/[PL]$/,'');
    document.querySelector('.doc-meta').textContent=`${formatLabel} · ${state.title.scale||'1:1'} · мм`;
    updateZoom();
  }
  function renderSheetFrame(d=dimensions()){
    if(!sheetFrameLayer)return;
    sheetFrameLayer.innerHTML='';
    // The page outline and drawing frame are independent from the title-block layer.
    // This prevents the frame disappearing when the user temporarily hides the template.
    add(sheetFrameLayer,'rect',{x:0,y:0,width:d.w,height:d.h,fill:'none',stroke:'#000000','stroke-width':.25,'vector-effect':'non-scaling-stroke'});
    if(state.titleForm!=='lab5-template') add(sheetFrameLayer,'rect',{x:20,y:5,width:Math.max(1,d.w-25),height:Math.max(1,d.h-10),fill:'none',stroke:'#000000','stroke-width':.32,'vector-effect':'non-scaling-stroke'});
  }
  function svgEl(name,attrs={}){ const el=document.createElementNS(NS,name); Object.entries(attrs).forEach(([k,v])=>{if(v!==undefined&&v!==null)el.setAttribute(k,String(v));}); return el; }
  function add(parent,name,attrs){ const el=svgEl(name,attrs); parent.appendChild(el); return el; }
  function objectLayer(o){ const l=layerFor(o); return l==='reference'?referenceLayer:l==='annotation'?annotationLayer:l==='construction'?constructionLayer:geometryLayer; }
  function applyStyle(el,o,selected=false){
    el.setAttribute('stroke',o.dash==='none'?'none':(selected?'#078db2':(o.color||'#20252a')));
    el.setAttribute('stroke-width',selected?Math.max(.45,(o.width??state.gost.thinLine)*1.8):(o.width??state.gost.thinLine));
    el.setAttribute('fill',o.fill||'none'); el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round');
    if(o.dash) el.setAttribute('stroke-dasharray',o.dash);
  }
  function arrow(g,x,y,ux,uy,color,size=1.6){
    const nx=-uy,ny=ux,w=size*.32;
    add(g,'path',{d:`M ${x} ${y} l ${-ux*size+nx*w} ${-uy*size+ny*w} l ${-ux*size-nx*w} ${-uy*size-ny*w} z`,fill:color,stroke:'none'});
  }
  function addText(g,x,y,text,size=2.8,color='#20252a',anchor='middle',rotate=0,extra={}){
    const slanted=String(state.gost.lettering||'B-V').endsWith('-S'),transforms=[rotate?`rotate(${rotate} ${x} ${y})`:'',slanted?`skewX(-15)`:''].filter(Boolean).join(' ');const el=add(g,'text',{x,y,'font-family':state.gost.fontFamily||'Arial,sans-serif','font-size':size,'text-anchor':anchor,fill:color,stroke:'none',transform:transforms||null,'font-weight':extra.weight||null,'font-style':extra.italic?'italic':null});
    el.textContent=String(text??''); return el;
  }
  function drawRulerGraphics(parent,a,b,opacity=1){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1)return;
    const ux=dx/len,uy=dy/len,nx=-uy,ny=ux,half=3.4;
    const p1={x:a.x+nx*half,y:a.y+ny*half},p2={x:b.x+nx*half,y:b.y+ny*half},p3={x:b.x-nx*half,y:b.y-ny*half},p4={x:a.x-nx*half,y:a.y-ny*half};
    add(parent,'polygon',{points:[p1,p2,p3,p4].map(p=>`${p.x},${p.y}`).join(' '),fill:'#e4c77c','fill-opacity':.22*opacity,stroke:'#9b792b','stroke-width':.25,'stroke-opacity':.8*opacity});
    add(parent,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#9b792b','stroke-width':.22,'stroke-opacity':opacity});
    const step=len>300?5:1;
    for(let d=0;d<=len+.001;d+=step){const x=a.x+ux*d,y=a.y+uy*d,major=Math.round(d)%10===0,medium=Math.round(d)%5===0;const tick=major?2.8:medium?2:1.15;add(parent,'line',{x1:x+nx*half*.88,y1:y+ny*half*.88,x2:x+nx*(half*.88-tick),y2:y+ny*(half*.88-tick),stroke:'#806322','stroke-width':.16,'stroke-opacity':opacity});if(major&&d>0){let ang=Math.atan2(dy,dx)*180/Math.PI;if(ang>90||ang<-90)ang+=180;addText(parent,x-nx*1.8,y-ny*1.8,String(Math.round(d)),1.25,'#806322','middle',ang);}}
  }
  function renderRuler(){rulerLayer.innerHTML='';if(state.ruler&&state.rulerVisible)drawRulerGraphics(rulerLayer,state.ruler.a,state.ruler.b,1);}
  function linePatternPoints(o){
    const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2},dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.01)return[a,b];
    const nx=-dy/len,ny=dx/len,amp=Math.min(1.1,Math.max(.45,(o.width||state.gost.thinLine)*2.5)),zig=o.linePattern==='zigzag',cycles=Math.max(1,Math.round(len/(zig?6:8))),steps=zig?cycles*2:cycles*12,pts=[];
    for(let i=0;i<=steps;i++){const t=i/steps;let offset=0;if(i!==0&&i!==steps){if(zig)offset=(i%2?amp:-amp);else offset=Math.sin(t*cycles*Math.PI*2)*amp;}pts.push({x:mm(a.x+dx*t+nx*offset),y:mm(a.y+dy*t+ny*offset)});}return pts;
  }
  function smoothPath(points,amount=70){if(!points||points.length<2)return '';if(points.length===2||amount<=0)return `M ${points.map((p,i)=>`${i?'L':' '}${p.x} ${p.y}`).join(' ')}`;const t=clamp(Number(amount)||0,0,100)/100;let d=`M ${points[0].x} ${points[0].y}`;for(let i=1;i<points.length-1;i++){const p=points[i],n=points[i+1],mx=(p.x+n.x)/2,my=(p.y+n.y)/2,cx=mx+(p.x-mx)*t,cy=my+(p.y-my)*t;d+=` Q ${cx} ${cy} ${mx} ${my}`;}const last=points[points.length-1];d+=` T ${last.x} ${last.y}`;return d;}
  function renderDimension(g,o,selected){
    const color=selected?'#078db2':(o.color||'#20252a'), kind=o.kind||'linear', thin=state.gost.thinLine, textSize=o.textSize||state.gost.textHeight, arrowSize=state.gost.arrowLength;
    if(kind==='radius'||kind==='diameter'){
      const cx=o.x,cy=o.y,dx=o.x2-cx,dy=o.y2-cy,r=Math.hypot(dx,dy)||1,ux=dx/r,uy=dy/r;
      const x1=kind==='diameter'?cx-ux*r:cx, y1=kind==='diameter'?cy-uy*r:cy;
      const x2=kind==='diameter'?cx+ux*r:o.x2, y2=kind==='diameter'?cy+uy*r:o.y2;
      add(g,'line',{x1,y1,x2,y2,stroke:color,'stroke-width':thin});
      arrow(g,kind==='diameter'?x1:x2,kind==='diameter'?y1:y2,kind==='diameter'?-ux:ux,kind==='diameter'?-uy:uy,color,arrowSize);
      if(kind==='diameter') arrow(g,x2,y2,ux,uy,color,arrowSize);
      addText(g,(x1+x2)/2+(-uy)*2,(y1+y2)/2+ux*2,`${kind==='diameter'?'Ø':'R'}${o.label||r.toFixed(state.gost.precision??1)}`,textSize,color);
      return;
    }
    if(kind==='angular'){
      const vx=o.x,vy=o.y,a1=Math.atan2(o.y2-vy,o.x2-vx),a2=Math.atan2(o.y3-vy,o.x3-vx),rad=o.radius||12;
      let delta=a2-a1; while(delta<0)delta+=Math.PI*2; while(delta>=Math.PI*2)delta-=Math.PI*2;
      const p1={x:vx+Math.cos(a1)*rad,y:vy+Math.sin(a1)*rad},p2={x:vx+Math.cos(a1+delta)*rad,y:vy+Math.sin(a1+delta)*rad};
      add(g,'line',{x1:vx,y1:vy,x2:vx+Math.cos(a1)*(rad+3),y2:vy+Math.sin(a1)*(rad+3),stroke:color,'stroke-width':thin});
      add(g,'line',{x1:vx,y1:vy,x2:vx+Math.cos(a2)*(rad+3),y2:vy+Math.sin(a2)*(rad+3),stroke:color,'stroke-width':thin});
      add(g,'path',{d:`M ${p1.x} ${p1.y} A ${rad} ${rad} 0 ${delta>Math.PI?1:0} 1 ${p2.x} ${p2.y}`,fill:'none',stroke:color,'stroke-width':thin});
      const deg=delta*180/Math.PI; addText(g,vx+Math.cos(a1+delta/2)*(rad+3),vy+Math.sin(a1+delta/2)*(rad+3),o.label||`${deg.toFixed(state.gost.precision??1)}°`,textSize,color);
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
    add(g,'line',{x1:o.x,y1:o.y,x2:ax,y2:ay,stroke:color,'stroke-width':thin});
    add(g,'line',{x1:o.x2,y1:o.y2,x2:bx,y2:by,stroke:color,'stroke-width':thin});
    add(g,'line',{x1:ax,y1:ay,x2:bx,y2:by,stroke:color,'stroke-width':thin});
    arrow(g,ax,ay,tx,ty,color,arrowSize); arrow(g,bx,by,-tx,-ty,color,arrowSize);
    addText(g,(ax+bx)/2,(ay+by)/2-1.3,o.label||value.toFixed(state.gost.precision??1),textSize,color);
  }
  function renderObject(o){
    if(o.hidden)return;
    const layer=layerFor(o); if((layer==='geometry'&&!visible.geometry)||(layer==='annotation'&&!visible.dimensions)||(layer==='construction'&&!visible.construction)||(layer==='reference'&&!visible.reference))return;
    const g=add(objectLayer(o),'g',{'data-id':o.id,'class':'drawing-object'}), selected=state.selectedIds.includes(o.id);
    if(o.type==='reference'){
      g.setAttribute('data-reference-exportable',o.exportable?'true':'false');
      if(o.locked)g.setAttribute('data-reference-locked','true');
      const cx=o.x+(o.w||1)/2,cy=o.y+(o.h||1)/2,rotation=Number(o.rotation)||0;
      if(rotation||o.mirrorY)g.setAttribute('transform',`translate(${cx} ${cy}) rotate(${rotation}) ${o.mirrorY?'scale(1 -1) ':''}translate(${-cx} ${-cy})`);
      const im=add(g,'image',{x:o.x,y:o.y,width:o.w,height:o.h,href:o.dataUrl,opacity:clamp(Number(o.opacity??.35),0,1),'preserveAspectRatio':'none','pointer-events':'all'});
      im.setAttributeNS('http://www.w3.org/1999/xlink','href',o.dataUrl);
      if(selected){add(g,'rect',{x:o.x,y:o.y,width:o.w,height:o.h,fill:'none',stroke:'#078db2','stroke-width':.45,'stroke-dasharray':'2 1','pointer-events':'none','data-selection-outline':'true'});}
      return;
    }
    const bHit=objectBounds(o);if(bHit){add(g,'rect',{x:bHit.x-1.5,y:bHit.y-1.5,width:Math.max(3,bHit.w+3),height:Math.max(3,bHit.h+3),fill:'transparent',stroke:'none','pointer-events':'all','data-hit-area':'true'});}
    const c=selected?'#078db2':(o.color||'#20252a');
    if(o.type==='point'){add(g,'circle',{cx:o.x,cy:o.y,r:o.size||.6,fill:c,stroke:'none'});add(g,'line',{x1:o.x-1.5,y1:o.y,x2:o.x+1.5,y2:o.y,stroke:c,'stroke-width':state.gost.thinLine});add(g,'line',{x1:o.x,y1:o.y-1.5,x2:o.x,y2:o.y+1.5,stroke:c,'stroke-width':state.gost.thinLine});
    } else if(o.type==='line'||o.type==='construction'||o.type==='centerline'){
      const patterned=['wave','zigzag'].includes(o.linePattern),el=patterned?add(g,'path',{d:linePatternPoints(o).map((p,i)=>(i?'L':'M')+` ${p.x} ${p.y}`).join(' ')}):add(g,'line',{x1:o.x,y1:o.y,x2:o.x2,y2:o.y2});
      applyStyle(el,{...o,dash:o.dash||(o.type==='centerline'?'12 3 1 3':''),color:o.color||(o.type==='construction'?'#8c969d':c)},selected);
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
    } else if(o.type==='polyline'||o.type==='spline'||o.type==='freehand'||o.type==='breakline'){
      const pts=o.points||[]; if(pts.length<2)return;
      let d=`M ${pts[0].x} ${pts[0].y}`;
      if((o.type==='spline'||o.type==='freehand')&&pts.length>2){d=smoothPath(pts,o.type==='freehand'?(o.smooth??65):100);}
      else if(o.type==='breakline'&&pts.length===2){const a=pts[0],b=pts[1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;const count=8,amp=Math.min(1.4,len/12);for(let i=1;i<=count;i++){const t=i/count,v=(i%2?1:-1)*amp;d+=` L ${a.x+dx*t+nx*v} ${a.y+dy*t+ny*v}`;}}
      else {pts.slice(1).forEach(p=>d+=` L ${p.x} ${p.y}`);}
      if(o.closed)d+=' Z';const el=add(g,'path',{d});applyStyle(el,o,selected);
    } else if(o.type==='text'||o.type==='techReq'){
      const lines=String(o.text||'Текст').split('\n'),size=o.size||4,lh=o.lineHeight||size*1.25,anchor=o.align||'start',widthFactor=clamp(Number(o.widthFactor)||1,.25,3),letter=Number(o.letterSpacing)||0;
      const estimatedW=Math.max(2,...lines.map(line=>line.length*size*.62+Math.max(0,line.length-1)*letter)),estimatedH=Math.max(size,lines.length*lh);
      const left=anchor==='middle'?-estimatedW/2:anchor==='end'?-estimatedW:0,top=(o.baseline==='hanging'?0:o.baseline==='middle'?-estimatedH/2:o.baseline==='text-after-edge'?-estimatedH:-size*.8);
      const lettering=o.lettering||state.gost.lettering||'B-V',oblique=String(lettering).endsWith('-S');const transform=`translate(${o.x} ${o.y}) rotate(${Number(o.rotation)||0}) ${oblique?'skewX(-15) ':''}scale(${widthFactor} 1)`;
      if(o.frame)add(g,'rect',{x:left-1,y:top-1,width:estimatedW+2,height:estimatedH+2,transform,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});
      const t=add(g,'text',{x:0,y:0,'font-family':o.font||state.gost.fontFamily||'Arial,sans-serif','font-size':size,fill:c,stroke:'none',transform,'font-weight':o.bold?'bold':'normal','font-style':o.italic?'italic':'normal','text-anchor':anchor,'dominant-baseline':o.baseline||'alphabetic','letter-spacing':letter||null,'text-decoration':[o.underline?'underline':'',o.overline?'overline':'',o.strike?'line-through':''].filter(Boolean).join(' ')||null});
      lines.forEach((line,i)=>{const sp=add(t,'tspan',{x:0,dy:i===0?0:lh});sp.textContent=line;});
    } else if(o.type==='dimension') renderDimension(g,o,selected);
    else if(o.type==='section'){
      const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1;
      add(g,'line',{x1:o.x,y1:o.y,x2:o.x2,y2:o.y2,stroke:c,'stroke-width':state.gost.mainLine});
      arrow(g,o.x,o.y,-dx/len,-dy/len,c,2.2);arrow(g,o.x2,o.y2,dx/len,dy/len,c,2.2);
      addText(g,o.x-2,o.y-2,o.label||'А',3.5,c);addText(g,o.x2+2,o.y2-2,o.label||'А',3.5,c);
    } else if(o.type==='leader'){
      const pts=o.points||[];if(pts.length>=2){const d=pts.map((p,i)=>(i?'L':'M')+` ${p.x} ${p.y}`).join(' ');add(g,'path',{d,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});const a=pts[0],b=pts[1],len=Math.hypot(b.x-a.x,b.y-a.y)||1;arrow(g,a.x,a.y,(b.x-a.x)/len,(b.y-a.y)/len,c,1.8);const end=pts[pts.length-1];add(g,'line',{x1:end.x,y1:end.y,x2:end.x+12,y2:end.y,stroke:c,'stroke-width':state.gost.thinLine});addText(g,end.x+1,end.y-1,o.text||'Примечание',2.5,c,'start');}
    } else if(o.type==='centerMark'){
      const s=o.size||5;add(g,'line',{x1:o.x-s,y1:o.y,x2:o.x+s,y2:o.y,stroke:c,'stroke-width':state.gost.thinLine});add(g,'line',{x1:o.x,y1:o.y-s,x2:o.x,y2:o.y+s,stroke:c,'stroke-width':state.gost.thinLine});
    } else if(o.type==='hatch'){
      const pid=`pat_${String(o.id).replace(/[^a-z0-9]/gi,'')}`;
      const pts=Array.isArray(o.points)&&o.points.length>=3?o.points:null;
      const x=pts?Math.min(...pts.map(p=>p.x)):Math.min(o.x,o.x2),y=pts?Math.min(...pts.map(p=>p.y)):Math.min(o.y,o.y2),w=pts?Math.max(...pts.map(p=>p.x))-x:Math.abs(o.x2-o.x),h=pts?Math.max(...pts.map(p=>p.y))-y:Math.abs(o.y2-o.y);
      const d=pts?`M ${pts.map((p,i)=>`${i?'L':' '}${p.x} ${p.y}`).join(' ')} Z`:null;
      if(o.pattern==='solid'){
        if(d)add(g,'path',{d,fill:o.color||c,'fill-opacity':.16,stroke:'none'});else add(g,'rect',{x,y,width:w,height:h,fill:o.color||c,'fill-opacity':.16,stroke:'none'});
      } else {
        const spacing=clamp(Number(o.spacing)||3,.5,100),angle=Number(o.angle??45),strokeWidth=clamp(Number(o.width)||state.gost.thinLine,.05,1),defs=add(g,'defs',{}),pat=add(defs,'pattern',{id:pid,width:spacing,height:spacing,patternUnits:'userSpaceOnUse',patternTransform:`rotate(${angle})`});
        add(pat,'path',{d:`M 0 0 L 0 ${spacing}`,stroke:o.color||c,'stroke-width':strokeWidth,fill:'none'});
        if(o.pattern==='cross')add(pat,'path',{d:`M 0 0 L ${spacing} 0`,stroke:o.color||c,'stroke-width':strokeWidth,fill:'none'});
        if(d)add(g,'path',{d,fill:`url(#${pid})`,stroke:'none'});else add(g,'rect',{x,y,width:w,height:h,fill:`url(#${pid})`,stroke:'none'});
      }
      if(o.showBoundary){if(d)add(g,'path',{d,fill:'none',stroke:o.color||c,'stroke-width':o.width||state.gost.thinLine});else add(g,'rect',{x,y,width:w,height:h,fill:'none',stroke:o.color||c,'stroke-width':o.width||state.gost.thinLine});}
    } else if(o.type==='roughness'){
      const s=o.size||5;add(g,'path',{d:`M ${o.x-s*.45} ${o.y+s*.25} L ${o.x} ${o.y-s*.45} L ${o.x+s*.45} ${o.y+s*.25} L ${o.x+s*1.8} ${o.y+s*.25}`,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});if(o.label)addText(g,o.x+s*.8,o.y-s*.5,o.label,2.5,c,'middle');
    } else if(o.type==='tolerance'){
      const w=Math.max(16,(o.text||'⌀0.05 | A').length*2.6+4),h=6;add(g,'rect',{x:o.x,y:o.y-h,width:w,height:h,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});addText(g,o.x+w/2,o.y-2,o.text||'⌀0.05 | A',2.5,c);
    } else if(o.type==='weld'){
      add(g,'line',{x1:o.x,y1:o.y,x2:o.x+18,y2:o.y,stroke:c,'stroke-width':state.gost.thinLine});add(g,'path',{d:`M ${o.x+5} ${o.y} L ${o.x+9} ${o.y-5} L ${o.x+13} ${o.y} Z`,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});addText(g,o.x+19,o.y-1,o.text||'a4',2.5,c,'start');
    } else if(o.type==='table'){
      const rows=o.rows||3,cols=o.cols||3,w=o.w||60,h=o.h||25,x=o.x,y=o.y;add(g,'rect',{x,y,width:w,height:h,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});for(let i=1;i<cols;i++)add(g,'line',{x1:x+w*i/cols,y1:y,x2:x+w*i/cols,y2:y+h,stroke:c,'stroke-width':state.gost.thinLine});for(let i=1;i<rows;i++)add(g,'line',{x1:x,y1:y+h*i/rows,x2:x+w,y2:y+h*i/rows,stroke:c,'stroke-width':state.gost.thinLine});(o.cells||[]).forEach((v,i)=>{if(v)addText(g,x+w*((i%cols)+.5)/cols,y+h*(Math.floor(i/cols)+.65)/rows,v,2.5,c);});
    }
    if(selected){const b=objectBounds(o);if(b){const box=add(g,'rect',{x:b.x-1.5,y:b.y-1.5,width:Math.max(3,b.w+3),height:Math.max(3,b.h+3),fill:'none',stroke:'#078db2','stroke-width':.3,'stroke-dasharray':'1.2 1','data-selection-outline':'true'});box.setAttribute('pointer-events','none');}}
  }
  function objectBounds(o){
    let pts=[];
    if(o.points)pts=o.points;
    else if(o.type==='arc'){const r=o.r||1;pts=[{x:o.x-r,y:o.y-r},{x:o.x+r,y:o.y+r}];}
    else if(o.type==='dimension'&&o.kind==='angular')pts=[{x:o.x,y:o.y},{x:o.x2,y:o.y2},{x:o.x3,y:o.y3}];
    else if(o.type==='text'||o.type==='techReq'){const lines=String(o.text||'').split('\n'),size=o.size||4,w=Math.max(5,...lines.map(t=>t.length*size*.62))*clamp(Number(o.widthFactor)||1,.25,3),h=Math.max(size,lines.length*(o.lineHeight||size*1.25));return{x:o.x-(o.align==='middle'?w/2:o.align==='end'?w:0),y:o.y-size*.8,w,h};}
    else if(o.type==='point')return{x:o.x-1.5,y:o.y-1.5,w:3,h:3};
    else if(o.type==='circle'){const r=Math.hypot(o.x2-o.x,o.y2-o.y);return{x:o.x-r,y:o.y-r,w:r*2,h:r*2};}
    else if(o.type==='table')return{x:o.x,y:o.y,w:o.w||60,h:o.h||25};
    else if(o.type==='reference')return{x:o.x,y:o.y,w:o.w||1,h:o.h||1};
    else if(o.type==='ellipse')return{x:Math.min(o.x,o.x2),y:Math.min(o.y,o.y2),w:Math.abs(o.x2-o.x),h:Math.abs(o.y2-o.y)};
    else pts=[{x:o.x,y:o.y},{x:o.x2??o.x,y:o.y2??o.y}];
    if(!pts.length)return null;const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  function unionBounds(objects){
    const boxes=objects.filter(o=>!o.hidden).map(objectBounds).filter(Boolean);if(!boxes.length)return null;
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),right=Math.max(...boxes.map(b=>b.x+b.w)),bottom=Math.max(...boxes.map(b=>b.y+b.h));
    return{x,y,w:Math.max(.2,right-x),h:Math.max(.2,bottom-y)};
  }
  function renderSelectionHandles(){
    selectionLayer.innerHTML='';
    const objects=getSelected().filter(o=>!o.hidden&&!o.locked&&!(o.type==='reference'&&o.locked));
    if(!objects.length)return;const b=unionBounds(objects);if(!b)return;
    add(selectionLayer,'rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'none',stroke:'#087fa0','stroke-width':.32,'stroke-dasharray':'1.5 1.1','pointer-events':'none'});
    const handles={nw:[b.x,b.y],n:[b.x+b.w/2,b.y],ne:[b.x+b.w,b.y],e:[b.x+b.w,b.y+b.h/2],se:[b.x+b.w,b.y+b.h],s:[b.x+b.w/2,b.y+b.h],sw:[b.x,b.y+b.h],w:[b.x,b.y+b.h/2]};
    Object.entries(handles).forEach(([key,[x,y]])=>{
      add(selectionLayer,'rect',{x:x-1.8,y:y-1.8,width:3.6,height:3.6,rx:.35,fill:'#f7fcff',stroke:'#087fa0','stroke-width':.55,'data-resize-handle':key,'pointer-events':'all',cursor:({nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize'})[key]});
    });
    const rx=b.x+b.w/2,ry=b.y-9;
    add(selectionLayer,'line',{x1:rx,y1:b.y,x2:rx,y2:ry+1.8,stroke:'#087fa0','stroke-width':.35,'pointer-events':'none'});
    add(selectionLayer,'circle',{cx:rx,cy:ry,r:2.6,fill:'#ffffff',stroke:'#087fa0','stroke-width':.7,'data-rotate-handle':'true','pointer-events':'all',cursor:'grab'});
    add(selectionLayer,'path',{d:`M ${rx-1.1} ${ry-.4} A 1.2 1.2 0 1 1 ${rx+.7} ${ry+1}`,fill:'none',stroke:'#087fa0','stroke-width':.35,'pointer-events':'none'});
  }
  function mapObjectPoint(p,oldB,newB){const sx=newB.w/Math.max(.0001,oldB.w),sy=newB.h/Math.max(.0001,oldB.h);return{x:mm(newB.x+(p.x-oldB.x)*sx),y:mm(newB.y+(p.y-oldB.y)*sy)};}
  function scaleObjectToBounds(source,oldB,newB){
    const o=deep(source),sx=newB.w/Math.max(.0001,oldB.w),sy=newB.h/Math.max(.0001,oldB.h),avg=(sx+sy)/2;
    const map=(x,y)=>mapObjectPoint({x,y},oldB,newB);
    if(o.type==='circle'&&Math.abs(sx-sy)>.0005){
      const c=map(o.x,o.y),r=Math.hypot(o.x2-o.x,o.y2-o.y),rx=Math.max(.05,r*sx),ry=Math.max(.05,r*sy);
      o.type='ellipse';o.x=mm(c.x-rx);o.y=mm(c.y-ry);o.x2=mm(c.x+rx);o.y2=mm(c.y+ry);
    } else if(o.type==='arc'&&Math.abs(sx-sy)>.0005){
      const delta=((o.end-o.start)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),steps=Math.max(16,Math.ceil(delta*18));
      o.points=Array.from({length:steps+1},(_,i)=>{const a=o.start+delta*i/steps;return map(o.x+Math.cos(a)*(o.r||1),o.y+Math.sin(a)*(o.r||1));});o.type='polyline';delete o.x;delete o.y;delete o.r;delete o.start;delete o.end;
    } else if(o.type==='reference'){
      const p=map(o.x,o.y);o.x=p.x;o.y=p.y;o.w=mm((o.w||1)*sx);o.h=mm((o.h||1)*sy);
    } else {
      if(o.points)o.points=o.points.map(p=>map(p.x,p.y));
      ['x','x2','x3'].forEach((k,i)=>{const yk=['y','y2','y3'][i];if(o[k]!==undefined&&o[yk]!==undefined){const p=map(o[k],o[yk]);o[k]=p.x;o[yk]=p.y;}});
      if(o.type==='table'){o.w=mm((o.w||60)*sx);o.h=mm((o.h||25)*sy);}
    }
    if(['text','techReq'].includes(o.type)){o.size=mm((o.size||3)*sy);o.lineHeight=mm((o.lineHeight||4)*sy);o.widthFactor=clamp((o.widthFactor||1)*sx/Math.max(.0001,sy),.1,10);o.letterSpacing=mm((o.letterSpacing||0)*sx);}
    if(o.type==='dimension'){o.textSize=mm((o.textSize||state.gost.textHeight)*sy);o.offset=mm((o.offset||0)*avg);o.radius=mm((o.radius||12)*avg);}
    if(o.type==='leader'&&o.points)o.arrowSize=mm((o.arrowSize||1.8)*avg);
    if(o.type==='reference'&&o.keepAspect!==false){o.h=mm(o.w/(source.aspect||source.w/Math.max(.001,source.h)||1));}
    ['size','radius','r','offset'].forEach(k=>{if(o[k]!==undefined&&o[k]!==null&&o.type!=='dimension')o[k]=mm(o[k]*avg);});
    if(o.rx!==undefined)o.rx=mm(o.rx*avg);
    return o;
  }
  function resizeBoundsFromPointer(startB,handle,p,keepAspect=false,aspect=1){
    let left=startB.x,right=startB.x+startB.w,top=startB.y,bottom=startB.y+startB.h;
    if(handle.includes('w'))left=Math.min(p.x,right-.2);if(handle.includes('e'))right=Math.max(p.x,left+.2);
    if(handle.includes('n'))top=Math.min(p.y,bottom-.2);if(handle.includes('s'))bottom=Math.max(p.y,top+.2);
    if(keepAspect&&handle.length===2){
      const w=right-left,h=bottom-top,ratio=aspect>0?aspect:startB.w/startB.h;
      if(Math.abs(w-startB.w)>=Math.abs(h-startB.h)){
        const wantedH=w/ratio;if(handle.includes('n'))top=bottom-wantedH;else bottom=top+wantedH;
      }else{
        const wantedW=h*ratio;if(handle.includes('w'))left=right-wantedW;else right=left+wantedW;
      }
    }
    return{x:mm(left),y:mm(top),w:mm(Math.max(.2,right-left)),h:mm(Math.max(.2,bottom-top))};
  }
  function beginResize(e,handle){
    const objects=getSelected().filter(o=>!o.hidden&&!o.locked&&!(o.type==='reference'&&o.locked));if(!objects.length)return;
    const box=unionBounds(objects);if(!box)return;
    state.resize={handle,start:pointFromEvent(e,true),box,originals:deep(objects),ids:objects.map(o=>o.id),historyBefore:snapshot(),keepAspect:objects.length===1&&objects[0].type==='reference'&&objects[0].keepAspect!==false,aspect:box.w/box.h};
    e.preventDefault();e.stopPropagation();try{svg.setPointerCapture(e.pointerId);}catch(_){}
    drawingArea.classList.add('resizing');
  }
  function applyResize(p,shiftKey=false){
    const r=state.resize;if(!r)return;
    const newB=resizeBoundsFromPointer(r.box,r.handle,p,r.keepAspect||shiftKey,r.aspect);
    r.originals.forEach(original=>{const idx=state.objects.findIndex(o=>o.id===original.id);if(idx>=0)state.objects[idx]=scaleObjectToBounds(original,r.box,newB);});
    renderAll();
  }
  function beginRotate(e){
    const objects=getSelected().filter(o=>!o.hidden&&!o.locked);if(!objects.length)return;
    const center=selectionCenter(objects),p=pointFromEvent(e,true);
    state.rotateDrag={center,startAngle:Math.atan2(p.y-center.y,p.x-center.x),originals:deep(objects),ids:objects.map(o=>o.id),historyBefore:snapshot(),delta:0};
    e.preventDefault();e.stopPropagation();try{svg.setPointerCapture(e.pointerId);}catch(_){}drawingArea.classList.add('rotating');
  }
  function applyRotateDrag(p,shiftKey=false){
    const r=state.rotateDrag;if(!r)return;let delta=Math.atan2(p.y-r.center.y,p.x-r.center.x)-r.startAngle;
    while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;
    if(shiftKey){const step=clamp(Number($('angleStep').value)||15,1,90)*Math.PI/180;delta=Math.round(delta/step)*step;}
    r.delta=delta;r.originals.forEach(original=>{const idx=state.objects.findIndex(o=>o.id===original.id);if(idx>=0){const transformed=deep(original);transformObj(transformed,r.center,delta);state.objects[idx]=transformed;}});
    renderAll();$('statusMessage').textContent=`Поворот: ${(delta*180/Math.PI).toFixed(1)}° · Shift — фиксация угла`;
  }
  function rotateSelectedBy(degrees){const objs=getSelected().filter(o=>!o.locked&&!o.hidden);if(!objs.length){setMessage('Выберите объекты для поворота');return;}const value=Number(degrees);if(!Number.isFinite(value)||Math.abs(value)<1e-9)return;const before=snapshot(),center=selectionCenter(objs);objs.forEach(o=>transformObj(o,center,value*Math.PI/180));commit(before);renderAll();setMessage(`Повернуто на ${value.toFixed(2)}°`);}
  function renderTree(){const el=$('objectTree');el.innerHTML='';state.objects.forEach((o,i)=>{const b=document.createElement('button');b.className='tree-object'+(state.selectedIds.includes(o.id)?' selected':'');b.textContent=`${o.hidden?'◌ ':o.locked?'🔒 ':''}${i+1}. ${o.name||({point:'Точка',section:'Линия разреза',techReq:'Тех. требования',reference:'Референс / подложка',line:'Отрезок',rect:'Прямоугольник',circle:'Окружность',ellipse:'Эллипс',arc:'Дуга',polyline:'Ломаная',spline:'Сплайн',freehand:'Свободная линия',text:'Текст',dimension:'Размер',leader:'Выноска',hatch:'Штриховка',centerMark:'Обозначение центра',roughness:'Шероховатость',tolerance:'Допуск',weld:'Сварка',table:'Таблица',breakline:'Линия обрыва',construction:'Вспомогательная линия',centerline:'Осевая линия'}[o.type]||o.type)}`;b.addEventListener('click',()=>{const group=o.groupId?state.objects.filter(x=>x.groupId===o.groupId):[o];state.selectedIds=group.map(x=>x.id);renderAll();});el.appendChild(b);});}
  function renderAll(){referenceLayer.innerHTML='';geometryLayer.innerHTML='';constructionLayer.innerHTML='';annotationLayer.innerHTML='';previewLayer.innerHTML='';selectionLayer.innerHTML='';state.objects.forEach(renderObject);renderRuler();renderSelectionHandles();$('geometryCount').textContent=state.objects.filter(o=>layerFor(o)==='geometry'&&!o.hidden).length;$('annotationCount').textContent=state.objects.filter(o=>layerFor(o)==='annotation'&&!o.hidden).length;$('constructionCount').textContent=state.objects.filter(o=>layerFor(o)==='construction'&&!o.hidden).length;$('selectedStatus').textContent=state.selectedIds.length;renderTree();updateSelectionPanel();}
  function updateSelectionPanel(){
    const arr=state.objects.filter(o=>state.selectedIds.includes(o.id)),o=arr.length===1?arr[0]:null;
    $('noSelection').classList.toggle('hidden',arr.length>0);$('selectionFields').classList.toggle('hidden',arr.length===0);const refsOnly=arr.length>0&&arr.every(x=>x.type==='reference'),allRefsLocked=refsOnly&&arr.every(x=>x.locked);$('quickReferenceLockBtn').disabled=!refsOnly;$('quickReferenceLockBtn').innerHTML=refsOnly?(allRefsLocked?'<span>🔓</span>Разрешить движение':'<span>🔒</span>Запретить движение'):'<span>🔒</span>Блокировка';$('quickReferenceLockBtn').setAttribute('aria-pressed',String(!!allRefsLocked));$('quickReferenceLockBtn').title=refsOnly?(allRefsLocked?'Разблокировать выбранные референсы':'Закрепить выбранные референсы'):'Выберите референс, чтобы переключить перемещение';
    if(arr.length>1)$('noSelection').textContent=`Выбрано объектов: ${arr.length}`;
    else $('noSelection').textContent='Объект не выбран';
    $('editTextFormatBtn').classList.toggle('hidden',!(o&&['text','techReq'].includes(o.type)));$('referenceSelectionFields').classList.toggle('hidden',!(o&&o.type==='reference'));$('objectLocked').checked=!!(o&&o.locked);$('objectGeometryFields').classList.toggle('hidden',!o);if(o){const derivedRotation=(o.type==='line'||o.type==='centerline'||o.type==='construction')?Math.atan2(o.y2-o.y,o.x2-o.x)*180/Math.PI:0;$('objectRotationAngle').value=mm(o.rotationTotal??o.rotation??derivedRotation);$('objectColor').value=o.color||'#20252a';$('objectWidth').value=o.width||.35;$('objectDash').value=o.linePattern==='wave'?'WAVE':o.linePattern==='zigzag'?'ZIGZAG':(o.dash||'');$('objectLayer').value=layerFor(o)==='reference'?'geometry':layerFor(o);$('objectName').value=o.name||'';$('objectTextSize').value=o.size||o.textSize||3;const box=objectBounds(o);if(box){$('objectBoxX').value=mm(box.x);$('objectBoxY').value=mm(box.y);$('objectBoxW').value=mm(Math.max(.1,box.w));$('objectBoxH').value=mm(Math.max(.1,box.h));}if(o.type==='reference'){$('referenceOpacity').value=Math.round((o.opacity??.35)*100);$('referenceOpacityValue').textContent=$('referenceOpacity').value+'%';$('referenceWidth').value=o.w||100;$('referenceHeight').value=o.h||60;$('referenceX').value=o.x||0;$('referenceY').value=o.y||0;$('referenceRotation').value=o.rotation||0;$('referenceLockStatus').textContent=o.locked?'🔒 Переміщення заборонено':'● Переміщення дозволено';$('referenceLockStatus').classList.toggle('locked',!!o.locked);$('referenceLockStatus').classList.toggle('unlocked',!o.locked);$('referenceLockBtn').textContent=o.locked?'🔓 Дозволити переміщення':'🔒 Заборонити переміщення';$('referenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));$('quickReferenceLockBtn').disabled=false;$('quickReferenceLockBtn').innerHTML=o.locked?'<span>🔓</span>Дозволити рух':'<span>🔒</span>Заборонити рух';$('quickReferenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));$('quickReferenceLockBtn').title=o.locked?'Клацніть, щоб дозволити переміщення референсу':'Клацніть, щоб заборонити переміщення референсу';$('referenceExportable').checked=!!o.exportable;$('referenceKeepAspect').checked=o.keepAspect!==false;}}
  }
  function applySelectedGeometry(){
    const selected=getSelected();if(selected.length!==1){setMessage('Для точного ввода габаритов выберите один объект');return;}
    const o=selected[0];if(o.locked){setMessage('Сначала снимите блокировку объекта');return;}
    const oldB=objectBounds(o),x=Number($('objectBoxX').value),y=Number($('objectBoxY').value),w=Number($('objectBoxW').value),h=Number($('objectBoxH').value);
    if(!oldB||![x,y,w,h].every(Number.isFinite)||w<=0||h<=0){setMessage('Проверьте координаты и размеры: ширина и высота должны быть больше нуля');return;}
    commit();const i=state.objects.findIndex(q=>q.id===o.id);if(i<0)return;state.objects[i]=scaleObjectToBounds(o,oldB,{x,y,w,h});renderAll();setMessage(`Размер объекта задан: ${w.toFixed(2)} × ${h.toFixed(2)} мм`);
  }
  function snapshot(){return{format:state.format,objects:deep(state.objects),title:deep(state.title),titleForm:state.titleForm,fileName:state.fileName,projectId:state.projectId,ruler:deep(state.ruler),rulerMode:state.rulerMode,rulerVisible:state.rulerVisible,gost:deep(state.gost),viewPan:deep(state.viewPan),template:state.template,visible:deep(visible)};}
  function persistAutosave(){try{localStorage.setItem('kompasOnlineAutosave',JSON.stringify(snapshot()));}catch(e){setMessage('Автосохранение недоступно: память браузера заполнена или отключена');}}
  function updateHistoryButtons(){const u=$('undoBtn'),r=$('redoBtn');if(u)u.disabled=state.history.length===0;if(r)r.disabled=state.redo.length===0;}
  function recordHistory(before){if(!before)return;state.history.push(deep(before));if(state.history.length>100)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';updateHistoryButtons();Promise.resolve().then(persistAutosave);}
  function commit(before=snapshot()){recordHistory(before);}
  function restore(s){state.format=s.format;state.objects=deep(s.objects||[]);state.title=deep(s.title||state.title);state.titleForm=(!s.titleForm||s.titleForm==='form1')?'user-template':s.titleForm;state.projectId=s.projectId??state.projectId;state.fileName=s.fileName||state.fileName;state.ruler=deep(s.ruler||null);state.rulerMode=s.rulerMode||'off';state.rulerVisible=s.rulerVisible!==false;state.gost=Object.assign({},state.gost,s.gost||{});state.viewPan=deep(s.viewPan||{x:0,y:0});if(typeof s.template==='boolean')state.template=s.template;if(s.visible)Object.assign(visible,s.visible);$('templateToggle').checked=state.template;$('templateVisible').checked=visible.template;$('geometryVisible').checked=visible.geometry;$('dimensionsVisible').checked=visible.dimensions;$('constructionVisible').checked=visible.construction;$('referenceVisibleToggle').checked=visible.reference;$('referenceVisibleToggleSecondary').checked=visible.reference;applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;state.selectedIds=[];syncTitleInputs();$('paperFormat').value=state.format;renderTemplate();renderAll();updateHistoryButtons();}
  function undo(){if(state.rotateDrag||state.resize){setMessage('Сначала завершите или отмените текущее преобразование');return;}if(!state.history.length){setMessage('Нет действий для отмены');return;}const current=snapshot(),previous=state.history.pop();state.redo.push(deep(current));if(state.redo.length>100)state.redo.shift();restore(previous);state.dirty=true;updateHistoryButtons();persistAutosave();$('saveState').textContent='Есть несохранённые изменения';setMessage('Действие отменено · Ctrl+Y или Ctrl+Shift+Z — повторить');}
  function redo(){if(state.rotateDrag||state.resize){setMessage('Сначала завершите или отмените текущее преобразование');return;}if(!state.redo.length){setMessage('Нет действий для повтора');return;}const current=snapshot(),next=state.redo.pop();state.history.push(deep(current));if(state.history.length>100)state.history.shift();restore(next);state.dirty=true;updateHistoryButtons();persistAutosave();$('saveState').textContent='Есть несохранённые изменения';setMessage('Действие повторено · Ctrl+Z — отменить');}
  function addObject(o){const before=snapshot();o.id=`obj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;o.name=o.name||'';o.color=o.color||(o.type==='construction'?'#8c969d':'#20252a');o.width=o.width??(annotationTypes.has(o.type)||constructionTypes.has(o.type)||['freehand','breakline'].includes(o.type)?state.gost.thinLine:state.gost.mainLine);o.layer=o.layer|| (annotationTypes.has(o.type)?'annotation':constructionTypes.has(o.type)?'construction':'geometry');if(o.type==='centerline'&&!o.dash)o.dash='12 3 1 3';if(o.type==='construction'&&!o.dash)o.dash='';if(['text','techReq'].includes(o.type)){o.size=o.size??state.gost.textHeight??3.5;o.lettering=o.lettering||state.gost.lettering||'B-V';o.font=o.font||state.gost.fontFamily||'Arial,sans-serif';}state.objects.push(o);state.selectedIds=[o.id];commit(before);renderAll();setMessage('Объект добавлен');}
  function createHatchFromSelectedBoundary(){
    const selected=getSelected().filter(o=>!o.hidden&&!o.locked);if(selected.length!==1){setMessage('Выберите один замкнутый контур для штриховки');return;}
    const src=selected[0];let points=[];
    if(src.type==='rect'){const x1=Math.min(src.x,src.x2),x2=Math.max(src.x,src.x2),y1=Math.min(src.y,src.y2),y2=Math.max(src.y,src.y2);points=[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];}
    else if(src.type==='circle'){const r=Math.hypot(src.x2-src.x,src.y2-src.y);points=Array.from({length:96},(_,i)=>({x:mm(src.x+Math.cos(i*Math.PI/48)*r),y:mm(src.y+Math.sin(i*Math.PI/48)*r)}));}
    else if(src.type==='ellipse'){const cx=(src.x+src.x2)/2,cy=(src.y+src.y2)/2,rx=Math.abs(src.x2-src.x)/2,ry=Math.abs(src.y2-src.y)/2;points=Array.from({length:96},(_,i)=>({x:mm(cx+Math.cos(i*Math.PI/48)*rx),y:mm(cy+Math.sin(i*Math.PI/48)*ry)}));}
    else if((src.type==='polyline'||src.type==='spline'||src.type==='freehand')&&src.closed&&Array.isArray(src.points))points=deep(src.points);
    if(points.length<3){setMessage('Поддерживаются прямоугольники, окружности, эллипсы и замкнутые контуры.');return;}
    addObject({type:'hatch',name:'Штриховка',points,closed:true,pattern:$('hatchPattern').value,angle:Number($('hatchAngle').value)||45,spacing:clamp(Number($('hatchSpacing').value)||3,.5,100),width:clamp(Number($('hatchWidth').value)||state.gost.thinLine,.05,1),color:$('hatchColor').value||'#20252a',layer:'annotation',boundaryOf:src.id});
    setMessage('Штриховка создана внутри выделенного контура. Контур сохранён отдельно.');
  }
  function selectTool(tool){state.tool=tool;if(tool!=='select')state.referenceCalibration=null;state.points=[];state.freehandDraft=null;previewLayer.innerHTML='';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const names={select:'Выбор: щелчок — объект, Shift — добавить, рамка — выделить область',line:'Отрезок: две точки. Shift фиксирует угол с заданным шагом',freehand:'Свободная линия: зажмите левую кнопку и ведите курсор; линия сгладится автоматически',ruler:'Линейка: укажите начало и конец линейки; затем выберите привязку параллельно или перпендикулярно',construction:'Вспомогательная прямая: две точки',centerline:'Осевая линия: две точки',point:'Точка: щёлкните по листу',section:'Обозначение разреза: две точки линии сечения',techReq:'Технические требования: точка вставки и многострочный текст',polyline:'Ломаная: точки; двойной щелчок или Enter — завершить',spline:'Сплайн: точки; двойной щелчок или Enter — завершить',rect:'Прямоугольник: два противоположных угла',roundRect:'Скруглённый прямоугольник: два угла; радиус задаётся параметром',circle:'Окружность: центр и радиус',arc:'Дуга: центр, начало, конец',ellipse:'Эллипс: два угла габаритной рамки',polygon:'Многоугольник: центр и радиус',breakline:'Линия обрыва: две точки',dimAuto:'Авторазмер: две точки; тип определяется направлением',dimension:'Линейный размер: две точки',dimH:'Горизонтальный размер: две точки',dimV:'Вертикальный размер: две точки',dimRad:'Радиальный размер: центр и точка на окружности',dimDia:'Диаметральный размер: центр и точка на окружности',dimAngle:'Угловой размер: вершина и две точки на сторонах угла',measure:'Измерение: две точки',text:'Текст: щёлкните на листе',leader:'Выноска: точка объекта, излом, конец текста',centerMark:'Обозначение центра: щёлкните по центру',hatch:'Прямоугольная штриховка: укажите два противоположных угла. Для замкнутого контура выделите его и нажмите «Заштриховать выделенный контур»',roughness:'Шероховатость: точка размещения',tolerance:'Допуск формы: точка размещения',weld:'Обозначение сварки: точка размещения',table:'Таблица: точка вставки'};setMessage(names[tool]||'Готово');$('canvasHint').textContent=names[tool]||'Выберите инструмент';$('canvasHint').classList.toggle('hide',tool==='select');}
  function snapToObjects(p){if(!state.objectSnap)return p;const candidates=[];for(const o of state.objects){if(o.points){o.points.forEach(q=>candidates.push(q));}else if(o.type==='circle'){candidates.push({x:o.x,y:o.y});candidates.push({x:(o.x+o.x2)/2,y:(o.y+o.y2)/2});}else if(o.type==='rect'||o.type==='line'||o.type==='construction'||o.type==='centerline'){const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2};candidates.push(a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});}else if(o.type==='ellipse'){candidates.push({x:(o.x+o.x2)/2,y:(o.y+o.y2)/2});}}
    let best=null,dist=2.1;candidates.forEach(q=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<dist){dist=d;best=q;}});return best?{x:mm(best.x),y:mm(best.y)}:p;}
  function pointFromEvent(e,raw=false){const r=svg.getBoundingClientRect(),d=dimensions();let x=(e.clientX-r.left)/r.width*d.w,y=(e.clientY-r.top)/r.height*d.h;const step=gridStep();if(raw)return{x:mm(x),y:mm(y)};if(state.snap){x=Math.round(x/step)*step;y=Math.round(y/step)*step;}const a=state.points[state.points.length-1];const lineTools=['line','polyline','spline','construction','centerline','breakline','section','dimension','dimAuto','dimH','dimV'];if(a&&e.shiftKey&&lineTools.includes(state.tool)){const angleStep=clamp(Number($('angleStep').value)||15,1,90)*Math.PI/180,dx=x-a.x,dy=y-a.y,len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),snapped=Math.round(angle/angleStep)*angleStep;x=a.x+Math.cos(snapped)*len;y=a.y+Math.sin(snapped)*len;}if(a&&state.ortho&&lineTools.includes(state.tool)){if(Math.abs(x-a.x)>=Math.abs(y-a.y))y=a.y;else x=a.x;}if(a&&state.ruler&&state.rulerMode!=='off'&&lineTools.includes(state.tool)){let ux=state.ruler.b.x-state.ruler.a.x,uy=state.ruler.b.y-state.ruler.a.y,len=Math.hypot(ux,uy)||1;ux/=len;uy/=len;if(state.rulerMode==='perpendicular'){const t=ux;ux=-uy;uy=t;}const dx=x-a.x,dy=y-a.y,t=dx*ux+dy*uy;x=a.x+ux*t;y=a.y+uy*t;}const p={x:mm(x),y:mm(y)};return snapToObjects(p);}
  function drawPreview(p){previewLayer.innerHTML='';const pts=state.points;if(state.tool==='select'&&state.selectionRect){const r=state.selectionRect;add(previewLayer,'rect',{x:Math.min(r.start.x,p.x),y:Math.min(r.start.y,p.y),width:Math.abs(p.x-r.start.x),height:Math.abs(p.y-r.start.y),fill:'#0b91b4','fill-opacity':.08,stroke:'#078db2','stroke-width':.25,'stroke-dasharray':'1 1'});return;}if(state.tool==='ruler'&&pts.length){drawRulerGraphics(previewLayer,pts[0],p,.8);return;}if(!pts.length)return;const a=pts[0];let el;
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
  const GOST_TEXT_HEIGHTS=[1.8,2.5,3.5,5,7,10,14,20];
  const GOST_SCALES=['1:1','1:2','1:2.5','1:4','1:5','1:10','1:15','1:20','1:25','1:40','1:50','1:75','1:100','1:200','1:400','1:500','1:800','1:1000','2:1','2.5:1','4:1','5:1','10:1','20:1','40:1','50:1','100:1'];
  function applyGostControls(){
    if($('standardProfile'))$('standardProfile').value=state.gost.profile||'dstu-gost-ua';
    if($('gostMainLine'))$('gostMainLine').value=state.gost.mainLine;
    if($('gostThinLine'))$('gostThinLine').value=state.gost.thinLine;
    if($('gostLineGroup'))$('gostLineGroup').value=String(state.gost.mainLine||.5);
    if($('gostTextHeight'))$('gostTextHeight').value=state.gost.textHeight;
    if($('gostArrowLength'))$('gostArrowLength').value=state.gost.arrowLength;
    if($('gostPrecision'))$('gostPrecision').value=state.gost.precision;
    if($('gostLettering'))$('gostLettering').value=state.gost.lettering||'B-V';
    if($('standardCustomFields'))$('standardCustomFields').classList.toggle('hidden',(state.gost.profile||'eskd-study')!=='custom');
    if($('defaultTextSize'))$('defaultTextSize').value=state.gost.textHeight;
  }
  function applyGostProfile(quiet=false){
    commit();
    const selected=$('standardProfile').value;
    state.gost={profile:selected==='custom'?'custom':(selected==='dstu-gost-ua'?'dstu-gost-ua':'eskd-study'),mainLine:.5,thinLine:.25,textHeight:3.5,arrowLength:3.5,precision:1,lettering:'B-V',fontFamily:'GOST type B,Arial,sans-serif'};
    applyGostControls();$('standardCustomFields').classList.toggle('hidden',selected!=='custom');
    $('dimensionOffset').value='5';
    if(!quiet)setMessage(selected==='dstu-gost-ua'?'Профіль ДСТУ ГОСТ 2.104:2006 застосовано до нових об’єктів (межі чинності див. у довідці)':'Навчальний профіль ЄСКД застосовано до нових об’єктів');
  }
  function readGostSettings(){
    commit();state.gost={profile:$('standardProfile').value,mainLine:clamp(Number($('gostMainLine').value)||.5,.13,2),thinLine:clamp(Number($('gostThinLine').value)||.25,.13,1),textHeight:GOST_TEXT_HEIGHTS.includes(Number($('gostTextHeight').value))?Number($('gostTextHeight').value):3.5,arrowLength:clamp(Number($('gostArrowLength').value)||3.5,2,10),precision:clamp(Number.isFinite(Number($('gostPrecision').value))?Number($('gostPrecision').value):1,0,3),lettering:$('gostLettering').value||'B-V',fontFamily:(String($('gostLettering').value||'B-V').startsWith('A')?'GOST type A,Arial,sans-serif':'GOST type B,Arial,sans-serif')};
    applyGostControls();setMessage('Настройки оформления сохранены для новых объектов');
  }
  function normalizeSelectedToGost(){
    const selected=getSelected();if(!selected.length){setMessage('Сначала выделите объекты для приведения к профилю');return;}
    const thinTypes=new Set(['dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','section','techReq','freehand','breakline']);
    commit();selected.forEach(o=>{if(o.type==='reference')return;o.width=thinTypes.has(o.type)?state.gost.thinLine:state.gost.mainLine;if(o.type==='centerline')o.dash='12 3 1 3';if(o.type==='construction')o.dash='';if(['text','techReq'].includes(o.type)){o.size=state.gost.textHeight;o.lettering=state.gost.lettering||'B-V';o.font=state.gost.fontFamily||'Arial,sans-serif';o.bold=false;o.italic=false;o.widthFactor=1;o.letterSpacing=0;}if(o.type==='dimension')o.textSize=state.gost.textHeight;});
    renderAll();setMessage('Выделенные объекты приведены к толщине и высоте текста профиля');
  }
  function checkGost(){
    const issues=[],ok=[];
    const d=dimensions();const allowedFmt={A4:[210,297],A3:[297,420],A2:[420,594],A1:[594,841],A0:[841,1189]};
    const key=state.format.slice(0,2),expected=allowedFmt[key];
    if(expected&&(Math.min(d.w,d.h)!==expected[0]||Math.max(d.w,d.h)!==expected[1]))issues.push('Размер листа не совпадает с выбранным форматом A-серии.');else ok.push(`Формат ${key}: размеры листа соответствуют ряду A.`);
    if(!GOST_SCALES.includes(String(state.title.scale||'1:1')))issues.push(`Масштаб «${state.title.scale}» не входит в список рекомендованных масштабов ЕСКД. Проверьте ГОСТ 2.302.`);else ok.push(`Масштаб ${state.title.scale}: из стандартного ряда.`);
    if(!state.template||!visible.template)ok.push('Чёрная рамка листа остаётся видимой; слой штампа временно скрыт.');else ok.push('Чёрная рамка и основная надпись отображаются.');
    const badText=state.objects.filter(o=>['text','techReq'].includes(o.type)&&!GOST_TEXT_HEIGHTS.includes(Number(o.size||state.gost.textHeight)));
    if(badText.length)issues.push(`Найдено ${badText.length} текстовых объектов с высотой вне ряда ISO 3098: 1,8; 2,5; 3,5; 5; 7; 10; 14; 20 мм.`);else ok.push('Высота текста в основных объектах соответствует принятому ряду высот.');
    const linePairs=[[.25,.13],[.35,.18],[.5,.25],[.7,.35],[1,.5],[1.4,.7],[2,1]];if(!linePairs.some(([w,n])=>Math.abs(state.gost.mainLine-w)<.011&&Math.abs(state.gost.thinLine-n)<.011))issues.push('Пара товщин не збігається з рекомендованими парами ISO 128-24; виберіть групу в налаштуваннях.');else ok.push('Пара товщин відповідає вибраній групі ISO 128-24.');
    const widthSeries=[.13,.18,.25,.35,.5,.7,1,1.4,2];const invalidWidths=state.objects.filter(o=>o.type!=='reference'&&o.width!==undefined&&!widthSeries.some(v=>Math.abs(v-Number(o.width))<.011));if(invalidWidths.length)issues.push(`${invalidWidths.length} об'єктів мають товщину поза рядом 0,13–2,0 мм.`);else ok.push('Товщини задані зі стандартного ряду 0,13–2,0 мм.');
    const letteringBad=state.objects.filter(o=>['text','techReq'].includes(o.type)&&o.lettering&&!['A-V','A-S','B-V','B-S'].includes(o.lettering));if(letteringBad.length)issues.push('Є текст із невідомим типом креслярського шрифту.');else ok.push('Для тексту задано тип креслярського шрифту A/B і вертикальне/похиле начертання.');
    const nonStandardText=state.objects.filter(o=>['text','techReq'].includes(o.type)&&(o.bold||o.italic||Math.abs((o.widthFactor??1)-1)>.01||Math.abs(Number(o.letterSpacing)||0)>.001));if(nonStandardText.length)issues.push(`${nonStandardText.length} текстових об’єктів мають жирність, курсив або змінені пропорції/інтервали; для стандартного креслярського напису нормалізуйте їх.`);else ok.push('Текст не має ручної жирності, курсиву або змінених пропорцій.');
    const missingCenterline=state.objects.filter(o=>o.type==='centerline'&&!o.dash);
    if(missingCenterline.length)issues.push(`${missingCenterline.length} осевых линий не имеют штрихпунктирного типа линии.`);else ok.push('Осевые линии имеют заданный штрихпунктирный стиль.');
    const thinTypes=new Set(['dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','section','techReq','freehand','breakline']);
    const widthWarn=state.objects.filter(o=>o.type!=='reference'&&Math.abs((o.width??(thinTypes.has(o.type)?state.gost.thinLine:state.gost.mainLine))-(thinTypes.has(o.type)?state.gost.thinLine:state.gost.mainLine))>.06);
    if(widthWarn.length)issues.push(`${widthWarn.length} объектов имеют толщину, отличающуюся от выбранного профиля (основная ${state.gost.mainLine} мм / тонкая ${state.gost.thinLine} мм).`);else ok.push('Толщины линий совпадают с заданными значениями профиля.');
    const refs=state.objects.filter(o=>o.type==='reference'&&!o.exportable);
    if(refs.length)ok.push(`${refs.length} референс(а) исключены из печати и SVG/PNG, как вспомогательные подложки.`);
    if(!state.title.title?.trim())issues.push('Не заполнено наименование документа в основной надписи.');
    if(!state.title.code?.trim())issues.push('Не заполнено обозначение документа в основной надписи.');
    const list=$('gostCheckResults');list.innerHTML='';
    [...issues.map(x=>({bad:true,text:x})),...ok.map(x=>({bad:false,text:x}))].forEach(item=>{const row=document.createElement('div');row.className='gost-result '+(item.bad?'bad':'good');row.textContent=(item.bad?'⚠ ':'✓ ')+item.text;list.appendChild(row);});
    $('gostSummary').textContent=issues.length?`Найдено замечаний: ${issues.length}. Это предварительная проверка, не официальная сертификация.`:'Базовые автоматические проверки пройдены. Это не заменяет нормоконтроль.';
    $('gostModal').classList.remove('hidden');
  }
  function importReference(file,placement=null){
    if(!/^image\/(png|jpeg|webp|bmp)$/i.test(file.type)){alert('Выбери изображение PNG, JPG, WEBP или BMP. SVG и документы не поддерживаются.');return;}
    if(file.size>40*1024*1024){alert('Файл слишком большой. Выбери изображение до 40 МБ.');return;}
    const reader=new FileReader();reader.onerror=()=>alert('Не удалось прочитать файл.');reader.onload=()=>{
      const img=new Image();img.onerror=()=>alert('Файл изображения повреждён или не поддерживается.');img.onload=()=>{
        const max=2000,ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);let dataUrl;try{dataUrl=canvas.toDataURL('image/webp',.88);if(!dataUrl.startsWith('data:image/webp'))dataUrl=canvas.toDataURL('image/png');}catch(e){alert('Не удалось обработать изображение.');return;}
        const d=dimensions(),aspect=canvas.width/canvas.height,w=Math.min(100,d.w-30),h=w/aspect,center=placement?pointFromEvent(placement,true):{x:d.w/2,y:d.h/2};const o={type:'reference',name:file.name||'Референс',x:mm(center.x-w/2),y:mm(center.y-h/2),w:mm(w),h:mm(h),aspect,opacity:.48,rotation:0,locked:false,exportable:false,dataUrl,layer:'reference',keepAspect:true};
        visible.reference=true;$('referenceVisibleToggle').checked=true;addObject(o);setMessage(o.locked?'Референс добавлен и закреплён. Отредактируй координаты в свойствах или сними закрепление кнопкой.':'Референс добавлен. Выбери его для настройки размера и положения.');
      };img.src=reader.result;
    };reader.readAsDataURL(file);
  }
  function selectedReferences(){return getSelected().filter(o=>o.type==='reference');}
  function toggleReferenceLock(){
    const refs=selectedReferences();if(!refs.length){setMessage('Выбери референс, чтобы закрепить или снять закрепление');return;}
    const next=!refs.every(o=>o.locked);commit();refs.forEach(o=>o.locked=next);renderAll();setMessage(next?'Референс закреплён: случайное перетаскивание отключено':'Закрепление референса снято');
  }
  function centerReferences(mode='sheet'){
    const refs=selectedReferences();if(!refs.length){setMessage('Выбери референс для центрирования');return;}
    let center;
    if(mode==='geometry'){
      const picked=getSelected().filter(o=>o.type!=='reference'&&!o.hidden);
      const candidates=picked.length?picked:state.objects.filter(o=>o.type!=='reference'&&!o.hidden);
      const b=unionBounds(candidates);if(b)center={x:b.x+b.w/2,y:b.y+b.h/2};
    }
    if(!center){const d=dimensions();center={x:d.w/2,y:d.h/2};}
    commit();refs.forEach(o=>{const w=o.w||1,h=o.h||1;o.x=mm(center.x-w/2);o.y=mm(center.y-h/2);});renderAll();setMessage(mode==='geometry'?'Референс выровнен по центру геометрии':'Референс выровнен по центру листа');
  }
  function fitSelectedReference(){
    const refs=selectedReferences();if(!refs.length){setMessage('Выбери референс');return;}const d=dimensions();
    commit();refs.forEach(o=>{const aspect=o.aspect||((o.w||1)/(o.h||1)),w=Math.min(d.w-30,(d.h-30)*aspect),h=w/aspect;o.w=mm(w);o.h=mm(h);o.x=mm((d.w-w)/2);o.y=mm((d.h-h)/2);o.rotation=0;});renderAll();setMessage('Референс вписан в лист и отцентрирован');
  }
  let editingTextId=null;
  function textValuesFromForm(){return{text:$('textContent').value,font:$('textFontCustom').value.trim()||$('textFont').value,size:clamp(Number($('textSize').value)||3,.5,50),widthFactor:clamp((Number($('textWidthFactor').value)||100)/100,.25,3),rotation:Number($('textRotation').value)||0,align:$('textAlign').value,baseline:$('textBaseline').value,lineHeight:clamp(Number($('textLineHeight').value)||4,.5,100),letterSpacing:clamp(Number($('textLetterSpacing').value)||0,-2,10),lettering:$('textLettering').value||state.gost.lettering||'B-V',color:$('textColor').value,bold:$('textBold').checked,italic:$('textItalic').checked,underline:$('textUnderline').checked,overline:$('textOverline').checked,strike:$('textStrike').checked,frame:$('textFrame').checked};}
  function openTextDialog(position,existing){editingTextId=existing?.id||null;const o=existing||{};$('textModalTitle').textContent=existing?'Редактирование текста':'Создание текста';$('textContent').value=o.text??'Текст';const font=o.font||state.gost.fontFamily||'GOST type B,Arial,sans-serif';$('textFontCustom').value='';$('textFont').value=font;if($('textFont').value!==font)$('textFontCustom').value=font;$('textLettering').value=o.lettering||state.gost.lettering||'B-V';$('textSize').value=o.size||Number($('defaultTextSize').value)||3;$('textWidthFactor').value=Math.round((o.widthFactor||1)*100);$('textRotation').value=o.rotation||0;$('textAlign').value=o.align||'start';$('textBaseline').value=o.baseline||'alphabetic';$('textLineHeight').value=o.lineHeight||((o.size||3)*1.25);$('textLetterSpacing').value=o.letterSpacing||0;$('textColor').value=o.color||'#20252a';$('textBold').checked=!!o.bold;$('textItalic').checked=!!o.italic;$('textUnderline').checked=!!o.underline;$('textOverline').checked=!!o.overline;$('textStrike').checked=!!o.strike;$('textFrame').checked=!!o.frame;$('textPosX').value=mm(position?.x??o.x??0);$('textPosY').value=mm(position?.y??o.y??0);$('textModal').classList.remove('hidden');$('textContent').focus();}
  function closeTextDialog(){ $('textModal').classList.add('hidden'); editingTextId=null; }
  function applyTextDialog(){const value=textValuesFromForm();if(!value.text.trim()){setMessage('Введите текст надписи');$('textContent').focus();return;}value.x=mm($('textPosX').value);value.y=mm($('textPosY').value);value.layer='annotation';if(editingTextId){const target=state.objects.find(o=>o.id===editingTextId);if(target){commit();Object.assign(target,value);renderAll();setMessage('Текст и его оформление обновлены');}}else addObject({type:'text',...value});closeTextDialog();}
  function onCanvasPointerDown(e){
    if(state.pendingPolarCenter&&e.button===0){const p=pointFromEvent(e,true);state.pendingPolarCenter=false;setPolarCenter(p);$('polarArrayModal').classList.remove('hidden');setMessage(`Центр массива выбран: X ${p.x.toFixed(2)} мм · Y ${p.y.toFixed(2)} мм`);e.preventDefault();return;}
    if(e.button===1||state.space){e.preventDefault();e.stopPropagation();state.pan={x:e.clientX,y:e.clientY,originX:state.viewPan.x,originY:state.viewPan.y,pointerId:e.pointerId};drawingArea.classList.add('dragging');try{(e.target.setPointerCapture?e.target:svg).setPointerCapture(e.pointerId);}catch(_){}return;}
    const rotateHandle=e.target.closest?.('[data-rotate-handle]');if(rotateHandle&&state.tool==='select'){beginRotate(e);return;}
    const resizeHandle=e.target.closest?.('[data-resize-handle]');if(resizeHandle&&state.tool==='select'){beginResize(e,resizeHandle.getAttribute('data-resize-handle'));return;}
    if(state.referenceCalibration){
      const cal=state.referenceCalibration,p=pointFromEvent(e,true);cal.points.push(p);
      if(cal.points.length===1){setMessage('Первая точка отмечена. Укажи вторую точку известного расстояния на референсе');return;}
      const o=state.objects.find(x=>x.id===cal.id),a=cal.points[0],b=cal.points[1],measured=Math.hypot(b.x-a.x,b.y-a.y);
      state.referenceCalibration=null;
      if(!o||measured<.01){selectTool('select');setMessage('Калибровка отменена: не удалось измерить отрезок');return;}
      const factor=cal.knownLength/measured,oldW=o.w||1,oldH=o.h||1,oldCx=o.x+oldW/2,oldCy=o.y+oldH/2;
      commit();o.w=clamp(oldW*factor,1,2000);const actualFactor=o.w/oldW;o.h=o.w/(o.aspect||1);const newCx=a.x+(oldCx-a.x)*actualFactor,newCy=a.y+(oldCy-a.y)*actualFactor;o.x=newCx-o.w/2;o.y=newCy-o.h/2;renderAll();selectTool('select');setMessage(`Референс откалиброван: ширина ${o.w.toFixed(2)} мм`);return;
    }
    const target=e.target.closest('[data-id]');
    if(state.tool==='select'){
      if(target){const id=target.getAttribute('data-id'),hitObj=state.objects.find(o=>o.id===id),group=hitObj?.groupId?state.objects.filter(o=>o.groupId===hitObj.groupId):[hitObj],groupIds=group.filter(Boolean).map(o=>o.id);if(e.shiftKey){const allSelected=groupIds.every(gid=>state.selectedIds.includes(gid));state.selectedIds=allSelected?state.selectedIds.filter(x=>!groupIds.includes(x)):[...new Set([...state.selectedIds,...groupIds])];}else if(!groupIds.every(gid=>state.selectedIds.includes(gid)))state.selectedIds=groupIds;renderAll();const objs=getSelected().filter(o=>!o.locked&&!(o.type==='reference'&&o.locked));if(objs.length)state.drag={ids:objs.map(o=>o.id),start:pointFromEvent(e),originals:deep(objs),historyBefore:snapshot(),moved:false};else setMessage('Выбранные объекты заблокированы');}
      else{if(!e.shiftKey)state.selectedIds=[];state.selectionRect={start:pointFromEvent(e,true),current:pointFromEvent(e,true),initial:[...state.selectedIds]};renderAll();}return;
    }
    const p=pointFromEvent(e);if(state.tool==='ruler'){state.points.push(p);if(state.points.length===1){setMessage('Укажите конец линейки');return;}const a=state.points[0],b=p;state.points=[];if(Math.hypot(b.x-a.x,b.y-a.y)<1){previewLayer.innerHTML='';setMessage('Линейка слишком короткая');return;}previewLayer.innerHTML='';commit();state.ruler={a:deep(a),b:deep(b)};renderRuler();setMessage('Линейка установлена. Выберите параллельную или перпендикулярную привязку');return;}if(state.tool==='freehand'){state.freehandDraft=[pointFromEvent(e,true)];previewLayer.innerHTML='';try{svg.setPointerCapture(e.pointerId);}catch(_){}return;}if(state.tool==='point'){addObject({type:'point',x:p.x,y:p.y,size:.7});return;}
    if(state.tool==='techReq'){const value=prompt('Технические требования (каждая строка — отдельный пункт):','1. Неуказанные радиусы 2 мм.\n2. Острые кромки притупить.');if(value!==null&&value.trim())addObject({type:'techReq',x:p.x,y:p.y,text:value,size:clamp(Number($('defaultTextSize').value)||3,.5,50),lineHeight:4,layer:'annotation'});return;}
    if(state.tool==='text'||state.tool==='roughness'||state.tool==='tolerance'||state.tool==='weld'||state.tool==='centerMark'||state.tool==='table'){
      if(state.tool==='text'){openTextDialog({x:p.x,y:p.y},null);}
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
    else if(state.tool==='hatch')addObject({type:'hatch',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'annotation',spacing:clamp(Number($('hatchSpacing').value)||3,.5,100),angle:Number($('hatchAngle').value)||45,pattern:$('hatchPattern').value,width:clamp(Number($('hatchWidth').value)||state.gost.thinLine,.05,1),color:$('hatchColor').value||'#20252a'});
    else if(['dimension','dimAuto','dimH','dimV','dimRad','dimDia'].includes(state.tool)){
      const kind=state.tool==='dimAuto'?(Math.abs(p.x-a.x)>=Math.abs(p.y-a.y)*2?'horizontal':Math.abs(p.y-a.y)>=Math.abs(p.x-a.x)*2?'vertical':'linear'):state.tool==='dimH'?'horizontal':state.tool==='dimV'?'vertical':state.tool==='dimRad'?'radius':state.tool==='dimDia'?'diameter':'linear';
      addObject({type:'dimension',kind,x:a.x,y:a.y,x2:p.x,y2:p.y,offset:clamp(Number($('dimensionOffset').value)||5,-100,100),layer:'annotation'});
    }
  }
  function finishPath(){if((state.tool==='polyline'||state.tool==='spline')&&state.points.length>=2){addObject({type:state.tool==='spline'?'spline':'polyline',points:deep(state.points),closed:false});state.points=[];previewLayer.innerHTML='';}else if(state.tool==='polyline'||state.tool==='spline'){state.points=[];previewLayer.innerHTML='';setMessage('Нужно минимум две точки');}}
  function onPointerMove(e){const raw=pointFromEvent(e,true),p=pointFromEvent(e);$('coordinates').textContent=`X: ${p.x.toFixed(2)} · Y: ${p.y.toFixed(2)} мм`;
    if(state.pan){state.viewPan.x=state.pan.originX+(e.clientX-state.pan.x);state.viewPan.y=state.pan.originY+(e.clientY-state.pan.y);svg.style.transform=`translate(${state.viewPan.x}px, ${state.viewPan.y}px)`;return;}
    if(state.rotateDrag){applyRotateDrag(raw,e.shiftKey);return;}
    if(state.resize){applyResize(raw,e.shiftKey);return;}
    if(state.drag){const dx=p.x-state.drag.start.x,dy=p.y-state.drag.start.y;if(Math.abs(dx)+Math.abs(dy)>.03){state.drag.moved=true;state.drag.ids.forEach((id,i)=>{const o=state.objects.find(x=>x.id===id);if(o){Object.assign(o,deep(state.drag.originals[i]));translateObject(o,dx,dy);}});renderAll();}return;}
    if(state.selectionRect){state.selectionRect.current=raw;drawPreview(raw);return;}
    if(state.freehandDraft){const last=state.freehandDraft[state.freehandDraft.length-1];if(Math.hypot(raw.x-last.x,raw.y-last.y)>=.25)state.freehandDraft.push(raw);previewLayer.innerHTML='';const path=add(previewLayer,'path',{d:smoothPath(state.freehandDraft,Number($('freehandSmooth').value)||0),fill:'none',stroke:'#078db2','stroke-width':clamp(Number($('freehandWidth').value)||state.gost.thinLine,.05,3),'stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':'1 0'});return;}
    if(state.points.length)drawPreview(p);
  }
  function onPointerUp(){if(state.freehandDraft){const pts=state.freehandDraft;state.freehandDraft=null;previewLayer.innerHTML='';if(pts.length>1){const smooth=Number($('freehandSmooth').value)||0;addObject({type:'freehand',points:deep(pts),smooth,layer:'geometry',width:clamp(Number($('freehandWidth').value)||state.gost.thinLine,.05,3)});}else setMessage('Свободная линия слишком короткая');return;}if(state.rotateDrag){const r=state.rotateDrag;state.rotateDrag=null;drawingArea.classList.remove('rotating');if(Math.abs(r.delta)>.0001){recordHistory(r.historyBefore);setMessage(`Поворот завершён: ${(r.delta*180/Math.PI).toFixed(1)}°`);}else setMessage('Поворот отменён');renderAll();return;}if(state.resize){const r=state.resize;state.resize=null;drawingArea.classList.remove('resizing');const changed=JSON.stringify(r.originals)!==JSON.stringify(r.ids.map(id=>state.objects.find(o=>o.id===id)).filter(Boolean));if(changed)recordHistory(r.historyBefore);renderAll();setMessage(changed?'Размер выбранных объектов изменён':'Размер не изменён');return;}if(state.pan){state.pan=null;drawingArea.classList.remove('dragging');state.dirty=true;$('saveState').textContent='Изменён вид чертежа';persistAutosave();}if(state.drag){if(state.drag.moved){recordHistory(state.drag.historyBefore);setMessage('Объекты перемещены');}state.drag=null;}if(state.selectionRect){const r=state.selectionRect,a=r.start,b=r.current||r.start,minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);const ids=state.objects.filter(o=>{const bb=objectBounds(o);return bb&&bb.x>=minX&&bb.y>=minY&&bb.x+bb.w<=maxX&&bb.y+bb.h<=maxY;}).map(o=>o.id);state.selectedIds=r.initial.concat(ids).filter((id,i,a)=>a.indexOf(id)===i);state.selectionRect=null;previewLayer.innerHTML='';renderAll();setMessage(`Выделено объектов: ${state.selectedIds.length}`);}}
  function intersectLines(a,b,c,d){const den=(a.x-b.x)*(c.y-d.y)-(a.y-b.y)*(c.x-d.x);if(Math.abs(den)<1e-8)return null;const t=((a.x-c.x)*(c.y-d.y)-(a.y-c.y)*(c.x-d.x))/den,u=-((a.x-b.x)*(a.y-c.y)-(a.y-b.y)*(a.x-c.x))/den;if(t<0||t>1||u<0||u>1)return null;return{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y),t};}
  function splitLineAt(o,p){const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2},dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(len2||1),0,1),q={x:mm(a.x+t*dx),y:mm(a.y+t*dy)};if(t<.02||t>.98){setMessage('Точка разбиения слишком близко к концу отрезка');return;}commit();const idx=state.objects.findIndex(x=>x.id===o.id);state.objects.splice(idx,1,{...deep(o),id:newId(),x:a.x,y:a.y,x2:q.x,y2:q.y},{...deep(o),id:newId(),x:q.x,y:q.y,x2:b.x,y2:b.y});state.selectedIds=[];renderAll();setMessage('Отрезок разбит на два');}
  function trimLineAt(o,p){const a={x:o.x,y:o.y},b={x:o.x2,y:o.y2},hits=[];state.objects.filter(x=>x.id!==o.id).forEach(x=>{if(x.type==='line'||x.type==='construction'||x.type==='centerline'){const h=intersectLines(a,b,{x:x.x,y:x.y},{x:x.x2,y:x.y2});if(h)hits.push(h);}else if(x.type==='rect'){const l=x.x,t=x.y,r=x.x2,bt=x.y2;[[{x:l,y:t},{x:r,y:t}],[{x:r,y:t},{x:r,y:bt}],[{x:r,y:bt},{x:l,y:bt}],[{x:l,y:bt},{x:l,y:t}]].forEach(pair=>{const h=intersectLines(a,b,pair[0],pair[1]);if(h)hits.push(h);});}});if(!hits.length){setMessage('Не найдено пересечений с другими линиями');return;}const dx=b.x-a.x,dy=b.y-a.y,tClick=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),hit=hits.sort((u,v)=>Math.abs(u.t-tClick)-Math.abs(v.t-tClick))[0];commit();if(tClick<hit.t){o.x2=mm(hit.x);o.y2=mm(hit.y);}else{o.x=mm(hit.x);o.y=mm(hit.y);}renderAll();setMessage('Отрезок усечён до ближайшего пересечения');}
  function selectionCenter(objs){const boxes=objs.map(objectBounds).filter(Boolean);if(!boxes.length)return{x:0,y:0};const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),r=Math.max(...boxes.map(b=>b.x+b.w)),bt=Math.max(...boxes.map(b=>b.y+b.h));return{x:(x+r)/2,y:(y+bt)/2};}
  function transformPoint(p,c,angle,scale=1,flip=null){let x=p.x-c.x,y=p.y-c.y;if(flip==='vertical')x=-x;if(flip==='horizontal')y=-y;const cs=Math.cos(angle),sn=Math.sin(angle);return{x:mm(c.x+(x*cs-y*sn)*scale),y:mm(c.y+(x*sn+y*cs)*scale)};}
  function transformObj(o,c,angle,scale=1,flip=null){
    const rotating=Math.abs(angle)>1e-7;
    if(o.type==='reference'){
      const oldW=o.w||1,oldH=o.h||1,center={x:o.x+oldW/2,y:o.y+oldH/2},next=transformPoint(center,c,angle,scale,flip);
      o.w=mm(oldW*scale);o.h=mm(oldH*scale);o.x=mm(next.x-o.w/2);o.y=mm(next.y-o.h/2);
      o.rotation=flip==='vertical'?180-(o.rotation||0):flip==='horizontal'?-(o.rotation||0):(o.rotation||0)+angle*180/Math.PI;
      if(flip)o.mirrorY=!o.mirrorY;return;
    }
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
    if(rotating&&o.type!=='text'&&o.type!=='techReq')o.rotationTotal=mm((o.rotationTotal||0)+angle*180/Math.PI);
    if(o.type==='arc'){
      if(flip==='vertical'){o.start=Math.PI-o.start;o.end=Math.PI-o.end;}
      else if(flip==='horizontal'){o.start=-o.start;o.end=-o.end;}
      else{o.start+=angle;o.end+=angle;}
      o.r*=scale;
    }
    if(o.type==='text'||o.type==='techReq'){
      if(o.rotation===undefined)o.rotation=0;
      o.rotation=flip==='vertical'?0:flip==='horizontal'?0:o.rotation+angle*180/Math.PI;
    }
    if(o.radius)o.radius*=scale;if(o.size)o.size*=scale;if(o.w)o.w*=scale;if(o.h)o.h*=scale;if(o.offset)o.offset*=scale;
  }
  function reflectPointAcrossLine(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(l2<1e-9)return{x:p.x,y:p.y};const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2,qx=a.x+t*dx,qy=a.y+t*dy;return{x:mm(2*qx-p.x),y:mm(2*qy-p.y)};}
  function reflectObjectAcrossLine(o,a,b){
    const phi=Math.atan2(b.y-a.y,b.x-a.x),reflect=p=>reflectPointAcrossLine(p,a,b),reflectAngle=ang=>2*phi-ang;
    if(o.type==='reference'){const cx=o.x+(o.w||0)/2,cy=o.y+(o.h||0)/2,q=reflect({x:cx,y:cy});o.x=mm(q.x-(o.w||0)/2);o.y=mm(q.y-(o.h||0)/2);let r=reflectAngle((Number(o.rotation)||0)*Math.PI/180)*180/Math.PI;while(r>180)r-=360;while(r<-180)r+=360;o.rotation=mm(r);o.mirrorY=!o.mirrorY;return;}
    if(o.type==='rect'){const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2);o.points=[[x1,y1],[x2,y1],[x2,y2],[x1,y2]].map(([x,y])=>reflect({x,y}));o.type='polyline';o.closed=true;['x','y','x2','y2','rx'].forEach(k=>delete o[k]);}
    else if(o.type==='ellipse'){const cx=(o.x+o.x2)/2,cy=(o.y+o.y2)/2,rx=Math.abs(o.x2-o.x)/2,ry=Math.abs(o.y2-o.y)/2;o.points=Array.from({length:64},(_,i)=>reflect({x:cx+Math.cos(i*Math.PI/32)*rx,y:cy+Math.sin(i*Math.PI/32)*ry}));o.type='polyline';o.closed=true;['x','y','x2','y2'].forEach(k=>delete o[k]);}
    else if(o.type==='circle'){const p=reflect({x:o.x,y:o.y}),edge=reflect({x:o.x2,y:o.y2});o.x=p.x;o.y=p.y;o.x2=edge.x;o.y2=edge.y;}
    else if(o.points)o.points=o.points.map(reflect);
    ['x','x2','x3'].forEach((k,i)=>{const yk=['y','y2','y3'][i];if(o[k]!==undefined&&o[yk]!==undefined){const p=reflect({x:o[k],y:o[yk]});o[k]=p.x;o[yk]=p.y;}});
    if(o.type==='arc'){const start=o.start,end=o.end;o.start=reflectAngle(end);o.end=reflectAngle(start);}
    if(o.type==='text'||o.type==='techReq'){let r=reflectAngle((Number(o.rotation)||0)*Math.PI/180)*180/Math.PI;while(r>180)r-=360;while(r<-180)r+=360;if(r>90)r-=180;if(r<-90)r+=180;o.rotation=mm(r);}
  }
  function openMirrorDialog(objs){const c=selectionCenter(objs),mode=$('mirrorAxisMode');$('mirrorX1').value=mm(c.x);$('mirrorY1').value=mm(c.y-100);$('mirrorX2').value=mm(c.x);$('mirrorY2').value=mm(c.y+100);mode.value='vertical';$('mirrorKeepOriginal').checked=false;$('mirrorCustomPoints').classList.add('hidden');$('mirrorModal').classList.remove('hidden');}
  function closeMirrorDialog(){$('mirrorModal').classList.add('hidden');}
  function applyMirrorDialog(){const objs=getSelected();if(!objs.length){closeMirrorDialog();return;}const mode=$('mirrorAxisMode').value,c=selectionCenter(objs);let a,b;if(mode==='vertical'){a={x:c.x,y:c.y-1000};b={x:c.x,y:c.y+1000};}else if(mode==='horizontal'){a={x:c.x-1000,y:c.y};b={x:c.x+1000,y:c.y};}else{a={x:Number($('mirrorX1').value),y:Number($('mirrorY1').value)};b={x:Number($('mirrorX2').value),y:Number($('mirrorY2').value)};if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||Math.hypot(b.x-a.x,b.y-a.y)<.001){alert('Задайте две различные точки оси симметрии.');return;}}const keep=$('mirrorKeepOriginal').checked;commit();const targets=keep?objs.map(o=>({...deep(o),id:newId(),name:o.name?`${o.name} — дзеркальна копія`:''})):objs;targets.forEach(o=>reflectObjectAcrossLine(o,a,b));if(keep)state.objects.push(...targets);state.selectedIds=targets.map(o=>o.id);closeMirrorDialog();renderAll();setMessage(`Дзеркально відображено об'єктів: ${targets.length}${keep}; оригінал ${keep?'збережено':'змінено'}`);}
  function polarSelection(){return (state.polarSelectionIds||state.selectedIds).map(id=>state.objects.find(o=>o.id===id)).filter(o=>o&&!o.hidden&&!o.locked);}
  function setPolarCenter(p){$('polarCenterX').value=mm(p.x);$('polarCenterY').value=mm(p.y);updatePolarSummary();}
  function updatePolarSummary(){
    const count=clamp(Math.round(Number($('polarCount').value)||5),2,100),angle=clamp(Number($('polarAngle').value)||360,1,360),full=$('polarFullCircle').checked;
    const step=angle/(full?count:Math.max(1,count-1));$('polarArraySummary').textContent=`${count} елементів · крок ${step.toFixed(2)}° · ${full?'без дубля кінцевої позиції':'з обома кінцями дуги'} · вихідний об'єкт зберігається.`;
  }
  function openPolarArrayDialog(objs,repeat=false){
    const usable=(objs||getSelected()).filter(o=>o&&!o.locked&&!o.hidden);
    if(!usable.length){setMessage('Спочатку виділіть один або кілька незаблокованих об’єктів');return;}
    state.polarSelectionIds=usable.map(o=>o.id);state.pendingPolarCenter=false;
    const d=dimensions(),last=repeat?state.lastPolarArray:null;
    $('polarCount').value=last?.count||5;$('polarAngle').value=last?.angle||360;$('polarFullCircle').checked=last?.fullCircle??true;$('polarRotateCopies').checked=last?.rotateCopies??true;
    const center=last?{x:last.cx,y:last.cy}:{x:d.w/2,y:d.h/2};setPolarCenter(center);
    $('polarArrayModal').classList.remove('hidden');updatePolarSummary();
  }
  function setPolarCenterFromSheet(mode){
    if(mode==='sheet'){const d=dimensions();setPolarCenter({x:d.w/2,y:d.h/2});return;}
    const objs=polarSelection();if(objs.length)setPolarCenter(selectionCenter(objs));
  }
  function applyPolarArray(){
    const objs=polarSelection();if(!objs.length){setMessage('Об’єкти для дублювання більше не доступні');$('polarArrayModal').classList.add('hidden');return;}
    const count=clamp(Math.round(Number($('polarCount').value)||5),2,100),span=Number($('polarAngle').value),cx=Number($('polarCenterX').value),cy=Number($('polarCenterY').value),fullCircle=$('polarFullCircle').checked,rotateCopies=$('polarRotateCopies').checked;
    if(!Number.isFinite(span)||span<=0||span>360||!Number.isFinite(cx)||!Number.isFinite(cy)){setMessage('Перевірте кількість, кут і координати центра');return;}
    const pivot={x:mm(cx),y:mm(cy)},groupCenter=selectionCenter(objs),denom=fullCircle?count:count-1,clones=[];
    commit();
    for(let i=1;i<count;i++){
      const angle=(span*i/denom)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
      const nextCenter={x:mm(pivot.x+(groupCenter.x-pivot.x)*cos-(groupCenter.y-pivot.y)*sin),y:mm(pivot.y+(groupCenter.x-pivot.x)*sin+(groupCenter.y-pivot.y)*cos)};
      const dx=nextCenter.x-groupCenter.x,dy=nextCenter.y-groupCenter.y,groupMap=new Map();
      objs.forEach(o=>{
        const n=deep(o);n.id=newId();
        if(n.groupId){if(!groupMap.has(n.groupId))groupMap.set(n.groupId,newId());n.groupId=groupMap.get(n.groupId);}
        if(rotateCopies)transformObj(n,pivot,angle);else translateObject(n,dx,dy);
        n.name=o.name?`${o.name} · ${i+1}`:'';clones.push(n);
      });
    }
    state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);state.lastPolarArray={count,angle:span,fullCircle,rotateCopies,cx:pivot.x,cy:pivot.y};
    $('polarArrayModal').classList.add('hidden');renderAll();setMessage(`Кругове дублювання: ${count} позицій, створено ${clones.length} копій`);
  }
  function repeatPolarArray(){if(!state.lastPolarArray){setMessage('Ще немає попереднього кругового масиву');return;}openPolarArrayDialog(getSelected(),true);}

  function applyAction(action){const objs=getSelected();
    if(action==='showAll'){if(state.objects.some(o=>o.hidden)){commit();state.objects.forEach(o=>o.hidden=false);renderAll();setMessage('Все скрытые объекты снова отображаются');}else setMessage('Нет скрытых объектов');return;}
    if(!objs.length){setMessage('Сначала выберите один или несколько объектов');return;}
    if(action==='group'){if(objs.length<2){setMessage('Для группы выберите минимум два объекта');return;}commit();const gid=`group_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;objs.forEach(o=>o.groupId=gid);renderAll();setMessage(`Объекты объединены в группу (${objs.length})`);return;}
    if(action==='ungroup'){const ids=new Set(objs.map(o=>o.groupId).filter(Boolean));if(!ids.size){setMessage('Среди выбранных объектов нет групп');return;}commit();objs.forEach(o=>delete o.groupId);renderAll();setMessage('Выбранные объекты разгруппированы');return;}
    if(action==='toggleLock'){const next=!objs.every(o=>o.locked);commit();objs.forEach(o=>o.locked=next);renderAll();setMessage(next?'Выбранные объекты заблокированы':'Блокировка снята');return;}
    if(action==='hideSelected'){commit();objs.forEach(o=>o.hidden=true);state.selectedIds=[];renderAll();setMessage('Выбранные объекты скрыты. Для возврата нажмите «Показать все»');return;}
    if(action==='bringFront'||action==='sendBack'){commit();const ids=new Set(objs.map(o=>o.id)),picked=state.objects.filter(o=>ids.has(o.id)),rest=state.objects.filter(o=>!ids.has(o.id));state.objects=action==='bringFront'?[...rest,...picked]:[...picked,...rest];renderAll();setMessage(action==='bringFront'?'Объекты перемещены вперёд':'Объекты перемещены назад');return;}
    if(action.startsWith('align')||action==='centerToSheet'||action==='distributeH'||action==='distributeV'){
      const movable=objs.filter(o=>!o.locked);if(!movable.length){setMessage('Все выбранные объекты заблокированы');return;}
      const bounds=movable.map(o=>({o,b:objectBounds(o)})).filter(x=>x.b);if(!bounds.length)return;
      if((action==='distributeH'||action==='distributeV')&&bounds.length<3){setMessage('Для распределения выберите минимум три объекта');return;}
      commit();const left=Math.min(...bounds.map(x=>x.b.x)),top=Math.min(...bounds.map(x=>x.b.y)),right=Math.max(...bounds.map(x=>x.b.x+x.b.w)),bottom=Math.max(...bounds.map(x=>x.b.y+x.b.h));
      if(action==='centerToSheet'){const d=dimensions(),dx=d.w/2-(left+right)/2,dy=d.h/2-(top+bottom)/2;movable.forEach(o=>translateObject(o,dx,dy));}
      else if(action==='alignLeft'||action==='alignCenter'||action==='alignRight'||action==='alignTop'||action==='alignMiddle'||action==='alignBottom'){
        bounds.forEach(({o,b})=>{let dx=0,dy=0;if(action==='alignLeft')dx=left-b.x;if(action==='alignCenter')dx=(left+right)/2-(b.x+b.w/2);if(action==='alignRight')dx=right-(b.x+b.w);if(action==='alignTop')dy=top-b.y;if(action==='alignMiddle')dy=(top+bottom)/2-(b.y+b.h/2);if(action==='alignBottom')dy=bottom-(b.y+b.h);translateObject(o,dx,dy);});
      } else {
        const horizontal=action==='distributeH',sorted=bounds.slice().sort((a,b)=>horizontal?a.b.x-b.b.x:a.b.y-b.b.y),start=horizontal?sorted[0].b.x:sorted[0].b.y,end=horizontal?sorted[sorted.length-1].b.x+sorted[sorted.length-1].b.w:sorted[sorted.length-1].b.y+sorted[sorted.length-1].b.h,total=sorted.reduce((sum,x)=>sum+(horizontal?x.b.w:x.b.h),0),gap=(end-start-total)/(sorted.length-1);let cursor=start;sorted.forEach(({o,b},i)=>{const delta=cursor-(horizontal?b.x:b.y);translateObject(o,horizontal?delta:0,horizontal?0:delta);cursor+=(horizontal?b.w:b.h)+gap;});
      }
      renderAll();setMessage('Выравнивание / распределение выполнено');return;
    }
    if(action==='zoomSelected'){const b=objs.map(objectBounds).filter(Boolean);if(!b.length)return;const x=Math.min(...b.map(q=>q.x)),y=Math.min(...b.map(q=>q.y)),r=Math.max(...b.map(q=>q.x+q.w)),bt=Math.max(...b.map(q=>q.y+q.h)),d=dimensions(),w=drawingArea.clientWidth-80,h=drawingArea.clientHeight-80;setZoom(clamp(Math.min(w/Math.max(1,r-x+16),h/Math.max(1,bt-y+16)),.25,6));drawingArea.scrollLeft=Math.max(0,(x+(r-x)/2)*state.zoom-drawingArea.clientWidth/2);drawingArea.scrollTop=Math.max(0,(y+(bt-y)/2)*state.zoom-drawingArea.clientHeight/2);setMessage('Выбранные объекты показаны крупнее');return;}
    if(action==='moveBy'){const dx=Number(prompt('Смещение по X, мм:','10')),dy=Number(prompt('Смещение по Y, мм:','0'));if(!Number.isFinite(dx)||!Number.isFinite(dy))return;commit();objs.forEach(o=>translateObject(o,dx,dy));renderAll();setMessage(`Сдвиг выполнен: ΔX ${dx} мм, ΔY ${dy} мм`);return;}
    if(action==='duplicate'){commit();const clones=objs.map(o=>({...deep(o),id:newId(),name:o.name?`${o.name} копия`:''}));clones.forEach(o=>translateObject(o,5,5));state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage('Копия создана со смещением 5 мм');return;}
    if(action==='rotate'){$('objectRotationAngle').focus();$('objectRotationAngle').select();setMessage('Введите угол в панели свойств и нажмите «Повернуть»; либо тяните круглую ручку над выделением.');return;}
    if(action==='mirror'){openMirrorDialog(objs);return;}
    if(action==='scale'){const k=Number(prompt('Коэффициент масштабирования:','2'));if(!Number.isFinite(k)||k<=0)return;commit();const c=selectionCenter(objs);objs.forEach(o=>transformObj(o,c,0,k));renderAll();setMessage(`Масштабирование ×${k} выполнено`);return;}
    if(action==='offset'){const dist=Number(prompt('Расстояние эквидистанты, мм:','2'));if(!Number.isFinite(dist)||!dist)return;commit();const clones=[];objs.forEach(o=>{const n=deep(o);n.id=newId();if(o.type==='line'){const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1,ox=-dy/len*dist,oy=dx/len*dist;translateObject(n,ox,oy);clones.push(n);}else if(o.type==='circle'){const r=Math.hypot(o.x2-o.x,o.y2-o.y)+dist;if(r>0){n.x2=n.x+(o.x2-o.x)/Math.hypot(o.x2-o.x,o.y2-o.y)*r;n.y2=n.y+(o.y2-o.y)/Math.hypot(o.x2-o.x,o.y2-o.y)*r;clones.push(n);}}else if(o.type==='rect'){const sign=dist>0?1:-1;n.x-=sign*Math.abs(dist);n.y-=sign*Math.abs(dist);n.x2+=sign*Math.abs(dist);n.y2+=sign*Math.abs(dist);clones.push(n);}});if(clones.length){state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);}renderAll();setMessage('Эквидистанта создана для поддерживаемых объектов');return;}
    if(action==='fillet'||action==='chamfer'){const value=Number(prompt(action==='fillet'?'Радиус скругления, мм:':'Размер фаски, мм:','2'));if(!Number.isFinite(value)||value<=0)return;let changed=0;commit();objs.forEach(o=>{if(o.type==='rect'){const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2);if(action==='fillet'){o.rx=Math.min(value,(x2-x1)/2,(y2-y1)/2);}else{o.type='polyline';o.closed=true;o.points=[{x:x1+value,y:y1},{x:x2-value,y:y1},{x:x2,y:y1+value},{x:x2,y:y2-value},{x:x2-value,y:y2},{x:x1+value,y:y2},{x:x1,y:y2-value},{x:x1,y:y1+value}];delete o.x;delete o.y;delete o.x2;delete o.y2;}changed++;}});renderAll();setMessage(`${action==='fillet'?'Скругление':'Фаска'}: обработано ${changed} прямоугольников`);return;}
    if(action==='arrayRect'){const cols=clamp(Number(prompt('Количество столбцов:','3'))||3,1,30),rows=clamp(Number(prompt('Количество строк:','2'))||2,1,30),dx=Number(prompt('Шаг по X, мм:','15')),dy=Number(prompt('Шаг по Y, мм:','15'));if(!Number.isFinite(dx)||!Number.isFinite(dy))return;commit();const clones=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(r===0&&c===0)continue;objs.forEach(o=>{const n={...deep(o),id:newId()};translateObject(n,c*dx,r*dy);clones.push(n);});}state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Создан прямоугольный массив: ${cols} × ${rows}`);return;}
    if(action==='arrayPolar'){openPolarArrayDialog(objs);return;}if(action==='repeatPolarArray'){repeatPolarArray();return;}
    if(action==='split'||action==='trim'){selectTool(action);setMessage(`Укажите на выбранном отрезке место операции «${action==='split'?'Разбить':'Усечь'}»`);}
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  // Local project library: IndexedDB is used for larger drawings and embedded image references.
  const PROJECT_DB_NAME='KompasOnlineProjectLibrary';
  const PROJECT_DB_VERSION=1;
  let projectDbPromise=null;
  let preferFallbackStorage=false;
  let volatileProjects=new Map();
  let storageMode='indexeddb';
  function openProjectDb(){
    if(!('indexedDB' in window))return Promise.reject(new Error('IndexedDB недоступен'));
    if(projectDbPromise)return projectDbPromise;
    projectDbPromise=new Promise((resolve,reject)=>{
      let request;
      try{request=indexedDB.open(PROJECT_DB_NAME,PROJECT_DB_VERSION);}catch(e){reject(e);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('projects')){const store=db.createObjectStore('projects',{keyPath:'id'});store.createIndex('updatedAt','updatedAt',{unique:false});}};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Не удалось открыть базу файлов'));
      request.onblocked=()=>reject(new Error('База файлов заблокирована другой вкладкой'));
    });
    return projectDbPromise;
  }
  function fallbackProjects(){
    try{return Object.assign(Object.fromEntries(volatileProjects),JSON.parse(localStorage.getItem('kompasOnlineProjectLibraryFallback')||'{}'));}
    catch(e){return Object.fromEntries(volatileProjects);}
  }
  function writeFallbackProjects(all){
    try{localStorage.setItem('kompasOnlineProjectLibraryFallback',JSON.stringify(all));storageMode='localStorage';volatileProjects.clear();return true;}
    catch(e){volatileProjects=new Map(Object.entries(all));storageMode='memory';return false;}
  }
  async function libraryCall(mode,method,value){
    try{
      if(preferFallbackStorage)throw new Error('Используется резервное хранилище');
      const db=await openProjectDb();
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('projects',mode),store=tx.objectStore('projects');
        let req;
        if(method==='put')req=store.put(value);else if(method==='get')req=store.get(value);else if(method==='delete')req=store.delete(value);else req=store.getAll();
        let result;
        req.onsuccess=()=>{result=req.result;};req.onerror=()=>reject(req.error||new Error('Ошибка базы файлов'));
        tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('Транзакция не выполнена'));tx.onabort=()=>reject(tx.error||new Error('Транзакция отменена'));
      });
    }catch(err){
      preferFallbackStorage=true;
      const all=fallbackProjects();
      if(method==='put'){all[value.id]=value;writeFallbackProjects(all);return value;}
      if(method==='get')return all[value]||null;
      if(method==='delete'){delete all[value];writeFallbackProjects(all);return true;}
      return Object.values(all);
    }
  }
  function makeDocument(){return{app:'Kompas Online',version:8,format:state.format,fileName:state.fileName,title:deep(state.title),titleForm:state.titleForm||'user-template',objects:deep(state.objects),ruler:deep(state.ruler),rulerMode:state.rulerMode,rulerVisible:state.rulerVisible,gost:deep(state.gost),viewPan:deep(state.viewPan),template:state.template,visible:deep(visible)};}
  function fileStamp(ms){try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(ms));}catch(e){return new Date(ms).toLocaleString();}}
  async function saveProject(options={}){
    let name=String(options.name||$('filenameField')?.value||state.fileName||'Кресленик_1').trim();
    if(options.saveAs){const asked=prompt('Название нового файла:',name+' — копия');if(asked===null)return;name=asked.trim();}
    if(!name){alert('Укажите название файла.');return;}
    state.title=readTitleValues();
    state.fileName=name;
    renderTemplate();
    const now=Date.now(),id=(options.saveAs||!state.projectId)?`drawing_${now}_${Math.random().toString(36).slice(2,8)}`:state.projectId;
    let previous=null;if(!options.saveAs&&id){try{previous=await libraryCall('readonly','get',id);}catch(e){}}
    const doc=makeDocument();doc.fileName=name;
    const record={id,name,createdAt:previous?.createdAt||now,updatedAt:now,format:state.format,objectCount:state.objects.length,data:doc};
    try{
      await libraryCall('readwrite','put',record);
      state.projectId=id;state.fileName=name;state.dirty=false;$('filenameField').value=name;renderTemplate();
      $('saveState').textContent=storageMode==='memory'?'Временно збережено':'Збережено в браузері';
      setMessage(storageMode==='memory'?`Файл «${name}» тимчасово збережено в пам’яті вкладки. Завантажте JSON-копію.`:`Файл «${name}» збережено у списку`);
      persistAutosave();
      if(!$('filesModal').classList.contains('hidden'))await renderProjectLibrary();
    }catch(err){alert('Не удалось сохранить файл: '+err.message);setMessage('Помилка збереження');}
  }
  function exportProjectJson(doc,name){const payload=doc||makeDocument();downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`${(name||state.fileName||'drawing').replace(/[\\/:*?"<>|]/g,'_')}.json`);setMessage('Резервная копия JSON скачана');}
  async function exportSavedProject(id){const rec=await libraryCall('readonly','get',id);if(rec)exportProjectJson(rec.data,rec.name);}
  async function applyLoadedDocument(doc,projectId=null,nameOverride=null){
    if(!doc||!Array.isArray(doc.objects)||!window.KompasTemplate.dimensions(doc.format||'A4P'))throw new Error('Неверный формат проекта');
    if(state.dirty&&!confirm('Есть несохранённые изменения. Открыть другой файл и заменить текущий чертёж?'))return false;
    state.format=doc.format||'A4P';$('paperFormat').value=state.format;state.fileName=nameOverride||doc.fileName||'Імпортований_кресленик';state.projectId=projectId;state.title=Object.assign({},state.title,doc.title||{});state.titleForm=(!doc.titleForm||doc.titleForm==='form1')?'user-template':doc.titleForm;
    state.ruler=doc.ruler||null;state.rulerMode=doc.rulerMode||'off';state.rulerVisible=doc.rulerVisible!==false;state.gost=Object.assign({},state.gost,doc.gost||{});if(state.gost.profile==='dstu-gost-ua'&&Number(state.gost.thinLine)===.18)state.gost.thinLine=.25;if(!state.gost.lettering)state.gost.lettering='B-V';state.viewPan=deep(doc.viewPan||{x:0,y:0});if(typeof doc.template==='boolean')state.template=doc.template;if(doc.visible)Object.assign(visible,doc.visible);else{state.template=true;visible.template=true;}
    $('templateToggle').checked=state.template;$('templateVisible').checked=visible.template;$('geometryVisible').checked=visible.geometry;$('dimensionsVisible').checked=visible.dimensions;$('constructionVisible').checked=visible.construction;$('referenceVisibleToggle').checked=visible.reference;$('referenceVisibleToggleSecondary').checked=visible.reference;
    state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];state.history=[];state.redo=[];updateHistoryButtons();
    applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;syncTitleInputs();renderTemplate();renderAll();state.dirty=false;$('saveState').textContent=projectId?'Файл відкрито':'Импортированный файл';setMessage('Кресленик відкрито');return true;
  }
  function loadProject(file){const reader=new FileReader();reader.onload=async()=>{try{const doc=JSON.parse(reader.result);const ok=await applyLoadedDocument(doc,null,doc.fileName||file.name.replace(/\.json$/i,''));if(ok)setMessage('JSON-файл успешно импортирован');}catch(err){alert(`Не удалось открыть проект: ${err.message}`);}};reader.readAsText(file);}
  async function renderProjectLibrary(){
    const list=$('savedProjectsList'),query=($('fileSearch').value||'').trim().toLocaleLowerCase();list.innerHTML='';
    try{
      const records=await libraryCall('readonly','getAll');records.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
      const filtered=records.filter(r=>(r.name||'').toLocaleLowerCase().includes(query));$('fileCount').textContent=`${filtered.length} из ${records.length} файлов`;
      if(!filtered.length){const empty=document.createElement('div');empty.className='file-empty';empty.textContent=records.length?'По запросу ничего не найдено.':'Пока нет сохранённых чертежей. Нажмите «Сохранить в список файлов».';list.appendChild(empty);return;}
      filtered.forEach(rec=>{
        const card=document.createElement('article');card.className='file-card';
        const info=document.createElement('div');const name=document.createElement('div');name.className='file-card-name';name.textContent=rec.name||'Без названия';
        const meta=document.createElement('div');meta.className='file-card-meta';const fmt=(rec.format||rec.data?.format||'A4P').replace(/[PL]$/,'');meta.textContent=`${fmt} · объектов: ${rec.objectCount??rec.data?.objects?.length??0} · изменён: ${fileStamp(rec.updatedAt||rec.createdAt||Date.now())}`;info.append(name,meta);
        const actions=document.createElement('div');actions.className='file-card-actions';
        const mk=(label,cls,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(cls)b.className=cls;b.addEventListener('click',fn);return b;};
        actions.append(mk('Відкрити','primary',async()=>{try{const ok=await applyLoadedDocument(rec.data,rec.id,rec.name);if(ok)$('filesModal').classList.add('hidden');}catch(e){alert('Не удалось открыть файл: '+e.message);}}));
        actions.append(mk('Перейменувати','',async()=>{const n=prompt('Нова назва файлу:',rec.name||'');if(n===null)return;if(!n.trim()){alert('Назва не може бути порожньою.');return;}rec.name=n.trim();rec.data.fileName=rec.name;rec.updatedAt=Date.now();await libraryCall('readwrite','put',rec);if(state.projectId===rec.id){state.fileName=rec.name;$('filenameField').value=rec.name;renderTemplate();}await renderProjectLibrary();}));
        actions.append(mk('Експорт','',()=>exportSavedProject(rec.id)));
        actions.append(mk('Видалити','danger',async()=>{if(!confirm(`Видалити файл «${rec.name}» зі списку збережених? Цю дію не можна скасувати.`))return;await libraryCall('readwrite','delete',rec.id);if(state.projectId===rec.id){state.projectId=null;state.dirty=true;$('saveState').textContent='Файл удалён из списка';}await renderProjectLibrary();setMessage(`Файл «${rec.name}» видалено`);}));
        card.append(info,actions);list.appendChild(card);
      });
    }catch(err){$('fileCount').textContent='Ошибка чтения';const empty=document.createElement('div');empty.className='file-empty';empty.textContent='Не удалось прочитать список файлов: '+err.message;list.appendChild(empty);}
  }
  async function openProjectLibrary(){ $('filesModal').classList.remove('hidden');$('fileSearch').value='';await renderProjectLibrary(); }
  function removePrivateReferences(clone){clone.querySelectorAll('[data-reference-exportable="false"]').forEach(n=>n.remove());}
  function exportSvg(){const clone=svg.cloneNode(true);clone.querySelector('#previewLayer')?.remove();clone.querySelector('#rulerLayer')?.remove();removePrivateReferences(clone);clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);const d=dimensions();clone.setAttribute('width',d.w+'mm');clone.setAttribute('height',d.h+'mm');const source='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);downloadBlob(new Blob([source],{type:'image/svg+xml;charset=utf-8'}),`${state.fileName||'drawing'}.svg`);setMessage('SVG экспортирован');}
  function exportSvgSource(){const previous=state.selectedIds.slice();state.selectedIds=[];renderAll();const clone=svg.cloneNode(true);state.selectedIds=previous;renderAll();clone.querySelector('#previewLayer')?.remove();clone.querySelector('#rulerLayer')?.remove();clone.querySelectorAll('[data-hit-area],[data-selection-outline]').forEach(n=>n.remove());removePrivateReferences(clone);clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);return new XMLSerializer().serializeToString(clone);}
  function canvasToBmp(canvas){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,image=ctx.getImageData(0,0,w,h),rowSize=Math.ceil((w*3)/4)*4,pixelSize=rowSize*h,fileSize=54+pixelSize,buffer=new ArrayBuffer(fileSize),view=new DataView(buffer),bytes=new Uint8Array(buffer);bytes[0]=66;bytes[1]=77;view.setUint32(2,fileSize,true);view.setUint32(10,54,true);view.setUint32(14,40,true);view.setInt32(18,w,true);view.setInt32(22,h,true);view.setUint16(26,1,true);view.setUint16(28,24,true);view.setUint32(34,pixelSize,true);view.setInt32(38,2835,true);view.setInt32(42,2835,true);for(let y=0;y<h;y++){const src=(h-1-y)*w*4,dst=54+y*rowSize;for(let x=0;x<w;x++){const si=src+x*4,di=dst+x*3;bytes[di]=image.data[si+2];bytes[di+1]=image.data[si+1];bytes[di+2]=image.data[si];}}return new Blob([buffer],{type:'image/bmp'});}
  function exportRaster(format='image/png',ext='png'){const source=exportSvgSource(),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'})),img=new Image();img.onload=()=>{const d=dimensions(),scale=Math.min(10,10000/Math.max(d.w,d.h),Math.sqrt(18000000/(d.w*d.h))),c=document.createElement('canvas');c.width=Math.max(1,Math.round(d.w*scale));c.height=Math.max(1,Math.round(d.h*scale));const ctx=c.getContext('2d');if(!ctx){URL.revokeObjectURL(url);alert('Браузер не выделил память для экспорта. Уменьшите формат или используйте SVG/PDF.');return;}ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);let blob;if(format==='image/bmp')blob=canvasToBmp(c);else{blob=null;c.toBlob(b=>{if(!b){alert(`Браузер не поддерживает экспорт ${ext.toUpperCase()}.`);URL.revokeObjectURL(url);return;}downloadBlob(b,`${state.fileName||'drawing'}.${ext}`);URL.revokeObjectURL(url);setMessage(`${ext.toUpperCase()} экспортирован`);},format,.92);return;}downloadBlob(blob,`${state.fileName||'drawing'}.${ext}`);URL.revokeObjectURL(url);setMessage(`${ext.toUpperCase()} экспортирован`);};img.onerror=()=>{URL.revokeObjectURL(url);alert('Не удалось создать изображение. Попробуйте экспорт SVG или PDF.');};img.src=url;}
  function exportPng(){exportRaster('image/png','png');}
  function exportJpg(){exportRaster('image/jpeg','jpg');}
  function exportWebp(){exportRaster('image/webp','webp');}
  function exportBmp(){exportRaster('image/bmp','bmp');}
  function parseSvgImport(text){const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror'))throw new Error('Некоректний SVG');const root=doc.documentElement;if(root.localName.toLowerCase()!=='svg')throw new Error('Файл не є SVG-документом');const rawVb=root.getAttribute('viewBox'),vb=(rawVb||`0 0 ${dimensions().w} ${dimensions().h}`).trim().split(/[ ,]+/).map(Number);if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)throw new Error('У SVG відсутній коректний viewBox');const d=dimensions(),maxW=d.w-20,maxH=d.h-20,scale=Math.min(maxW/vb[2],maxH/vb[3]),ox=(d.w-vb[2]*scale)/2,oy=(d.h-vb[3]*scale)/2;const X=x=>mm(ox+(Number(x)-vb[0])*scale),Y=y=>mm(oy+(Number(y)-vb[1])*scale),L=v=>Math.max(.05,Math.abs(Number(v)||.35)*scale);const out=[],temp=document.createElementNS(NS,'svg');temp.setAttribute('width','1');temp.setAttribute('height','1');temp.style.cssText='position:absolute;left:-10000px;top:-10000px;visibility:hidden';document.body.appendChild(temp);
    function walk(el,inherited={},parentMatrix=null){const style={...inherited};const matrix=(()=>{try{const local=el.getAttribute('transform');return parentMatrix?(local?parentMatrix.multiply(new DOMMatrix(local)):parentMatrix):(local?new DOMMatrix(local):new DOMMatrix());}catch(_){return parentMatrix||new DOMMatrix();}})();const P=(x,y)=>{try{const q=new DOMPoint(Number(x),Number(y)).matrixTransform(matrix);return{x:X(q.x),y:Y(q.y)};}catch(_){return{x:X(x),y:Y(y)};}};['stroke','fill','stroke-width','stroke-dasharray','font-family','font-size','font-weight','font-style','text-anchor'].forEach(k=>{const v=el.getAttribute(k);if(v!==null)style[k]=v;});const st=el.getAttribute('style');if(st)st.split(';').forEach(pair=>{const [k,v]=pair.split(':');if(k&&v)style[k.trim()]=v.trim();});const tag=el.localName.toLowerCase();if(['defs','metadata','title','desc','style','script','clipPath','mask','pattern','marker'].includes(tag))return;const stroke=(style.stroke&&style.stroke!=='none')?style.stroke:'#20252a',base={color:stroke,width:L(style['stroke-width']||.35),layer:'geometry'};const attr=n=>Number(el.getAttribute(n)||0);const dash=style['stroke-dasharray'];if(dash&&dash!=='none')base.dash=dash.split(/[ ,]+/).map(v=>mm(Number(v)*scale)).join(' ');
      if(tag==='line'){const a=P(attr('x1'),attr('y1')),b=P(attr('x2'),attr('y2'));out.push({...base,type:'line',x:a.x,y:a.y,x2:b.x,y2:b.y});}
      else if(tag==='rect'){const x=attr('x'),y=attr('y'),w=attr('width'),h=attr('height'),pts=[P(x,y),P(x+w,y),P(x+w,y+h),P(x,y+h)];if(w>0&&h>0){if(el.getAttribute('transform'))out.push({...base,type:'polyline',points:pts,closed:true});else out.push({...base,type:'rect',x:pts[0].x,y:pts[0].y,x2:pts[2].x,y2:pts[2].y,rx:attr('rx')*scale});}}
      else if(tag==='circle'){const c=P(attr('cx'),attr('cy')),e=P(attr('cx')+attr('r'),attr('cy'));out.push({...base,type:'circle',x:c.x,y:c.y,x2:e.x,y2:e.y});}
      else if(tag==='ellipse'){const cx=attr('cx'),cy=attr('cy'),rx=attr('rx'),ry=attr('ry'),pts=Array.from({length:64},(_,i)=>P(cx+Math.cos(i*Math.PI/32)*rx,cy+Math.sin(i*Math.PI/32)*ry));out.push({...base,type:'polyline',points:pts,closed:true});}
      else if(tag==='polyline'||tag==='polygon'){const nums=(el.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number),points=[];for(let i=0;i+1<nums.length;i+=2)points.push(P(nums[i],nums[i+1]));if(points.length>1)out.push({...base,type:'polyline',points,closed:tag==='polygon'});}
      else if(tag==='path'){const path=document.createElementNS(NS,'path');path.setAttribute('d',el.getAttribute('d')||'');temp.appendChild(path);try{const len=path.getTotalLength(),count=Math.max(2,Math.min(256,Math.ceil(len/2)));const points=[];for(let i=0;i<=count;i++){const q=path.getPointAtLength(len*i/count);points.push(P(q.x,q.y));}if(points.length>1)out.push({...base,type:'polyline',points,closed:/\bz\s*$/i.test(el.getAttribute('d')||'')});}catch(_){/* Unsupported path data is skipped safely. */}path.remove();}
      else if(tag==='text'||tag==='tspan'){const txt=(el.textContent||'').trim();if(txt&&tag==='text'){const p=P(attr('x'),attr('y')),q=P(attr('x')+1,attr('y')),rot=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI,size=L(style['font-size']||4);out.push({...base,type:'text',layer:'annotation',x:p.x,y:p.y,size,text:txt,font:style['font-family']||'Arial,sans-serif',bold:style['font-weight']==='bold',italic:style['font-style']==='italic',rotation:mm(rot),align:style['text-anchor']==='middle'?'middle':style['text-anchor']==='end'?'end':'start'});}}
      for(const child of el.children)walk(child,style,matrix);
    }
    for(const child of root.children)walk(child,{});temp.remove();return out;}
  function importSvg(file){const reader=new FileReader();reader.onerror=()=>alert('Не удалось прочитать SVG');reader.onload=()=>{try{const items=parseSvgImport(String(reader.result));if(!items.length)throw new Error('В SVG не найдено поддерживаемых графических объектов');commit();items.forEach(o=>{o.id=newId();state.objects.push(o);});state.selectedIds=[];renderAll();setMessage(`Импортировано векторных объектов SVG: ${items.length}. Комплексные transform/фильтры могут требовать ручной проверки.`);}catch(e){alert('Ошибка импорта SVG: '+e.message);}};reader.readAsText(file);}
  const csvFields=['type','x','y','x2','y2','r','start','end','points','text','label','size','width','color','dash','layer','closed','kind','rotation','font','lettering','linePattern'];
  function csvCell(v){const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function exportCsv(){const rows=[csvFields.join(',')];state.objects.filter(o=>o.type!=='reference').forEach(o=>{const r={...o};if(o.type==='circle')r.r=Math.hypot(o.x2-o.x,o.y2-o.y);if(o.points)r.points=o.points.map(p=>`${p.x}:${p.y}`).join('|');rows.push(csvFields.map(k=>csvCell(r[k])).join(','));});downloadBlob(new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),`${state.fileName||'drawing'}.csv`);setMessage('CSV экспортирован; референсы и сложные вложенные данные исключены.');}
  function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}if(cell.length||row.length){row.push(cell);rows.push(row);}return rows;}
  function importCsv(file){const reader=new FileReader();reader.onload=()=>{try{const rows=parseCsv(String(reader.result).replace(/^\ufeff/,''));if(rows.length<2)throw new Error('CSV пустой');const headers=rows.shift().map(x=>x.trim()),items=[];rows.forEach(row=>{const r={};headers.forEach((h,i)=>r[h]=row[i]??'');if(!r.type)return;const n=k=>Number(r[k]||0),o={type:r.type,color:r.color||'#20252a',width:n('width')||.35,layer:r.layer||'geometry'};['x','y','x2','y2','r','start','end','size','rotation'].forEach(k=>{if(r[k]!==undefined&&r[k]!=='')o[k]=n(k);});['text','label','dash','kind','font','lettering','linePattern'].forEach(k=>{if(r[k])o[k]=r[k];});if(r.closed)o.closed=r.closed==='true'||r.closed==='1';if(r.points)o.points=r.points.split('|').map(pair=>{const [x,y]=pair.split(':').map(Number);return{x,y};}).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!supportedTypes.has(o.type)||o.type==='reference')return;if(o.type==='circle'&&r.r){o.x2=o.x+n('r');o.y2=o.y;}items.push(o);});if(!items.length)throw new Error('В CSV нет поддерживаемой геометрии');commit();items.forEach(o=>{o.id=newId();state.objects.push(o);});state.selectedIds=[];renderAll();setMessage(`Импортировано объектов CSV: ${items.length}`);}catch(e){alert('Ошибка импорта CSV: '+e.message);}};reader.readAsText(file);}
  function printDocument(){const d=dimensions(),previous=state.selectedIds.slice(),rulerWasVisible=state.rulerVisible;state.selectedIds=[];renderAll();let style=document.getElementById('dynamicPrintStyle');if(!style){style=document.createElement('style');style.id='dynamicPrintStyle';document.head.appendChild(style);}style.textContent=`@page{size:${d.w}mm ${d.h}mm;margin:0}@media print{.drawing-area svg{width:${d.w}mm!important;height:${d.h}mm!important;transform:none!important}g[data-reference-exportable="false"]{display:none!important}#rulerLayer,#previewLayer{display:none!important}}`;window.print();state.selectedIds=previous;state.rulerVisible=rulerWasVisible;renderAll();}
  function dxfPair(code,value){return`${code}\n${value}\n`;}
  function exportDxf(){
    let s='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n5\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0\n0\nLTYPE\n2\nDASHED\n70\n0\n3\nDashed __ __ __\n72\n65\n73\n2\n40\n9\n49\n6\n49\n-3\n0\nLTYPE\n2\nCENTER\n70\n0\n3\nCenter __ . __ . __\n72\n65\n73\n4\n40\n19\n49\n12\n49\n-3\n49\n1\n49\n-3\n0\nLTYPE\n2\nPHANTOM\n70\n0\n3\nPhantom __ . . __\n72\n65\n73\n6\n40\n23\n49\n12\n49\n-3\n49\n1\n49\n-3\n49\n1\n49\n-3\n0\nLTYPE\n2\nDOT\n70\n0\n3\nDotted line . . .\n72\n65\n73\n2\n40\n3\n49\n1\n49\n-2\n0\nENDTAB\n0\nTABLE\n2\nLAYER\n70\n3\n0\nLAYER\n2\ngeometry\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nannotation\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nconstruction\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
    const y=v=>-v;
    const dxfLtype=o=>!o||!o.dash||o.dash==='none'?'CONTINUOUS':String(o.dash).includes('1 2')?'DOT':String(o.dash).includes('1 3 1 3')?'PHANTOM':String(o.dash).includes('12 3 1 3')||String(o.dash).includes('24 3 1 3')?'CENTER':'DASHED';
    const dxfStyle=o=>{if(!o)return'';const hex=String(o.color||'').match(/^#([0-9a-f]{6})$/i);return dxfPair(6,dxfLtype(o))+dxfPair(370,Math.round((Number(o.width)||.35)*100))+(hex?dxfPair(420,parseInt(hex[1],16)):'');};
    const writeLine=(a,b,layer='geometry',style=null)=>{s+='0\nLINE\n'+dxfPair(8,layer)+dxfStyle(style)+dxfPair(10,a.x)+dxfPair(20,y(a.y))+dxfPair(30,0)+dxfPair(11,b.x)+dxfPair(21,y(b.y))+dxfPair(31,0);};
    const writeText=(x,yy,text,size=3,layer='annotation',rotation=0,style=null)=>{s+='0\nTEXT\n'+dxfPair(8,layer)+dxfStyle(style)+dxfPair(10,x)+dxfPair(20,y(yy))+dxfPair(30,0)+dxfPair(40,size)+dxfPair(50,-rotation)+dxfPair(1,text||'');};
    state.objects.forEach(o=>{
      const layer=layerFor(o);
      if(o.type==='point'){
        s+='0\nPOINT\n'+dxfPair(8,layer)+dxfStyle(o)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0);
      } else if(['line','construction','centerline','section'].includes(o.type)){
        if(o.linePattern){const pts=linePatternPoints(o);s+='0\nLWPOLYLINE\n'+dxfPair(8,layer)+dxfStyle(o)+dxfPair(90,pts.length)+dxfPair(70,0);pts.forEach(p=>{s+=dxfPair(10,p.x)+dxfPair(20,y(p.y));});}
        else writeLine({x:o.x,y:o.y},{x:o.x2,y:o.y2},layer,o);
        if(o.type==='section'){writeText(o.x-2,o.y-2,o.label||'А',3,layer);writeText(o.x2+2,o.y2-2,o.label||'А',3,layer);}
      } else if(o.type==='circle'){
        s+='0\nCIRCLE\n'+dxfPair(8,layer)+dxfStyle(o)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0)+dxfPair(40,Math.hypot(o.x2-o.x,o.y2-o.y));
      } else if(o.type==='arc'){
        s+='0\nARC\n'+dxfPair(8,layer)+dxfStyle(o)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0)+dxfPair(40,o.r)+dxfPair(50,(-o.start*180/Math.PI+360)%360)+dxfPair(51,(-o.end*180/Math.PI+360)%360);
      } else if(o.type==='text'||o.type==='techReq'){
        String(o.text||'').split('\n').forEach((line,i)=>writeText(o.x,o.y+i*(o.lineHeight||4),line,o.size||4,layer,o.rotation||0));
      } else if(o.type==='rect'||o.type==='polyline'||o.type==='spline'||o.type==='freehand'||o.type==='breakline'||o.type==='ellipse'){
        let pts=o.points?o.points.slice():o.type==='ellipse'?Array.from({length:48},(_,i)=>({x:(o.x+o.x2)/2+Math.cos(i*2*Math.PI/48)*Math.abs(o.x2-o.x)/2,y:(o.y+o.y2)/2+Math.sin(i*2*Math.PI/48)*Math.abs(o.y2-o.y)/2})):[{x:o.x,y:o.y},{x:o.x2,y:o.y},{x:o.x2,y:o.y2},{x:o.x,y:o.y2}];
        s+='0\nLWPOLYLINE\n'+dxfPair(8,layer)+dxfStyle(o)+dxfPair(90,pts.length)+dxfPair(70,(o.closed||o.type==='rect'||o.type==='ellipse')?1:0);
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
  function parseDxf(text){
    const lines=String(text).replace(/\r/g,'').split('\n'),pairs=[];
    for(let n=0;n+1<lines.length;n+=2)pairs.push([Number(lines[n].trim()),lines[n+1].trim()]);
    const out=[];let i=0;const val=(p,c,def=0)=>{const f=p.find(x=>x[0]===c);return f?Number(f[1]):def;};
    let unitCode=4;for(let n=0;n<pairs.length-1;n++){if(pairs[n][0]===9&&pairs[n][1]==='$INSUNITS'&&pairs[n+1][0]===70){unitCode=Number(pairs[n+1][1]);break;}}
    const unitScale=({0:1,1:25.4,2:304.8,4:1,5:10,6:1000,8:0.0000254,9:0.0254,10:914.4,11:1e-7,12:1e-6,13:.001,14:100})[unitCode]||1;
    const X=v=>v*unitScale,Y=v=>-v*unitScale;
    while(i<pairs.length){
      if(pairs[i][0]!==0){i++;continue;}
      const type=pairs[i++][1];if(type==='ENDSEC'||type==='EOF')continue;
      const p=[];while(i<pairs.length&&pairs[i][0]!==0)p.push(pairs[i++]);
      const get=(c,d=0)=>val(p,c,d),layer=p.find(x=>x[0]===8)?.[1]||'geometry',lt=p.find(x=>x[0]===6)?.[1]||'CONTINUOUS';
      const dashMap={DASHED:'6 2',CENTER:'12 3 1 3',PHANTOM:'24 3 1 3 1 3',DOT:'1 2'};
      const aci=get(62,7),aciColors={1:'#ff0000',2:'#ffff00',3:'#00ff00',4:'#00ffff',5:'#0000ff',6:'#ff00ff',7:'#20252a',8:'#808080',9:'#c0c0c0'};const trueColor=get(420,NaN),color=Number.isFinite(trueColor)?'#'+Math.max(0,trueColor).toString(16).padStart(6,'0').slice(-6):(aciColors[aci]||'#20252a');const base={color,width:clamp(get(370,35)/100,.05,3),layer:layer==='annotation'?'annotation':layer==='construction'?'construction':'geometry',...(dashMap[lt]?{dash:dashMap[lt]}:{})};
      if(type==='POLYLINE'){
        const pts=[];let closed=(get(70)&1)===1;
        while(i<pairs.length&&pairs[i][0]===0&&pairs[i][1]==='VERTEX'){
          i++;const vp=[];while(i<pairs.length&&pairs[i][0]!==0)vp.push(pairs[i++]);const vx=val(vp,10,NaN),vy=val(vp,20,NaN);if(Number.isFinite(vx)&&Number.isFinite(vy))pts.push({x:X(vx),y:Y(vy)});
        }
        if(i<pairs.length&&pairs[i][0]===0&&pairs[i][1]==='SEQEND'){i++;while(i<pairs.length&&pairs[i][0]!==0)i++;}
        if(pts.length>1)out.push({...base,type:'polyline',points:pts,closed});
        continue;
      }
      if(type==='POINT')out.push({...base,type:'point',x:X(get(10)),y:Y(get(20))});
      else if(type==='LINE')out.push({...base,type:'line',x:X(get(10)),y:Y(get(20)),x2:X(get(11)),y2:Y(get(21))});
      else if(type==='CIRCLE'){const x=X(get(10)),y=Y(get(20)),r=get(40)*unitScale;out.push({...base,type:'circle',x,y,x2:x+r,y2:y});}
      else if(type==='ARC'){const x=X(get(10)),y=Y(get(20)),r=get(40)*unitScale,a=-get(50)*Math.PI/180,b=-get(51)*Math.PI/180;out.push({...base,type:'arc',x,y,r,start:a,end:b});}
      else if(type==='TEXT'||type==='MTEXT'){
        const raw=type==='TEXT'?(p.find(x=>x[0]===1)?.[1]||'Текст'):[...p.filter(x=>x[0]===3),...p.filter(x=>x[0]===1)].map(x=>x[1]).join('');
        const content=raw.replace(/\\P/gi,'\n').replace(/\\~/g,' ').replace(/\\\\/g,'\\').replace(/\\[A-Za-z][^;]*;/g,'');
        out.push({...base,type:'text',x:X(get(10)),y:Y(get(20)),size:get(40,3)*unitScale,rotation:-get(50,0),text:content,layer:'annotation'});
      }
      else if(type==='LWPOLYLINE'||type==='SPLINE'){
        const xs=p.filter(x=>x[0]===10).map(x=>Number(x[1])),ys=p.filter(x=>x[0]===20).map(x=>Number(x[1])),pts=xs.map((x,k)=>({x:X(x),y:Y(ys[k]??0)}));
        if(pts.length>1)out.push({...base,type:type==='SPLINE'?'spline':'polyline',points:pts,closed:(get(70)&1)===1});
      }
      else if(type==='ELLIPSE'){
        const cx=get(10),cy=get(20),mx=get(11),my=get(21),ratio=clamp(get(40,1),.001,1),a=get(41,0),b=get(42,Math.PI*2),rx=Math.hypot(mx,my),ry=rx*ratio,rot=Math.atan2(my,mx),span=((b-a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)||Math.PI*2,count=Math.max(16,Math.min(128,Math.ceil(span*24)));
        const pts=Array.from({length:count+1},(_,k)=>{const t=a+span*k/count,u=Math.cos(t)*rx,v=Math.sin(t)*ry;return{x:X(cx+u*Math.cos(rot)-v*Math.sin(rot)),y:Y(cy+u*Math.sin(rot)+v*Math.cos(rot))};});
        if(pts.length>2)out.push({...base,type:'polyline',points:pts,closed:Math.abs(span-Math.PI*2)<.001});
      }
      else if(type==='SOLID'||type==='3DFACE'){
        const codes=type==='SOLID'?[[10,20],[11,21],[12,22],[13,23]]:[[10,20],[11,21],[12,22],[13,23]],pts=codes.map(([xc,yc])=>({x:X(get(xc)),y:Y(get(yc))}));out.push({...base,type:'polyline',points:pts,closed:true});
      }
    }
    return out;
  }
  function importDxf(file){const reader=new FileReader();reader.onload=()=>{try{const imported=parseDxf(reader.result);if(!imported.length)throw new Error('Поддерживаемых сущностей не найдено');commit();imported.forEach(o=>{o.id=newId();state.objects.push(o);});state.selectedIds=[];renderAll();setMessage(`Импортировано объектов DXF: ${imported.length}`);}catch(e){alert('Ошибка импорта DXF: '+e.message);}};reader.readAsText(file);}
  function parseHpgl(text){
    const src=String(text).replace(/\r/g,' ').replace(/\n/g,' '),tokens=src.match(/[A-Za-z]{2}[^;]*;?/g)||[],out=[];let x=0,y=0,absolute=true,penDown=false,points=[],width=.35;
    const scale=1/40,flush=()=>{if(points.length>1)out.push({type:'polyline',points:points.map(p=>({x:p.x,y:p.y})),closed:false,width,color:'#20252a',layer:'geometry'});points=[];};
    const pairs=arg=>{const ns=arg.trim().split(/[ ,]+/).filter(Boolean).map(Number);const result=[];for(let k=0;k+1<ns.length;k+=2)if(Number.isFinite(ns[k])&&Number.isFinite(ns[k+1]))result.push([ns[k],ns[k+1]]);return result;};
    for(let token of tokens){token=token.trim();if(token.length<2)continue;const cmd=token.slice(0,2).toUpperCase(),arg=token.slice(2).replace(/;$/,'');
      if(cmd==='IN'){flush();x=0;y=0;penDown=false;absolute=true;}
      else if(cmd==='PA'||cmd==='PR'){absolute=cmd==='PA';}
      else if(cmd==='PW'){const w=Number(arg.split(/[ ,]+/)[0]);if(Number.isFinite(w)&&w>0)width=clamp(w,.05,3);}
      else if(cmd==='PU'||cmd==='PD'){
        const down=cmd==='PD',coords=pairs(arg);
        if(!down){flush();penDown=false;}
        coords.forEach(([a,b])=>{const nx=absolute?a:x+a,ny=absolute?b:y+b;if(down){if(!penDown||!points.length){points=[{x,y}];penDown=true;}points.push({x:nx,y:ny});}else{flush();}x=nx;y=ny;});
        if(down&&!coords.length)penDown=true;
      }
      else if(cmd==='CI'){const r=Number(arg.split(/[ ,]+/)[0]);if(Number.isFinite(r)&&r>0)out.push({type:'circle',x,y,x2:x+r,y2:y,width,color:'#20252a',layer:'geometry'});}
      else if(cmd==='AA'||cmd==='AR'){
        const q=pairs(arg)[0],rest=arg.trim().split(/[ ,]+/).map(Number),sweep=rest[2];if(q&&Number.isFinite(sweep)){const cx=absolute?q[0]:x+q[0],cy=absolute?q[1]:y+q[1],a0=Math.atan2(y-cy,x-cx),r=Math.hypot(x-cx,y-cy),count=Math.max(8,Math.min(180,Math.ceil(Math.abs(sweep)/5)));flush();const pts=[];for(let k=0;k<=count;k++){const a=a0+sweep*Math.PI/180*k/count;pts.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});}out.push({type:'polyline',points:pts,width,color:'#20252a',layer:'geometry'});x=cx+Math.cos(a0+sweep*Math.PI/180)*r;y=cy+Math.sin(a0+sweep*Math.PI/180)*r;}
      }
    }
    flush();
    if(!out.length)throw new Error('У HPGL/PLT не найдено поддерживаемых контуров.');
    // Convert plotter coordinates to page millimetres, top-left origin.
    const coords=[];out.forEach(o=>{if(o.points)coords.push(...o.points);else if(o.type==='circle'){const r=Math.abs(o.x2-o.x);coords.push({x:o.x-r,y:o.y-r},{x:o.x+r,y:o.y+r});}else coords.push({x:o.x,y:o.y},{x:o.x2,y:o.y2});});const minX=Math.min(...coords.map(p=>p.x)),maxX=Math.max(...coords.map(p=>p.x)),minY=Math.min(...coords.map(p=>p.y)),maxY=Math.max(...coords.map(p=>p.y)),d=dimensions(),margin=10,fit=Math.min(1,(d.w-2*margin)/Math.max(1,(maxX-minX)*scale),(d.h-2*margin)/Math.max(1,(maxY-minY)*scale));
    out.forEach(o=>{if(o.points)o.points=o.points.map(p=>({x:mm(margin+(p.x-minX)*scale*fit),y:mm(margin+(maxY-p.y)*scale*fit)}));else{o.x=mm(margin+(o.x-minX)*scale*fit);o.x2=mm(margin+(o.x2-minX)*scale*fit);o.y=mm(margin+(maxY-o.y)*scale*fit);o.y2=mm(margin+(maxY-o.y2)*scale*fit);}o.width=clamp(o.width*fit,.05,3);});return out;
  }
  function importHpgl(file){const reader=new FileReader();reader.onerror=()=>alert('Не удалось прочитать HPGL/PLT');reader.onload=()=>{try{const items=parseHpgl(reader.result);commit();items.forEach(o=>{o.id=newId();state.objects.push(o);});state.selectedIds=[];renderAll();setMessage(`Импортировано контуров HPGL/PLT: ${items.length}. Геометрия вписана в лист.`);}catch(e){alert('Ошибка импорта HPGL/PLT: '+e.message);}};reader.readAsText(file);}
  function exportHpgl(){
    const d=dimensions(),parts=['IN;PA;SP1;'];const toX=x=>Math.round(x*40),toY=y=>Math.round((d.h-y)*40),emitPath=(pts,closed=false,width=.35)=>{if(!pts||pts.length<2)return;parts.push(`PW${clamp(Number(width)||.35,.05,3).toFixed(2)};PU${toX(pts[0].x)},${toY(pts[0].y)};PD`);const seq=closed?[...pts,pts[0]]:pts;parts.push(seq.slice(1).map(p=>`${toX(p.x)},${toY(p.y)}`).join(',' )+';PU;');};
    state.objects.forEach(o=>{if(o.type==='reference')return;if(o.type==='arc'){const delta=((o.end-o.start)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),r=o.r||1,count=Math.max(8,Math.min(180,Math.ceil(delta*24))),pts=Array.from({length:count+1},(_,i)=>({x:o.x+Math.cos(o.start+delta*i/count)*r,y:o.y+Math.sin(o.start+delta*i/count)*r}));emitPath(pts,false,o.width);}
      else if(o.type==='point'){emitPath([{x:o.x,y:o.y},{x:o.x+.1,y:o.y+.1}],false,o.width);}
      else if(o.type==='circle'){const r=Math.hypot(o.x2-o.x,o.y2-o.y)*40;parts.push(`PW${(o.width||.35).toFixed(2)};PU${toX(o.x)},${toY(o.y)};CI${r.toFixed(2)};PU;`);}
      else if(o.type==='rect')emitPath([{x:o.x,y:o.y},{x:o.x2,y:o.y},{x:o.x2,y:o.y2},{x:o.x,y:o.y2}],true,o.width);
      else if(o.points)emitPath(o.points,!!o.closed,o.width);
      else if(['line','construction','centerline','section'].includes(o.type))emitPath(o.linePattern?linePatternPoints(o):[{x:o.x,y:o.y},{x:o.x2,y:o.y2}],false,o.width);
      else if(o.type==='ellipse'){const pts=Array.from({length:64},(_,i)=>({x:(o.x+o.x2)/2+Math.cos(i*Math.PI/32)*Math.abs(o.x2-o.x)/2,y:(o.y+o.y2)/2+Math.sin(i*Math.PI/32)*Math.abs(o.y2-o.y)/2}));emitPath(pts,true,o.width);}
    });parts.push('SP0;');downloadBlob(new Blob([parts.join('')],{type:'application/vnd.hp-hpgl'}),`${state.fileName||'drawing'}.plt`);setMessage('HPGL/PLT экспортирован. Текст, размеры и штриховка в плоттерный файл не включены — экспортируются геометрические контуры.');
  }
  function syncTitleInputs(){const t=state.title;$('titleField').value=t.title||'';$('codeField').value=t.code||'';$('materialField').value=t.material||'';$('scaleField').value=t.scale||'1:1';$('sheetField').value=t.sheet||'1';$('sheetsField').value=t.sheets||'1';$('companyField').value=t.company||'';$('literField').value=t.liter||'У';$('massField').value=t.mass||'—';$('developerField').value=t.developer||'';$('checkerField').value=t.checker||'';$('technicalField').value=t.technical||'';$('normativeField').value=t.normative||'';$('approvedField').value=t.approved||'';$('filenameField').value=state.fileName||'Кресленик_1';if($('titleFormSelect'))$('titleFormSelect').value=state.titleForm||'form1';}
  function readTitleValues(){return{title:$('titleField').value,code:$('codeField').value,material:$('materialField').value,scale:$('scaleField').value,sheet:$('sheetField').value,sheets:$('sheetsField').value,company:$('companyField').value,liter:$('literField').value,mass:$('massField').value,developer:$('developerField').value,checker:$('checkerField').value,technical:$('technicalField').value,normative:$('normativeField').value,approved:$('approvedField').value};}
  function applyTitle(){commit();state.title=readTitleValues();state.fileName=$('filenameField').value.trim()||'Кресленик_1';renderTemplate();renderAll();setMessage('Основний напис оновлено');}
  function setFormat(fmt){commit();state.format=fmt;renderTemplate();setZoom(Math.min(state.zoom,2.5));$('paperFormat').value=fmt;setMessage(`Формат листа: ${fmt}`);}
  function fillNewDocumentChoices(){
    $('newDocFormat').innerHTML=$('paperFormat').innerHTML;$('newDocTemplate').innerHTML=$('titleFormSelect').innerHTML;
    $('newDocFormat').value=state.format||'A4P';$('newDocTemplate').value=state.titleForm||'user-template';$('newDocName').value=state.fileName||'Кресленик_1';$('newDocProfile').value=state.gost.profile==='eskd-study'?'eskd-study':'dstu-gost-ua';
    const match=String($('newDocFormat').value).match(/(P|L)$/);$('newDocOrientation').value=match?match[1]:'P';updateNewDocumentPreview();
  }
  function updateNewDocumentPreview(){
    const fmt=$('newDocFormat').value||'A4P',template=$('newDocTemplate').value||'user-template',d=window.KompasTemplate.dimensions(fmt),v=$('newDocPreview');
    v.setAttribute('viewBox',`0 0 ${d.w} ${d.h}`);v.innerHTML='';const bg=svgEl('rect',{x:0,y:0,width:d.w,height:d.h,fill:'#fff'});v.appendChild(bg);
    window.KompasTemplate.render(v,fmt,state.title,template);
    const desc={'lab5-template':'Чистый шаблон лабораторной работы №5 по вашему фото. Большое центральное поле пустое, без модели.','user-template':'Ваш собственный шаблон із боковыми служебными графами и расширенной основной надписью.','gost-form1':'Форма 1 — первый лист графического документа.','form2':'Форма 2 — первый лист текстового документа.','form2a':'Форма 2а — следующий лист.','form2b-odd':'Форма 2б — дополнительные графы слева.','form2b-even':'Форма 2б — дополнительные графы справа.','spec-form1':'Спецификация — первый лист.','spec-form1a':'Спецификация — последующие листы.','blank':'Чистая рамка без штампа.'};$('newDocTemplateHint').textContent=desc[template]||'';
  }
  function newDocument(){fillNewDocumentChoices();$('newDocModal').classList.remove('hidden');}
  function createNewDocument(){
    if((state.objects.length||state.dirty)&&!confirm('Создать новый чертёж? Несохранённые изменения будут потеряны.'))return;
    const fmt=$('newDocFormat').value||'A4P',template=$('newDocTemplate').value||'user-template',name=$('newDocName').value.trim()||'Кресленик_1',profile=$('newDocProfile').value;
    state.objects=[];state.selectedIds=[];state.ruler=null;state.rulerMode='off';state.rulerVisible=true;state.viewPan={x:0,y:0};state.projectId=null;state.titleForm=template;$('rulerMode').value='off';$('rulerVisible').checked=true;state.format=fmt;state.fileName=name;$('paperFormat').value=fmt;$('titleFormSelect').value=template;$('templateQuickSelect').value=template;$('filenameField').value=name;
    state.title={title:template==='lab5-template'?'Лабораторна робота 5':'Найменування деталі',code:'КРЕСЛЕННЯ.001',material:'Матеріал не зазначено',scale:'1:1',sheet:'1',sheets:'1',company:'Навчальний кресленик',liter:'У',mass:'—',developer:template==='lab5-template'?'Щербенко М.':'',checker:'',technical:'',normative:'',approved:''};
    state.gost={profile,mainLine:.5,thinLine:.25,textHeight:3.5,arrowLength:3.5,precision:1,lettering:'B-V',fontFamily:'GOST type B,Arial,sans-serif'};applyGostControls();
    state.history=[];state.redo=[];updateHistoryButtons();state.grid=$('newDocGrid').checked;$('gridToggle').checked=state.grid;const gp=svg.querySelector('#gridPattern');if(gp){const step=gridStep();gp.setAttribute('width',step);gp.setAttribute('height',step);gp.querySelector('path').setAttribute('d',`M ${step} 0 L 0 0 0 ${step}`);}$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');
    syncTitleInputs();renderTemplate();renderAll();state.dirty=false;$('saveState').textContent='Новий кресленик';$('newDocModal').classList.add('hidden');resetViewPan();const d=dimensions(),aw=drawingArea.clientWidth-90,ah=drawingArea.clientHeight-90;setZoom(clamp(Math.min(aw/d.w,ah/d.h),.25,6));setMessage(`Створено ${name}: ${fmt} · ${template}`);
  }

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
    try{const raw=localStorage.getItem('kompasOnlineAutosave');if(!raw){setMessage('Автосохранение не найдено');return;}const doc=JSON.parse(raw);if(!doc||!Array.isArray(doc.objects))throw new Error('Повреждённый файл автосохранения');commit();state.format=doc.format||'A4P';state.fileName=doc.fileName||'Автовідновлення';state.projectId=doc.projectId||null;state.titleForm=(!doc.titleForm||doc.titleForm==='form1')?'user-template':doc.titleForm;state.title=Object.assign({},state.title,doc.title||{});state.ruler=doc.ruler||null;state.rulerMode=doc.rulerMode||'off';state.rulerVisible=doc.rulerVisible!==false;state.gost=Object.assign({},state.gost,doc.gost||{});if(state.gost.profile==='dstu-gost-ua'&&Number(state.gost.thinLine)===.18)state.gost.thinLine=.25;if(!state.gost.lettering)state.gost.lettering='B-V';state.viewPan=deep(doc.viewPan||{x:0,y:0});if(typeof doc.template==='boolean')state.template=doc.template;if(doc.visible)Object.assign(visible,doc.visible);$('templateToggle').checked=state.template;$('templateVisible').checked=visible.template;$('geometryVisible').checked=visible.geometry;$('dimensionsVisible').checked=visible.dimensions;$('constructionVisible').checked=visible.construction;$('referenceVisibleToggle').checked=visible.reference;$('referenceVisibleToggleSecondary').checked=visible.reference;applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];$('paperFormat').value=state.format;syncTitleInputs();renderTemplate();renderAll();setMessage('Автосохранение восстановлено');}catch(e){alert('Не удалось восстановить автосохранение: '+e.message);}
  }
  function copySelected(){const objs=getSelected();if(!objs.length){setMessage('Сначала выберите объекты для копирования');return;}state.clipboard=deep(objs);setMessage(`Скопировано объектов: ${objs.length}`);}
  function pasteClipboard(){if(!state.clipboard.length){setMessage('Буфер обмена пуст');return;}commit();const clones=state.clipboard.map(o=>({...deep(o),id:newId()}));clones.forEach(o=>translateObject(o,5,5));state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Вставлено объектов: ${clones.length}`);}
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>selectTool(b.dataset.tool)));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>applyAction(b.dataset.action)));
  $('newBtn').addEventListener('click',newDocument);$('createNewDocBtn').addEventListener('click',createNewDocument);$('closeNewDocModal').addEventListener('click',()=>$('newDocModal').classList.add('hidden'));$('cancelNewDocBtn').addEventListener('click',()=>$('newDocModal').classList.add('hidden'));$('newDocModal').addEventListener('click',e=>{if(e.target===$('newDocModal'))$('newDocModal').classList.add('hidden');});$('newDocTemplate').addEventListener('change',updateNewDocumentPreview);$('newDocFormat').addEventListener('change',()=>{const v=$('newDocFormat').value,m=v.match(/(P|L)$/);if(m)$('newDocOrientation').value=m[1];updateNewDocumentPreview();});$('newDocOrientation').addEventListener('change',()=>{const v=$('newDocFormat').value;if(/^(A[0-5])[PL]$/.test(v)){const base=v.slice(0,2);$('newDocFormat').value=base+$('newDocOrientation').value;updateNewDocumentPreview();}});$('coordinateApplyBtn').addEventListener('click',applyNumericCoordinate);$('restoreAutosaveBtn').addEventListener('click',restoreAutosave);$('saveBtn').addEventListener('click',()=>saveProject());$('saveToLibraryBtn').addEventListener('click',()=>saveProject());$('saveAsLibraryBtn').addEventListener('click',()=>saveProject({saveAs:true}));$('saveJsonBtn').addEventListener('click',()=>exportProjectJson());$('openBtn').addEventListener('click',openProjectLibrary);$('openLibraryBtn').addEventListener('click',openProjectLibrary);$('loadJsonBtn').addEventListener('click',()=>$('fileInput').click());$('importJsonFromLibraryBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>{if(e.target.files[0])loadProject(e.target.files[0]);e.target.value='';});$('closeFilesModal').addEventListener('click',()=>$('filesModal').classList.add('hidden'));$('filesModal').addEventListener('click',e=>{if(e.target===$('filesModal'))$('filesModal').classList.add('hidden');});$('fileSearch').addEventListener('input',renderProjectLibrary);$('newFromLibraryBtn').addEventListener('click',()=>{$('filesModal').classList.add('hidden');newDocument();});function changeTitleTemplate(value){if(!value)return;commit();state.titleForm=value;renderTemplate();setMessage('Шаблон аркуша змінено; геометрію креслення збережено');}
  $('titleFormSelect').addEventListener('change',e=>changeTitleTemplate(e.target.value));
  $('templateQuickSelect').addEventListener('change',e=>changeTitleTemplate(e.target.value));
  $('mirrorAxisMode').addEventListener('change',e=>$('mirrorCustomPoints').classList.toggle('hidden',e.target.value!=='custom'));$('closeMirrorModal').addEventListener('click',closeMirrorDialog);$('cancelMirrorBtn').addEventListener('click',closeMirrorDialog);$('applyMirrorBtn').addEventListener('click',applyMirrorDialog);$('mirrorModal').addEventListener('click',e=>{if(e.target===$('mirrorModal'))closeMirrorDialog();});
  $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);$('deleteBtn').addEventListener('click',deleteSelected);$('deleteSelectedBtn').addEventListener('click',deleteSelected);
  $('gridBtn').addEventListener('click',()=>{$('gridToggle').checked=!$('gridToggle').checked;$('gridToggle').dispatchEvent(new Event('change'));});$('snapBtn').addEventListener('click',()=>{$('objectSnapToggle').checked=!$('objectSnapToggle').checked;state.objectSnap=$('objectSnapToggle').checked;setMessage(`Привязки к объектам ${state.objectSnap?'включены':'выключены'}`);});$('orthoBtn').addEventListener('click',()=>{$('orthoToggle').checked=!$('orthoToggle').checked;state.ortho=$('orthoToggle').checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  $('rulerVisible').addEventListener('change',e=>{state.rulerVisible=e.target.checked;renderRuler();});$('rulerMode').addEventListener('change',e=>{state.rulerMode=e.target.value;setMessage(state.rulerMode==='off'?'Привязка к линейке выключена':state.ruler?'Режим линейки: '+(state.rulerMode==='parallel'?'параллельно':'перпендикулярно'):'Сначала поставьте линейку инструментом «Линейка»');});$('clearRulerBtn').addEventListener('click',()=>{commit();state.ruler=null;state.rulerMode='off';$('rulerMode').value='off';renderRuler();setMessage('Линейка убрана');});
  $('gridToggle').addEventListener('change',e=>{state.grid=e.target.checked;$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');});$('gridStep').addEventListener('change',()=>{const pattern=svg.querySelector('#gridPattern');const step=gridStep();pattern.setAttribute('width',step);pattern.setAttribute('height',step);pattern.querySelector('path').setAttribute('d',`M ${step} 0 L 0 0 0 ${step}`);});$('snapToggle').addEventListener('change',e=>state.snap=e.target.checked);$('objectSnapToggle').addEventListener('change',e=>state.objectSnap=e.target.checked);$('orthoToggle').addEventListener('change',e=>{state.ortho=e.target.checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  $('templateToggle').addEventListener('change',e=>{const before=snapshot();state.template=e.target.checked;commit(before);renderTemplate();});$('geometryVisible').addEventListener('change',e=>{const before=snapshot();visible.geometry=e.target.checked;commit(before);renderAll();});$('dimensionsVisible').addEventListener('change',e=>{const before=snapshot();visible.dimensions=e.target.checked;commit(before);renderAll();});$('constructionVisible').addEventListener('change',e=>{const before=snapshot();visible.construction=e.target.checked;commit(before);renderAll();});$('templateVisible').addEventListener('change',e=>{const before=snapshot();visible.template=e.target.checked;commit(before);renderTemplate();});
  $('paperFormat').addEventListener('change',e=>setFormat(e.target.value));$('fitBtn').addEventListener('click',()=>{resetViewPan();const d=dimensions(),w=drawingArea.clientWidth-70,h=drawingArea.clientHeight-70;setZoom(Math.min(w/d.w,h/d.h));});$('zoomIn').addEventListener('click',()=>setZoom(state.zoom*1.15));$('zoomOut').addEventListener('click',()=>setZoom(state.zoom/1.15));
  ['titleField','codeField','materialField','scaleField','sheetField','sheetsField','companyField','literField','massField','developerField','checkerField','technicalField','normativeField','approvedField','filenameField'].forEach(id=>$(id).addEventListener('input',()=>{state.dirty=true;$('saveState').textContent='Є незбережені зміни';}));
  $('applyTitleBtn').addEventListener('click',applyTitle);$('svgBtn').addEventListener('click',exportSvg);$('dxfBtn').addEventListener('click',exportDxf);$('exportDxfBtn').addEventListener('click',exportDxf);$('importDxfBtn').addEventListener('click',()=>$('dxfInput').click());$('dxfInput').addEventListener('change',e=>{if(e.target.files[0])importDxf(e.target.files[0]);e.target.value='';});$('svgInput').addEventListener('change',e=>{if(e.target.files[0])importSvg(e.target.files[0]);e.target.value='';});$('csvInput').addEventListener('change',e=>{if(e.target.files[0])importCsv(e.target.files[0]);e.target.value='';});$('importSvgBtn').addEventListener('click',()=>$('svgInput').click());$('importCsvBtn').addEventListener('click',()=>$('csvInput').click());$('exportCsvBtn').addEventListener('click',exportCsv);$('importHpglBtn').addEventListener('click',()=>$('hpglInput').click());$('hpglInput').addEventListener('change',e=>{if(e.target.files[0])importHpgl(e.target.files[0]);e.target.value='';});$('exportHpglBtn').addEventListener('click',exportHpgl);$('pngBtn').addEventListener('click',exportPng);$('exportJpgBtn').addEventListener('click',exportJpg);$('exportWebpBtn').addEventListener('click',exportWebp);$('exportBmpBtn').addEventListener('click',exportBmp);$('printBtn').addEventListener('click',printDocument);$('addTextBtn').addEventListener('click',()=>selectTool('text'));
  $('applyObjectGeometryBtn').addEventListener('click',applySelectedGeometry);
  $('objectColor').addEventListener('change',e=>{const o=getSelected()[0];if(o){commit();getSelected().forEach(x=>x.color=e.target.value);renderAll();}});
  $('objectTextSize').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>{o.size=clamp(Number(e.target.value)||3,.5,50);o.textSize=o.size;});renderAll();}});
  $('editContentBtn').addEventListener('click',()=>{const objs=getSelected().filter(o=>['text','techReq','leader','roughness','tolerance','weld','dimension','section'].includes(o.type));if(!objs.length){setMessage('Выберите надпись или обозначение для редактирования');return;}const o=objs[0];if(o.type==='text'||o.type==='techReq'){openTextDialog(o,o);return;}const key=['roughness','section','dimension'].includes(o.type)?'label':'text',value=o[key]??(o.type==='roughness'?'Ra 3,2':o.type==='section'?'А':'');const edited=prompt('Новое содержимое:',value);if(edited===null)return;commit();objs.forEach(x=>x[key]=edited);renderAll();setMessage('Содержимое обозначения изменено');});
  $('editTextFormatBtn').addEventListener('click',()=>{const o=getSelected().find(x=>x.type==='text'||x.type==='techReq');if(o)openTextDialog(o,o);else setMessage('Выберите текстовый объект');});
  $('addReferenceBtn').addEventListener('click',()=>$('referenceInput').click());
  $('addReferenceRibbonBtn').addEventListener('click',()=>$('referenceInput').click());
  $('gostRibbonBtn').addEventListener('click',checkGost);
  $('referenceInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importReference(f);e.target.value='';});
  drawingArea.addEventListener('pointerdown',e=>{if(e.button===1||state.space)onCanvasPointerDown(e);});drawingArea.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
  drawingArea.addEventListener('dragover',e=>{if([...e.dataTransfer.items].some(i=>i.kind==='file'&&i.type.startsWith('image/'))){e.preventDefault();drawingArea.classList.add('drag-over');}});drawingArea.addEventListener('dragleave',e=>{if(!drawingArea.contains(e.relatedTarget))drawingArea.classList.remove('drag-over');});drawingArea.addEventListener('drop',e=>{e.preventDefault();drawingArea.classList.remove('drag-over');const f=[...e.dataTransfer.files].find(x=>x.type.startsWith('image/'));if(f)importReference(f,{clientX:e.clientX,clientY:e.clientY});});
  $('referenceVisibleToggle').addEventListener('change',e=>{visible.reference=e.target.checked;$('referenceVisibleToggleSecondary').checked=e.target.checked;renderAll();});
  $('referenceVisibleToggleSecondary').addEventListener('change',e=>{visible.reference=e.target.checked;$('referenceVisibleToggle').checked=e.target.checked;renderAll();});
  $('referenceOpacity').addEventListener('focus',()=>{state.referenceOpacityBefore=snapshot();});
  $('referenceOpacity').addEventListener('input',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;if(!state.referenceOpacityBefore)state.referenceOpacityBefore=snapshot();o.opacity=Number(e.target.value)/100;$('referenceOpacityValue').textContent=e.target.value+'%';const im=referenceLayer.querySelector(`[data-id="${o.id}"] image`);if(im)im.setAttribute('opacity',o.opacity);});
  $('referenceOpacity').addEventListener('change',()=>{if(state.referenceOpacityBefore){recordHistory(state.referenceOpacityBefore);state.referenceOpacityBefore=null;renderAll();}});
  $('referenceWidth').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.w=clamp(Number(e.target.value)||10,1,2000);if(o.keepAspect!==false)o.h=o.w/(o.aspect||1);renderAll();});$('referenceHeight').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.h=clamp(Number(e.target.value)||10,1,2000);if(o.keepAspect!==false)o.w=o.h*(o.aspect||1);renderAll();});
  $('referenceX').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.x=mm(Number(e.target.value)||0);renderAll();});
  $('referenceY').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.y=mm(Number(e.target.value)||0);renderAll();});
  $('referenceRotation').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.rotation=Number(e.target.value)||0;renderAll();});$('referenceKeepAspect').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.keepAspect=e.target.checked;renderAll();});
  $('referenceCalibrateBtn').addEventListener('click',()=>{const o=getSelected().find(x=>x.type==='reference');if(!o){setMessage('Выберите референс');return;}const raw=prompt('Введи реальную длину между двумя точками на изображении, в миллиметрах:','100');if(raw===null)return;const length=Number(raw);if(!Number.isFinite(length)||length<=0){alert('Длина должна быть положительным числом в миллиметрах.');return;}state.referenceCalibration={id:o.id,knownLength:length,points:[]};selectTool('select');setMessage('Калибровка: щёлкни первую точку на референсе. Затем щёлкни вторую.');});
  $('referenceLockBtn').addEventListener('click',toggleReferenceLock);
  $('quickReferenceLockBtn').addEventListener('click',toggleReferenceLock);
  $('polarCount').addEventListener('input',updatePolarSummary);$('polarAngle').addEventListener('input',updatePolarSummary);$('polarFullCircle').addEventListener('change',updatePolarSummary);
  document.querySelectorAll('[data-polar-count]').forEach(b=>b.addEventListener('click',()=>{$('polarCount').value=b.dataset.polarCount;updatePolarSummary();}));
  $('polarPickCenterBtn').addEventListener('click',()=>{state.pendingPolarCenter=true;$('polarArrayModal').classList.add('hidden');setMessage('Клацніть на кресленні, щоб указати центр кругового масиву');});
  $('polarSheetCenterBtn').addEventListener('click',()=>setPolarCenterFromSheet('sheet'));$('polarSelectionCenterBtn').addEventListener('click',()=>setPolarCenterFromSheet('selection'));
  $('applyPolarArrayBtn').addEventListener('click',applyPolarArray);$('cancelPolarArrayBtn').addEventListener('click',()=>{$('polarArrayModal').classList.add('hidden');state.pendingPolarCenter=false;});$('closePolarArrayBtn').addEventListener('click',()=>{$('polarArrayModal').classList.add('hidden');state.pendingPolarCenter=false;});$('polarArrayModal').addEventListener('click',e=>{if(e.target===$('polarArrayModal')){$('polarArrayModal').classList.add('hidden');state.pendingPolarCenter=false;}});
  $('centerReferenceBtn').addEventListener('click',()=>centerReferences('sheet'));
  $('centerReferenceToGeometryBtn').addEventListener('click',()=>centerReferences('geometry'));
  $('referenceExportable').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.exportable=e.target.checked;renderAll();});
  $('fitReferenceBtn').addEventListener('click',fitSelectedReference);
  $('standardProfile').addEventListener('change',e=>{if(e.target.value==='eskd-study'||e.target.value==='dstu-gost-ua')applyGostProfile(true);else $('standardCustomFields').classList.remove('hidden');});
  $('applyGostBtn').addEventListener('click',()=>applyGostProfile(false));$('gostLettering').addEventListener('change',e=>{state.gost.lettering=e.target.value;state.gost.fontFamily=String(e.target.value).startsWith('A')?'GOST type A,Arial,sans-serif':'GOST type B,Arial,sans-serif';state.dirty=true;$('saveState').textContent='Є незбережені зміни';persistAutosave();});$('textLettering').addEventListener('change',e=>{if(!$('textFontCustom').value.trim())$('textFont').value=String(e.target.value).startsWith('A')?'GOST type A,Arial,sans-serif':'GOST type B,Arial,sans-serif';});$('gostLineGroup').addEventListener('change',e=>{const wide=Number(e.target.value);$('gostMainLine').value=wide;$('gostThinLine').value=mm(wide/2);});
  $('saveGostSettingsBtn').addEventListener('click',readGostSettings);
  $('checkGostBtn').addEventListener('click',checkGost);$('normalizeGostBtn').addEventListener('click',normalizeSelectedToGost);
  $('closeGostModal').addEventListener('click',()=>$('gostModal').classList.add('hidden'));
  $('closeGostModalBottom').addEventListener('click',()=>$('gostModal').classList.add('hidden'));
  $('gostModal').addEventListener('click',e=>{if(e.target===$('gostModal'))$('gostModal').classList.add('hidden');});
  $('closeTextModal').addEventListener('click',closeTextDialog);$('cancelTextBtn').addEventListener('click',closeTextDialog);$('applyTextBtn').addEventListener('click',applyTextDialog);$('textModal').addEventListener('click',e=>{if(e.target===$('textModal'))closeTextDialog();});
  $('applyObjectRotationBtn').addEventListener('click',()=>rotateSelectedBy(Number($('objectRotationAngle').value)||0));
  document.querySelectorAll('[data-rotate-step]').forEach(b=>b.addEventListener('click',()=>rotateSelectedBy(Number(b.dataset.rotateStep))));
  $('hatchSelectedBoundaryBtn').addEventListener('click',createHatchFromSelectedBoundary);
  document.querySelectorAll('[data-hatch-angle]').forEach(b=>b.addEventListener('click',()=>{$('hatchAngle').value=b.dataset.hatchAngle;}));
  $('objectWidth').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.width=clamp(Number(e.target.value)||.35,.05,3));renderAll();}});$('objectDash').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>{if(e.target.value==='WAVE'){o.linePattern='wave';o.width=state.gost.thinLine;delete o.dash;}else if(e.target.value==='ZIGZAG'){o.linePattern='zigzag';o.width=state.gost.thinLine;delete o.dash;}else{o.linePattern='';o.dash=e.target.value;}});renderAll();}});$('objectLayer').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.layer=e.target.value);renderAll();}});$('objectName').addEventListener('change',e=>{if(getSelected().length===1){commit();getSelected()[0].name=e.target.value;renderAll();}});$('objectLocked').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.locked=e.target.checked);renderAll();setMessage(e.target.checked?'Объекты заблокированы':'Блокировка снята');}});
  svg.addEventListener('pointerdown',e=>{if(e.button!==1&&!state.space)onCanvasPointerDown(e);});svg.addEventListener('dblclick',e=>{e.preventDefault();finishPath();});svg.addEventListener('contextmenu',e=>{if(state.tool==='polyline'||state.tool==='spline'){e.preventDefault();finishPath();}else e.preventDefault();});window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);
  drawingArea.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){state.viewPan.x-=e.deltaY||e.deltaX;updateZoom();persistAutosave();return;}if(e.altKey){state.viewPan.y-=e.deltaY;updateZoom();persistAutosave();return;}setZoomAt(state.zoom*(e.deltaY<0?1.1:.9),e.clientX,e.clientY);},{passive:false});
  window.addEventListener('keydown',e=>{const tag=document.activeElement.tagName;if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){state.space=true;e.preventDefault();}if(e.key==='Enter'&&(state.tool==='polyline'||state.tool==='spline'))finishPath();if(e.key==='F8'){state.ortho=!state.ortho;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';}if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA','SELECT'].includes(tag))deleteSelected();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();$('openBtn').click();}if((e.ctrlKey||e.metaKey)&&e.key==='0'){e.preventDefault();$('fitBtn').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newDocument();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();if(e.shiftKey)redo();else undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();redo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();copySelected();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();pasteClipboard();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();applyAction('duplicate');}if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key.toLowerCase()==='r'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();applyAction('arrayPolar');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();toggleReferenceLock();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!['INPUT','TEXTAREA'].includes(tag)){e.preventDefault();state.selectedIds=state.objects.map(o=>o.id);renderAll();}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!['INPUT','TEXTAREA','SELECT'].includes(tag)&&state.selectedIds.length&&!e.repeat){e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;commit();getSelected().forEach(o=>translateObject(o,dx,dy));renderAll();}if(e.key==='Escape'){if(state.rotateDrag){const before=state.rotateDrag.historyBefore;state.rotateDrag=null;drawingArea.classList.remove('rotating');restore(before);setMessage('Поворот отменён');}if(state.resize){const before=state.resize.historyBefore;state.resize=null;drawingArea.classList.remove('resizing');restore(before);setMessage('Изменение размера отменено');}if(!$('filesModal').classList.contains('hidden'))$('filesModal').classList.add('hidden');if(!$('polarArrayModal').classList.contains('hidden'))$('polarArrayModal').classList.add('hidden');state.pendingPolarCenter=false;if(!$('mirrorModal').classList.contains('hidden'))closeMirrorDialog();if(state.referenceCalibration){state.referenceCalibration=null;setMessage('Калибровка референса отменена');}if(!$('textModal').classList.contains('hidden')){closeTextDialog();return;}state.freehandDraft=null;state.points=[];state.selectionRect=null;previewLayer.innerHTML='';selectTool('select');}});
  window.addEventListener('keyup',e=>{if(e.code==='Space')state.space=false;});window.addEventListener('blur',()=>{state.space=false;if(state.rotateDrag){const before=state.rotateDrag.historyBefore;state.rotateDrag=null;drawingArea.classList.remove('rotating');restore(before);}if(state.resize){const before=state.resize.historyBefore;state.resize=null;drawingArea.classList.remove('resizing');restore(before);}if(state.pan){state.pan=null;drawingArea.classList.remove('dragging');persistAutosave();}});
  document.querySelectorAll('.panel-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.panel-tab').forEach(t=>t.classList.toggle('active',t===tab));$('toolsPanel').classList.toggle('hidden',tab.dataset.panel!=='tools');$('treePanel').classList.toggle('hidden',tab.dataset.panel!=='tree');}));
  $('helpBtn').addEventListener('click',()=>$('helpModal').classList.remove('hidden'));$('closeHelp').addEventListener('click',()=>$('helpModal').classList.add('hidden'));$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.add('hidden');});
  document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{const menu=btn.dataset.menu;if(menu==='file')openProjectLibrary();else if(menu==='edit')undo();else if(menu==='view')$('fitBtn').click();else if(menu==='insert')selectTool('text');else if(menu==='draw')selectTool('line');else if(menu==='format')$('applyTitleBtn').click();else $('helpBtn').click();}));
  applyGostControls();syncTitleInputs();renderTemplate();renderAll();updateZoom();fillNewDocumentChoices();selectTool('select');updateHistoryButtons();openProjectDb().catch(()=>{});
})();
