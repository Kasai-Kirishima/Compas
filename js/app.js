(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('sheetSvg'), drawingArea = $('drawingArea');
  const templateLayer = $('templateLayer'), referenceLayer = $('referenceLayer'), geometryLayer = $('geometryLayer'), constructionLayer = $('constructionLayer'), annotationLayer = $('annotationLayer'), rulerLayer = $('rulerLayer'), previewLayer = $('previewLayer');
  const annotationTypes = new Set(['text','dimension','leader','centerMark','roughness','tolerance','weld','table','section','techReq']);
  const constructionTypes = new Set(['construction','centerline']);
  const supportedTypes = new Set(['point','line','rect','circle','ellipse','arc','polyline','spline','freehand','text','dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','breakline','construction','centerline','section','techReq','reference']);
  const state = {
    referenceCalibration:null,
    format:'A4P', tool:'select', objects:[], selectedIds:[], points:[], zoom:1.8, grid:false, snap:false,
    objectSnap:true, ortho:false, template:true, space:false, pan:null, viewPan:{x:0,y:0}, drag:null, selectionRect:null,
    history:[], redo:[], clipboard:[], ruler:null, rulerMode:'off', rulerVisible:true, freehandDraft:null,
    gost:{profile:'dstu-gost-ua',mainLine:.5,thinLine:.18,textHeight:3.5,arrowLength:3.5,precision:1,fontFamily:'GOST type A,Arial,sans-serif'},
    title:{title:'Найменування деталі',code:'КРЕСЛЕННЯ.001',material:'Матеріал не зазначено',scale:'1:1',sheet:'1',sheets:'1',company:'Навчальний кресленик',liter:'У',mass:'—',developer:'',checker:'',technical:'',normative:'',approved:''},
    titleForm:'form1', projectId:null, fileName:'Кресленик_1', dirty:false
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
    window.KompasTemplate.render(templateLayer,state.format,templateData(),state.titleForm||'form1');
    if($('titleFormSelect'))$('titleFormSelect').value=state.titleForm||'form1';
    templateLayer.style.display=(state.template&&visible.template)?'':'none';
    $('docName').textContent=state.fileName.replaceAll('_',' ');
    const formatLabel=state.format.replace(/[PL]$/,'');
    document.querySelector('.doc-meta').textContent=`${formatLabel} · ${state.title.scale||'1:1'} · мм`;
    updateZoom();
  }
  function svgEl(name,attrs={}){ const el=document.createElementNS(NS,name); Object.entries(attrs).forEach(([k,v])=>{if(v!==undefined&&v!==null)el.setAttribute(k,String(v));}); return el; }
  function add(parent,name,attrs){ const el=svgEl(name,attrs); parent.appendChild(el); return el; }
  function objectLayer(o){ const l=layerFor(o); return l==='reference'?referenceLayer:l==='annotation'?annotationLayer:l==='construction'?constructionLayer:geometryLayer; }
  function applyStyle(el,o,selected=false){
    el.setAttribute('stroke',selected?'#078db2':(o.color||'#20252a'));
    el.setAttribute('stroke-width',selected?Math.max(.45,(o.width??state.gost.thinLine)*1.8):(o.width??state.gost.thinLine));
    el.setAttribute('fill',o.fill||'none'); el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round');
    if(o.dash) el.setAttribute('stroke-dasharray',o.dash);
  }
  function arrow(g,x,y,ux,uy,color,size=1.6){
    const nx=-uy,ny=ux,w=size*.32;
    add(g,'path',{d:`M ${x} ${y} l ${-ux*size+nx*w} ${-uy*size+ny*w} l ${-ux*size-nx*w} ${-uy*size-ny*w} z`,fill:color,stroke:'none'});
  }
  function addText(g,x,y,text,size=2.8,color='#20252a',anchor='middle',rotate=0,extra={}){
    const el=add(g,'text',{x,y,'font-family':state.gost.fontFamily||'Arial,sans-serif','font-size':size,'text-anchor':anchor,fill:color,stroke:'none',transform:rotate?`rotate(${rotate} ${x} ${y})`:null,'font-weight':extra.weight||null,'font-style':extra.italic?'italic':null});
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
    const layer=layerFor(o); if((layer==='geometry'&&!visible.geometry)||(layer==='annotation'&&!visible.dimensions)||(layer==='construction'&&!visible.construction)||(layer==='reference'&&!visible.reference))return;
    const g=add(objectLayer(o),'g',{'data-id':o.id,'class':'drawing-object'}), selected=state.selectedIds.includes(o.id);
    if(o.type==='reference'){
      g.setAttribute('data-reference-exportable',o.exportable?'true':'false');
      if(o.locked)g.setAttribute('data-reference-locked','true');
      const cx=o.x+(o.w||1)/2,cy=o.y+(o.h||1)/2,rotation=Number(o.rotation)||0;
      if(rotation)g.setAttribute('transform',`rotate(${rotation} ${cx} ${cy})`);
      const im=add(g,'image',{x:o.x,y:o.y,width:o.w,height:o.h,href:o.dataUrl,opacity:clamp(Number(o.opacity??.35),0,1),'preserveAspectRatio':'none','pointer-events':'all'});
      im.setAttributeNS('http://www.w3.org/1999/xlink','href',o.dataUrl);
      if(selected){add(g,'rect',{x:o.x,y:o.y,width:o.w,height:o.h,fill:'none',stroke:'#078db2','stroke-width':.45,'stroke-dasharray':'2 1','pointer-events':'none'});}
      return;
    }
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
      const transform=`translate(${o.x} ${o.y}) rotate(${Number(o.rotation)||0}) scale(${widthFactor} 1)`;
      if(o.frame)add(g,'rect',{x:left-1,y:top-1,width:estimatedW+2,height:estimatedH+2,transform,fill:'none',stroke:c,'stroke-width':.2});
      const t=add(g,'text',{x:0,y:0,'font-family':o.font||'Arial,sans-serif','font-size':size,fill:c,stroke:'none',transform,'font-weight':o.bold?'bold':'normal','font-style':o.italic?'italic':'normal','text-anchor':anchor,'dominant-baseline':o.baseline||'alphabetic','letter-spacing':letter||null,'text-decoration':[o.underline?'underline':'',o.overline?'overline':'',o.strike?'line-through':''].filter(Boolean).join(' ')||null});
      lines.forEach((line,i)=>{const sp=add(t,'tspan',{x:0,dy:i===0?0:lh});sp.textContent=line;});
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
    else if(o.type==='text'||o.type==='techReq'){const lines=String(o.text||'').split('\n'),size=o.size||4,w=Math.max(5,...lines.map(t=>t.length*size*.62))*clamp(Number(o.widthFactor)||1,.25,3),h=Math.max(size,lines.length*(o.lineHeight||size*1.25));return{x:o.x-(o.align==='middle'?w/2:o.align==='end'?w:0),y:o.y-size*.8,w,h};}
    else if(o.type==='point')return{x:o.x-1.5,y:o.y-1.5,w:3,h:3};
    else if(o.type==='circle'){const r=Math.hypot(o.x2-o.x,o.y2-o.y);return{x:o.x-r,y:o.y-r,w:r*2,h:r*2};}
    else if(o.type==='table')return{x:o.x,y:o.y,w:o.w||60,h:o.h||25};
    else if(o.type==='reference')return{x:o.x,y:o.y,w:o.w||1,h:o.h||1};
    else if(o.type==='ellipse')return{x:Math.min(o.x,o.x2),y:Math.min(o.y,o.y2),w:Math.abs(o.x2-o.x),h:Math.abs(o.y2-o.y)};
    else pts=[{x:o.x,y:o.y},{x:o.x2??o.x,y:o.y2??o.y}];
    if(!pts.length)return null;const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  function renderTree(){const el=$('objectTree');el.innerHTML='';state.objects.forEach((o,i)=>{const b=document.createElement('button');b.className='tree-object'+(state.selectedIds.includes(o.id)?' selected':'');b.textContent=`${i+1}. ${o.name||({point:'Точка',section:'Линия разреза',techReq:'Тех. требования',reference:'Референс / подложка',line:'Отрезок',rect:'Прямоугольник',circle:'Окружность',ellipse:'Эллипс',arc:'Дуга',polyline:'Ломаная',spline:'Сплайн',freehand:'Свободная линия',text:'Текст',dimension:'Размер',leader:'Выноска',hatch:'Штриховка',centerMark:'Обозначение центра',roughness:'Шероховатость',tolerance:'Допуск',weld:'Сварка',table:'Таблица',breakline:'Линия обрыва',construction:'Вспомогательная линия',centerline:'Осевая линия'}[o.type]||o.type)}`;b.addEventListener('click',()=>{state.selectedIds=[o.id];renderAll();});el.appendChild(b);});}
  function renderAll(){referenceLayer.innerHTML='';geometryLayer.innerHTML='';constructionLayer.innerHTML='';annotationLayer.innerHTML='';previewLayer.innerHTML='';state.objects.forEach(renderObject);renderRuler();$('geometryCount').textContent=state.objects.filter(o=>layerFor(o)==='geometry').length;$('annotationCount').textContent=state.objects.filter(o=>layerFor(o)==='annotation').length;$('constructionCount').textContent=state.objects.filter(o=>layerFor(o)==='construction').length;$('selectedStatus').textContent=state.selectedIds.length;renderTree();updateSelectionPanel();}
  function updateSelectionPanel(){
    const arr=state.objects.filter(o=>state.selectedIds.includes(o.id)),o=arr.length===1?arr[0]:null;
    $('noSelection').classList.toggle('hidden',arr.length>0);$('selectionFields').classList.toggle('hidden',arr.length===0);
    if(arr.length>1)$('noSelection').textContent=`Выбрано объектов: ${arr.length}`;
    else $('noSelection').textContent='Объект не выбран';
    $('editTextFormatBtn').classList.toggle('hidden',!(o&&['text','techReq'].includes(o.type)));$('referenceSelectionFields').classList.toggle('hidden',!(o&&o.type==='reference'));if(o){$('objectColor').value=o.color||'#20252a';$('objectWidth').value=o.width||.35;$('objectDash').value=o.dash||'';$('objectLayer').value=layerFor(o)==='reference'?'geometry':layerFor(o);$('objectName').value=o.name||'';$('objectTextSize').value=o.size||o.textSize||3;if(o.type==='reference'){$('referenceOpacity').value=Math.round((o.opacity??.35)*100);$('referenceOpacityValue').textContent=$('referenceOpacity').value+'%';$('referenceWidth').value=o.w||100;$('referenceX').value=o.x||0;$('referenceY').value=o.y||0;$('referenceRotation').value=o.rotation||0;$('referenceLocked').checked=!!o.locked;$('referenceExportable').checked=!!o.exportable;}}
  }
  function snapshot(){return{format:state.format,objects:deep(state.objects),title:deep(state.title),titleForm:state.titleForm,fileName:state.fileName,projectId:state.projectId,ruler:deep(state.ruler),rulerMode:state.rulerMode,rulerVisible:state.rulerVisible,gost:deep(state.gost),viewPan:deep(state.viewPan)};}
  function persistAutosave(){try{localStorage.setItem('kompasOnlineAutosave',JSON.stringify(snapshot()));}catch(e){setMessage('Автосохранение недоступно: память браузера заполнена или отключена');}}
  function commit(){state.history.push(snapshot());if(state.history.length>100)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';Promise.resolve().then(persistAutosave);}
  function restore(s){state.format=s.format;state.objects=deep(s.objects);state.title=deep(s.title);state.titleForm=s.titleForm||'form1';state.projectId=s.projectId??state.projectId;state.fileName=s.fileName;state.ruler=deep(s.ruler||null);state.rulerMode=s.rulerMode||'off';state.rulerVisible=s.rulerVisible!==false;state.gost=Object.assign({},state.gost,s.gost||{});state.viewPan=deep(s.viewPan||{x:0,y:0});applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;state.selectedIds=[];syncTitleInputs();$('paperFormat').value=state.format;renderTemplate();renderAll();}
  function undo(){if(!state.history.length){setMessage('Нет действий для отмены');return;}state.redo.push(snapshot());restore(state.history.pop());state.dirty=true;persistAutosave();setMessage('Действие отменено');}
  function redo(){if(!state.redo.length){setMessage('Нет действий для повтора');return;}state.history.push(snapshot());restore(state.redo.pop());state.dirty=true;persistAutosave();setMessage('Действие повторено');}
  function addObject(o){o.id=`obj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;o.name=o.name||'';o.color=o.color||(o.type==='construction'?'#8c969d':'#20252a');o.width=o.width??(annotationTypes.has(o.type)||constructionTypes.has(o.type)?state.gost.thinLine:state.gost.mainLine);o.layer=o.layer|| (annotationTypes.has(o.type)?'annotation':constructionTypes.has(o.type)?'construction':'geometry');state.objects.push(o);state.selectedIds=[o.id];commit();renderAll();setMessage('Объект добавлен');}
  function selectTool(tool){state.tool=tool;if(tool!=='select')state.referenceCalibration=null;state.points=[];state.freehandDraft=null;previewLayer.innerHTML='';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const names={select:'Выбор: щелчок — объект, Shift — добавить, рамка — выделить область',line:'Отрезок: две точки. Shift фиксирует угол с заданным шагом',freehand:'Свободная линия: зажмите левую кнопку и ведите курсор; линия сгладится автоматически',ruler:'Линейка: укажите начало и конец линейки; затем выберите привязку параллельно или перпендикулярно',construction:'Вспомогательная прямая: две точки',centerline:'Осевая линия: две точки',point:'Точка: щёлкните по листу',section:'Обозначение разреза: две точки линии сечения',techReq:'Технические требования: точка вставки и многострочный текст',polyline:'Ломаная: точки; двойной щелчок или Enter — завершить',spline:'Сплайн: точки; двойной щелчок или Enter — завершить',rect:'Прямоугольник: два противоположных угла',roundRect:'Скруглённый прямоугольник: два угла; радиус задаётся параметром',circle:'Окружность: центр и радиус',arc:'Дуга: центр, начало, конец',ellipse:'Эллипс: два угла габаритной рамки',polygon:'Многоугольник: центр и радиус',breakline:'Линия обрыва: две точки',dimAuto:'Авторазмер: две точки; тип определяется направлением',dimension:'Линейный размер: две точки',dimH:'Горизонтальный размер: две точки',dimV:'Вертикальный размер: две точки',dimRad:'Радиальный размер: центр и точка на окружности',dimDia:'Диаметральный размер: центр и точка на окружности',dimAngle:'Угловой размер: вершина и две точки на сторонах угла',measure:'Измерение: две точки',text:'Текст: щёлкните на листе',leader:'Выноска: точка объекта, излом, конец текста',centerMark:'Обозначение центра: щёлкните по центру',hatch:'Штриховка прямоугольной области: два угла',roughness:'Шероховатость: точка размещения',tolerance:'Допуск формы: точка размещения',weld:'Обозначение сварки: точка размещения',table:'Таблица: точка вставки'};setMessage(names[tool]||'Готово');$('canvasHint').textContent=names[tool]||'Выберите инструмент';$('canvasHint').classList.toggle('hide',tool==='select');}
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
  const GOST_TEXT_HEIGHTS=[2.5,3.5,5,7,10,14,20,28,40];
  const GOST_SCALES=['1:1','1:2','1:2.5','1:4','1:5','1:10','1:15','1:20','1:25','1:40','1:50','1:75','1:100','1:200','1:400','1:500','1:800','1:1000','2:1','2.5:1','4:1','5:1','10:1','20:1','40:1','50:1','100:1'];
  function applyGostControls(){
    if($('standardProfile'))$('standardProfile').value=state.gost.profile||'dstu-gost-ua';
    if($('gostMainLine'))$('gostMainLine').value=state.gost.mainLine;
    if($('gostThinLine'))$('gostThinLine').value=state.gost.thinLine;
    if($('gostTextHeight'))$('gostTextHeight').value=state.gost.textHeight;
    if($('gostArrowLength'))$('gostArrowLength').value=state.gost.arrowLength;
    if($('gostPrecision'))$('gostPrecision').value=state.gost.precision;
    if($('standardCustomFields'))$('standardCustomFields').classList.toggle('hidden',(state.gost.profile||'eskd-study')!=='custom');
    if($('defaultTextSize'))$('defaultTextSize').value=state.gost.textHeight;
  }
  function applyGostProfile(quiet=false){
    commit();
    const selected=$('standardProfile').value;
    state.gost={profile:selected==='custom'?'custom':(selected==='dstu-gost-ua'?'dstu-gost-ua':'eskd-study'),mainLine:.5,thinLine:.18,textHeight:3.5,arrowLength:3.5,precision:1,fontFamily:'GOST type A,Arial,sans-serif'};
    applyGostControls();$('standardCustomFields').classList.toggle('hidden',selected!=='custom');
    $('dimensionOffset').value='5';
    if(!quiet)setMessage(selected==='dstu-gost-ua'?'Профіль ДСТУ ГОСТ 2.104:2006 застосовано до нових об’єктів (межі чинності див. у довідці)':'Навчальний профіль ЄСКД застосовано до нових об’єктів');
  }
  function readGostSettings(){
    commit();state.gost={profile:$('standardProfile').value,mainLine:clamp(Number($('gostMainLine').value)||.5,.5,1.4),thinLine:clamp(Number($('gostThinLine').value)||.18,.13,.7),textHeight:GOST_TEXT_HEIGHTS.includes(Number($('gostTextHeight').value))?Number($('gostTextHeight').value):3.5,arrowLength:clamp(Number($('gostArrowLength').value)||3.5,2,10),precision:clamp(Number.isFinite(Number($('gostPrecision').value))?Number($('gostPrecision').value):1,0,3),fontFamily:'GOST type A,Arial,sans-serif'};
    applyGostControls();setMessage('Настройки оформления сохранены для новых объектов');
  }
  function normalizeSelectedToGost(){
    const selected=getSelected();if(!selected.length){setMessage('Сначала выделите объекты для приведения к профилю');return;}
    const thinTypes=new Set(['dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','section','techReq']);
    commit();selected.forEach(o=>{if(o.type==='reference')return;o.width=thinTypes.has(o.type)?state.gost.thinLine:state.gost.mainLine;if(['text','techReq'].includes(o.type))o.size=state.gost.textHeight;if(o.type==='dimension')o.textSize=state.gost.textHeight;});
    renderAll();setMessage('Выделенные объекты приведены к толщине и высоте текста профиля');
  }
  function checkGost(){
    const issues=[],ok=[];
    const d=dimensions();const allowedFmt={A4:[210,297],A3:[297,420],A2:[420,594],A1:[594,841],A0:[841,1189]};
    const key=state.format.slice(0,2),expected=allowedFmt[key];
    if(expected&&(Math.min(d.w,d.h)!==expected[0]||Math.max(d.w,d.h)!==expected[1]))issues.push('Размер листа не совпадает с выбранным форматом A-серии.');else ok.push(`Формат ${key}: размеры листа соответствуют ряду A.`);
    if(!GOST_SCALES.includes(String(state.title.scale||'1:1')))issues.push(`Масштаб «${state.title.scale}» не входит в список рекомендованных масштабов ЕСКД. Проверьте ГОСТ 2.302.`);else ok.push(`Масштаб ${state.title.scale}: из стандартного ряда.`);
    if(!state.template||!visible.template)issues.push('Шаблон/рамка скрыты. Перед печатью включите рамку и основную надпись.');else ok.push('Рамка и основная надпись отображаются.');
    const badText=state.objects.filter(o=>['text','techReq'].includes(o.type)&&!GOST_TEXT_HEIGHTS.includes(Number(o.size||state.gost.textHeight)));
    if(badText.length)issues.push(`Найдено ${badText.length} текстовых объектов с высотой вне основного ряда 2,5; 3,5; 5; 7; 10; 14; 20; 28; 40 мм.`);else ok.push('Высота текста в основных объектах соответствует принятому ряду высот.');
    const missingCenterline=state.objects.filter(o=>o.type==='centerline'&&!o.dash);
    if(missingCenterline.length)issues.push(`${missingCenterline.length} осевых линий не имеют штрихпунктирного типа линии.`);else ok.push('Осевые линии имеют заданный штрихпунктирный стиль.');
    const thinTypes=new Set(['dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','section','techReq']);
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
        const d=dimensions(),aspect=canvas.width/canvas.height,w=Math.min(100,d.w-30),h=w/aspect,center=placement?pointFromEvent(placement,true):{x:d.w/2,y:d.h/2};const o={type:'reference',name:file.name||'Референс',x:mm(center.x-w/2),y:mm(center.y-h/2),w:mm(w),h:mm(h),aspect,opacity:.35,rotation:0,locked:false,exportable:false,dataUrl,layer:'reference'};
        visible.reference=true;$('referenceVisibleToggle').checked=true;addObject(o);setMessage('Референс добавлен. Выберите его для настройки прозрачности, размера и поворота.');
      };img.src=reader.result;
    };reader.readAsDataURL(file);
  }
  let editingTextId=null;
  function textValuesFromForm(){return{text:$('textContent').value,font:$('textFontCustom').value.trim()||$('textFont').value,size:clamp(Number($('textSize').value)||3,.5,50),widthFactor:clamp((Number($('textWidthFactor').value)||100)/100,.25,3),rotation:Number($('textRotation').value)||0,align:$('textAlign').value,baseline:$('textBaseline').value,lineHeight:clamp(Number($('textLineHeight').value)||4,.5,100),letterSpacing:clamp(Number($('textLetterSpacing').value)||0,-2,10),color:$('textColor').value,bold:$('textBold').checked,italic:$('textItalic').checked,underline:$('textUnderline').checked,overline:$('textOverline').checked,strike:$('textStrike').checked,frame:$('textFrame').checked};}
  function openTextDialog(position,existing){editingTextId=existing?.id||null;const o=existing||{};$('textModalTitle').textContent=existing?'Редактирование текста':'Создание текста';$('textContent').value=o.text??'Текст';const font=o.font||'Arial,sans-serif';$('textFontCustom').value='';$('textFont').value=font;if($('textFont').value!==font)$('textFontCustom').value=font;$('textSize').value=o.size||Number($('defaultTextSize').value)||3;$('textWidthFactor').value=Math.round((o.widthFactor||1)*100);$('textRotation').value=o.rotation||0;$('textAlign').value=o.align||'start';$('textBaseline').value=o.baseline||'alphabetic';$('textLineHeight').value=o.lineHeight||((o.size||3)*1.25);$('textLetterSpacing').value=o.letterSpacing||0;$('textColor').value=o.color||'#20252a';$('textBold').checked=!!o.bold;$('textItalic').checked=!!o.italic;$('textUnderline').checked=!!o.underline;$('textOverline').checked=!!o.overline;$('textStrike').checked=!!o.strike;$('textFrame').checked=!!o.frame;$('textPosX').value=mm(position?.x??o.x??0);$('textPosY').value=mm(position?.y??o.y??0);$('textModal').classList.remove('hidden');$('textContent').focus();}
  function closeTextDialog(){ $('textModal').classList.add('hidden'); editingTextId=null; }
  function applyTextDialog(){const value=textValuesFromForm();if(!value.text.trim()){setMessage('Введите текст надписи');$('textContent').focus();return;}value.x=mm($('textPosX').value);value.y=mm($('textPosY').value);value.layer='annotation';if(editingTextId){const target=state.objects.find(o=>o.id===editingTextId);if(target){commit();Object.assign(target,value);renderAll();setMessage('Текст и его оформление обновлены');}}else addObject({type:'text',...value});closeTextDialog();}
  function onCanvasPointerDown(e){
    if(e.button===1||state.space){e.preventDefault();e.stopPropagation();state.pan={x:e.clientX,y:e.clientY,originX:state.viewPan.x,originY:state.viewPan.y,pointerId:e.pointerId};drawingArea.classList.add('dragging');try{(e.target.setPointerCapture?e.target:svg).setPointerCapture(e.pointerId);}catch(_){}return;}
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
      if(target){const id=target.getAttribute('data-id'),hitObj=state.objects.find(o=>o.id===id);if(e.shiftKey){state.selectedIds=state.selectedIds.includes(id)?state.selectedIds.filter(x=>x!==id):[...state.selectedIds,id];}else if(!state.selectedIds.includes(id))state.selectedIds=[id];renderAll();const objs=getSelected();if(!(hitObj?.type==='reference'&&hitObj.locked))state.drag={ids:objs.map(o=>o.id),start:pointFromEvent(e),originals:deep(objs),historyBefore:snapshot(),moved:false};else setMessage('Референс заблокирован — снимите блокировку в свойствах');}
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
    else if(state.tool==='hatch')addObject({type:'hatch',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'annotation',spacing:clamp(Number($('hatchSpacing').value)||4,.5,100),angle:Number($('hatchAngle').value)||45,pattern:$('hatchPattern').value});
    else if(['dimension','dimAuto','dimH','dimV','dimRad','dimDia'].includes(state.tool)){
      const kind=state.tool==='dimAuto'?(Math.abs(p.x-a.x)>=Math.abs(p.y-a.y)*2?'horizontal':Math.abs(p.y-a.y)>=Math.abs(p.x-a.x)*2?'vertical':'linear'):state.tool==='dimH'?'horizontal':state.tool==='dimV'?'vertical':state.tool==='dimRad'?'radius':state.tool==='dimDia'?'diameter':'linear';
      addObject({type:'dimension',kind,x:a.x,y:a.y,x2:p.x,y2:p.y,offset:clamp(Number($('dimensionOffset').value)||5,-100,100),layer:'annotation'});
    }
  }
  function finishPath(){if((state.tool==='polyline'||state.tool==='spline')&&state.points.length>=2){addObject({type:state.tool==='spline'?'spline':'polyline',points:deep(state.points),closed:false});state.points=[];previewLayer.innerHTML='';}else if(state.tool==='polyline'||state.tool==='spline'){state.points=[];previewLayer.innerHTML='';setMessage('Нужно минимум две точки');}}
  function onPointerMove(e){const raw=pointFromEvent(e,true),p=pointFromEvent(e);$('coordinates').textContent=`X: ${p.x.toFixed(2)} · Y: ${p.y.toFixed(2)} мм`;
    if(state.pan){state.viewPan.x=state.pan.originX+(e.clientX-state.pan.x);state.viewPan.y=state.pan.originY+(e.clientY-state.pan.y);svg.style.transform=`translate(${state.viewPan.x}px, ${state.viewPan.y}px)`;return;}
    if(state.drag){const dx=p.x-state.drag.start.x,dy=p.y-state.drag.start.y;if(Math.abs(dx)+Math.abs(dy)>.03){state.drag.moved=true;state.drag.ids.forEach((id,i)=>{const o=state.objects.find(x=>x.id===id);if(o){Object.assign(o,deep(state.drag.originals[i]));translateObject(o,dx,dy);}});renderAll();}return;}
    if(state.selectionRect){state.selectionRect.current=raw;drawPreview(raw);return;}
    if(state.freehandDraft){const last=state.freehandDraft[state.freehandDraft.length-1];if(Math.hypot(raw.x-last.x,raw.y-last.y)>=.25)state.freehandDraft.push(raw);previewLayer.innerHTML='';const path=add(previewLayer,'path',{d:smoothPath(state.freehandDraft,Number($('freehandSmooth').value)||0),fill:'none',stroke:'#078db2','stroke-width':clamp(Number($('freehandWidth').value)||.35,.05,3),'stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':'1 0'});return;}
    if(state.points.length)drawPreview(p);
  }
  function onPointerUp(){if(state.freehandDraft){const pts=state.freehandDraft;state.freehandDraft=null;previewLayer.innerHTML='';if(pts.length>1){const smooth=Number($('freehandSmooth').value)||0;addObject({type:'freehand',points:deep(pts),smooth,layer:'geometry',width:clamp(Number($('freehandWidth').value)||.35,.05,3)});}else setMessage('Свободная линия слишком короткая');return;}if(state.pan){state.pan=null;drawingArea.classList.remove('dragging');state.dirty=true;$('saveState').textContent='Изменён вид чертежа';persistAutosave();}if(state.drag){if(state.drag.moved){state.history.push(state.drag.historyBefore);if(state.history.length>100)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';try{localStorage.setItem('kompasOnlineAutosave',JSON.stringify(snapshot()));}catch(e){}setMessage('Объекты перемещены');}state.drag=null;}if(state.selectionRect){const r=state.selectionRect,a=r.start,b=r.current||r.start,minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);const ids=state.objects.filter(o=>{const bb=objectBounds(o);return bb&&bb.x>=minX&&bb.y>=minY&&bb.x+bb.w<=maxX&&bb.y+bb.h<=maxY;}).map(o=>o.id);state.selectedIds=r.initial.concat(ids).filter((id,i,a)=>a.indexOf(id)===i);state.selectionRect=null;previewLayer.innerHTML='';renderAll();setMessage(`Выделено объектов: ${state.selectedIds.length}`);}}
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
    if(o.type==='reference'){o.rotation=flip==='vertical'?180-(o.rotation||0):flip==='horizontal'?-(o.rotation||0):(o.rotation||0)+angle*180/Math.PI;o.w*=scale;o.h*=scale;}
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
  function makeDocument(){return{app:'Kompas Online',version:5,format:state.format,fileName:state.fileName,title:deep(state.title),titleForm:state.titleForm||'form1',objects:deep(state.objects),ruler:deep(state.ruler),rulerMode:state.rulerMode,rulerVisible:state.rulerVisible,gost:deep(state.gost),viewPan:deep(state.viewPan)};}
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
    state.format=doc.format||'A4P';$('paperFormat').value=state.format;state.fileName=nameOverride||doc.fileName||'Імпортований_кресленик';state.projectId=projectId;state.title=Object.assign({},state.title,doc.title||{});state.titleForm=doc.titleForm||'form1';
    state.ruler=doc.ruler||null;state.rulerMode=doc.rulerMode||'off';state.rulerVisible=doc.rulerVisible!==false;state.gost=Object.assign({},state.gost,doc.gost||{});state.viewPan=deep(doc.viewPan||{x:0,y:0});
    state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];state.history=[];state.redo=[];
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
  function exportPng(){const clone=svg.cloneNode(true);clone.querySelector('#previewLayer')?.remove();clone.querySelector('#rulerLayer')?.remove();removePrivateReferences(clone);clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);const source=new XMLSerializer().serializeToString(clone),blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas'),d=dimensions();c.width=Math.round(d.w*10);c.height=Math.round(d.h*10);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{downloadBlob(b,`${state.fileName||'drawing'}.png`);URL.revokeObjectURL(url);setMessage('PNG экспортирован');},'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);alert('Не удалось создать PNG. Попробуйте экспорт SVG.');};img.src=url;}
  function printDocument(){const d=dimensions();let style=document.getElementById('dynamicPrintStyle');if(!style){style=document.createElement('style');style.id='dynamicPrintStyle';document.head.appendChild(style);}style.textContent=`@page{size:${d.w}mm ${d.h}mm;margin:0}@media print{.drawing-area svg{width:${d.w}mm!important;height:${d.h}mm!important;transform:none!important}g[data-reference-exportable=\"false\"]{display:none!important}}`;window.print();}
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
      } else if(o.type==='rect'||o.type==='polyline'||o.type==='spline'||o.type==='freehand'||o.type==='breakline'||o.type==='ellipse'){
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
  function syncTitleInputs(){const t=state.title;$('titleField').value=t.title||'';$('codeField').value=t.code||'';$('materialField').value=t.material||'';$('scaleField').value=t.scale||'1:1';$('sheetField').value=t.sheet||'1';$('sheetsField').value=t.sheets||'1';$('companyField').value=t.company||'';$('literField').value=t.liter||'У';$('massField').value=t.mass||'—';$('developerField').value=t.developer||'';$('checkerField').value=t.checker||'';$('technicalField').value=t.technical||'';$('normativeField').value=t.normative||'';$('approvedField').value=t.approved||'';$('filenameField').value=state.fileName||'Кресленик_1';if($('titleFormSelect'))$('titleFormSelect').value=state.titleForm||'form1';}
  function readTitleValues(){return{title:$('titleField').value,code:$('codeField').value,material:$('materialField').value,scale:$('scaleField').value,sheet:$('sheetField').value,sheets:$('sheetsField').value,company:$('companyField').value,liter:$('literField').value,mass:$('massField').value,developer:$('developerField').value,checker:$('checkerField').value,technical:$('technicalField').value,normative:$('normativeField').value,approved:$('approvedField').value};}
  function applyTitle(){commit();state.title=readTitleValues();state.fileName=$('filenameField').value.trim()||'Кресленик_1';renderTemplate();renderAll();setMessage('Основний напис оновлено');}
  function setFormat(fmt){commit();state.format=fmt;renderTemplate();setZoom(Math.min(state.zoom,2.5));$('paperFormat').value=fmt;setMessage(`Формат листа: ${fmt}`);}
  function newDocument(){if((state.objects.length||state.dirty)&&!confirm('Создать новый чертёж? Несохранённые изменения будут потеряны.'))return;state.objects=[];state.selectedIds=[];state.ruler=null;state.rulerMode='off';state.viewPan={x:0,y:0};state.projectId=null;state.titleForm='form1';$('rulerMode').value='off';state.format='A4P';state.fileName='Кресленик_1';$('paperFormat').value='A4P';state.title={title:'Найменування деталі',code:'КРЕСЛЕННЯ.001',material:'Матеріал не зазначено',scale:'1:1',sheet:'1',sheets:'1',company:'Навчальний кресленик',liter:'У',mass:'—',developer:'',checker:'',technical:'',normative:'',approved:''};state.history=[];state.redo=[];syncTitleInputs();renderTemplate();renderAll();state.dirty=false;$('saveState').textContent='Новий кресленик';setMessage('Створено новий кресленик');}

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
    try{const raw=localStorage.getItem('kompasOnlineAutosave');if(!raw){setMessage('Автосохранение не найдено');return;}const doc=JSON.parse(raw);if(!doc||!Array.isArray(doc.objects))throw new Error('Повреждённый файл автосохранения');commit();state.format=doc.format||'A4P';state.fileName=doc.fileName||'Автовідновлення';state.projectId=doc.projectId||null;state.titleForm=doc.titleForm||'form1';state.title=Object.assign({},state.title,doc.title||{});state.ruler=doc.ruler||null;state.rulerMode=doc.rulerMode||'off';state.rulerVisible=doc.rulerVisible!==false;state.gost=Object.assign({},state.gost,doc.gost||{});state.viewPan=deep(doc.viewPan||{x:0,y:0});applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];$('paperFormat').value=state.format;syncTitleInputs();renderTemplate();renderAll();setMessage('Автосохранение восстановлено');}catch(e){alert('Не удалось восстановить автосохранение: '+e.message);}
  }
  function copySelected(){const objs=getSelected();if(!objs.length){setMessage('Сначала выберите объекты для копирования');return;}state.clipboard=deep(objs);setMessage(`Скопировано объектов: ${objs.length}`);}
  function pasteClipboard(){if(!state.clipboard.length){setMessage('Буфер обмена пуст');return;}commit();const clones=state.clipboard.map(o=>({...deep(o),id:newId()}));clones.forEach(o=>translateObject(o,5,5));state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Вставлено объектов: ${clones.length}`);}
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>selectTool(b.dataset.tool)));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>applyAction(b.dataset.action)));
  $('newBtn').addEventListener('click',newDocument);$('coordinateApplyBtn').addEventListener('click',applyNumericCoordinate);$('restoreAutosaveBtn').addEventListener('click',restoreAutosave);$('saveBtn').addEventListener('click',()=>saveProject());$('saveToLibraryBtn').addEventListener('click',()=>saveProject());$('saveAsLibraryBtn').addEventListener('click',()=>saveProject({saveAs:true}));$('saveJsonBtn').addEventListener('click',()=>exportProjectJson());$('openBtn').addEventListener('click',openProjectLibrary);$('openLibraryBtn').addEventListener('click',openProjectLibrary);$('loadJsonBtn').addEventListener('click',()=>$('fileInput').click());$('importJsonFromLibraryBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>{if(e.target.files[0])loadProject(e.target.files[0]);e.target.value='';});$('closeFilesModal').addEventListener('click',()=>$('filesModal').classList.add('hidden'));$('filesModal').addEventListener('click',e=>{if(e.target===$('filesModal'))$('filesModal').classList.add('hidden');});$('fileSearch').addEventListener('input',renderProjectLibrary);$('newFromLibraryBtn').addEventListener('click',()=>{$('filesModal').classList.add('hidden');newDocument();});$('titleFormSelect').addEventListener('change',e=>{commit();state.titleForm=e.target.value;renderTemplate();setMessage(e.target.value==='form2a'?'Обрано форму 2а для наступних аркушів':'Обрано форму 1 для першого аркуша');});
  $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);$('deleteBtn').addEventListener('click',deleteSelected);$('deleteSelectedBtn').addEventListener('click',deleteSelected);
  $('gridBtn').addEventListener('click',()=>{$('gridToggle').checked=!$('gridToggle').checked;$('gridToggle').dispatchEvent(new Event('change'));});$('snapBtn').addEventListener('click',()=>{$('objectSnapToggle').checked=!$('objectSnapToggle').checked;state.objectSnap=$('objectSnapToggle').checked;setMessage(`Привязки к объектам ${state.objectSnap?'включены':'выключены'}`);});$('orthoBtn').addEventListener('click',()=>{$('orthoToggle').checked=!$('orthoToggle').checked;state.ortho=$('orthoToggle').checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  $('rulerVisible').addEventListener('change',e=>{state.rulerVisible=e.target.checked;renderRuler();});$('rulerMode').addEventListener('change',e=>{state.rulerMode=e.target.value;setMessage(state.rulerMode==='off'?'Привязка к линейке выключена':state.ruler?'Режим линейки: '+(state.rulerMode==='parallel'?'параллельно':'перпендикулярно'):'Сначала поставьте линейку инструментом «Линейка»');});$('clearRulerBtn').addEventListener('click',()=>{commit();state.ruler=null;state.rulerMode='off';$('rulerMode').value='off';renderRuler();setMessage('Линейка убрана');});
  $('gridToggle').addEventListener('change',e=>{state.grid=e.target.checked;$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');});$('gridStep').addEventListener('change',()=>{const pattern=svg.querySelector('#gridPattern');const step=gridStep();pattern.setAttribute('width',step);pattern.setAttribute('height',step);pattern.querySelector('path').setAttribute('d',`M ${step} 0 L 0 0 0 ${step}`);});$('snapToggle').addEventListener('change',e=>state.snap=e.target.checked);$('objectSnapToggle').addEventListener('change',e=>state.objectSnap=e.target.checked);$('orthoToggle').addEventListener('change',e=>{state.ortho=e.target.checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  $('templateToggle').addEventListener('change',e=>{state.template=e.target.checked;renderTemplate();});$('geometryVisible').addEventListener('change',e=>{visible.geometry=e.target.checked;renderAll();});$('dimensionsVisible').addEventListener('change',e=>{visible.dimensions=e.target.checked;renderAll();});$('constructionVisible').addEventListener('change',e=>{visible.construction=e.target.checked;renderAll();});$('templateVisible').addEventListener('change',e=>{visible.template=e.target.checked;renderTemplate();});
  $('paperFormat').addEventListener('change',e=>setFormat(e.target.value));$('fitBtn').addEventListener('click',()=>{resetViewPan();const d=dimensions(),w=drawingArea.clientWidth-70,h=drawingArea.clientHeight-70;setZoom(Math.min(w/d.w,h/d.h));});$('zoomIn').addEventListener('click',()=>setZoom(state.zoom*1.15));$('zoomOut').addEventListener('click',()=>setZoom(state.zoom/1.15));
  ['titleField','codeField','materialField','scaleField','sheetField','sheetsField','companyField','literField','massField','developerField','checkerField','technicalField','normativeField','approvedField','filenameField'].forEach(id=>$(id).addEventListener('input',()=>{state.dirty=true;$('saveState').textContent='Є незбережені зміни';}));
  $('applyTitleBtn').addEventListener('click',applyTitle);$('svgBtn').addEventListener('click',exportSvg);$('dxfBtn').addEventListener('click',exportDxf);$('exportDxfBtn').addEventListener('click',exportDxf);$('importDxfBtn').addEventListener('click',()=>$('dxfInput').click());$('dxfInput').addEventListener('change',e=>{if(e.target.files[0])importDxf(e.target.files[0]);e.target.value='';});$('pngBtn').addEventListener('click',exportPng);$('printBtn').addEventListener('click',printDocument);$('addTextBtn').addEventListener('click',()=>selectTool('text'));
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
  $('referenceOpacity').addEventListener('change',()=>{if(state.referenceOpacityBefore){state.history.push(state.referenceOpacityBefore);if(state.history.length>100)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';persistAutosave();state.referenceOpacityBefore=null;renderAll();}});
  $('referenceWidth').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.w=clamp(Number(e.target.value)||10,1,2000);o.h=o.w/(o.aspect||1);renderAll();});
  $('referenceX').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.x=mm(Number(e.target.value)||0);renderAll();});
  $('referenceY').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.y=mm(Number(e.target.value)||0);renderAll();});
  $('referenceRotation').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.rotation=Number(e.target.value)||0;renderAll();});
  $('referenceCalibrateBtn').addEventListener('click',()=>{const o=getSelected().find(x=>x.type==='reference');if(!o){setMessage('Выберите референс');return;}const raw=prompt('Введи реальную длину между двумя точками на изображении, в миллиметрах:','100');if(raw===null)return;const length=Number(raw);if(!Number.isFinite(length)||length<=0){alert('Длина должна быть положительным числом в миллиметрах.');return;}state.referenceCalibration={id:o.id,knownLength:length,points:[]};selectTool('select');setMessage('Калибровка: щёлкни первую точку на референсе. Затем щёлкни вторую.');});
  $('referenceLocked').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.locked=e.target.checked;renderAll();});
  $('referenceExportable').addEventListener('change',e=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;commit();o.exportable=e.target.checked;renderAll();});
  $('fitReferenceBtn').addEventListener('click',()=>{const o=getSelected().find(x=>x.type==='reference');if(!o)return;const d=dimensions();commit();o.w=d.w-40;o.h=o.w/(o.aspect||1);o.x=(d.w-o.w)/2;o.y=(d.h-o.h)/2;o.rotation=0;renderAll();setMessage('Референс вписан в лист');});
  $('standardProfile').addEventListener('change',e=>{if(e.target.value==='eskd-study'||e.target.value==='dstu-gost-ua')applyGostProfile(true);else $('standardCustomFields').classList.remove('hidden');});
  $('applyGostBtn').addEventListener('click',()=>applyGostProfile(false));
  $('saveGostSettingsBtn').addEventListener('click',readGostSettings);
  $('checkGostBtn').addEventListener('click',checkGost);$('normalizeGostBtn').addEventListener('click',normalizeSelectedToGost);
  $('closeGostModal').addEventListener('click',()=>$('gostModal').classList.add('hidden'));
  $('closeGostModalBottom').addEventListener('click',()=>$('gostModal').classList.add('hidden'));
  $('gostModal').addEventListener('click',e=>{if(e.target===$('gostModal'))$('gostModal').classList.add('hidden');});
  $('closeTextModal').addEventListener('click',closeTextDialog);$('cancelTextBtn').addEventListener('click',closeTextDialog);$('applyTextBtn').addEventListener('click',applyTextDialog);$('textModal').addEventListener('click',e=>{if(e.target===$('textModal'))closeTextDialog();});
  $('objectWidth').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.width=clamp(Number(e.target.value)||.35,.05,3));renderAll();}});$('objectDash').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.dash=e.target.value);renderAll();}});$('objectLayer').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.layer=e.target.value);renderAll();}});$('objectName').addEventListener('change',e=>{if(getSelected().length===1){commit();getSelected()[0].name=e.target.value;renderAll();}});
  svg.addEventListener('pointerdown',e=>{if(e.button!==1&&!state.space)onCanvasPointerDown(e);});svg.addEventListener('dblclick',e=>{e.preventDefault();finishPath();});svg.addEventListener('contextmenu',e=>{if(state.tool==='polyline'||state.tool==='spline'){e.preventDefault();finishPath();}else e.preventDefault();});window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);
  drawingArea.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){state.viewPan.x-=e.deltaY||e.deltaX;updateZoom();persistAutosave();return;}if(e.altKey){state.viewPan.y-=e.deltaY;updateZoom();persistAutosave();return;}setZoomAt(state.zoom*(e.deltaY<0?1.1:.9),e.clientX,e.clientY);},{passive:false});
  window.addEventListener('keydown',e=>{const tag=document.activeElement.tagName;if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){state.space=true;e.preventDefault();}if(e.key==='Enter'&&(state.tool==='polyline'||state.tool==='spline'))finishPath();if(e.key==='F8'){state.ortho=!state.ortho;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';}if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA','SELECT'].includes(tag))deleteSelected();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();$('openBtn').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newDocument();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();copySelected();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();pasteClipboard();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();applyAction('duplicate');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!['INPUT','TEXTAREA'].includes(tag)){e.preventDefault();state.selectedIds=state.objects.map(o=>o.id);renderAll();}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!['INPUT','TEXTAREA','SELECT'].includes(tag)&&state.selectedIds.length&&!e.repeat){e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;commit();getSelected().forEach(o=>translateObject(o,dx,dy));renderAll();}if(e.key==='Escape'){if(!$('filesModal').classList.contains('hidden'))$('filesModal').classList.add('hidden');if(state.referenceCalibration){state.referenceCalibration=null;setMessage('Калибровка референса отменена');}if(!$('textModal').classList.contains('hidden')){closeTextDialog();return;}state.freehandDraft=null;state.points=[];state.selectionRect=null;previewLayer.innerHTML='';selectTool('select');}});
  window.addEventListener('keyup',e=>{if(e.code==='Space')state.space=false;});window.addEventListener('blur',()=>{state.space=false;if(state.pan){state.pan=null;drawingArea.classList.remove('dragging');persistAutosave();}});
  document.querySelectorAll('.panel-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.panel-tab').forEach(t=>t.classList.toggle('active',t===tab));$('toolsPanel').classList.toggle('hidden',tab.dataset.panel!=='tools');$('treePanel').classList.toggle('hidden',tab.dataset.panel!=='tree');}));
  $('helpBtn').addEventListener('click',()=>$('helpModal').classList.remove('hidden'));$('closeHelp').addEventListener('click',()=>$('helpModal').classList.add('hidden'));$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.add('hidden');});
  document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{const menu=btn.dataset.menu;if(menu==='file')openProjectLibrary();else if(menu==='edit')undo();else if(menu==='view')$('fitBtn').click();else if(menu==='insert')selectTool('text');else if(menu==='draw')selectTool('line');else if(menu==='format')$('applyTitleBtn').click();else $('helpBtn').click();}));
  applyGostControls();syncTitleInputs();renderTemplate();renderAll();updateZoom();selectTool('select');openProjectDb().catch(()=>{});
})();
