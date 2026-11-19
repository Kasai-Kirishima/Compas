import { Polygon, Circle } from '../src/cad-geometry-trim.mjs';
import { normalizeWheelDeltas, wheelZoomFactor } from '../src/wheel-navigation.mjs';
import { createProjectFile, readProjectFile, projectFileBaseName } from '../src/project-file.mjs';
import { getObjectSnapCandidates, findObjectSnap, findClosedLoops, createHatch, regularPolygonVertices, sixPointStarOutline, pointInRegion, trimLegacyCurve, arcThroughThreePoints } from '../src/sketch-advanced.mjs';
import { closestClosedPolylineEdge, moveClosedPolylineEdge } from '../src/polygon-edit.mjs';
import { dimensionExtensionField, dimensionExtensionValue, dimensionExtensionSpec, dimensionExtensionLengthFromPoint, dimensionExtensionGapField, dimensionExtensionGapValue, dimensionExtensionGapSpec, dimensionExtensionGapFromPoint, dimensionExtensionFromDrag, dimensionExtensionGapFromDrag, resizeDimensionPreservingOrientation } from '../src/dimension-extensions.mjs';
import { GOST_LINE_PATTERNS, normalizeGostDashPattern } from '../src/line-types.mjs';
import { cutPolygonNotchAtPoint, cutCircleNotchAtPoint, cutPolygonNotchWithoutBottomAtPoint, cutCircleNotchWithoutBottomAtPoint, cutOpenPathGapAtPoint, cutClosedBoundaryGapAtPoint, cutClosedContourByStraightPass, cutOpenPathByStraightPass, splitOpenPathAtPoint, splitClosedPolygonAtPoints, createRectangularPocket, createCircularCutout, createObroundCutout } from '../src/cutouts.mjs';

(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('sheetSvg'), drawingArea = $('drawingArea');
  const templateLayer = $('templateLayer'), sheetFrameLayer = $('sheetFrameLayer'), referenceLayer = $('referenceLayer'), geometryLayer = $('geometryLayer'), constructionLayer = $('constructionLayer'), annotationLayer = $('annotationLayer'), rulerLayer = $('rulerLayer'), previewLayer = $('previewLayer'), selectionLayer = $('selectionLayer');
  const annotationTypes = new Set(['text','dimension','leader','centerMark','roughness','tolerance','weld','table','section','techReq']);
  const constructionTypes = new Set(['construction','centerline','xline','ray']);
  const supportedTypes = new Set(['point','line','rect','circle','ellipse','arc','polyline','spline','freehand','text','dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','breakline','construction','centerline','xline','ray','section','techReq','reference']);
  const state = {
    referenceCalibration:null,
    format:'A3P', tool:'select', objects:[], selectedIds:[], points:[], zoom:1.8, grid:false, snap:false,
    objectSnap:true, ortho:false, template:true, space:false, pan:null, viewPan:{x:0,y:0}, drag:null, selectionRect:null, splitPending:null,
    history:[], redo:[], clipboard:[], ruler:null, rulerMode:'off', rulerVisible:true, freehandDraft:null, resize:null, rotateDrag:null, dimensionLabelDrag:null, dimensionExtensionDrag:null, duplicatePlacement:null, erasing:null, straightCutDraft:null,
    faceDrag:null, faceSelection:null, faceHover:null, selectedRegion:null,
    gost:{profile:'dstu-gost-ua',mainLine:.5,thinLine:.25,textHeight:5,dimensionTextHeight:7,dimensionTextDefaultsVersion:3,textDefaultsVersion:2,arrowLength:3.5,dimensionArrowVersion:2,precision:1,lettering:'B-S',fontFamily:'GOST type B,Arial,sans-serif'},
    title:{title:'Лабораторная работа №5',code:'КТ-24.ЛР5.001',material:'',scale:'1:1',sheet:'',sheets:'1',company:'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ',liter:'',mass:'',developer:'Кушвид О.А.',checker:'Базиль Б.',technical:'',normative:'',approved:''},
    titleForm:'lab5-template', templateTextOverrides:{}, projectId:null, fileName:'Кресленик_1', dirty:false, assignmentDimensions:''
  };
  const visible = {geometry:true,dimensions:true,construction:true,template:true,reference:true};
  let snapCandidateCache = null;
  let dimensionSliderSelectionKey = '';
  const deep = o => JSON.parse(JSON.stringify(o));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const mm = v => Number((Number(v)||0).toFixed(2));
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const layerFor = o => o.type==='reference'?'reference':(o.layer || (annotationTypes.has(o.type) ? 'annotation' : constructionTypes.has(o.type) ? 'construction' : 'geometry'));
  const isAnnotation = o => layerFor(o) === 'annotation';

  function setMessage(message){ $('statusMessage').textContent = message; }
  function mergeSavedGost(saved){
    const incoming=deep(saved||{});
    // Migrate legacy default lettering from 3.5 to the larger standard 5 mm.
    // Explicitly versioned user settings are kept unchanged.
    if(!incoming.textDefaultsVersion){
      if(Number(incoming.textHeight)===3.5)incoming.textHeight=5;
      incoming.textDefaultsVersion=2;
    }
    if(!incoming.dimensionArrowVersion) incoming.dimensionArrowVersion=2;
    if(incoming.arrowLength!==undefined) incoming.arrowLength=clamp(Number(incoming.arrowLength)||3.5,2.5,5);
    state.gost=Object.assign({},state.gost,incoming);
    if((Number(incoming.dimensionTextDefaultsVersion)||0)<3){if(!Number.isFinite(Number(incoming.dimensionTextHeight))||Number(incoming.dimensionTextHeight)===5)incoming.dimensionTextHeight=7;incoming.dimensionTextDefaultsVersion=3;}
    if(![1.8,2.5,3.5,5,7,10,14,20].includes(Number(state.gost.dimensionTextHeight)))state.gost.dimensionTextHeight=7;
  }
  function dimensions(){ return window.KompasTemplate.dimensions(state.format); }
  function gridStep(){ return clamp(Number($('gridStep')?.value)||5,.1,100); }
  function updateZoom(){ const d=dimensions(); svg.style.width=`${d.w*state.zoom}px`; svg.style.height=`${d.h*state.zoom}px`; svg.style.transform=`translate(${state.viewPan.x}px, ${state.viewPan.y}px)`; $('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`; }
  const MIN_ZOOM=.1, MAX_ZOOM=32;
  function setZoom(z){ state.zoom=clamp(Number(z)||1,MIN_ZOOM,MAX_ZOOM); updateZoom(); }
  function setZoomAt(z,clientX,clientY){
    const before=svg.getBoundingClientRect();
    const fx=before.width>0?clamp((clientX-before.left)/before.width,0,1):.5;
    const fy=before.height>0?clamp((clientY-before.top)/before.height,0,1):.5;
    state.zoom=clamp(Number(z)||state.zoom,MIN_ZOOM,MAX_ZOOM);
    updateZoom();
    const after=svg.getBoundingClientRect();
    state.viewPan.x+=clientX-(after.left+fx*after.width);
    state.viewPan.y+=clientY-(after.top+fy*after.height);
    updateZoom();
  }
  function resetViewPan(){state.viewPan={x:0,y:0};updateZoom();}
  function templateData(){
    const overrides=state.templateTextOverrides?.[state.titleForm]||{};
    if(state.titleForm!=='lab5-template')return {...state.title,templateTextOverrides:overrides};
    return {...state.title,scale:state.title.scale||'1:1',liter:state.title.liter==='У'?'':(state.title.liter??''),mass:state.title.mass==='—'?'':(state.title.mass??''),templateTextOverrides:overrides};
  }
  function renderTemplate(){
    const d=dimensions(); svg.setAttribute('viewBox',`0 0 ${d.w} ${d.h}`);
    $('paperRect').setAttribute('width',d.w); $('paperRect').setAttribute('height',d.h);
    $('gridRect').setAttribute('width',d.w); $('gridRect').setAttribute('height',d.h);
    window.KompasTemplate.render(templateLayer,state.format,templateData(),state.titleForm||'user-template');
    // Every text cell in every SVG template can be edited in-place with a double click.
    templateLayer.querySelectorAll('[data-template-text-id]').forEach(el=>{
      el.style.cursor='text';
      el.setAttribute('aria-label',`Редактировать текст: ${el.textContent||''}`);
      el.setAttribute('title','Двойной щелчок — изменить текст');
      el.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();openTemplateTextDialog(el);});
      el.addEventListener('pointerdown',e=>{if(e.detail>=2){e.preventDefault();e.stopPropagation();}});
    });
    if($('titleFormSelect'))$('titleFormSelect').value=state.titleForm||'user-template';
    if($('templateQuickSelect'))$('templateQuickSelect').value=state.titleForm||'user-template';
    const templateDescriptions={'lab5-template':'Шаблон лабораторной работы №5: А3, книжный, рамка 20/5 мм, основная надпись формы 1 и вертикальная графа 26 справа сверху по ГОСТ 2.104-2006. Центральное поле свободно для чертежа.','technical-a3-template':'Технический шаблон по вашему образцу: А3, книжный, рамка 20/5 мм, основная надпись формы 1 и вертикальная графа 26 справа сверху по ГОСТ 2.104-2006. Центральное поле свободно.','user-template':'Ваш початковий шаблон: бокові службові графи, верхня комірка й нижній основний напис.','gost-form1':'Форма 1 — перший аркуш графічного документа (креслення або схема).','form2':'Форма 2 — перший аркуш текстового конструкторського документа.','form2a':'Форма 2а — наступні аркуші графічних і текстових документів.','form2b-odd':'Форма 2б для текстового документа з додатковими графами ліворуч; варіант компонування для двостороннього копіювання.','form2b-even':'Форма 2б для текстового документа з додатковими графами праворуч; дзеркальний варіант компонування для двостороннього копіювання.','spec-form1':'Навчальна форма специфікації за традиційною ЄСКД / ГОСТ 2.106-96: перший аркуш із групами документації, деталей, стандартних виробів та матеріалів.','spec-form1a':'Навчальна форма специфікації за традиційною ЄСКД / ГОСТ 2.106-96: продовження таблиці на наступному аркуші.','blank':'Чистий аркуш зі стандартною рамкою без основного напису.'};
    if($('templateDescription'))$('templateDescription').textContent=(state.titleForm==='user-template'&&d.h<280)?'На форматі A5 ваш розширений шаблон не вміщується; застосовано компактний варіант форми 1.':(templateDescriptions[state.titleForm]||templateDescriptions['user-template']);
    templateLayer.style.display=(state.template&&visible.template)?'':'none';
    if(state.template&&visible.template&&$('statusMessage')&&!$('statusMessage').dataset.templateEditHint){$('statusMessage').dataset.templateEditHint='1';$('statusMessage').title='Двойной щелчок по любому тексту рамки или штампа — редактирование';}
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
    const a3GostTemplate=['lab5-template','technical-a3-template'].includes(state.titleForm);
    const pageOutline={x:0,y:0,width:d.w,height:d.h,fill:'none',stroke:'#000000','stroke-width':.25,'vector-effect':'non-scaling-stroke'};
    add(sheetFrameLayer,'rect',pageOutline);
    if(a3GostTemplate) add(sheetFrameLayer,'rect',{x:20,y:5,width:Math.max(1,d.w-25),height:Math.max(1,d.h-10),fill:'none',stroke:'#000000','stroke-width':.5,'vector-effect':'non-scaling-stroke'});
    else add(sheetFrameLayer,'rect',{x:20,y:5,width:Math.max(1,d.w-25),height:Math.max(1,d.h-10),fill:'none',stroke:'#000000','stroke-width':.32,'vector-effect':'non-scaling-stroke'});
  }
  function svgEl(name,attrs={}){ const el=document.createElementNS(NS,name); Object.entries(attrs).forEach(([k,v])=>{if(v!==undefined&&v!==null)el.setAttribute(k,String(v));}); return el; }
  function add(parent,name,attrs){ const el=svgEl(name,attrs); parent.appendChild(el); return el; }
  function objectLayer(o){ const l=layerFor(o); return l==='reference'?referenceLayer:l==='annotation'?annotationLayer:l==='construction'?constructionLayer:geometryLayer; }
  function applyStyle(el,o,selected=false){
    el.setAttribute('stroke',o.dash==='none'?'none':(selected?'#078db2':(o.color||'#20252a')));
    el.setAttribute('stroke-width',selected?Math.max(.45,(o.width??state.gost.thinLine)*1.8):(o.width??state.gost.thinLine));
    el.setAttribute('fill',o.fill||'none'); el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round');
    if(o.dash) el.setAttribute('stroke-dasharray',normalizeGostDashPattern(o.dash));
  }
  // Editable ГОСТ-style dimension arrowhead. The default remains a closed,
  // filled triangle; each dimension can override the shape and size globally
  // or independently at its first and second endpoints.
  function dimensionArrow(g,x,y,ux,uy,color,size=2.5,style='filled'){
    const v=Math.hypot(ux,uy);
    if(!Number.isFinite(v)||v<1e-8||!Number.isFinite(size)||size<=0)return null;
    style=['filled','open','tick','dot','none'].includes(style)?style:'filled';
    if(style==='none')return null;
    ux/=v; uy/=v;
    const nx=-uy,ny=ux,half=size*Math.tan(9*Math.PI/180),baseX=x-ux*size,baseY=y-uy*size;
    if(style==='dot')return add(g,'circle',{cx:x,cy:y,r:Math.max(.35,size*.22),fill:color,stroke:color,'stroke-width':.1,'data-dimension-arrow':'true','data-arrow-style':style});
    if(style==='tick'){
      const tx=(ux-uy)*.70710678,ty=(uy+ux)*.70710678,halfTick=size*.34;
      return add(g,'path',{d:`M ${x-tx*halfTick} ${y-ty*halfTick} L ${x+tx*halfTick} ${y+ty*halfTick}`,fill:'none',stroke:color,'stroke-width':Math.max(.35,size*.13),'stroke-linecap':'round','data-dimension-arrow':'true','data-arrow-style':style});
    }
    const path=style==='open'
      ? `M ${baseX+nx*half} ${baseY+ny*half} L ${x} ${y} L ${baseX-nx*half} ${baseY-ny*half}`
      : `M ${x} ${y} L ${baseX+nx*half} ${baseY+ny*half} L ${baseX-nx*half} ${baseY-ny*half} Z`;
    return add(g,'path',{
      d:path,fill:style==='filled'?color:'none',stroke:color,'stroke-width':style==='open'?Math.max(.35,size*.13):.12,'stroke-linejoin':'miter','vector-effect':'none',
      'data-dimension-arrow':'true','data-arrow-standard':'gost-2.307','data-arrow-style':style
    });
  }
  function dimensionArrowStyle(o,end){
    const specific=o[`arrow${end}Style`];
    return ['filled','open','tick','dot','none'].includes(specific)?specific:(['filled','open','tick','dot','none'].includes(o.arrowStyle)?o.arrowStyle:'filled');
  }
  // ГОСТ 2.305: open V-shaped view-direction arrow, distinct from a dimension arrow.
  function viewDirectionArrow(g,x,y,ux,uy,color,size=5){
    const v=Math.hypot(ux,uy);
    if(!Number.isFinite(v)||v<1e-8||!Number.isFinite(size)||size<=0)return null;
    ux/=v; uy/=v;
    const nx=-uy,ny=ux,half=size*Math.tan(9*Math.PI/180),baseX=x-ux*size,baseY=y-uy*size;
    return add(g,'path',{
      d:`M ${baseX+nx*half} ${baseY+ny*half} L ${x} ${y} L ${baseX-nx*half} ${baseY-ny*half}`,
      fill:'none',stroke:color,'stroke-width':Math.max(.35,state.gost.mainLine||.5),
      'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'none',
      'data-view-arrow':'true','data-arrow-standard':'gost-2.305'
    });
  }
  function dimensionLabel(g,x,y,text,size,color,rotation=0,options={}){
    const group=add(g,'g',rotation?{transform:`rotate(${rotation} ${x} ${y})`}:{});
    let textEl;
    if(options.lowerDiameterSign){
      // The diameter glyph sits fractionally below the numeric baseline, as a
      // compact drafting prefix. The number itself stays on the normal line.
      textEl=addText(group,x,y+size*.08,'',size,color,'middle');
      const shift=`${(size*.14).toFixed(2)}`;
      const sign=svgEl('tspan',{dy:shift});sign.textContent='⌀';textEl.appendChild(sign);
      const digits=svgEl('tspan',{dy:`-${shift}`});digits.textContent=String(text??'').replace(/^⌀/u,'');textEl.appendChild(digits);
    }else textEl=addText(group,x,y+size*.08,String(text??''),size,color,'middle');
    textEl.setAttribute('data-dimension-label','true');
    textEl.setAttribute('data-label-anchor','center');
    // Dragging the numeral itself is easier than aiming only for the small helper grip.
    textEl.setAttribute('data-dimension-label-handle','true');
    textEl.setAttribute('pointer-events','all');
    textEl.style.cursor='move';
    textEl.setAttribute('aria-label','Перетащить размерное число в любое место');
    return textEl;
  }
  // Автоматически размещаем стрелки внутри, если между выносными линиями
  // есть место для обеих головок; иначе выносим их наружу.
  function effectiveArrowPlacement(o,lineLength,arrowSize){
    const requested=['inside','outside','auto'].includes(o.arrowPlacement)?o.arrowPlacement:'auto';
    if(requested!=='auto')return requested;
    const textSize=clamp(Number(o.textSize)||state.gost.dimensionTextHeight||state.gost.textHeight||5,1.8,20);
    const value=dimensionNumber(o,lineLength);
    const labelWidth=o.hideValue?0:Math.max(textSize*1.5,String(value).length*textSize*.62+1.8);
    return lineLength >= (2*arrowSize + labelWidth + 1) ? 'inside' : 'outside';
  }
  function dimensionNumber(o,value){
    if(o.label!==undefined&&o.label!==null&&String(o.label).trim()!=='')return String(o.label);
    const precision=clamp(Number(state.gost.precision??1),0,3);
    const raw=Number(value).toFixed(precision);
    return precision?raw.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,''):raw;
  }
  // Keeps the text block clear of its own dimension line without painting an
  // opaque rectangle over the drawing. The clearance is recalculated on render.
  function keepDimensionLabelClearOfLine(center,a,b,text,textSize,rotation=0,preferredSide=1){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<.001)return center;
    const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
    const width=Math.max(textSize*1.5,String(text).length*textSize*.62+1.8),height=textSize*1.25;
    const angle=rotation*Math.PI/180,tx=Math.cos(angle),ty=Math.sin(angle),tnx=-ty,tny=tx;
    const halfNormal=(Math.abs(tx*nx+ty*ny)*width+Math.abs(tnx*nx+tny*ny)*height)/2;
    const clearance=Math.max(.6,textSize*.16,(state.gost.thinLine||.25)*2);
    const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const signed=(center.x-midpoint.x)*nx+(center.y-midpoint.y)*ny;
    const required=halfNormal+clearance;
    if(Math.abs(signed)>=required)return center;
    const side=Math.sign(signed)||Math.sign(preferredSide)||1;
    const shift=required-Math.abs(signed);
    return{x:mm(center.x+nx*side*shift),y:mm(center.y+ny*side*shift)};
  }
  function resolveDimensionLabelPosition(o,center,a,b,text,textSize,rotation=0,preferredSide=1){
    // Automatic clearance is applied to the default label position only.
    // Once a user has dragged the number, preserve the exact 2D position so it
    // can be moved both along the dimension line and towards/away from it.
    const manuallyPositioned=o.labelManualPositioned===true||Math.abs(Number(o.labelDx)||0)>.001||Math.abs(Number(o.labelDy)||0)>.001;
    return manuallyPositioned?center:keepDimensionLabelClearOfLine(center,a,b,text,textSize,rotation,preferredSide);
  }
  function addText(g,x,y,text,size=2.8,color='#20252a',anchor='middle',rotate=0,extra={}){
    const slanted=String(state.gost.lettering||'B-S').endsWith('-S'),transform=(rotate||slanted)?`translate(${x} ${y}) ${rotate?`rotate(${rotate}) `:''}${slanted?'skewX(-15) ':''}translate(${-x} ${-y})`:null;const el=add(g,'text',{x,y,'font-family':state.gost.fontFamily||'Arial,sans-serif','font-size':size,'text-anchor':anchor,fill:color,stroke:'none',transform,'font-weight':extra.weight||null,'font-style':extra.italic?'italic':null});
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
  function drawDimensionLabelHandle(g,x,y,selected,width=8,size=3.5){if(selected){const cx=x+width/2+1.5,cy=y-size*.55;add(g,'circle',{cx,cy,r:3.8,fill:'transparent',stroke:'none','data-dimension-label-handle':'true','data-editor-overlay':'true','pointer-events':'all',cursor:'move'});add(g,'circle',{cx,cy,r:1.45,fill:'#e6fbff',stroke:'#078db2','stroke-width':.55,'data-editor-overlay':'true','pointer-events':'none'});}}
  function drawDimensionExtension(g,origin,end,color,width,gap){
    const dx=end.x-origin.x,dy=end.y-origin.y,len=Math.hypot(dx,dy)||1;
    const start={x:origin.x+dx/len*gap,y:origin.y+dy/len*gap};
    add(g,'line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y,stroke:color,'stroke-width':width,fill:'none'});
  }
  function drawDimensionExtensionHandle(g,spec,selected,locked){
    if(!spec||!selected||locked)return;
    const {tip,end}=spec;
    add(g,'circle',{cx:tip.x,cy:tip.y,r:3.8,fill:'transparent',stroke:'none','data-dimension-extension-handle':end,'data-editor-overlay':'true','pointer-events':'all',cursor:'move','aria-label':end==='start'?'Перетащить только первую ножку размера':'Перетащить только вторую ножку размера'});
    add(g,'circle',{cx:tip.x,cy:tip.y,r:1.35,fill:'#e6fbff',stroke:'#078db2','stroke-width':.55,'data-editor-overlay':'true','pointer-events':'none'});
  }
  function drawDimensionExtensionGapHandle(g,spec,selected,locked){
    if(!spec||!selected||locked)return;
    const {tip,end}=spec;
    add(g,'circle',{cx:tip.x,cy:tip.y,r:4.2,fill:'transparent',stroke:'none','data-dimension-extension-gap-handle':end,'data-editor-overlay':'true','pointer-events':'all',cursor:'move','aria-label':end==='start'?'Перетащить начало первой ножки от детали':'Перетащить начало второй ножки от детали'});
    add(g,'circle',{cx:tip.x,cy:tip.y,r:1.55,fill:'#e9fff0',stroke:'#16834b','stroke-width':.6,'data-editor-overlay':'true','pointer-events':'none'});
  }
  function renderDimension(g,o,selected){
    const color=selected?'#078db2':(o.color||'#20252a');
    const kind=o.kind||'linear',thin=state.gost.thinLine;
    const textSize=clamp(Number(o.textSize)||state.gost.dimensionTextHeight||state.gost.textHeight||5,1.8,20);
    const arrowSize=clamp(Number(o.arrowSize)||Number(state.gost.arrowLength)||3.5,.8,12);
    const labelRotationExtra=clamp(Number(o.labelRotationDeg)||0,-360,360);
    const extensionGap=clamp(Number(o.extensionGap??1),0,5);
    const makeLine=(a,b,width=thin)=>add(g,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':width,fill:'none'});

    if(kind==='radius'||kind==='diameter'){
      const cx=Number(o.x),cy=Number(o.y),dx=Number(o.x2)-cx,dy=Number(o.y2)-cy;
      const r=Math.hypot(dx,dy);
      if(!Number.isFinite(r)||r<.01)return;
      const ux=dx/r,uy=dy/r,nx=-uy,ny=ux;
      const p1=kind==='diameter'?{x:cx-ux*r,y:cy-uy*r}:{x:cx,y:cy};
      const p2={x:cx+ux*r,y:cy+uy*r};
      makeLine(p1,p2);
      if(kind==='diameter'){
        // Diameter arrows terminate at the two opposite points of the circle.
        // Their tips point from the centre out towards the circular contour.
        const aSize=Math.min(arrowSize,Math.max(1.8,r*.48));
        const requestedArrowPlacement=['inside','outside','auto'].includes(o.arrowPlacement)?o.arrowPlacement:'auto';
        const arrowsOutside=requestedArrowPlacement==='outside'||(requestedArrowPlacement==='auto'&&2*r<(2*aSize+1));
        // Inside: arrow bodies stay within the circle. Outside: arrow bodies
        // are beyond the circumference and their tips point inward, visually
        // pressing against the circular edge.
        dimensionArrow(g,p1.x,p1.y,arrowsOutside?ux:-ux,arrowsOutside?uy:-uy,color,aSize,dimensionArrowStyle(o,'Start'));
        dimensionArrow(g,p2.x,p2.y,arrowsOutside?-ux:ux,arrowsOutside?-uy:uy,color,aSize,dimensionArrowStyle(o,'End'));
        const label=dimensionNumber(o,2*r).trim().replace(/^(?:Ш|ш|Ø|ø|⌀)\s*/u,'');
        // Normalize legacy diameter prefixes (including a mis-entered Cyrillic Ш) to the diameter sign ⌀.
        // ГОСТ 2.307-2011, 5.25: move the diameter number away from the line centre.
        const rawLabelX=cx-nx*(textSize*.85+1)+Number(o.labelDx||0),rawLabelY=cy-ny*(textSize*.85+1)+Number(o.labelDy||0);
        const safeLabel=resolveDimensionLabelPosition(o,{x:rawLabelX,y:rawLabelY},p1,p2,`⌀${label}`,textSize,labelRotationExtra,-1),labelX=safeLabel.x,labelY=safeLabel.y;
        if(!o.hideValue){dimensionLabel(g,labelX,labelY,`⌀${label}`,textSize,color,labelRotationExtra,{lowerDiameterSign:true});drawDimensionLabelHandle(g,labelX,labelY,selected&&!o.locked,Math.max(textSize*1.5,(`⌀${label}`).length*textSize*.62),textSize);}
      }else{
        // A radius dimension has one arrowhead at the measured arc.
        dimensionArrow(g,p2.x,p2.y,ux,uy,color,arrowSize,dimensionArrowStyle(o,'End'));
        const label=dimensionNumber(o,r).trim().replace(/^R\s*/i,'');
        const rawMx=(cx+p2.x)/2-nx*(textSize*.75+1)+Number(o.labelDx||0),rawMy=(cy+p2.y)/2-ny*(textSize*.75+1)+Number(o.labelDy||0);
        const safeLabel=resolveDimensionLabelPosition(o,{x:rawMx,y:rawMy},{x:cx,y:cy},p2,`R${label}`,textSize,labelRotationExtra,-1),mx=safeLabel.x,my=safeLabel.y;
        if(!o.hideValue){dimensionLabel(g,mx,my,`R${label}`,textSize,color,labelRotationExtra);drawDimensionLabelHandle(g,mx,my,selected&&!o.locked,Math.max(textSize*1.5,(`R${label}`).length*textSize*.62),textSize);}
      }
      return;
    }

    if(kind==='angular'){
      const vx=Number(o.x),vy=Number(o.y),aStart=Math.atan2(Number(o.y2)-vy,Number(o.x2)-vx),aEnd=Math.atan2(Number(o.y3)-vy,Number(o.x3)-vx);
      let delta=(aEnd-aStart+Math.PI*2)%(Math.PI*2),start=aStart,end=aEnd;
      // Keep the natural smaller angle; this avoids an accidental 300+ degree arc.
      if(delta>Math.PI){delta=Math.PI*2-delta;start=aEnd;end=aStart;}
      const rad=clamp(Number(o.radius)||12,2,1000),p1={x:vx+Math.cos(start)*rad,y:vy+Math.sin(start)*rad},p2={x:vx+Math.cos(end)*rad,y:vy+Math.sin(end)*rad};
      const extStart=dimensionExtensionSpec(o,'start'),extEnd=dimensionExtensionSpec(o,'end');
      const gapStart=dimensionExtensionGapSpec(o,'start'),gapEnd=dimensionExtensionGapSpec(o,'end');
      drawDimensionExtension(g,{x:vx,y:vy},extStart.tip,color,thin,gapStart?.value??0);
      drawDimensionExtension(g,{x:vx,y:vy},extEnd.tip,color,thin,gapEnd?.value??0);
      drawDimensionExtensionHandle(g,extStart,selected,o.locked);drawDimensionExtensionHandle(g,extEnd,selected,o.locked);
      drawDimensionExtensionGapHandle(g,gapStart,selected,o.locked);drawDimensionExtensionGapHandle(g,gapEnd,selected,o.locked);
      add(g,'path',{d:`M ${p1.x} ${p1.y} A ${rad} ${rad} 0 ${delta>Math.PI?1:0} 1 ${p2.x} ${p2.y}`,fill:'none',stroke:color,'stroke-width':thin});
      const arcLen=rad*delta,aSize=Math.min(arrowSize,Math.max(1.4,arcLen*.32));
      // Tangents of the dimension arc: both tips face into the measured sector.
      dimensionArrow(g,p1.x,p1.y,-Math.sin(start),Math.cos(start),color,aSize,dimensionArrowStyle(o,'Start'));
      dimensionArrow(g,p2.x,p2.y,Math.sin(end),-Math.cos(end),color,aSize,dimensionArrowStyle(o,'End'));
      const mid=start+delta/2,rr=rad+textSize*.8+1.5;
      const label=dimensionNumber(o,delta*180/Math.PI).trim().replace(/°$/,'')+'°';
      const labelX=vx+Math.cos(mid)*rr+Number(o.labelDx||0),labelY=vy+Math.sin(mid)*rr+Number(o.labelDy||0);
      if(!o.hideValue){dimensionLabel(g,labelX,labelY,label,textSize,color,labelRotationExtra);drawDimensionLabelHandle(g,labelX,labelY,selected&&!o.locked,Math.max(textSize*1.5,label.length*textSize*.62),textSize);}
      return;
    }

    const x1=Number(o.x),y1=Number(o.y),x2=Number(o.x2),y2=Number(o.y2);
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
    if(!Number.isFinite(len)||len<.01)return;
    let ax,ay,bx,by,ux,uy,nx,ny,labelNx,labelNy,value,extA,extB,labelRotation=0;
    const rawOffset=Number.isFinite(Number(o.offset))?Number(o.offset):10;
    const off=(Math.sign(rawOffset)||1)*Math.max(10,Math.abs(rawOffset));
    if(kind==='horizontal'){
      const side=off>=0?1:-1,base=side>0?Math.max(y1,y2):Math.min(y1,y2),dimY=base+side*Math.abs(off);
      ax=x1;bx=x2;ay=by=dimY;ux=Math.sign(bx-ax)||1;uy=0;nx=0;ny=side;labelNx=nx;labelNy=ny;
      extA=dimensionExtensionSpec(o,'start').tip;extB=dimensionExtensionSpec(o,'end').tip;value=Math.abs(dx);
    }else if(kind==='vertical'){
      const side=off>=0?1:-1,base=side>0?Math.max(x1,x2):Math.min(x1,x2),dimX=base+side*Math.abs(off);
      ax=bx=dimX;ay=y1;by=y2;ux=0;uy=Math.sign(by-ay)||1;nx=-side;ny=0;labelNx=1;labelNy=0;
      extA=dimensionExtensionSpec(o,'start').tip;extB=dimensionExtensionSpec(o,'end').tip;value=Math.abs(dy);
      labelRotation=-90;
    }else{
      ux=dx/len;uy=dy/len;nx=-uy;ny=ux;
      ax=x1+nx*off;ay=y1+ny*off;bx=x2+nx*off;by=y2+ny*off;
      extA=dimensionExtensionSpec(o,'start').tip;extB=dimensionExtensionSpec(o,'end').tip;value=len;
      labelRotation=Math.atan2(uy,ux)*180/Math.PI;if(labelRotation>90||labelRotation<-90){labelRotation+=180;labelNx=-nx;labelNy=-ny;}else{labelNx=nx;labelNy=ny;}
    }
    // Each object-side beginning and each overrun beyond the dimension line can be edited independently.
    const nearStart=dimensionExtensionGapSpec(o,'start'),nearEnd=dimensionExtensionGapSpec(o,'end');
    drawDimensionExtension(g,{x:x1,y:y1},extA,color,thin,nearStart?.value??extensionGap);
    drawDimensionExtension(g,{x:x2,y:y2},extB,color,thin,nearEnd?.value??extensionGap);
    drawDimensionExtensionHandle(g,dimensionExtensionSpec(o,'start'),selected,o.locked);drawDimensionExtensionHandle(g,dimensionExtensionSpec(o,'end'),selected,o.locked);
    drawDimensionExtensionGapHandle(g,nearStart,selected,o.locked);drawDimensionExtensionGapHandle(g,nearEnd,selected,o.locked);
    const label=dimensionNumber(o,value);
    const lineLen=Math.hypot(bx-ax,by-ay),placement=effectiveArrowPlacement(o,lineLen,arrowSize);
    if(placement==='outside'){
      // Наружное размещение: наконечники стоят за пределами выносных линий,
      // а размерная линия продолжается за ними.
      const start={x:ax-ux*(arrowSize+1),y:ay-uy*(arrowSize+1)},end={x:bx+ux*(arrowSize+1),y:by+uy*(arrowSize+1)};
      makeLine(start,end);
      dimensionArrow(g,ax,ay,ux,uy,color,arrowSize,dimensionArrowStyle(o,'Start'));
      dimensionArrow(g,bx,by,-ux,-uy,color,arrowSize,dimensionArrowStyle(o,'End'));
    }else{
      // Внутреннее размещение: основания стрелок обращены к середине размера.
      makeLine({x:ax,y:ay},{x:bx,y:by});
      dimensionArrow(g,ax,ay,-ux,-uy,color,arrowSize,dimensionArrowStyle(o,'Start'));
      dimensionArrow(g,bx,by,ux,uy,color,arrowSize,dimensionArrowStyle(o,'End'));
    }
    // Размерное число остаётся читаемым и автоматически отодвигается от размерной линии.
    const midX=(ax+bx)/2,midY=(ay+by)/2,labelOffset=textSize*.75+1;
    const baseX=midX-labelNx*labelOffset,baseY=midY-labelNy*labelOffset;
    const horizontal=(o.textOrientation||'horizontal')!=='aligned';
    const finalLabelRotation=(horizontal?0:labelRotation)+labelRotationExtra;
    const rawLabel={x:baseX+Number(o.labelDx||0),y:baseY+Number(o.labelDy||0)};
    const safeLabel=resolveDimensionLabelPosition(o,rawLabel,{x:ax,y:ay},{x:bx,y:by},label,textSize,finalLabelRotation,labelNx||1);
    const lx=safeLabel.x,ly=safeLabel.y;
    if(!o.hideValue){dimensionLabel(g,lx,ly,label,textSize,color,finalLabelRotation);
    drawDimensionLabelHandle(g,lx,ly,selected&&!o.locked,Math.max(textSize*1.5,String(label).length*textSize*.62),textSize);}
  }
  function extentLinePoints(o){
    const a={x:Number(o.x),y:Number(o.y)},b={x:Number(o.x2),y:Number(o.y2)};
    const dx=b.x-a.x,dy=b.y-a.y;
    if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||Math.hypot(dx,dy)<1e-9)return null;
    const d=dimensions();let lo=o.type==='ray'?0:-Infinity,hi=Infinity;
    const clip=(origin,delta,min,max)=>{
      if(Math.abs(delta)<1e-12)return origin>=min-1e-9&&origin<=max+1e-9?[-Infinity,Infinity]:null;
      const t1=(min-origin)/delta,t2=(max-origin)/delta;return[Math.min(t1,t2),Math.max(t1,t2)];
    };
    for(const q of [[a.x,dx,0,d.w],[a.y,dy,0,d.h]]){const t=clip(...q);if(!t)return null;lo=Math.max(lo,t[0]);hi=Math.min(hi,t[1]);}
    if(!Number.isFinite(lo))lo=-Math.max(d.w,d.h)*4;
    if(!Number.isFinite(hi))hi=Math.max(d.w,d.h)*4;
    if(lo>hi)return null;
    return[{x:mm(a.x+dx*lo),y:mm(a.y+dy*lo)},{x:mm(a.x+dx*hi),y:mm(a.y+dy*hi)}];
  }
  function roleOf(o){const geometric=['line','construction','centerline','xline','ray','rect','circle','ellipse','arc','polyline','spline','freehand','breakline'].includes(o?.type);return geometric ? (o.lineRole || (o.type==='centerline' ? 'center' : (['construction','xline','ray'].includes(o.type) ? 'thin' : 'main'))) : null;}
  function renderObject(o){
    if(o.hidden)return;
    const layer=layerFor(o); if((layer==='geometry'&&!visible.geometry)||(layer==='annotation'&&!visible.dimensions)||(layer==='construction'&&!visible.construction)||(layer==='reference'&&!visible.reference))return;
    const lineRole=roleOf(o);if(lineRole&&['main','thin','center'].includes(lineRole)){const control=$('show'+lineRole[0].toUpperCase()+lineRole.slice(1)+'Lines');if(control&&!control.checked)return;}
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
    } else if(o.type==='line'||o.type==='construction'||o.type==='centerline'||o.type==='xline'||o.type==='ray'){
      const patterned=['wave','zigzag'].includes(o.linePattern),extent=['xline','ray'].includes(o.type)?extentLinePoints(o):null;
      const p1=extent?.[0]||{x:o.x,y:o.y},p2=extent?.[1]||{x:o.x2,y:o.y2};
      const el=(!extent&&patterned)?add(g,'path',{d:linePatternPoints(o).map((p,i)=>(i?'L':'M')+` ${p.x} ${p.y}`).join(' ')}):add(g,'line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y});
      const roleDash=o.type==='centerline'?GOST_LINE_PATTERNS.dashDotThin:(lineRole==='center'?GOST_LINE_PATTERNS.dashDotThin:'');
      applyStyle(el,{...o,dash:o.dash||roleDash,color:o.color||(o.type==='construction'||o.type==='xline'||o.type==='ray'?'#8c969d':c)},selected);
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
      const lines=String(o.text||'Текст').split('\n'),size=o.size||5,lh=o.lineHeight||size*1.25,anchor=o.align||'start',widthFactor=clamp(Number(o.widthFactor)||1,.25,3),letter=Number(o.letterSpacing)||0;
      const estimatedW=Math.max(2,...lines.map(line=>line.length*size*.62+Math.max(0,line.length-1)*letter)),estimatedH=Math.max(size,lines.length*lh);
      const left=anchor==='middle'?-estimatedW/2:anchor==='end'?-estimatedW:0,top=(o.baseline==='hanging'?0:o.baseline==='middle'?-estimatedH/2:o.baseline==='text-after-edge'?-estimatedH:-size*.8);
      const lettering=o.lettering||state.gost.lettering||'B-S',oblique=String(lettering).endsWith('-S');const transform=`translate(${o.x} ${o.y}) rotate(${Number(o.rotation)||0}) ${oblique?'skewX(-15) ':''}scale(${widthFactor} 1)`;
      if(o.frame)add(g,'rect',{x:left-1,y:top-1,width:estimatedW+2,height:estimatedH+2,transform,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});
      const t=add(g,'text',{x:0,y:0,'font-family':o.font||state.gost.fontFamily||'Arial,sans-serif','font-size':size,fill:c,stroke:'none',transform,'font-weight':o.bold?'bold':'normal','font-style':o.italic?'italic':'normal','text-anchor':anchor,'dominant-baseline':o.baseline||'alphabetic','letter-spacing':letter||null,'text-decoration':[o.underline?'underline':'',o.overline?'overline':'',o.strike?'line-through':''].filter(Boolean).join(' ')||null});
      lines.forEach((line,i)=>{const sp=add(t,'tspan',{x:0,dy:i===0?0:lh});sp.textContent=line;});
    } else if(o.type==='dimension') renderDimension(g,o,selected);
    else if(o.type==='section'){
      const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
      add(g,'line',{x1:o.x,y1:o.y,x2:o.x2,y2:o.y2,stroke:c,'stroke-width':state.gost.mainLine});
      // Both view-direction arrows point to the same selected side of the cutting plane.
      // Their tips are offset 2.5 mm from the end marks as required by GOST 2.305.
      const sectionArrowSize=clamp(Math.max(4.5,Number(state.gost.arrowLength)||2.5),4.5,6),gap=2.5;
      const side=o.viewSide===-1?-1:1,nx=-uy*side,ny=ux*side;
      viewDirectionArrow(g,o.x+nx*gap,o.y+ny*gap,nx,ny,c,sectionArrowSize);
      viewDirectionArrow(g,o.x2+nx*gap,o.y2+ny*gap,nx,ny,c,sectionArrowSize);
      addText(g,o.x+nx*(gap+3)-2,o.y+ny*(gap+3)-2,o.label||'А',o.textSize||state.gost.textHeight,c);
      addText(g,o.x2+nx*(gap+3)+2,o.y2+ny*(gap+3)-2,o.label||'А',o.textSize||state.gost.textHeight,c);
    } else if(o.type==='leader'){
      const pts=o.points||[];if(pts.length>=2){const d=pts.map((p,i)=>(i?'L':'M')+` ${p.x} ${p.y}`).join(' ');add(g,'path',{d,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});const a=pts[0],b=pts[1],len=Math.hypot(b.x-a.x,b.y-a.y)||1,termination=o.termination||'arrow';
        // ГОСТ 2.316: a leader ends with an arrow, a dot, or no marker,
        // depending on whether it refers to a contour/surface, an area, or another line.
        if(termination==='dot')add(g,'circle',{cx:a.x,cy:a.y,r:.65,fill:c,stroke:'none','data-leader-terminal':'dot'});
        else if(termination!=='none')dimensionArrow(g,a.x,a.y,-(b.x-a.x)/len,-(b.y-a.y)/len,c,clamp(Number(state.gost.arrowLength)||3.5,2.5,5));
        const end=pts[pts.length-1];add(g,'line',{x1:end.x,y1:end.y,x2:end.x+12,y2:end.y,stroke:c,'stroke-width':state.gost.thinLine});addText(g,end.x+1,end.y-1,o.text||'Примечание',o.textSize||state.gost.textHeight,c,'start');}
    } else if(o.type==='centerMark'){
      const s=o.size||5;add(g,'line',{x1:o.x-s,y1:o.y,x2:o.x+s,y2:o.y,stroke:c,'stroke-width':state.gost.thinLine});add(g,'line',{x1:o.x,y1:o.y-s,x2:o.x,y2:o.y+s,stroke:c,'stroke-width':state.gost.thinLine});
    } else if(o.type==='hatch'){
      const pid=`pat_${String(o.id).replace(/[^a-z0-9]/gi,'')}`;
      const pts=Array.isArray(o.points)&&o.points.length>=3?o.points:null;
      const holes=Array.isArray(o.holes)?o.holes.filter(r=>Array.isArray(r)&&r.length>=3):[];
      const x=pts?Math.min(...pts.map(p=>p.x)):Math.min(o.x,o.x2),y=pts?Math.min(...pts.map(p=>p.y)):Math.min(o.y,o.y2),w=pts?Math.max(...pts.map(p=>p.x))-x:Math.abs(o.x2-o.x),h=pts?Math.max(...pts.map(p=>p.y))-y:Math.abs(o.y2-o.y);
      const d=pts?[pts,...holes].map(r=>`M ${r.map((p,i)=>`${i?'L':' '}${p.x} ${p.y}`).join(' ')} Z`).join(' '):null;
      if(Array.isArray(o.hatchSegments)){
        if(o.pattern==='solid'&&d)add(g,'path',{d,fill:o.color||c,'fill-opacity':.16,stroke:'none','fill-rule':'evenodd'});
        else o.hatchSegments.forEach(segment=>add(g,'line',{x1:segment.a.x,y1:segment.a.y,x2:segment.b.x,y2:segment.b.y,stroke:o.color||c,'stroke-width':clamp(Number(o.width)||state.gost.thinLine,.05,1),fill:'none'}));
      } else if(o.pattern==='solid'){
        if(d)add(g,'path',{d,fill:o.color||c,'fill-opacity':.16,stroke:'none','fill-rule':'evenodd'});else add(g,'rect',{x,y,width:w,height:h,fill:o.color||c,'fill-opacity':.16,stroke:'none'});
      } else {
        const spacing=clamp(Number(o.spacing)||3,.5,100),angle=Number(o.angle??45),strokeWidth=clamp(Number(o.width)||state.gost.thinLine,.05,1),defs=add(g,'defs',{}),pat=add(defs,'pattern',{id:pid,width:spacing,height:spacing,patternUnits:'userSpaceOnUse',patternTransform:`rotate(${angle})`});
        add(pat,'path',{d:`M 0 0 L 0 ${spacing}`,stroke:o.color||c,'stroke-width':strokeWidth,fill:'none'});
        if(o.pattern==='cross')add(pat,'path',{d:`M 0 0 L ${spacing} 0`,stroke:o.color||c,'stroke-width':strokeWidth,fill:'none'});
        if(d)add(g,'path',{d,fill:`url(#${pid})`,stroke:'none','fill-rule':'evenodd'});else add(g,'rect',{x,y,width:w,height:h,fill:`url(#${pid})`,stroke:'none'});
      }
      if(o.showBoundary&&d)add(g,'path',{d,fill:'none',stroke:o.color||c,'stroke-width':o.width||state.gost.thinLine,'fill-rule':'evenodd'});
    } else if(o.type==='roughness'){
      const s=o.size||5;add(g,'path',{d:`M ${o.x-s*.45} ${o.y+s*.25} L ${o.x} ${o.y-s*.45} L ${o.x+s*.45} ${o.y+s*.25} L ${o.x+s*1.8} ${o.y+s*.25}`,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});if(o.label)addText(g,o.x+s*.8,o.y-s*.5,o.label,o.textSize||state.gost.textHeight,c,'middle');
    } else if(o.type==='tolerance'){
      const ts=o.textSize||state.gost.textHeight,w=Math.max(20,(o.text||'⌀0.05 | A').length*ts*.62+4),h=Math.max(7,ts*1.55);add(g,'rect',{x:o.x,y:o.y-h,width:w,height:h,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});addText(g,o.x+w/2,o.y-ts*.45,o.text||'⌀0.05 | A',ts,c);
    } else if(o.type==='weld'){
      add(g,'line',{x1:o.x,y1:o.y,x2:o.x+18,y2:o.y,stroke:c,'stroke-width':state.gost.thinLine});add(g,'path',{d:`M ${o.x+5} ${o.y} L ${o.x+9} ${o.y-5} L ${o.x+13} ${o.y} Z`,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});addText(g,o.x+19,o.y-1,o.text||'a4',o.textSize||state.gost.textHeight,c,'start');
    } else if(o.type==='table'){
      const rows=o.rows||3,cols=o.cols||3,w=o.w||60,h=o.h||25,x=o.x,y=o.y;add(g,'rect',{x,y,width:w,height:h,fill:'none',stroke:c,'stroke-width':state.gost.thinLine});for(let i=1;i<cols;i++)add(g,'line',{x1:x+w*i/cols,y1:y,x2:x+w*i/cols,y2:y+h,stroke:c,'stroke-width':state.gost.thinLine});for(let i=1;i<rows;i++)add(g,'line',{x1:x,y1:y+h*i/rows,x2:x+w,y2:y+h*i/rows,stroke:c,'stroke-width':state.gost.thinLine});(o.cells||[]).forEach((v,i)=>{if(v)addText(g,x+w*((i%cols)+.5)/cols,y+h*(Math.floor(i/cols)+.65)/rows,v,o.textSize||5,c);});
    }
    if(state.faceSelection?.id===o.id){
      const facePoints=editablePolygonFacePoints(o),edgeIndex=state.faceSelection.edgeIndex;
      if(facePoints&&edgeIndex>=0&&edgeIndex<facePoints.length){const a=facePoints[edgeIndex],b=facePoints[(edgeIndex+1)%facePoints.length];add(g,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#e28a22','stroke-width':.85,'stroke-dasharray':'2 1','pointer-events':'none','data-editor-overlay':'true'});}
    }
    if(selected){const b=objectBounds(o);if(b){const box=add(g,'rect',{x:b.x-1.5,y:b.y-1.5,width:Math.max(3,b.w+3),height:Math.max(3,b.h+3),fill:'none',stroke:'#078db2','stroke-width':.3,'stroke-dasharray':'1.2 1','data-selection-outline':'true'});box.setAttribute('pointer-events','none');}}
  }
  function objectBounds(o){
    if(o&&['xline','ray'].includes(o.type)){const ep=extentLinePoints(o);if(ep){const xs=ep.map(p=>p.x),ys=ep.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}}
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
  // Only polygonal closed contours have independently movable straight faces.
  // Plain rectangles are converted to editable polylines after their first edit;
  // rounded rectangles stay untouched because their sides meet tangent arcs.
  function editablePolygonFacePoints(o){
    if(o?.type==='polyline'&&o.closed&&Array.isArray(o.points)&&o.points.length>=3){
      const points=o.points.map(p=>({x:Number(p.x),y:Number(p.y)}));
      if(points.length>3&&Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<1e-6)points.pop();
      return points.length>=3?points:null;
    }
    if(o?.type==='rect'&&!Number(o.rx)){
      const left=Math.min(o.x,o.x2),right=Math.max(o.x,o.x2),top=Math.min(o.y,o.y2),bottom=Math.max(o.y,o.y2);
      if(right-left<.05||bottom-top<.05)return null;
      return[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
    }
    return null;
  }
  function setEditablePolygonFacePoints(o,points){
    if(o.type==='rect'){
      o.type='polyline';o.points=points.map(p=>({x:mm(p.x),y:mm(p.y)}));o.closed=true;
      delete o.x;delete o.y;delete o.x2;delete o.y2;delete o.rx;
    }else{o.points=points.map(p=>({x:mm(p.x),y:mm(p.y)}));o.closed=true;}
  }
  function faceHitTolerance(){const rect=svg.getBoundingClientRect(),scale=rect.width/Math.max(1,dimensions().w);return Math.max(.35,10/Math.max(.05,scale));}
  function findEditableFaceAt(point){
    if(!visible.geometry)return null;
    let best=null;const tolerance=faceHitTolerance();
    for(const o of state.objects){
      if(o.hidden||o.locked||layerFor(o)!=='geometry')continue;
      const points=editablePolygonFacePoints(o);if(!points)continue;
      const hit=closestClosedPolylineEdge(points,point);
      if(hit&&hit.distance<=tolerance&&(!best||hit.distance<best.hit.distance))best={object:o,points,hit};
    }
    return best;
  }
  function renderFaceHover(face){
    previewLayer.innerHTML='';if(!face)return;
    const a=face.points[face.hit.edgeIndex],b=face.points[(face.hit.edgeIndex+1)%face.points.length];
    add(previewLayer,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#e28a22','stroke-width':1.1,'stroke-dasharray':'2 1','pointer-events':'none'});
    add(previewLayer,'circle',{cx:face.hit.point.x,cy:face.hit.point.y,r:.9,fill:'#ffffff',stroke:'#e28a22','stroke-width':.45,'pointer-events':'none'});
  }
  function faceNormal(points,index){const a=points[index],b=points[(index+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;return{x:-dy/len,y:dx/len};}
  function applyFaceOffset(object,edgeIndex,offset,before=snapshot()){
    const points=editablePolygonFacePoints(object);if(!points){setMessage('Выберите замкнутый многоугольник или обычный прямоугольник');return false;}
    const result=moveClosedPolylineEdge(points,edgeIndex,offset);
    if(!result.ok){setMessage(result.reason||'Не удалось переместить грань');return false;}
    if(Math.abs(result.offset)<1e-8){setMessage('Смещение равно нулю');return false;}
    setEditablePolygonFacePoints(object,result.points);commit(before);state.faceSelection={id:object.id,edgeIndex};renderAll();
    $('polygonFaceOffset').value='0';setMessage(`Грань ${edgeIndex+1} смещена на ${Number(offset).toFixed(2)} мм`);return true;
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
    // Dimension objects use their own round blue drag handles for label and
    // extension editing. Hide generic square bounding-box resize grips for them.
    if(!objects.some(o=>o.type==='dimension')){
      const handles={nw:[b.x,b.y],n:[b.x+b.w/2,b.y],ne:[b.x+b.w,b.y],e:[b.x+b.w,b.y+b.h/2],se:[b.x+b.w,b.y+b.h],s:[b.x+b.w/2,b.y+b.h],sw:[b.x,b.y+b.h],w:[b.x,b.y+b.h/2]};
      Object.entries(handles).forEach(([key,[x,y]])=>{
        add(selectionLayer,'rect',{x:x-1.8,y:y-1.8,width:3.6,height:3.6,rx:.35,fill:'#f7fcff',stroke:'#087fa0','stroke-width':.55,'data-resize-handle':key,'pointer-events':'all',cursor:({nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize'})[key]});
      });
    }
    const rx=b.x+b.w/2,ry=b.y-9;
    add(selectionLayer,'line',{x1:rx,y1:b.y,x2:rx,y2:ry+1.8,stroke:'#087fa0','stroke-width':.35,'pointer-events':'none'});
    add(selectionLayer,'circle',{cx:rx,cy:ry,r:2.6,fill:'#ffffff',stroke:'#087fa0','stroke-width':.7,'data-rotate-handle':'true','pointer-events':'all',cursor:'grab'});
    add(selectionLayer,'path',{d:`M ${rx-1.1} ${ry-.4} A 1.2 1.2 0 1 1 ${rx+.7} ${ry+1}`,fill:'none',stroke:'#087fa0','stroke-width':.35,'pointer-events':'none'});
  }
  function mapObjectPoint(p,oldB,newB){const sx=newB.w/Math.max(.0001,oldB.w),sy=newB.h/Math.max(.0001,oldB.h);return{x:mm(newB.x+(p.x-oldB.x)*sx),y:mm(newB.y+(p.y-oldB.y)*sy)};}
  function scaleObjectToBounds(source,oldB,newB){
    // Dimensions are resized in their own local axes. The generic X/Y map
    // below skews diagonal dimensions when the selection box is stretched.
    if(source.type==='dimension')return resizeDimensionPreservingOrientation(source,oldB,newB);
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
    if(['text','techReq'].includes(o.type)){o.size=mm((o.size||5)*sy);o.lineHeight=mm((o.lineHeight||4)*sy);o.widthFactor=clamp((o.widthFactor||1)*sx/Math.max(.0001,sy),.1,10);o.letterSpacing=mm((o.letterSpacing||0)*sx);}
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
  function renderSelectedRegion(){
    const region=state.selectedRegion?.region;if(!region?.outer?.length)return;
    const rings=[region.outer,...(region.holes||[])];
    const d=rings.map(ring=>`M ${ring.map((p,i)=>`${i?'L':' '}${p.x} ${p.y}`).join(' ')} Z`).join(' ');
    add(selectionLayer,'path',{d,fill:'#16a5c9','fill-opacity':.08,'fill-rule':'evenodd',stroke:'#078db2','stroke-width':.55,'stroke-dasharray':'2 1','pointer-events':'none','data-region-selection':'true'});
  }
  function renderAll(){snapCandidateCache=null;referenceLayer.innerHTML='';geometryLayer.innerHTML='';constructionLayer.innerHTML='';annotationLayer.innerHTML='';previewLayer.innerHTML='';selectionLayer.innerHTML='';state.objects.forEach(renderObject);renderRuler();renderSelectionHandles();renderSelectedRegion();$('geometryCount').textContent=state.objects.filter(o=>layerFor(o)==='geometry'&&!o.hidden).length;$('annotationCount').textContent=state.objects.filter(o=>layerFor(o)==='annotation'&&!o.hidden).length;$('constructionCount').textContent=state.objects.filter(o=>layerFor(o)==='construction'&&!o.hidden).length;$('selectedStatus').textContent=state.selectedIds.length;renderTree();updateSelectionPanel();}
  function updateSelectionPanel(){
    const arr=state.objects.filter(o=>state.selectedIds.includes(o.id)),o=arr.length===1?arr[0]:null;
    $('noSelection').classList.toggle('hidden',arr.length>0);$('selectionFields').classList.toggle('hidden',arr.length===0);const refsOnly=arr.length>0&&arr.every(x=>x.type==='reference'),allRefsLocked=refsOnly&&arr.every(x=>x.locked);$('quickReferenceLockBtn').disabled=!refsOnly;$('quickReferenceLockBtn').innerHTML=refsOnly?(allRefsLocked?'<span>🔓</span>Разрешить движение':'<span>🔒</span>Запретить движение'):'<span>🔒</span>Блокировка';$('quickReferenceLockBtn').setAttribute('aria-pressed',String(!!allRefsLocked));$('quickReferenceLockBtn').title=refsOnly?(allRefsLocked?'Разблокировать выбранные референсы':'Закрепить выбранные референсы'):'Выберите референс, чтобы переключить перемещение';
    if(arr.length>1)$('noSelection').textContent=`Выбрано объектов: ${arr.length}`;
    else $('noSelection').textContent='Объект не выбран';
    $('editTextFormatBtn').classList.toggle('hidden',!(o&&['text','techReq'].includes(o.type)));$('referenceSelectionFields').classList.toggle('hidden',!(o&&o.type==='reference'));$('dimensionSelectionFields').classList.toggle('hidden',!(arr.length>0&&arr.every(x=>x.type==='dimension')));$('objectTextSizeField').classList.toggle('hidden',arr.length>0&&arr.every(x=>x.type==='dimension'));$('objectLocked').checked=!!(o&&o.locked);$('objectGeometryFields').classList.toggle('hidden',!o);if(o){$('dimensionArrowPlacement').value=['inside','outside','auto'].includes(o.arrowPlacement)?o.arrowPlacement:'auto';if(o.type==='dimension'){$('dimensionTextHeight').value=String(Number(o.textSize)||state.gost.dimensionTextHeight||state.gost.textHeight||5);$('dimensionTextOrientation').value=o.textOrientation||'horizontal';$('dimensionSelectedOffset').value=Number(o.offset)||10;$('dimensionSelectedOffsetSlider').value=clamp(Math.abs(Number(o.offset)||10),10,200);$('dimensionExtensionGap').value=Number(o.extensionGap??1);$('dimensionExtensionGapStart').value=dimensionExtensionGapSpec(o,'start')?.value??dimensionExtensionGapValue(o,'start');$('dimensionExtensionGapStartSlider').value=dimensionExtensionGapSpec(o,'start')?.value??dimensionExtensionGapValue(o,'start');$('dimensionExtensionGapEnd').value=dimensionExtensionGapSpec(o,'end')?.value??dimensionExtensionGapValue(o,'end');$('dimensionExtensionGapEndSlider').value=dimensionExtensionGapSpec(o,'end')?.value??dimensionExtensionGapValue(o,'end');$('dimensionExtensionStart').value=dimensionExtensionValue(o,'start');$('dimensionExtensionStartSlider').value=dimensionExtensionValue(o,'start');$('dimensionExtensionEnd').value=dimensionExtensionValue(o,'end');$('dimensionExtensionEndSlider').value=dimensionExtensionValue(o,'end');$('dimensionLabelDx').value=Number(o.labelDx)||0;$('dimensionLabelDy').value=Number(o.labelDy)||0;$('dimensionLabelRotation').value=Number(o.labelRotationDeg)||0;$('dimensionLabelRotationSlider').value=clamp(Number(o.labelRotationDeg)||0,-360,360);$('dimensionArrowStyle').value=['filled','open','tick','dot','none'].includes(o.arrowStyle)?o.arrowStyle:'filled';$('dimensionArrowStartStyle').value=['filled','open','tick','dot','none'].includes(o.arrowStartStyle)?o.arrowStartStyle:'inherit';$('dimensionArrowEndStyle').value=['filled','open','tick','dot','none'].includes(o.arrowEndStyle)?o.arrowEndStyle:'inherit';$('dimensionArrowSize').value=Number(o.arrowSize)||Number(state.gost.arrowLength)||3.5;$('dimensionShowValue').checked=o.hideValue!==true;}const derivedRotation=(o.type==='line'||o.type==='centerline'||o.type==='construction')?Math.atan2(o.y2-o.y,o.x2-o.x)*180/Math.PI:0;$('objectRotationAngle').value=mm(o.rotationTotal??o.rotation??derivedRotation);$('objectColor').value=o.color||'#20252a';$('objectWidth').value=o.width||.35;$('objectDash').value=o.linePattern==='wave'?'WAVE':o.linePattern==='zigzag'?'ZIGZAG':(o.dash?normalizeGostDashPattern(o.dash):'');$('objectLayer').value=layerFor(o)==='reference'?'geometry':layerFor(o);if($('objectLineRole'))$('objectLineRole').value=roleOf(o)||'main';$('objectName').value=o.name||'';$('objectTextSize').value=o.size||o.textSize||state.gost.textHeight||5;const box=objectBounds(o);if(box){$('objectBoxX').value=mm(box.x);$('objectBoxY').value=mm(box.y);$('objectBoxW').value=mm(Math.max(.1,box.w));$('objectBoxH').value=mm(Math.max(.1,box.h));}if(o.type==='reference'){$('referenceOpacity').value=Math.round((o.opacity??.35)*100);$('referenceOpacityValue').textContent=$('referenceOpacity').value+'%';$('referenceWidth').value=o.w||100;$('referenceHeight').value=o.h||60;$('referenceX').value=o.x||0;$('referenceY').value=o.y||0;$('referenceRotation').value=o.rotation||0;$('referenceLockStatus').textContent=o.locked?'🔒 Переміщення заборонено':'● Переміщення дозволено';$('referenceLockStatus').classList.toggle('locked',!!o.locked);$('referenceLockStatus').classList.toggle('unlocked',!o.locked);$('referenceLockBtn').textContent=o.locked?'🔓 Дозволити переміщення':'🔒 Заборонити переміщення';$('referenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));$('quickReferenceLockBtn').disabled=false;$('quickReferenceLockBtn').innerHTML=o.locked?'<span>🔓</span>Дозволити рух':'<span>🔒</span>Заборонити рух';$('quickReferenceLockBtn').setAttribute('aria-pressed',String(!!o.locked));$('quickReferenceLockBtn').title=o.locked?'Клацніть, щоб дозволити переміщення референсу':'Клацніть, щоб заборонити переміщення референсу';$('referenceExportable').checked=!!o.exportable;$('referenceKeepAspect').checked=o.keepAspect!==false;}}
    // Dimension controls remain available for a multi-selection containing only
    // dimensions; edits are applied to every unlocked selected dimension.
    const dimensionSample=arr.length>0&&arr.every(x=>x.type==='dimension')?arr[0]:null;
    if(dimensionSample&&arr.length>1){
      $('dimensionArrowPlacement').value=['inside','outside','auto'].includes(dimensionSample.arrowPlacement)?dimensionSample.arrowPlacement:'auto';
      $('dimensionTextHeight').value=String(Number(dimensionSample.textSize)||state.gost.dimensionTextHeight||state.gost.textHeight||5);
      $('dimensionTextOrientation').value=dimensionSample.textOrientation||'horizontal';
      $('dimensionSelectedOffset').value=Number(dimensionSample.offset)||10;$('dimensionSelectedOffsetSlider').value=clamp(Math.abs(Number(dimensionSample.offset)||10),10,200);
      $('dimensionExtensionGap').value=Number(dimensionSample.extensionGap??1);
      $('dimensionExtensionGapStart').value=dimensionExtensionGapSpec(dimensionSample,'start')?.value??dimensionExtensionGapValue(dimensionSample,'start');$('dimensionExtensionGapStartSlider').value=dimensionExtensionGapSpec(dimensionSample,'start')?.value??dimensionExtensionGapValue(dimensionSample,'start');$('dimensionExtensionGapEnd').value=dimensionExtensionGapSpec(dimensionSample,'end')?.value??dimensionExtensionGapValue(dimensionSample,'end');$('dimensionExtensionGapEndSlider').value=dimensionExtensionGapSpec(dimensionSample,'end')?.value??dimensionExtensionGapValue(dimensionSample,'end');
      $('dimensionExtensionStart').value=dimensionExtensionValue(dimensionSample,'start');$('dimensionExtensionStartSlider').value=dimensionExtensionValue(dimensionSample,'start');$('dimensionExtensionEnd').value=dimensionExtensionValue(dimensionSample,'end');$('dimensionExtensionEndSlider').value=dimensionExtensionValue(dimensionSample,'end');
      $('dimensionLabelDx').value=Number(dimensionSample.labelDx)||0;
      $('dimensionLabelDy').value=Number(dimensionSample.labelDy)||0;
      $('dimensionLabelRotation').value=Number(dimensionSample.labelRotationDeg)||0;$('dimensionLabelRotationSlider').value=clamp(Number(dimensionSample.labelRotationDeg)||0,-360,360);
      $('dimensionArrowStyle').value=['filled','open','tick','dot','none'].includes(dimensionSample.arrowStyle)?dimensionSample.arrowStyle:'filled';
      $('dimensionArrowStartStyle').value=['filled','open','tick','dot','none'].includes(dimensionSample.arrowStartStyle)?dimensionSample.arrowStartStyle:'inherit';
      $('dimensionArrowEndStyle').value=['filled','open','tick','dot','none'].includes(dimensionSample.arrowEndStyle)?dimensionSample.arrowEndStyle:'inherit';
      $('dimensionArrowSize').value=Number(dimensionSample.arrowSize)||Number(state.gost.arrowLength)||3.5;
      $('dimensionShowValue').checked=dimensionSample.hideValue!==true;
    }
    if(arr.length>0&&arr.every(x=>x.type==='dimension'))syncDimensionLengthSliders(arr);
    else dimensionSliderSelectionKey='';
  }
  function applySelectedGeometry(){
    const selected=getSelected();if(selected.length!==1){setMessage('Для точного ввода габаритов выберите один объект');return;}
    const o=selected[0];if(o.locked){setMessage('Сначала снимите блокировку объекта');return;}
    const oldB=objectBounds(o),x=Number($('objectBoxX').value),y=Number($('objectBoxY').value),w=Number($('objectBoxW').value),h=Number($('objectBoxH').value);
    if(!oldB||![x,y,w,h].every(Number.isFinite)||w<=0||h<=0){setMessage('Проверьте координаты и размеры: ширина и высота должны быть больше нуля');return;}
    commit();const i=state.objects.findIndex(q=>q.id===o.id);if(i<0)return;state.objects[i]=scaleObjectToBounds(o,oldB,{x,y,w,h});renderAll();setMessage(`Размер объекта задан: ${w.toFixed(2)} × ${h.toFixed(2)} мм`);
  }
  function snapshot(){return{format:state.format,objects:deep(state.objects),title:deep(state.title),titleForm:state.titleForm,templateTextOverrides:deep(state.templateTextOverrides||{}),fileName:state.fileName,projectId:state.projectId,ruler:deep(state.ruler),rulerMode:state.rulerMode,rulerVisible:state.rulerVisible,gost:deep(state.gost),assignmentDimensions:state.assignmentDimensions||'',viewPan:deep(state.viewPan),zoom:state.zoom,grid:state.grid,gridStep:gridStep(),snap:state.snap,objectSnap:state.objectSnap,ortho:state.ortho,template:state.template,visible:deep(visible),lineVisibility:{main:$('showMainLines')?.checked!==false,thin:$('showThinLines')?.checked!==false,center:$('showCenterLines')?.checked!==false},snapModes:{endpoint:$('snapEndpointToggle')?.checked!==false,midpoint:$('snapMidpointToggle')?.checked!==false,center:$('snapCenterToggle')?.checked!==false,intersection:$('snapIntersectionToggle')?.checked!==false,quadrant:$('snapQuadrantToggle')?.checked!==false,tangent:$('snapTangentToggle')?.checked!==false}};}
  function persistAutosave(){try{localStorage.setItem('kompasOnlineAutosave',JSON.stringify(snapshot()));}catch(e){setMessage('Автосохранение недоступно: память браузера заполнена или отключена');}}
  function updateHistoryButtons(){const u=$('undoBtn'),r=$('redoBtn');if(u)u.disabled=state.history.length===0;if(r)r.disabled=state.redo.length===0;}
  function recordHistory(before){if(!before)return;state.history.push(deep(before));if(state.history.length>100)state.history.shift();state.redo=[];state.dirty=true;$('saveState').textContent='Есть несохранённые изменения';updateHistoryButtons();Promise.resolve().then(persistAutosave);}
  function commit(before=snapshot()){recordHistory(before);}
  function restore(s){state.format=s.format;state.objects=deep(s.objects||[]);state.title=deep(s.title||state.title);state.titleForm=(!s.titleForm||s.titleForm==='form1')?'user-template':s.titleForm;state.templateTextOverrides=deep(s.templateTextOverrides||{});state.projectId=s.projectId??state.projectId;state.fileName=s.fileName||state.fileName;state.ruler=deep(s.ruler||null);state.rulerMode=s.rulerMode||'off';state.rulerVisible=s.rulerVisible!==false;state.assignmentDimensions=String(s.assignmentDimensions||'');$('assignmentDimensions').value=state.assignmentDimensions;mergeSavedGost(s.gost||{});state.viewPan=deep(s.viewPan||{x:0,y:0});if(Number.isFinite(Number(s.zoom)))state.zoom=clamp(Number(s.zoom),MIN_ZOOM,MAX_ZOOM);if(typeof s.grid==='boolean')state.grid=s.grid;if(Number.isFinite(Number(s.gridStep)))$('gridStep').value=String(clamp(Number(s.gridStep),.1,100));if(typeof s.snap==='boolean')state.snap=s.snap;if(typeof s.objectSnap==='boolean')state.objectSnap=s.objectSnap;if(typeof s.ortho==='boolean')state.ortho=s.ortho;if(typeof s.template==='boolean')state.template=s.template;if(s.visible)Object.assign(visible,s.visible);if(s.lineVisibility){$('showMainLines').checked=s.lineVisibility.main!==false;$('showThinLines').checked=s.lineVisibility.thin!==false;$('showCenterLines').checked=s.lineVisibility.center!==false;}if(s.snapModes){$('snapEndpointToggle').checked=s.snapModes.endpoint!==false;$('snapMidpointToggle').checked=s.snapModes.midpoint!==false;$('snapCenterToggle').checked=s.snapModes.center!==false;$('snapIntersectionToggle').checked=s.snapModes.intersection!==false;$('snapQuadrantToggle').checked=s.snapModes.quadrant!==false;$('snapTangentToggle').checked=s.snapModes.tangent!==false;}$('templateToggle').checked=state.template;$('templateVisible').checked=visible.template;$('geometryVisible').checked=visible.geometry;$('dimensionsVisible').checked=visible.dimensions;$('constructionVisible').checked=visible.construction;$('referenceVisibleToggle').checked=visible.reference;$('referenceVisibleToggleSecondary').checked=visible.reference;$('gridToggle').checked=state.grid;$('snapToggle').checked=state.snap;$('objectSnapToggle').checked=state.objectSnap;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');const gp=svg.querySelector('#gridPattern');if(gp){const step=gridStep();gp.setAttribute('width',step);gp.setAttribute('height',step);gp.querySelector('path').setAttribute('d',`M ${step} 0 L 0 0 0 ${step}`);}applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;state.selectedIds=[];syncTitleInputs();$('paperFormat').value=state.format;renderTemplate();renderAll();updateZoom();updateHistoryButtons();}
  function undo(){if(state.rotateDrag||state.resize||state.dimensionLabelDrag||state.erasing){setMessage('Сначала завершите или отмените текущее преобразование');return;}if(!state.history.length){setMessage('Нет действий для отмены');return;}const current=snapshot(),previous=state.history.pop();state.redo.push(deep(current));if(state.redo.length>100)state.redo.shift();restore(previous);state.dirty=true;updateHistoryButtons();persistAutosave();$('saveState').textContent='Есть несохранённые изменения';setMessage('Действие отменено · Ctrl+Y или Ctrl+Shift+Z — повторить');}
  function redo(){if(state.rotateDrag||state.resize||state.dimensionLabelDrag||state.erasing){setMessage('Сначала завершите или отмените текущее преобразование');return;}if(!state.redo.length){setMessage('Нет действий для повтора');return;}const current=snapshot(),next=state.redo.pop();state.history.push(deep(current));if(state.history.length>100)state.history.shift();restore(next);state.dirty=true;updateHistoryButtons();persistAutosave();$('saveState').textContent='Есть несохранённые изменения';setMessage('Действие повторено · Ctrl+Z — отменить');}
  function addObject(o){const before=snapshot();o.id=`obj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;o.name=o.name||'';const geometric=['line','construction','centerline','xline','ray','rect','circle','ellipse','arc','polyline','spline','freehand','breakline'].includes(o.type);if(geometric){const requested=o.lineRole||$('drawingLineRole')?.value||(o.type==='centerline'?'center':(['construction','xline','ray'].includes(o.type)?'thin':'main'));o.lineRole=requested;const explicit=Number($('drawingLineWidth')?.value);o.width=o.width??(Number.isFinite(explicit)&&explicit>0?explicit:(requested==='main'?state.gost.mainLine:state.gost.thinLine));if(requested==='center')o.dash=o.dash||GOST_LINE_PATTERNS.dashDotThin;}o.color=o.color||(o.type==='construction'||o.type==='xline'||o.type==='ray'?'#8c969d':'#20252a');o.width=o.width??(annotationTypes.has(o.type)||constructionTypes.has(o.type)||['freehand','breakline'].includes(o.type)?state.gost.thinLine:state.gost.mainLine);o.layer=o.layer|| (annotationTypes.has(o.type)?'annotation':constructionTypes.has(o.type)?'construction':'geometry');if(o.type==='centerline')o.dash=normalizeGostDashPattern(o.dash||GOST_LINE_PATTERNS.dashDotThin);if(o.type==='construction'&&!o.dash)o.dash='';if(['text','techReq'].includes(o.type)){o.size=o.size??state.gost.textHeight??5;o.lettering=o.lettering||state.gost.lettering||'B-S';o.font=o.font||state.gost.fontFamily||'Arial,sans-serif';}state.objects.push(o);state.selectedIds=[o.id];commit(before);renderAll();setMessage('Объект добавлен');}
  function appContourToPolygon(o){
    if(!o||o.locked)return null;
    let vertices=null;
    if(o.type==='rect'&&Number(o.rx||0)>0){
      const x=Math.min(o.x,o.x2),y=Math.min(o.y,o.y2),w=Math.abs(o.x2-o.x),h=Math.abs(o.y2-o.y),r=clamp(Number(o.rx)||0,0,Math.min(w,h)/2),steps=10;
      if(r>0){
        const corners=[
          {cx:x+w-r,cy:y+r,a:-Math.PI/2},
          {cx:x+w-r,cy:y+h-r,a:0},
          {cx:x+r,cy:y+h-r,a:Math.PI/2},
          {cx:x+r,cy:y+r,a:Math.PI},
        ];
        vertices=[];
        corners.forEach(({cx,cy,a})=>{for(let i=0;i<=steps;i++){const t=a+i*(Math.PI/2)/steps;const p={x:mm(cx+r*Math.cos(t)),y:mm(cy+r*Math.sin(t))};if(!vertices.length||Math.hypot(p.x-vertices[vertices.length-1].x,p.y-vertices[vertices.length-1].y)>.001)vertices.push(p);}});
      }
    }else if(o.type==='rect'){
      const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2);
      vertices=[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
    }else if(o.type==='ellipse'){
      const cx=(o.x+o.x2)/2,cy=(o.y+o.y2)/2,rx=Math.abs(o.x2-o.x)/2,ry=Math.abs(o.y2-o.y)/2;
      if(rx>0&&ry>0)vertices=Array.from({length:128},(_,i)=>({x:mm(cx+rx*Math.cos(i*Math.PI/64)),y:mm(cy+ry*Math.sin(i*Math.PI/64))}));
    }else if(o.type==='polyline'&&o.closed&&Array.isArray(o.points))vertices=deep(o.points);
    else if(['spline','freehand'].includes(o.type)&&o.closed&&Array.isArray(o.points)&&o.points.length>=3)vertices=sampleSmoothPath(o.points,o.type==='freehand'?(o.smooth??65):100);
    if(!vertices||vertices.length<3)return null;
    return new Polygon(vertices,{ownerId:o.id,style:{stroke:o.color||'#20252a',lineWidth:o.width||state.gost.mainLine,lineDash:[]}});
  }
  function isCuttableBoundary(o){
    return !!o&&!o.hidden&&!o.locked&&(o.type==='circle'||!!appContourToPolygon(o));
  }
  function appClosedContourPoints(o){
    if(!o||o.locked||o.hidden)return null;
    if(o.type==='circle'){
      const radius=Math.hypot(o.x2-o.x,o.y2-o.y);
      if(!(radius>0))return null;
      return Array.from({length:256},(_,i)=>({x:o.x+Math.cos(i*Math.PI/128)*radius,y:o.y+Math.sin(i*Math.PI/128)*radius}));
    }
    if(o.type==='hatch'&&Array.isArray(o.points)&&o.points.length>=3)return deep(o.points);
    return appContourToPolygon(o)?.vertices||null;
  }
  function appOpenPathPoints(o){
    if(!o||o.locked||o.hidden)return null;
    if(['line','construction','centerline'].includes(o.type))return ['wave','zigzag'].includes(o.linePattern)?linePatternPoints(o):[{x:o.x,y:o.y},{x:o.x2,y:o.y2}];
    if(o.type==='arc'){
      const r=Number(o.r)||0;if(!(r>0))return null;
      const sweep=((o.end-o.start)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),count=Math.max(16,Math.ceil(sweep*48));
      return Array.from({length:count+1},(_,i)=>{const a=o.start+sweep*i/count;return{x:o.x+r*Math.cos(a),y:o.y+r*Math.sin(a)};});
    }
    if(['spline','freehand'].includes(o.type)&&!o.closed&&Array.isArray(o.points)&&o.points.length>=2)return sampleSmoothPath(o.points,o.type==='freehand'?(o.smooth??65):100);
    if(o.type==='breakline'&&!o.closed&&Array.isArray(o.points)&&o.points.length===2){
      const[a,b]=o.points,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,amp=Math.min(1.4,len/12),samples=[{x:a.x,y:a.y}];
      for(let i=1;i<=8;i++){const t=i/8,v=(i%2?1:-1)*amp;samples.push({x:a.x+dx*t+nx*v,y:a.y+dy*t+ny*v});}
      return samples;
    }
    if(o.type==='polyline'&&!o.closed&&Array.isArray(o.points)&&o.points.length>=2)return deep(o.points);
    return null;
  }
  function sampleSmoothPath(points,amount=70,steps=10){
    if(!Array.isArray(points)||points.length<2)return[];
    if(points.length===2||amount<=0)return deep(points);
    const t=clamp(Number(amount)||0,0,100)/100,out=[deep(points[0])];
    const sampleQuad=(a,c,b)=>{for(let j=1;j<=steps;j++){const u=j/steps,v=1-u;out.push({x:a.x*v*v+2*c.x*v*u+b.x*u*u,y:a.y*v*v+2*c.y*v*u+b.y*u*u});}};
    let current=points[0],lastControl=null;
    for(let i=1;i<points.length-1;i++){
      const p=points[i],n=points[i+1],mid={x:(p.x+n.x)/2,y:(p.y+n.y)/2},control={x:mid.x+(p.x-mid.x)*t,y:mid.y+(p.y-mid.y)*t};
      sampleQuad(current,control,mid);current=mid;lastControl=control;
    }
    if(lastControl){const control={x:2*current.x-lastControl.x,y:2*current.y-lastControl.y};sampleQuad(current,control,points[points.length-1]);}
    return out;
  }
  function isCuttableOpenPath(o){return !!appOpenPathPoints(o);}
  function replaceWithOpenFragments(source,fragments){
    const originalType=source.type,base=deep(source),idx=state.objects.findIndex(o=>o.id===source.id);
    if(idx<0)return false;
    const replacements=fragments.map((points,i)=>{
      const obj={...deep(base),id:i===0?source.id:newId(),type:'polyline',points:points.map(p=>({x:mm(p.x),y:mm(p.y)})),closed:false};
      delete obj.x;delete obj.y;delete obj.x2;delete obj.y2;delete obj.r;delete obj.start;delete obj.end;delete obj.rx;
      if(originalType==='line'||originalType==='construction'||originalType==='centerline'){
        obj.type=originalType;obj.x=mm(points[0].x);obj.y=mm(points[0].y);obj.x2=mm(points[points.length-1].x);obj.y2=mm(points[points.length-1].y);delete obj.points;delete obj.closed;
      }
      if(originalType==='arc')obj.name=obj.name||'Дуга после разреза';
      return obj;
    });
    state.objects.splice(idx,1,...replacements);
    state.selectedIds=replacements.map(o=>o.id);
    return true;
  }
  function replaceWithClosedFragments(source,fragments){
    const idx=state.objects.findIndex(o=>o.id===source.id);
    if(idx<0)return false;
    const replacements=fragments.map((points,i)=>{
      const obj={...deep(source),id:i===0?source.id:newId(),type:'polyline',points:points.map(p=>({x:mm(p.x),y:mm(p.y)})),closed:true};
      delete obj.x;delete obj.y;delete obj.x2;delete obj.y2;delete obj.r;delete obj.start;delete obj.end;delete obj.rx;delete obj.x3;delete obj.y3;
      obj.name=`${source.name||'Контур'} — часть ${i+1}`;
      return obj;
    });
    state.objects.splice(idx,1,...replacements);
    state.selectedIds=replacements.map(o=>o.id);
    return true;
  }
  function replaceWithContourResults(source,closedFragments=[],openFragments=[],passCutMeta={}){
    const idx=state.objects.findIndex(o=>o.id===source.id);
    if(idx<0)return false;
    const pieces=[...closedFragments.map(points=>({points,closed:true})),...openFragments.map(points=>({points,closed:false}))];
    if(!pieces.length)return false;
    const replacements=pieces.map(({points,closed},i)=>{
      const obj={...deep(source),id:i===0?source.id:newId(),type:'polyline',points:points.map(p=>({x:mm(p.x),y:mm(p.y)})),closed};
      delete obj.x;delete obj.y;delete obj.x2;delete obj.y2;delete obj.r;delete obj.start;delete obj.end;delete obj.rx;delete obj.x3;delete obj.y3;
      obj.name=`${source.name||'Контур'} — ${closed?'часть':'открытый участок'} ${i+1}`;
      if(passCutMeta.straightPassCut){
        obj.straightPassCut=true;
        obj.straightPassMode=passCutMeta.mode||'noBottom';
        obj.feature='straight-pass-cut-fragment';
      }
      return obj;
    });
    state.objects.splice(idx,1,...replacements);
    state.selectedIds=replacements.map(o=>o.id);
    return true;
  }
  function applySplitTool(point,clickedId=null){
    const clicked=clickedId?state.objects.find(o=>o.id===clickedId):null;
    const selected=getSelected().find(o=>appOpenPathPoints(o)||appClosedContourPoints(o));
    const source=clickedId?(clicked&&(appOpenPathPoints(clicked)||appClosedContourPoints(clicked))?clicked:null):selected;
    if(!source){setMessage('Щёлкните по геометрическому объекту или заранее выделите его. Поддерживаются линии, дуги, ломаные, окружности, эллипсы и замкнутые контуры.');return false;}
    if(source.locked){setMessage('Объект заблокирован — снимите блокировку перед разделением.');return false;}

    const hitTolerance=clamp(8/Math.max(.25,state.zoom),1.5,10);
    const openPath=appOpenPathPoints(source);
    if(openPath){
      const tx=splitOpenPathAtPoint(openPath,point,{hitTolerance});
      if(!tx.ok){setMessage(tx.reason||'Не удалось разделить объект');return false;}
      const before=snapshot();
      if(!replaceWithOpenFragments(source,tx.fragments)){setMessage('Не удалось обновить объект');return false;}
      commit(before);renderAll();
      setMessage(`Объект разделён на две части в точке X ${mm(tx.splitPoint.x)} · Y ${mm(tx.splitPoint.y)} мм. Обе части сохранены отдельно.`);
      return true;
    }

    const closed=appClosedContourPoints(source);
    if(closed){
      if(!state.splitPending||state.splitPending.id!==source.id){
        state.splitPending={id:source.id,point:{x:point.x,y:point.y}};
        state.selectedIds=[source.id];
        previewLayer.innerHTML='';
        add(previewLayer,'circle',{cx:point.x,cy:point.y,r:1.4,fill:'#078db2',stroke:'#ffffff','stroke-width':.35});
        setMessage('Первая точка отмечена. Щёлкните по второй точке границы — контур разделится по прямой между точками на две отдельные части.');
        return true;
      }
      const pending=state.splitPending;
      const tx=splitClosedPolygonAtPoints(closed,pending.point,point,{hitTolerance});
      if(!tx.ok){setMessage(tx.reason||'Не удалось разделить замкнутый контур. Первая точка сохранена — выберите другую вторую точку.');return false;}
      const before=snapshot();
      if(!replaceWithClosedFragments(source,tx.fragments)){setMessage('Не удалось обновить замкнутый контур');return false;}
      state.splitPending=null;commit(before);renderAll();
      setMessage(`Контур разделён на две замкнутые части. Площади: ${mm(tx.metadata.firstArea)} и ${mm(tx.metadata.secondArea)} мм².`);
      return true;
    }
    setMessage('Этот объект нельзя разделить как геометрию. Выберите линию или контур.');
    return false;
  }
  function cutClosedBoundaryWithoutWalls(points,point,width,options={}){
    const tx=cutClosedBoundaryGapAtPoint(points,point,width,options);
    return tx.ok?{ok:true,points:tx.path,metadata:tx.metadata}:tx;
  }
  function straightPassCorners(start,end,width){
    const dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy);if(len<1e-8)return null;
    const nx=-dy/len,ny=dx/len,h=width/2;
    return [
      {x:start.x+nx*h,y:start.y+ny*h},{x:end.x+nx*h,y:end.y+ny*h},
      {x:end.x-nx*h,y:end.y-ny*h},{x:start.x-nx*h,y:start.y-ny*h}
    ];
  }
  function renderStraightPassPreview(){
    const draft=state.straightCutDraft;if(!draft)return;
    previewLayer.innerHTML='';const corners=straightPassCorners(draft.start,draft.current,draft.width);
    if(!corners)return;
    const dx=draft.current.x-draft.start.x,dy=draft.current.y-draft.start.y,len=Math.hypot(dx,dy);
    if(len<1e-8)return;
    const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
    add(previewLayer,'polygon',{points:corners.map(p=>`${p.x},${p.y}`).join(' '),fill:'#16a5c7','fill-opacity':.13,stroke:'none'});
    const a=corners[0],b=corners[1],c=corners[2],d=corners[3];
    if(draft.mode!=='noWalls'){
      add(previewLayer,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#078db2','stroke-width':.65,'stroke-dasharray':'2 1'});
      add(previewLayer,'line',{x1:c.x,y1:c.y,x2:d.x,y2:d.y,stroke:'#078db2','stroke-width':.65,'stroke-dasharray':'2 1'});
    }
    add(previewLayer,'line',{x1:draft.start.x,y1:draft.start.y,x2:draft.current.x,y2:draft.current.y,stroke:'#078db2','stroke-width':.35,'stroke-dasharray':'1.5 1'});
    // Visible direction marker makes the drag vector unambiguous at any angle.
    const head=clamp(draft.width*.65,2,5),base={x:draft.current.x-ux*head*1.6,y:draft.current.y-uy*head*1.6};
    add(previewLayer,'polygon',{points:[`${draft.current.x},${draft.current.y}`,`${base.x+nx*head*.65},${base.y+ny*head*.65}`,`${base.x-nx*head*.65},${base.y-ny*head*.65}`].join(' '),fill:'#078db2',stroke:'none'});
    const angle=((Math.atan2(dy,dx)*180/Math.PI)%360+360)%360,mid={x:(draft.start.x+draft.current.x)/2,y:(draft.start.y+draft.current.y)/2};
    const angleLabel=add(previewLayer,'text',{x:mid.x+nx*head*1.6,y:mid.y+ny*head*1.6,fill:'#075d73','font-size':3.2,'font-weight':600,'text-anchor':'middle','paint-order':'stroke','stroke':'white','stroke-width':.7,'stroke-linejoin':'round'});
    angleLabel.textContent=`${angle.toFixed(1)}°`;
  }
  function applyStraightPassCut(start,end,width,mode='noBottom'){
    const len=Math.hypot(end.x-start.x,end.y-start.y);
    if(len<Math.max(width*.75,.5)){setMessage('Проход слишком короткий. Протяни линию снаружи детали до нужной точки внутри или за ней.');return false;}
    // Include open paths created by previous blind/no-bottom or no-walls cuts.
    // This is what allows the same resulting geometry to be cut again and
    // again instead of becoming a one-operation-only object.
    const targets=state.objects.filter(o=>!o.hidden&&!o.locked&&o.type!=='reference'&&!annotationTypes.has(o.type)&&!constructionTypes.has(o.type)&&layerFor(o)!=='annotation'&&layerFor(o)!=='construction'&&(!!appClosedContourPoints(o)||!!appOpenPathPoints(o)));
    if(!targets.length){setMessage('На чертеже нет доступной геометрии для проходного выреза.');return false;}
    const before=snapshot(),successes=[],failures=[];
    for(const source of targets){
      const contour=appClosedContourPoints(source);
      if(!contour){
        const path=appOpenPathPoints(source);if(!path||path.length<2)continue;
        // Rebuild real walls on an open contour produced by an earlier pass.
        // Keep ordinary open lines/curves as simple line gaps: they are not
        // closed material boundaries and must not grow artificial walls.
        const isPreviousPass=source.straightPassCut===true||source.feature==='straight-pass-cut-fragment'||/— открытый участок \d+$/.test(source.name||'');
        const tx=cutOpenPathByStraightPass(path,start,end,width,{
          eps:1e-7,mode,reconstructContour:isPreviousPass,
        });
        if(!tx.ok){if(!/не пересекает оставшиеся участки контура/.test(tx.reason||''))failures.push(`${source.name||source.type}: ${tx.reason||'пропущен'}`);continue;}
        const idsBefore=new Set(state.objects.map(o=>o.id));
        const rebuilt=tx.operation==='repeatable-straight-pass-cut-open-contour';
        const saved=rebuilt
          ?replaceWithContourResults(source,tx.fragments||[],tx.openFragments||[],{straightPassCut:true,mode})
          :replaceWithOpenFragments(source,tx.fragments);
        if(!saved){failures.push(`${source.name||source.type}: не удалось сохранить повторный вырез`);continue;}
        const replacementIds=state.objects.filter(o=>o.id===source.id||!idsBefore.has(o.id)).map(o=>o.id);
        const count=(tx.fragments||[]).length+(tx.openFragments||[]).length;
        successes.push({sourceId:source.id,ids:replacementIds,count,closed:(tx.fragments||[]).length,open:(tx.openFragments||[]).length||(!rebuilt?tx.fragments.length:0),removedArea:tx.metadata.removedArea||0,removedLength:tx.metadata.removedLength||0,wasOpen:true,wallsRebuilt:!!tx.metadata.wallsRebuilt});
        continue;
      }
      if(contour.length<3)continue;
      const tx=cutClosedContourByStraightPass(contour,start,end,width,{eps:1e-7,rejectStartInside:true,autoReverseIfStartInside:true,mode});
      if(!tx.ok){
        if(!/не пересекает выбранный контур|не удалил материал контура/.test(tx.reason||''))failures.push(`${source.name||source.type}: ${tx.reason||'пропущен'}`);
        continue;
      }
      const idsBefore=new Set(state.objects.map(o=>o.id));
      if(!replaceWithContourResults(source,tx.fragments,tx.openFragments||[],{straightPassCut:true,mode})){failures.push(`${source.name||source.type}: не удалось сохранить результат`);continue;}
      const replacementIds=state.objects.filter(o=>o.id===source.id||!idsBefore.has(o.id)).map(o=>o.id);
      successes.push({sourceId:source.id,ids:replacementIds,count:tx.fragments.length+(tx.openFragments||[]).length,closed:tx.fragments.length,open:(tx.openFragments||[]).length,removedArea:tx.metadata.removedArea,directionReversed:!!tx.metadata.directionReversed});
    }
    previewLayer.innerHTML='';
    if(!successes.length){setMessage(failures[0]||'Полоса не пересекла доступные контуры или открытые участки. Попробуй другую траекторию или ширину.');return false;}
    state.selectedIds=[...new Set(successes.flatMap(s=>s.ids))];
    commit(before);renderAll();
    const pieces=successes.reduce((sum,s)=>sum+s.count,0),split=successes.filter(s=>s.count>1).length,reversed=successes.filter(s=>s.directionReversed).length;
    const modeLabel=mode==='noWalls'?'без стенок':mode==='noBottom'?'без нижней стенки':'со всеми стенками';
    const recut=successes.filter(s=>s.wasOpen).length,wallsRebuilt=successes.filter(s=>s.wallsRebuilt).length;
    setMessage(`Прямой проход (${modeLabel}) выполнен: затронуто объектов ${successes.length}, создано фрагментов ${pieces}${split?` · разделено на несколько частей ${split}`:''}${recut?` · повторно обработано открытых контуров ${recut}`:''}${wallsRebuilt?` · стенки построены повторно ${wallsRebuilt}`:''}${failures.length?` · пропущено ${failures.length}`:''}${reversed?` · направление автоматически адаптировано для ${reversed} контуров`:''}. ${mode==='noBottom'?'Боковые стенки прямые и параллельные, внутренний конец открыт.':mode==='noWalls'?'Новые боковые линии и торец не добавляются.':'Боковые стенки прямые и параллельные.'} Повторные вырезы на полученных фрагментах разрешены. Ширина ${mm(width)} мм.`);
    return true;
  }
  function applyEdgeCutout(point,clickedId=null,mode='walls'){
    const clicked=clickedId?state.objects.find(o=>o.id===clickedId):null;
    const isEditable=o=>!!o&&(isCuttableBoundary(o)||isCuttableOpenPath(o));
    const selected=getSelected().filter(isEditable);
    let targets=[];
    if(clicked&&isEditable(clicked))targets=selected.some(o=>o.id===clicked.id)&&selected.length>1?selected:[clicked];
    else targets=selected;
    if(!targets.length){setMessage('Щёлкните по геометрии или заранее выделите один или несколько объектов.');return false;}
    const width=Number($('cutoutNotchWidth').value),depth=Number($('cutoutNotchDepth').value),minWeb=Number($('cutoutMinWeb').value);
    if(!Number.isFinite(width)||width<=0||!Number.isFinite(depth)||depth<=0||!Number.isFinite(minWeb)||minWeb<0){setMessage('Введите положительные ширину и глубину, а также неотрицательную перемычку.');return false;}
    const hitTolerance=clamp(7/Math.max(.25,state.zoom),1.5,9),batch=targets.length>1,before=snapshot(),successes=[],failures=[];
    // In a multi-selection batch, one click is the shared placement reference:
    // each selected object's closest boundary/path point receives the same cut.
    const tolerance=batch?Infinity:hitTolerance;
    for(const source of targets){
      if(source.locked){failures.push('объект заблокирован');continue;}
      if(isCuttableOpenPath(source)){
        const path=appOpenPathPoints(source),tx=cutOpenPathGapAtPoint(path,point,width,{hitTolerance:tolerance});
        if(!tx.ok){failures.push(tx.reason||'разрез не попал в открытую линию');continue;}
        if(!replaceWithOpenFragments(source,tx.fragments)){failures.push('не удалось обновить открытую линию');continue;}
        successes.push({id:source.id,parts:tx.fragments.length,removed:mm(tx.metadata.removedLength)});
        continue;
      }
      if(mode==='noWalls'){
        const contour=appClosedContourPoints(source),tx=cutClosedBoundaryWithoutWalls(contour,point,width,{hitTolerance:tolerance});
        if(!tx.ok){failures.push(tx.reason||'не удалось удалить участок границы');continue;}
        if(!replaceWithOpenFragments(source,[tx.points])){failures.push('не удалось преобразовать контур в открытую линию');continue;}
        successes.push({id:source.id,parts:1,removed:mm(tx.metadata.removedLength)});
        continue;
      }
      let tx;
      if(source.type==='circle'){
        const radius=Math.hypot(source.x2-source.x,source.y2-source.y);
        const circle=new Circle({x:source.x,y:source.y},radius,{id:source.id,ownerId:source.id,locked:source.locked,style:{stroke:source.color||'#20252a',lineWidth:source.width||state.gost.mainLine,lineDash:[]}});
        tx=mode==='noBottom'
          ?cutCircleNotchWithoutBottomAtPoint(circle,point,width,depth,{hitTolerance:tolerance,minWeb})
          :cutCircleNotchAtPoint(circle,point,width,depth,{hitTolerance:tolerance,minWeb});
      }else{
        const polygon=appContourToPolygon(source);
        tx=mode==='noBottom'
          ?cutPolygonNotchWithoutBottomAtPoint(polygon,point,width,depth,{hitTolerance:tolerance,minWeb})
          :cutPolygonNotchAtPoint(polygon,point,width,depth,{hitTolerance:tolerance,minWeb});
      }
      if(!tx.ok){failures.push(tx.reason||'не удалось выполнить вырез');continue;}
      if(mode==='noBottom'){
        if(!replaceWithOpenFragments(source,[tx.path])){failures.push('не удалось создать вырез без нижней стенки');continue;}
      }else{
        const replacement=tx.add[0];
        source.type='polyline';source.points=replacement.vertices.map(p=>({x:mm(p.x),y:mm(p.y)}));source.closed=true;
        delete source.x;delete source.y;delete source.x2;delete source.y2;delete source.rx;
        source.name=source.name||'Контур с вырезом';
      }
      successes.push({id:source.id,parts:1,removed:mm(width)});
    }
    if(!successes.length){setMessage(failures[0]||'Не удалось выполнить операцию');return false;}
    state.selectedIds=[...new Set(successes.flatMap(x=>state.objects.filter(o=>o.id===x.id).map(o=>o.id)))];
    commit(before);renderAll();
    const modeLabel=mode==='noWalls'?'Вырез без стенок':mode==='noBottom'?'Вырез без нижней стенки':'Полный вырез (боковые и нижняя стенки)';
    setMessage(`${modeLabel}: обработано объектов ${successes.length}${batch?' · пакетный режим':''}${failures.length?` · пропущено ${failures.length}`:''}. При нескольких выбранных объектах один щелчок проецируется на ближайшую границу каждого объекта. Можно продолжать вырезать этот же контур и другие выбранные объекты.`);
    return true;
  }
  function cutoutPrimitivesToAppObjects(primitives,shape){
    if(!Array.isArray(primitives)||!primitives.length)return [];
    const first=primitives[0];
    if(first.type==='circle'){
      return [{type:'circle',x:mm(first.center.x),y:mm(first.center.y),x2:mm(first.center.x+first.radius),y2:mm(first.center.y),feature:shape==='slot'?'obround-cutout':'circular-cutout'}];
    }
    if(first.type==='polygon'){
      return [{type:'polyline',points:first.vertices.map(p=>({x:mm(p.x),y:mm(p.y)})),closed:true,feature:first.feature||'rectangular-pocket'}];
    }
    if(shape==='slot'&&primitives.length===4&&primitives[0].type==='line'&&primitives[1].type==='arc'&&primitives[2].type==='line'&&primitives[3].type==='arc'){
      const [top,rightArc,bottom,leftArc]=primitives,samples=16,points=[{x:top.a.x,y:top.a.y},{x:top.b.x,y:top.b.y}];
      for(let i=1;i<=samples;i++)points.push(rightArc.pointAt(1-i/samples));
      points.push({x:bottom.b.x,y:bottom.b.y});
      for(let i=1;i<=samples;i++)points.push(leftArc.pointAt(1-i/samples));
      return [{type:'polyline',points:points.map(p=>({x:mm(p.x),y:mm(p.y)})),closed:true,feature:'obround-cutout'}];
    }
    return [];
  }
  function placeInnerCutout(point){
    const shape=$('cutoutShape').value,width=Number($('cutoutInnerWidth').value),height=Number($('cutoutInnerHeight').value),radius=Number($('cutoutInnerRadius').value),length=Number($('cutoutInnerLength').value),angle=Number($('cutoutInnerAngle').value)*Math.PI/180;
    try{
      let primitives;
      if(shape==='rect')primitives=createRectangularPocket(point,width,height,angle);
      else if(shape==='circle')primitives=createCircularCutout(point,radius);
      else primitives=createObroundCutout(point,length,width,angle);
      const objects=cutoutPrimitivesToAppObjects(primitives,shape);
      if(!objects.length)throw new Error('Не удалось преобразовать контур в объект чертежа');
      const before=snapshot(),created=objects.map(raw=>({...raw,id:newId(),name:shape==='rect'?'Прямоугольное отверстие':shape==='circle'?'Круглое отверстие':'Продолговатый паз',color:'#20252a',width:state.gost.thinLine,layer:'geometry'}));
      state.objects.push(...created);state.selectedIds=created.map(o=>o.id);commit(before);renderAll();
      selectTool('select');setMessage(`Внутренний контур добавлен: ${shape==='rect'?'прямоугольное отверстие':shape==='circle'?'круглое отверстие':'продолговатый паз'}. Это отдельный 2D-контур.`);
      return true;
    }catch(error){setMessage(error?.message||'Не удалось создать внутренний контур');return false;}
  }
  function hatchableDrawingObjects({respectSelection=true}={}){
    const allowed=new Set(['line','construction','centerline','section','rect','circle','arc','ellipse','polyline','spline','freehand']);
    const selected=getSelected().filter(o=>allowed.has(o.type)&&!o.hidden&&!o.locked);
    return respectSelection&&selected.length?selected:state.objects.filter(o=>allowed.has(o.type)&&!o.hidden&&!o.locked);
  }
  function hatchAngleValue(){
    const raw=$('hatchAngle')?.value,parsed=raw===''||raw==null?45:Number(raw);
    if(!Number.isFinite(parsed))return 45;
    // Hatch direction is a global drafting setting, not inferred from click position.
    // A line hatch repeats every 180 degrees; preserve zero as a valid horizontal angle.
    return ((parsed%180)+180)%180;
  }
  function sharedHatchOrigin(regions){
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const region of regions||[])for(const ring of [region.outer||[],...(region.holes||[])])for(const p of ring){
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    }
    if(!Number.isFinite(minX))return {x:0,y:0};
    return {x:mm((minX+maxX)/2),y:mm((minY+maxY)/2)};
  }
  function findRegionAtPoint(point){
    const source=hatchableDrawingObjects({respectSelection:false});
    if(!source.length)throw new Error('Нет видимых контуров для выбора области');
    const regions=findClosedLoops(source,{tolerance:.01,curveSegments:512,maxSegments:20000});
    const region=regions.filter(region=>pointInRegion(point,region)).sort((a,b)=>a.area-b.area)[0]||null;
    // Compute the grid anchor from the complete drawing, not from the clicked
    // face. Repeated clicks in other material islands will keep one shared phase.
    if(region)region.hatchOrigin=sharedHatchOrigin(regions);
    return region;
  }
  function selectRegionAtPoint(point){
    try{
      const region=findRegionAtPoint(point);
      if(!region){state.selectedRegion=null;renderAll();setMessage('В этой точке замкнутая область не найдена. Щёлкните внутри контура.');return false;}
      state.selectedRegion={point:deep(point),region:deep(region)};
      renderAll();setMessage(`Выбрана область · площадь ${region.area.toFixed(2)} мм² · отверстий ${region.holes.length}. Нажмите «Заштриховать выбранную область».`);
      return true;
    }catch(error){setMessage(error?.message||'Не удалось выбрать область');return false;}
  }
  function createHatchForRegion(region){
    if(!region?.outer?.length){setMessage('Сначала выберите замкнутую область');return false;}
    const pattern=$('hatchPattern').value,angle=hatchAngleValue(),spacing=clamp(Number($('hatchSpacing').value)||3,.5,100),width=clamp(Number($('hatchWidth').value)||state.gost.thinLine,.05,1),color=$('hatchColor').value||'#20252a';
    try{
      const generated=createHatch(region,{angle,step:spacing,pattern,maxLines:20000,origin:region.hatchOrigin||null});
      const before=snapshot(),object={id:newId(),type:'hatch',name:'Штриховка области',points:generated.outer,holes:generated.holes,hatchSegments:generated.segments,closed:true,pattern,angle,spacing,width,color,layer:'annotation',boundaryAuto:true,sourceIds:region.sourceIds};
      state.objects.push(object);state.selectedIds=[object.id];state.selectedRegion=null;commit(before);renderAll();
      setMessage(`Область заштрихована под фиксированным углом ${angle}° · площадь ${region.area.toFixed(2)} мм² · отверстий ${region.holes.length}`);
      return true;
    }catch(error){setMessage(error?.message||'Не удалось заштриховать область');return false;}
  }
  function hatchRegionAtPoint(point){
    // The clicked point selects only the region; hatch angle always comes from the
    // fixed angle field and never from the pointer direction or click position.
    try{
      const region=findRegionAtPoint(point);
      if(!region){setMessage('Щёлкните внутри замкнутой области. Штриховка не выйдет за её контур.');return false;}
      return createHatchForRegion(region);
    }catch(error){setMessage(error?.message||'Не удалось определить область для штриховки');return false;}
  }
  function hatchSelectedRegion(){
    if(!state.selectedRegion?.point){setMessage('Сначала используйте «Выбор области» и щёлкните внутри нужного контура');return false;}
    try{
      // Re-detect from the stored click point so edited/removed geometry cannot
      // leave a stale region boundary in the drawing.
      const region=findRegionAtPoint(state.selectedRegion.point);
      if(!region){state.selectedRegion=null;renderAll();setMessage('Ранее выбранная область изменилась. Выберите её заново.');return false;}
      return createHatchForRegion(region);
    }catch(error){setMessage(error?.message||'Не удалось заштриховать выбранную область');return false;}
  }
  function createHatchFromSelectedBoundary(){
    const selected=getSelected().filter(o=>!o.hidden&&!o.locked);if(selected.length!==1){setMessage('Выберите один замкнутый контур для штриховки');return;}
    const src=selected[0];let points=[];
    if(src.type==='rect'){const x1=Math.min(src.x,src.x2),x2=Math.max(src.x,src.x2),y1=Math.min(src.y,src.y2),y2=Math.max(src.y,src.y2);points=[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];}
    else if(src.type==='circle'){const r=Math.hypot(src.x2-src.x,src.y2-src.y);points=Array.from({length:96},(_,i)=>({x:mm(src.x+Math.cos(i*Math.PI/48)*r),y:mm(src.y+Math.sin(i*Math.PI/48)*r)}));}
    else if(src.type==='ellipse'){const cx=(src.x+src.x2)/2,cy=(src.y+src.y2)/2,rx=Math.abs(src.x2-src.x)/2,ry=Math.abs(src.y2-src.y)/2;points=Array.from({length:96},(_,i)=>({x:mm(cx+Math.cos(i*Math.PI/48)*rx),y:mm(cy+Math.sin(i*Math.PI/48)*ry)}));}
    else if((src.type==='polyline'||src.type==='spline'||src.type==='freehand')&&src.closed&&Array.isArray(src.points))points=deep(src.points);
    if(points.length<3){setMessage('Поддерживаются прямоугольники, окружности, эллипсы и замкнутые контуры.');return;}
    const pattern=$('hatchPattern').value,angle=hatchAngleValue(),spacing=clamp(Number($('hatchSpacing').value)||3,.5,100),width=clamp(Number($('hatchWidth').value)||state.gost.thinLine,.05,1),color=$('hatchColor').value||'#20252a';
    try{
      const generated=createHatch({outer:points,holes:[]},{angle,step:spacing,pattern});
      addObject({type:'hatch',name:'Штриховка',points:generated.outer,holes:generated.holes,hatchSegments:generated.segments,closed:true,pattern,angle,spacing,width,color,layer:'annotation',boundaryOf:src.id});
      setMessage(`Штриховка создана · угол ${angle}° · шаг ${spacing} мм. Контур сохранён отдельно.`);
    }catch(error){setMessage(error?.message||'Не удалось заштриховать контур');}
  }
  function findAndHatchClosedRegions(){
    const source=hatchableDrawingObjects();
    if(!source.length){setMessage('Нет геометрии для поиска замкнутых областей');return;}
    let regions=[];
    try{regions=findClosedLoops(source,{tolerance:.01,curveSegments:512,maxSegments:20000});}
    catch(error){setMessage(error?.message||'Не удалось построить граф пересечений');return;}
    if(!regions.length){setMessage('Замкнутые области не найдены. Проверьте соединение концов линий.');return;}
    const pattern=$('hatchPattern').value,angle=hatchAngleValue(),spacing=clamp(Number($('hatchSpacing').value)||3,.5,100),width=clamp(Number($('hatchWidth').value)||state.gost.thinLine,.05,1),color=$('hatchColor').value||'#20252a';
    try{
      const hatchOrigin=sharedHatchOrigin(regions);
      const before=snapshot(),created=regions.map((region,index)=>{const hatch=createHatch(region,{angle,step:spacing,pattern,origin:hatchOrigin});return{id:newId(),type:'hatch',name:`Автоштриховка ${index+1}`,points:hatch.outer,holes:hatch.holes,hatchSegments:hatch.segments,closed:true,pattern,angle,spacing,width,color,layer:'annotation',boundaryAuto:true,sourceIds:region.sourceIds};});
      state.objects.push(...created);state.selectedIds=created.map(o=>o.id);state.selectedRegion=null;recordHistory(before);renderAll();
      const holeCount=regions.reduce((sum,r)=>sum+r.holes.length,0);
      setMessage(`Найдено областей: ${regions.length}; внутренних отверстий: ${holeCount}; угол ${angle}°; штриховок создано: ${created.length}`);
    }catch(error){setMessage(error?.message||'Не удалось создать штриховку для найденных областей');}
  }
  function selectTool(tool){if(tool!=='straightCut'&&state.straightCutDraft){state.straightCutDraft=null;previewLayer.innerHTML='';}if(state.duplicatePlacement&&tool!=='select'){state.duplicatePlacement=null;previewLayer.innerHTML='';}state.tool=tool;if(!['selectRegion','hatch'].includes(tool))state.selectedRegion=null;if(tool!=='select')state.referenceCalibration=null;if(tool!=='moveFace'){state.faceSelection=null;state.faceHover=null;}state.points=[];state.freehandDraft=null;state.splitPending=null;previewLayer.innerHTML='';if($('snapIndicatorLayer'))$('snapIndicatorLayer').innerHTML='';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const names={select:'Выбор объектов: щелчок — выбрать объект, Shift — добавить к выбору, рамка — выделить несколько объектов. Для выбора замкнутой территории используйте отдельный инструмент «Выбор области».',selectRegion:'Выбор области: щёлкните внутри замкнутого контура или внутри одной из областей пересекающейся геометрии. Область подсветится; затем нажмите «Заштриховать выбранную область». Угол штриховки берётся только из поля «Угол» и не зависит от места щелчка.',cutoutNoWalls:'Вырез без стенок: удаляется участок границы без боковых и нижней линий. Выделите несколько объектов и щёлкните один раз — каждый получит вырез у ближайшей к курсору границы.',cutoutNoBottom:'Вырез без нижней стенки: сохраняются обе боковые линии паза, но нижняя соединительная линия отсутствует. При нескольких выделенных объектах один щелчок применяет вырез ко всем по ближайшей точке границы.',straightCut:'Прямой проходной вырез: свободно ведите прямую полосу под любым углом — снизу вверх, сверху вниз, слева направо или по диагонали. Если жест начинается внутри одного из пересекаемых контуров и заканчивается снаружи, направление для этого контура автоматически разворачивается, чтобы вход остался со стороны начала жеста. Выберите «Без нижней стенки» для двух параллельных боковых линий без поперечного торца или «Без стенок» для удаления только границы.',split:'Разделить объект: по открытой линии щёлкните один раз в любом месте, в том числе точно посередине. По замкнутому контуру щёлкните две точки границы — объект разделится на две самостоятельные замкнутые части.',cutout:'Полный вырез: на замкнутом контуре остаются две боковые стенки и нижняя соединительная линия. На открытой линии удаляется участок заданной ширины. При нескольких выделенных объектах один щелчок применяется ко всем по ближайшей точке.',cutoutInner:'Внутренний контур: щёлкните в центре будущего отверстия или паза.',eraser:'Ластик: нажмите или проведите по объектам, чтобы стереть их. Заблокированные объекты защищены.',line:'Отрезок: две точки. Shift фиксирует угол с заданным шагом',freehand:'Свободная линия: зажмите левую кнопку и ведите курсор; линия сгладится автоматически',ruler:'Линейка: укажите начало и конец линейки; затем выберите привязку параллельно или перпендикулярно',construction:'Вспомогательная линия: две точки',xline:'Бесконечная прямая: укажите две точки, задающие направление; линия проходит через весь лист',ray:'Луч: укажите начальную точку и направление; луч продолжается до границы листа',centerline:'Осевая линия: две точки',point:'Точка: щёлкните по листу',section:'Обозначение разреза: две точки линии сечения',techReq:'Технические требования: точка вставки и многострочный текст',polyline:'Ломаная: точки; двойной щелчок или Enter — завершить',spline:'Сплайн: точки; двойной щелчок или Enter — завершить',rect:'Прямоугольник: два противоположных угла',roundRect:'Скруглённый прямоугольник: два угла; радиус задаётся параметром',circle:'Окружность: центр и радиус либо диаметр (выберите режим в настройках геометрии)',arc:'Дуга: центр, начало, конец',ellipse:'Эллипс: два угла габаритной рамки',moveFace:'Перемещение грани: наведите курсор на сторону замкнутого многоугольника и перетащите её перпендикулярно. Соседние вершины сохранят направления соседних граней. Щелчок выбирает грань для точного смещения в поле слева. Shift — шаг 0,5 мм.',polygon:'Правильный многоугольник: центр и размер. «По граням» — щёлкните на расстоянии от центра до середины стороны; программа построит точный размер между параллельными сторонами. «По вершинам» — щёлкните по радиусу до вершины.',star6:'Шестиконечная звезда: укажите центр, затем радиус до вершины. Создаётся один замкнутый внешний контур из 12 вершин без внутренних пересекающихся линий. Звезда редактируется, перемещается и дублируется как единый объект.',arc3:'Дуга по трём точкам: укажите начало, точку через которую должна пройти дуга, и конец. Можно построить как малую, так и большую дугу.',trim:'Усечь кривую: щёлкните по удаляемому участку между соседними пересечениями. Поддерживаются отрезки, окружности, дуги, прямоугольники, эллипсы и замкнутые полилинии.',breakline:'Линия обрыва: две точки',dimAuto:'Авторазмер: две точки; тип определяется направлением',dimension:'Линейный размер: две точки',dimH:'Горизонтальный размер: две точки',dimV:'Вертикальный размер: две точки',dimRad:'Радиальный размер: центр и точка на окружности',dimDia:'Диаметральный размер: центр и точка на окружности',dimAngle:'Угловой размер: вершина и две точки на сторонах угла',measure:'Измерение: две точки',text:'Добавить текст: выберите инструмент (или нажмите T), затем щёлкните по листу. Двойной щелчок по пустому месту также откроет редактор надписи',leader:'Выноска: точка объекта, излом, конец текста',centerMark:'Обозначение центра: щёлкните по центру',hatch:'Штриховка области: выберите рисунок, расстояние и угол (быстрые углы с шагом 15° или точный ввод), затем щёлкните внутри замкнутого контура. Линии обрезаются по границе и не проходят через отверстия. Можно щёлкать по нескольким областям подряд.',roughness:'Шероховатость: точка размещения',tolerance:'Допуск формы: точка размещения',weld:'Обозначение сварки: точка размещения',table:'Таблица: точка вставки'};setMessage(names[tool]||'Готово');$('canvasHint').textContent=names[tool]||'Выберите инструмент';$('canvasHint').classList.toggle('hide',tool==='select');}
  function tangentPointsFrom(point,object){
    if(!point||!object||!['circle','arc'].includes(object.type))return [];
    const cx=Number(object.x),cy=Number(object.y),r=object.type==='circle'?Math.hypot(Number(object.x2)-cx,Number(object.y2)-cy):Number(object.r)||0;
    const vx=point.x-cx,vy=point.y-cy,d2=vx*vx+vy*vy;if(!(r>0)||d2<=r*r+1e-8)return [];
    const base={x:cx+vx*r*r/d2,y:cy+vy*r*r/d2},h=r*Math.sqrt(Math.max(0,d2-r*r))/d2;
    const pts=[{x:base.x-vy*h,y:base.y+vx*h},{x:base.x+vy*h,y:base.y-vx*h}];
    if(object.type==='arc')return pts.filter(q=>{const a=Math.atan2(q.y-cy,q.x-cx),start=Number(object.start)||0,end=Number(object.end)||0,sweep=((end-start)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),t=((a-start)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);return t<=sweep+1e-8;});
    return pts;
  }
  function drawSnapIndicator(match){
    const layer=$('snapIndicatorLayer');if(!layer)return;layer.innerHTML='';if(!match)return;
    const color={endpoint:'#0b8a52',midpoint:'#9563c7',center:'#246bd1',intersection:'#e07818',quadrant:'#148d9d',tangent:'#c13b84'}[match.type]||'#078db2',p=match.point;
    add(layer,'circle',{cx:p.x,cy:p.y,r:2.0,fill:'#fff','fill-opacity':.82,stroke:color,'stroke-width':.45,'vector-effect':'non-scaling-stroke'});
    add(layer,'line',{x1:p.x-2.8,y1:p.y,x2:p.x+2.8,y2:p.y,stroke:color,'stroke-width':.35,'vector-effect':'non-scaling-stroke'});
    add(layer,'line',{x1:p.x,y1:p.y-2.8,x2:p.x,y2:p.y+2.8,stroke:color,'stroke-width':.35,'vector-effect':'non-scaling-stroke'});
  }
  function snapToObjects(p){
    if(!state.objectSnap){drawSnapIndicator(null);return p;}
    // XLINE/RAY proxies are clipped to the active sheet only for intersection solving.
    if(!snapCandidateCache){const directCandidates=getObjectSnapCandidates(state.objects),hasExtended=state.objects.some(o=>['xline','ray'].includes(o.type)),proxies=state.objects.map(o=>{if(!['xline','ray'].includes(o.type))return o;const ep=extentLinePoints(o);return ep?{...o,type:'construction',x:ep[0].x,y:ep[0].y,x2:ep[1].x,y2:ep[1].y,_extendedProxy:true}:o;});snapCandidateCache=hasExtended?getObjectSnapCandidates(proxies):directCandidates;}
    const modeMap={endpoint:'snapEndpointToggle',midpoint:'snapMidpointToggle',center:'snapCenterToggle',intersection:'snapIntersectionToggle',quadrant:'snapQuadrantToggle'};
    let candidates=snapCandidateCache.filter(c=>{const id=modeMap[c.type],control=id?$(id):null;return !id||!control||control.checked;});
    // The ends of a clipped XLINE/RAY are not real endpoints; keep only its intersections.
    const extendedIds=new Set(state.objects.filter(o=>['xline','ray'].includes(o.type)).map(o=>o.id));
    candidates=candidates.filter(c=>!(c.type==='endpoint'||c.type==='midpoint')||!(c.sourceIds||[]).some(id=>extendedIds.has(id)));
    const tolerance=Math.max(.25,8/Math.max(.2,state.zoom));
    let match=findObjectSnap(p,state.objects,{tolerance,candidates});
    const tangentToggle=$('snapTangentToggle');
    if(tangentToggle?.checked&&state.points.length){
      const tangentMatches=[];for(const o of state.objects){if(o.hidden||o.locked)continue;for(const q of tangentPointsFrom(state.points.at(-1),o)){const distance=Math.hypot(q.x-p.x,q.y-p.y);if(distance<=tolerance)tangentMatches.push({type:'tangent',point:q,sourceIds:[o.id],distance,priority:0});}}
      if(tangentMatches.length){tangentMatches.sort((a,b)=>a.distance-b.distance);const t=tangentMatches[0];if(!match||t.distance<=match.distance+Math.max(.15,tolerance*.06))match=t;}
    }
    drawSnapIndicator(match);state.lastSnap=match||null;
    return match?{x:mm(match.point.x),y:mm(match.point.y)}:p;
  }
  function pointFromEvent(e,raw=false){const r=svg.getBoundingClientRect(),d=dimensions();let x=(e.clientX-r.left)/r.width*d.w,y=(e.clientY-r.top)/r.height*d.h;const step=gridStep();if(raw)return{x:mm(x),y:mm(y)};if(state.snap){x=Math.round(x/step)*step;y=Math.round(y/step)*step;}const a=state.points[state.points.length-1];const lineTools=['line','polyline','spline','construction','centerline','xline','ray','breakline','section','dimension','dimAuto','dimH','dimV'];if(a&&e.shiftKey&&lineTools.includes(state.tool)){const angleStep=clamp(Number($('angleStep').value)||15,1,90)*Math.PI/180,dx=x-a.x,dy=y-a.y,len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),snapped=Math.round(angle/angleStep)*angleStep;x=a.x+Math.cos(snapped)*len;y=a.y+Math.sin(snapped)*len;}if(a&&state.ortho&&lineTools.includes(state.tool)){if(Math.abs(x-a.x)>=Math.abs(y-a.y))y=a.y;else x=a.x;}if(a&&state.ruler&&state.rulerMode!=='off'&&lineTools.includes(state.tool)){let ux=state.ruler.b.x-state.ruler.a.x,uy=state.ruler.b.y-state.ruler.a.y,len=Math.hypot(ux,uy)||1;ux/=len;uy/=len;if(state.rulerMode==='perpendicular'){const t=ux;ux=-uy;uy=t;}const dx=x-a.x,dy=y-a.y,t=dx*ux+dy*uy;x=a.x+ux*t;y=a.y+uy*t;}const p={x:mm(x),y:mm(y)};return snapToObjects(p);}
  function drawPreview(p){previewLayer.innerHTML='';const pts=state.points;if(state.tool==='split'&&state.splitPending){add(previewLayer,'line',{x1:state.splitPending.point.x,y1:state.splitPending.point.y,x2:p.x,y2:p.y,stroke:'#078db2','stroke-width':.45,'stroke-dasharray':'1.5 1'});add(previewLayer,'circle',{cx:state.splitPending.point.x,cy:state.splitPending.point.y,r:1.2,fill:'#078db2',stroke:'#ffffff','stroke-width':.3});return;}if(state.tool==='select'&&state.selectionRect){const r=state.selectionRect;add(previewLayer,'rect',{x:Math.min(r.start.x,p.x),y:Math.min(r.start.y,p.y),width:Math.abs(p.x-r.start.x),height:Math.abs(p.y-r.start.y),fill:'#0b91b4','fill-opacity':.08,stroke:'#078db2','stroke-width':.25,'stroke-dasharray':'1 1'});return;}if(state.tool==='ruler'&&pts.length){drawRulerGraphics(previewLayer,pts[0],p,.8);return;}if(!pts.length)return;const a=pts[0];let el;
    if(['line','construction','centerline','rect','roundRect','circle','ellipse','dimension','dimAuto','dimH','dimV','dimRad','dimDia','breakline'].includes(state.tool)){if(state.tool==='rect'||state.tool==='roundRect')el=add(previewLayer,'rect',{x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y),rx:state.tool==='roundRect'?Number($('roundingRadius').value)||0:0});else if(state.tool==='circle')el=add(previewLayer,'circle',{cx:a.x,cy:a.y,r:Math.hypot(p.x-a.x,p.y-a.y)/($('circleInputMode')?.value==='diameter'?2:1)});else if(state.tool==='ellipse')el=add(previewLayer,'ellipse',{cx:(a.x+p.x)/2,cy:(a.y+p.y)/2,rx:Math.abs(p.x-a.x)/2,ry:Math.abs(p.y-a.y)/2});else if(state.tool==='xline'||state.tool==='ray'){const ep=extentLinePoints({type:state.tool,x:a.x,y:a.y,x2:p.x,y2:p.y});const q=ep||[a,p];el=add(previewLayer,'line',{x1:q[0].x,y1:q[0].y,x2:q[1].x,y2:q[1].y});}else el=add(previewLayer,'line',{x1:a.x,y1:a.y,x2:p.x,y2:p.y});}
    else if(state.tool==='polyline'||state.tool==='spline'||state.tool==='leader'){const all=[...pts,p],d=all.map((q,i)=>(i?'L':'M')+` ${q.x} ${q.y}`).join(' ');el=add(previewLayer,'path',{d});}
    else if(state.tool==='polygon'){const n=clamp(Number($('polygonSides').value)||6,3,24),mode=$('polygonMode')?.value||'circumradius',angle=Math.atan2(p.y-a.y,p.x-a.x),pickedRadius=Math.hypot(p.x-a.x,p.y-a.y),measured=mode==='acrossFlats'?pickedRadius*2:pickedRadius,vertices=regularPolygonVertices(a,n,measured,{mode,angle});el=add(previewLayer,'path',{d:vertices.map((q,i)=>`${i?'L':'M'} ${q.x} ${q.y}`).join(' ')+' Z'});}
    else if(state.tool==='star6'){
      const radius=Math.hypot(p.x-a.x,p.y-a.y),angle=Math.atan2(p.y-a.y,p.x-a.x);
      if(radius>.05){const points=sixPointStarOutline(a,radius,{angle});el=add(previewLayer,'path',{d:points.map((q,i)=>`${i?'L':'M'} ${q.x} ${q.y}`).join(' ')+' Z',fill:'none',stroke:'#078db2','stroke-width':.45});}
    }
    else if(state.tool==='arc3'&&pts.length>=2){try{const curve=arcThroughThreePoints(pts[0],pts[1],p),r=curve.radius,p1={x:curve.center.x+Math.cos(curve.startAngle)*r,y:curve.center.y+Math.sin(curve.startAngle)*r},p2={x:curve.center.x+Math.cos(curve.endAngle)*r,y:curve.center.y+Math.sin(curve.endAngle)*r};el=add(previewLayer,'path',{d:`M ${p1.x} ${p1.y} A ${r} ${r} 0 ${curve.sweep>Math.PI?1:0} 1 ${p2.x} ${p2.y}`});}catch{}}
    else if(state.tool==='arc'&&pts.length>=2){const center=pts[0],start=pts[1],r=Math.hypot(start.x-center.x,start.y-center.y),sa=Math.atan2(start.y-center.y,start.x-center.x),ea=Math.atan2(p.y-center.y,p.x-center.x);const s={x:center.x+Math.cos(sa)*r,y:center.y+Math.sin(sa)*r},e={x:center.x+Math.cos(ea)*r,y:center.y+Math.sin(ea)*r},delta=(ea-sa+Math.PI*2)%(Math.PI*2);el=add(previewLayer,'path',{d:`M ${s.x} ${s.y} A ${r} ${r} 0 ${delta>Math.PI?1:0} 1 ${e.x} ${e.y}`});}
    if(el){el.setAttribute('fill','none');el.setAttribute('stroke','#078db2');el.setAttribute('stroke-width','.45');el.setAttribute('stroke-dasharray','1.5 1');}
  }
  function translateObject(o,dx,dy){['x','x2','x3'].forEach(k=>{if(o[k]!==undefined)o[k]=mm(o[k]+dx);});['y','y2','y3'].forEach(k=>{if(o[k]!==undefined)o[k]=mm(o[k]+dy);});if(o.points)o.points=o.points.map(p=>({x:mm(p.x+dx),y:mm(p.y+dy)}));if(o.holes)o.holes=o.holes.map(r=>r.map(p=>({x:mm(p.x+dx),y:mm(p.y+dy)})));if(o.hatchSegments)o.hatchSegments=o.hatchSegments.map(s=>({a:{x:mm(s.a.x+dx),y:mm(s.a.y+dy)},b:{x:mm(s.b.x+dx),y:mm(s.b.y+dy)},angle:s.angle}));}
  function getSelected(){return state.objects.filter(o=>state.selectedIds.includes(o.id));}
  function newId(){return`obj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;}
  function deleteSelected(){if(!state.selectedIds.length){setMessage('Сначала выберите объект');return;}const ids=state.selectedIds.filter(id=>{const o=state.objects.find(x=>x.id===id);return o&&!o.locked;});if(!ids.length){setMessage('Все выбранные объекты заблокированы');return;}commit();state.objects=state.objects.filter(o=>!ids.includes(o.id));state.selectedIds=state.selectedIds.filter(id=>!ids.includes(id));renderAll();setMessage(`Удалено объектов: ${ids.length}`);}
  const GOST_TEXT_HEIGHTS=[1.8,2.5,3.5,5,7,10,14,20,28,40];
  // ГОСТ 2.304-81, type B: standard nominal text heights used for dimension numerals.
  const GOST_DIMENSION_TEXT_HEIGHTS=[1.8,2.5,3.5,5,7,10,14,20];
  const GOST_SCALES=['1:1','1:2','1:2.5','1:4','1:5','1:10','1:15','1:20','1:25','1:40','1:50','1:75','1:100','1:200','1:400','1:500','1:800','1:1000','2:1','2.5:1','4:1','5:1','10:1','20:1','40:1','50:1','100:1'];
  function applyGostControls(){
    if($('standardProfile'))$('standardProfile').value=state.gost.profile||'dstu-gost-ua';
    if($('gostMainLine'))$('gostMainLine').value=state.gost.mainLine;
    if($('gostThinLine'))$('gostThinLine').value=state.gost.thinLine;
    if($('gostLineGroup'))$('gostLineGroup').value=String(state.gost.mainLine||.5);
    if($('gostTextHeight'))$('gostTextHeight').value=state.gost.textHeight;
    if($('gostArrowLength'))$('gostArrowLength').value=state.gost.arrowLength;
    if($('gostPrecision'))$('gostPrecision').value=state.gost.precision;
    if($('gostLettering'))$('gostLettering').value=state.gost.lettering||'B-S';
    if($('standardCustomFields'))$('standardCustomFields').classList.toggle('hidden',(state.gost.profile||'eskd-study')!=='custom');
    if($('defaultTextSize'))$('defaultTextSize').value=state.gost.textHeight;
    if($('defaultDimensionTextHeight'))$('defaultDimensionTextHeight').value=state.gost.dimensionTextHeight||7;
  }
  function applyGostProfile(quiet=false){
    commit();
    const selected=$('standardProfile').value;
    state.gost={profile:selected==='custom'?'custom':(selected==='dstu-gost-ua'?'dstu-gost-ua':'eskd-study'),mainLine:.5,thinLine:.25,textHeight:5,dimensionTextHeight:7,dimensionTextDefaultsVersion:3,textDefaultsVersion:2,arrowLength:3.5,dimensionArrowVersion:2,precision:1,lettering:'B-S',fontFamily:'GOST type B,Arial,sans-serif'};
    applyGostControls();$('standardCustomFields').classList.toggle('hidden',selected!=='custom');
    $('dimensionOffset').value='10';
    if(!quiet)setMessage(selected==='dstu-gost-ua'?'Профіль ДСТУ ГОСТ 2.104:2006 застосовано до нових об’єктів (межі чинності див. у довідці)':'Навчальний профіль ЄСКД застосовано до нових об’єктів');
  }
  function readGostSettings(){
    commit();state.gost={profile:$('standardProfile').value,mainLine:clamp(Number($('gostMainLine').value)||.5,.13,2),thinLine:clamp(Number($('gostThinLine').value)||.25,.13,1),textHeight:GOST_TEXT_HEIGHTS.includes(Number($('gostTextHeight').value))?Number($('gostTextHeight').value):5,dimensionTextHeight:GOST_DIMENSION_TEXT_HEIGHTS.includes(Number($('defaultDimensionTextHeight').value))?Number($('defaultDimensionTextHeight').value):7,dimensionTextDefaultsVersion:3,textDefaultsVersion:2,arrowLength:clamp(Number($('gostArrowLength').value)||3.5,2.5,5),dimensionArrowVersion:2,precision:clamp(Number.isFinite(Number($('gostPrecision').value))?Number($('gostPrecision').value):1,0,3),lettering:$('gostLettering').value||'B-S',fontFamily:(String($('gostLettering').value||'B-S').startsWith('A')?'GOST type A,Arial,sans-serif':'GOST type B,Arial,sans-serif')};
    applyGostControls();setMessage('Настройки оформления сохранены для новых объектов');
  }
  function enlargeAllDrawingText(targetSize=5){
    const textTypes=new Set(['text','techReq','dimension','leader','section','roughness','tolerance','weld','table']);
    const items=state.objects.filter(o=>textTypes.has(o.type));
    if(!items.length){setMessage('У кресленику поки немає текстових позначень');return;}
    const before=snapshot();
    state.gost.textHeight=targetSize;state.gost.textDefaultsVersion=2;
    items.forEach(o=>{if(o.type==='dimension')o.textSize=targetSize;else if(['text','techReq'].includes(o.type))o.size=targetSize;else o.textSize=targetSize;});
    applyGostControls();commit(before);renderAll();
    setMessage(`Усі написи збільшено до ${targetSize} мм. Для нового тексту також встановлено цю висоту.`);
  }
  function normalizeSelectedToGost(){
    const selected=getSelected();if(!selected.length){setMessage('Сначала выделите объекты для приведения к профилю');return;}
    const thinTypes=new Set(['dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','section','techReq','freehand','breakline']);
    commit();selected.forEach(o=>{if(o.type==='reference')return;o.width=thinTypes.has(o.type)?state.gost.thinLine:state.gost.mainLine;if(o.type==='centerline')o.dash=GOST_LINE_PATTERNS.dashDotThin;if(o.type==='construction')o.dash='';if(['text','techReq'].includes(o.type)){o.size=state.gost.textHeight;o.lettering=state.gost.lettering||'B-S';o.font=state.gost.fontFamily||'Arial,sans-serif';o.bold=false;o.italic=false;o.widthFactor=1;o.letterSpacing=0;}if(o.type==='dimension'){o.textSize=state.gost.dimensionTextHeight||state.gost.textHeight;const oldOffset=Number(o.offset)||10;o.offset=(Math.sign(oldOffset)||1)*Math.max(10,Math.abs(oldOffset));}});
    renderAll();setMessage('Выделенные объекты приведены к толщине и высоте текста профиля');
  }
  function checkGost(){
    const errors=[],warnings=[],passed=[],info=[];
    const d=dimensions(),fmt=String(state.format||'A4P').replace(/[PL]$/,'');
    const baseSizes={A0:[841,1189],A1:[594,841],A2:[420,594],A3:[297,420],A4:[210,297],A5:[148,210]};
    const longSizes={'A0x2':[1189,1682],'A0x3':[1189,2523],'A1x3':[841,1783],'A1x4':[841,2378],'A2x3':[594,1261],'A2x4':[594,1682],'A2x5':[594,2102],'A3x3':[420,891],'A3x4':[420,1189],'A3x5':[420,1486],'A3x6':[420,1783],'A3x7':[420,2080],'A4x3':[297,630],'A4x4':[297,841],'A4x5':[297,1051],'A4x6':[297,1261],'A4x7':[297,1471],'A4x8':[297,1682],'A4x9':[297,1892]};
    const expected=baseSizes[fmt]||longSizes[fmt];
    if(!expected)errors.push(`Невідомий код формату аркуша «${state.format}».`);
    else if(Math.min(d.w,d.h)!==expected[0]||Math.max(d.w,d.h)!==expected[1])errors.push(`Фактичний розмір аркуша ${d.w}×${d.h} мм не відповідає формату ${fmt}.`);
    else passed.push(`Формат ${fmt}: ${d.w}×${d.h} мм відповідає ряду форматів ДСТУ EN ISO 5457:2022.`);
    if(!GOST_SCALES.includes(String(state.title.scale||'1:1')))warnings.push(`Масштаб «${state.title.scale}» не знайдено в навчальному переліку масштабів. Перевірте ДСТУ EN ISO 5455:2022 та вимоги завдання.`);
    else passed.push(`Масштаб ${state.title.scale}: значення входить до типового навчального ряду.`);
    const titleBlockRequired=!['blank'].includes(state.titleForm);
    if(titleBlockRequired){if(!state.title.title?.trim())warnings.push('Не заповнено назву документа в основному написі.');else passed.push('Назва документа заповнена.');if(!state.title.code?.trim())warnings.push('Не заповнено позначення документа.');else passed.push('Позначення документа заповнено.');}
    const a3GostTemplate=['lab5-template','technical-a3-template'].includes(state.titleForm);
    if(a3GostTemplate&&state.format!=='A3P')warnings.push('Выбранный пользовательский шаблон ЕСКД рассчитан на формат А3, книжная ориентация (297×420 мм).');
    if(a3GostTemplate&&state.format==='A3P')passed.push('Пользовательский шаблон используется в формате А3, книжная ориентация.');
    if(state.template&&visible.template)passed.push('Шаблон і основний напис відображаються.');else warnings.push('Шаблон/основний напис приховано; перевірте, чи це допустимо для вашого завдання.');

    const textObjects=state.objects.filter(o=>['text','techReq'].includes(o.type));
    const badText=textObjects.filter(o=>!GOST_TEXT_HEIGHTS.includes(Number(o.size||state.gost.textHeight)));
    if(badText.length)warnings.push(`${badText.length} текстових об’єктів мають висоту поза рядом 1,8; 2,5; 3,5; 5; 7; 10; 14; 20; 28; 40 мм (ГОСТ 2.304-81 / ДСТУ ISO 3098).`);
    else if(textObjects.length)passed.push(`Висота ${textObjects.length} текстових об’єктів входить до стандартного ряду ГОСТ 2.304-81 / ДСТУ ISO 3098.`);
    else info.push('Текстових об’єктів користувача поки немає.');
    const smallTypeA=textObjects.filter(o=>Number(o.size)===1.8&&String(o.lettering||state.gost.lettering||'B-S').startsWith('A'));
    if(smallTypeA.length)warnings.push(`${smallTypeA.length} написів висотою 1,8 мм задано шрифтом типу А; за ГОСТ 2.304-81 цей розмір застосовується лише для типу Б.`);
    const letteringBad=textObjects.filter(o=>o.lettering&&!['A-V','A-S','B-V','B-S'].includes(o.lettering));
    const styleBad=textObjects.filter(o=>o.bold||o.italic||Math.abs((o.widthFactor??1)-1)>.01||Math.abs(Number(o.letterSpacing)||0)>.001);
    if(letteringBad.length)warnings.push(`${letteringBad.length} текстових об’єктів мають невідоме креслярське начертання.`);else if(textObjects.length)passed.push('Типи креслярського шрифту позначені як A/B, вертикальні або похилі.');
    if(styleBad.length)warnings.push(`${styleBad.length} написів мають жирність/курсив/змінену ширину чи інтервали; перевірте їх за вимогами креслярського шрифту.`);

    const linePairs=[[.25,.13],[.35,.18],[.5,.25],[.7,.35],[1,.5],[1.4,.7],[2,1]],widthSeries=[.13,.18,.25,.35,.5,.7,1,1.4,2];
    if(!linePairs.some(([w,n])=>Math.abs(state.gost.mainLine-w)<.011&&Math.abs(state.gost.thinLine-n)<.011))warnings.push('Пара основної/тонкої товщини не відповідає типовій парі ряду ISO 128; перевірте налаштування профілю.');else passed.push(`Пара товщин ${state.gost.mainLine}/${state.gost.thinLine} мм входить до ряду рекомендованих пар.`);
    const invalidWidths=state.objects.filter(o=>o.type!=='reference'&&o.width!==undefined&&!widthSeries.some(v=>Math.abs(v-Number(o.width))<.011));
    if(invalidWidths.length)warnings.push(`${invalidWidths.length} об’єктів мають товщину поза рядом 0,13–2,0 мм.`);else passed.push('Товщини графічних об’єктів належать до стандартного ряду 0,13–2,0 мм.');
    const centerNoDash=state.objects.filter(o=>o.type==='centerline'&&!o.dash);if(centerNoDash.length)warnings.push(`${centerNoDash.length} осьових ліній не мають штрихпунктирного типу.`);else if(state.objects.some(o=>o.type==='centerline'))passed.push('Осьові лінії мають штрихпунктирне оформлення.');
    const thinTypes=new Set(['dimension','leader','centerMark','hatch','roughness','tolerance','weld','table','section','techReq','freehand','breakline']);
    const widthWarn=state.objects.filter(o=>o.type!=='reference'&&o.width!==undefined&&Math.abs(Number(o.width)-(thinTypes.has(o.type)?state.gost.thinLine:state.gost.mainLine))>.061);
    if(widthWarn.length)warnings.push(`${widthWarn.length} об’єктів відрізняються за товщиною від заданих значень профілю (основна ${state.gost.mainLine} мм / тонка ${state.gost.thinLine} мм).`);else passed.push('Товщини об’єктів узгоджені з поточною парою профілю.');

    const dims=state.objects.filter(o=>o.type==='dimension');
    const geometryObjects=state.objects.filter(o=>!o.hidden&&layerFor(o)==='geometry'&&['line','rect','circle','ellipse','arc','polyline','spline','freehand'].includes(o.type));
    if(dims.length&&!geometryObjects.length)errors.push('На листе есть размерные обозначения, но нет геометрии детали: добавьте реальные отрезки, дуги и окружности. Сейчас размеры «висят» без контура.');
    else if(!geometryObjects.length)info.push('Геометрия детали пока не построена — лист-шаблон остаётся пустым.');
    else passed.push(`Найдена геометрия детали: ${geometryObjects.length} графических объектов.`);
    const circleObjects=geometryObjects.filter(o=>o.type==='circle');
    const unbackedDiameters=dims.filter(o=>o.kind==='diameter').filter(o=>{
      const cx=Number(o.x),cy=Number(o.y),r=Math.hypot(Number(o.x2)-cx,Number(o.y2)-cy);
      return !circleObjects.some(c=>Math.hypot(Number(c.x)-cx,Number(c.y)-cy)<=1.5&&Math.abs(Math.hypot(Number(c.x2)-Number(c.x),Number(c.y2)-Number(c.y))-r)<=1.5);
    });
    if(unbackedDiameters.length)warnings.push(`${unbackedDiameters.length} диаметральных размеров не привязаны к соответствующим окружностям. Постройте окружность детали и проверьте центр/радиус размера.`);
    // Reserve the lower-right 185 x 55 mm title block and a clear margin on both A3 custom templates.
    if(['lab5-template','technical-a3-template'].includes(state.titleForm) && state.format==='A3P'){
      const protectedZone={x:220,y:227,w:200,h:70};
      const intersects=(a,b)=>a && a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
      const nearStamp=state.objects.filter(o=>!o.hidden && o.type!=='reference').filter(o=>{
        let b=objectBounds(o); if(!b)return false;
        if(o.type==='dimension'){
          const x1=Number(o.x),y1=Number(o.y),x2=Number(o.x2),y2=Number(o.y2),k=o.kind||'linear';
          const raw=Number.isFinite(Number(o.offset))?Number(o.offset):10,off=(Math.sign(raw)||1)*Math.max(10,Math.abs(raw));
          const pts=[{x:x1,y:y1},{x:x2,y:y2}];
          if(k==='horizontal'){const side=off>=0?1:-1,yy=(side>0?Math.max(y1,y2):Math.min(y1,y2))+off;pts.push({x:x1,y:yy},{x:x2,y:yy});}
          else if(k==='vertical'){const side=off>=0?1:-1,xx=(side>0?Math.max(x1,x2):Math.min(x1,x2))+off;pts.push({x:xx,y:y1},{x:xx,y:y2});}
          else if(k==='linear'){const len=Math.hypot(x2-x1,y2-y1)||1,nx=-(y2-y1)/len,ny=(x2-x1)/len;pts.push({x:x1+nx*off,y:y1+ny*off},{x:x2+nx*off,y:y2+ny*off});}
          else if(k==='angular' && Number.isFinite(Number(o.x3))){const a1=Math.atan2(y2-y1,x2-x1),a2=Math.atan2(Number(o.y3)-y1,Number(o.x3)-x1);let da=(a2-a1+Math.PI*2)%(Math.PI*2);if(da>Math.PI)da=Math.PI*2-da;const rr=clamp(Number(o.radius)||12,2,1000);for(let i=0;i<=16;i++){const a=a1+da*i/16;pts.push({x:x1+Math.cos(a)*rr,y:y1+Math.sin(a)*rr});}}
          const pad=Math.max(2,(Number(o.textSize)||state.gost.textHeight)*.8),xs=pts.map(q=>q.x),ys=pts.map(q=>q.y);b={x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:Math.max(...xs)-Math.min(...xs)+2*pad,h:Math.max(...ys)-Math.min(...ys)+2*pad};
        }
        return intersects(b,protectedZone);
      });
      if(nearStamp.length)warnings.push(`${nearStamp.length} об’єктів або розмірів заходять у зону штампа чи в 10-мм відступ. Підніміть контур/розміри вище або змістіть ліворуч.`);
      else passed.push('Зона основного напису та 10-мм відступ навколо неї вільні.');
    }
    state.assignmentDimensions=String($('assignmentDimensions')?.value||'').trim();
    const assignmentLines=state.assignmentDimensions.split(/[\n;]+/).map(v=>v.trim()).filter(Boolean);
    if(assignmentLines.length){
      const actual=dims.map((o,index)=>{const k=o.kind||'linear',dx=Number(o.x2)-Number(o.x),dy=Number(o.y2)-Number(o.y);let value,type='length';if(k==='radius'){value=Math.hypot(dx,dy);type='radius';}else if(k==='diameter'){value=2*Math.hypot(dx,dy);type='diameter';}else if(k==='angular'){const a=Math.atan2(Number(o.y2)-Number(o.y),Number(o.x2)-Number(o.x)),b=Math.atan2(Number(o.y3)-Number(o.y),Number(o.x3)-Number(o.x));let delta=Math.abs((b-a)*180/Math.PI)%360;value=Math.min(delta,360-delta);type='angle';}else if(k==='horizontal')value=Math.abs(dx);else if(k==='vertical')value=Math.abs(dy);else value=Math.hypot(dx,dy);return{index,o,value,type,used:false};}).filter(v=>Number.isFinite(v.value));
      let matched=0,missing=0,invalid=0;
      assignmentLines.forEach(line=>{
        const normalized=line.replace(/,/g,'.');
        const prefix=(normalized.match(/^\s*(⌀|Ø|ø|Ш|ш|R|D|∠)/i)||[])[1]||'';
        const suffixAngle=/°\s*$/.test(normalized);
        const num=normalized.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/);
        if(!num){invalid++;warnings.push(`Не вдалося прочитати очікуваний розмір «${line}». Введіть число або префікс ⌀, R чи кут у градусах.`);return;}
        const expected=Number(num[0]),type=/^(?:⌀|Ø|ø|Ш|ш|D)$/i.test(prefix)?'diameter':/^R$/i.test(prefix)?'radius':(/^∠$/i.test(prefix)||suffixAngle)?'angle':'length';
        const candidates=actual.filter(a=>!a.used&&(!type||a.type===type));
        const tolerance=type==='angle'||suffixAngle?0.1:Math.max(.05,Math.abs(expected)*.0005);
        let best=null,bestDiff=Infinity;candidates.forEach(a=>{const diff=Math.abs(a.value-expected);if(diff<bestDiff){best=a;bestDiff=diff;}});
        if(best&&bestDiff<=tolerance){best.used=true;matched++;passed.push(`Размер из задания «${line}» найден: фактическое значение ${best.value.toFixed(type==='angle'?1:2)}${type==='angle'?'°':' мм'} (допуск сравнения ±${tolerance.toFixed(2)}).`);}
        else{missing++;const available=candidates.length?candidates.map(a=>`${a.value.toFixed(2)}${a.type==='angle'?'°':' мм'}`).join(', '):'подходящих размерных объектов нет';warnings.push(`Размер из задания «${line}» не совпал с геометрией. Ближайшее значение: ${best?best.value.toFixed(2):'—'}; доступно: ${available}. Проверьте размер или геометрию.`);}
      });
      if(matched===assignmentLines.length)passed.push(`Проверка задания: совпали все ${matched} ожидаемых размеров.`);
      else warnings.push(`Проверка задания: совпало ${matched} из ${assignmentLines.length} ожидаемых размеров; не совпало/не найдено ${missing}.`);
      if(invalid)warnings.push(`В списке задания есть ${invalid} некорректных строк.`);
    }else info.push('Размеры задания не заданы. Для сравнения с листом преподавателя внесите ⌀, R, угловые и линейные значения в поле «Проверка размеров по заданию».');
    const dimensionKinds=new Set(['linear','horizontal','vertical','radius','diameter','angular']);
    const malformed=dims.filter(o=>!dimensionKinds.has(o.kind||'linear')||!Number.isFinite(Number(o.x))||!Number.isFinite(Number(o.y))||!Number.isFinite(Number(o.x2))||!Number.isFinite(Number(o.y2)));
    if(malformed.length)errors.push(`${malformed.length} розмірів мають неповні координати або невідомий тип.`);
    const zeroDims=dims.filter(o=>{const k=o.kind||'linear';if(k==='angular')return Math.abs(Number(o.x2)-Number(o.x))+Math.abs(Number(o.y2)-Number(o.y))<.01||Math.abs(Number(o.x3)-Number(o.x))+Math.abs(Number(o.y3)-Number(o.y))<.01;return Math.hypot(Number(o.x2)-Number(o.x),Number(o.y2)-Number(o.y))<.01;});
    if(zeroDims.length)errors.push(`${zeroDims.length} розмірів мають нульову/вироджену геометрію.`);
    // Separate exact X/Y page-boundary checks; dimensions with extension graphics near the edge need a margin.
    const dimOut=dims.filter(o=>{const ps=[{x:o.x,y:o.y},{x:o.x2,y:o.y2}];if(o.kind==='angular')ps.push({x:o.x3,y:o.y3});return ps.some(p=>p.x<0||p.y<0||p.x>d.w||p.y>d.h);});
    if(dimOut.length)warnings.push(`${dimOut.length} розмірів мають точки поза аркушем.`);
    if(dims.length){
      if(!visible.dimensions){warnings.push('Шар розмірів приховано; перевірка фактичного вигляду стрілок пропущена.');}
      else {
        const missingArrows=[];
        const arrowTargets=o=>{
          const k=o.kind||'linear',x=Number(o.x),y=Number(o.y),x2=Number(o.x2),y2=Number(o.y2),dx=x2-x,dy=y2-y,len=Math.hypot(dx,dy)||1;
          if(k==='radius')return[{tip:{x:x2,y:y2},dir:{x:dx/len,y:dy/len}}];
          if(k==='diameter'){const ux=dx/len,uy=dy/len;return[{tip:{x:x-ux*len,y:y-uy*len},dir:{x:-ux,y:-uy}},{tip:{x:x+ux*len,y:y+uy*len},dir:{x:ux,y:uy}}];}
          if(k==='angular'){const a=Math.atan2(y2-y,x2-x),b=Math.atan2(Number(o.y3)-y,Number(o.x3)-x);let delta=(b-a+Math.PI*2)%(Math.PI*2),start=a,end=b;if(delta>Math.PI){delta=Math.PI*2-delta;start=b;end=a;}const r=clamp(Number(o.radius)||12,2,1000);return[{tip:{x:x+Math.cos(start)*r,y:y+Math.sin(start)*r},dir:{x:-Math.sin(start),y:Math.cos(start)}},{tip:{x:x+Math.cos(end)*r,y:y+Math.sin(end)*r},dir:{x:Math.sin(end),y:-Math.cos(end)}}];}
          const raw=Number.isFinite(Number(o.offset))?Number(o.offset):10,off=(Math.sign(raw)||1)*Math.max(10,Math.abs(raw));let a,b,ux,uy;
          if(k==='horizontal'){const side=off>=0?1:-1,base=side>0?Math.max(y,y2):Math.min(y,y2),dyDim=base+side*Math.abs(off);a={x,y:dyDim};b={x:x2,y:dyDim};ux=Math.sign(b.x-a.x)||1;uy=0;}
          else if(k==='vertical'){const side=off>=0?1:-1,base=side>0?Math.max(x,x2):Math.min(x,x2),dxDim=base+side*Math.abs(off);a={x:dxDim,y};b={x:dxDim,y:y2};ux=0;uy=Math.sign(b.y-a.y)||1;}
          else {ux=dx/len;uy=dy/len;const nx=-uy,ny=ux;a={x:x+nx*off,y:y+ny*off};b={x:x2+nx*off,y:y2+ny*off};}
          const lineLen=Math.hypot(b.x-a.x,b.y-a.y),placement=effectiveArrowPlacement(o,lineLen,clamp(Number(state.gost.arrowLength)||3.5,2.5,5));
          return placement==='inside'
            ?[{tip:a,dir:{x:-ux,y:-uy}},{tip:b,dir:{x:ux,y:uy}}]
            :[{tip:a,dir:{x:ux,y:uy}},{tip:b,dir:{x:-ux,y:-uy}}];
        };
        const triangleInfo=path=>{const d=path.getAttribute('d')||'',nums=(d.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)||[]).map(Number);if(!/[zZ]\s*$/.test(d)||nums.length<6)return null;const [tx,ty,b1x,b1y,b2x,b2y]=nums,p1={x:tx,y:ty},p2={x:b1x,y:b1y},p3={x:b2x,y:b2y},base={x:(b1x+b2x)/2,y:(b1y+b2y)/2},vx=tx-base.x,vy=ty-base.y,length=Math.hypot(vx,vy),width=Math.hypot(b2x-b1x,b2y-b1y),area=Math.abs((b1x-tx)*(b2y-ty)-(b2x-tx)*(b1y-ty))/2;return{tip:p1,dir:{x:vx/(length||1),y:vy/(length||1)},length,width,area};};
        dims.forEach(o=>{
          const group=annotationLayer.querySelector(`[data-id="${o.id}"]`),paths=group?[...group.querySelectorAll('[data-dimension-arrow]')]:[],targets=arrowTargets(o),expectedCount=(o.kind==='radius')?1:2;
          if(paths.length!==expectedCount||targets.length!==expectedCount){missingArrows.push(o);return;}
          const infos=paths.map(triangleInfo);if(infos.some(v=>!v||v.length<.5||v.width<.2||v.area<.08)){missingArrows.push(o);return;}
          infos.forEach((a,i)=>{const target=targets[i],tipError=Math.hypot(a.tip.x-target.tip.x,a.tip.y-target.tip.y),dot=a.dir.x*target.dir.x+a.dir.y*target.dir.y,expectedLen=clamp(Number(state.gost.arrowLength)||3.5,2.5,5);if(tipError>.15||dot<.92||a.length>expectedLen+.2)missingArrows.push(o);});
        });
        if(missingArrows.length)errors.push(`${new Set(missingArrows).size} розмірів мають відсутні, перекошені або неправильно спрямовані наконечники стрілок.`);else passed.push(`Стрілки ${dims.length} розмірних позначень мають правильну трикутну форму, напрямок і точки прив’язки.`);
      }
      if(!Number.isFinite(Number(state.gost.arrowLength))||Number(state.gost.arrowLength)<2.5||Number(state.gost.arrowLength)>5)warnings.push('Довжина розмірних стрілок виходить за робочий діапазон 2,5–5 мм; перевірте налаштування.');else passed.push(`Довжина стрілок: ${state.gost.arrowLength} мм; режим розміщення перевіряється для кожного розміру окремо.`);
      const forcedInsideShort=dims.filter(o=>['linear','horizontal','vertical'].includes(o.kind||'linear')&&o.arrowPlacement==='inside'&&effectiveArrowPlacement({...o,arrowPlacement:'auto'},Math.hypot(Number(o.x2)-Number(o.x),Number(o.y2)-Number(o.y)),Number(state.gost.arrowLength)||3.5)==='outside');
      if(forcedInsideShort.length)warnings.push(`${forcedInsideShort.length} коротких розмірів примусово мають стрілки всередині; наконечники можуть перекриватися. Виберіть «Авто» або «Снаружи».`);
      const forcedOutside=dims.filter(o=>['linear','horizontal','vertical'].includes(o.kind||'linear')&&o.arrowPlacement==='outside');
      const autoOutside=dims.filter(o=>['linear','horizontal','vertical'].includes(o.kind||'linear')&&effectiveArrowPlacement(o,Math.hypot(Number(o.x2)-Number(o.x),Number(o.y2)-Number(o.y)),Number(state.gost.arrowLength)||3.5)==='outside'&&o.arrowPlacement!=='outside');
      if(forcedOutside.length||autoOutside.length)passed.push(`Наружное размещение стрелок: ${forcedOutside.length} вручную и ${autoOutside.length} автоматически.`);
      const badDimText=dims.filter(o=>!GOST_DIMENSION_TEXT_HEIGHTS.includes(Number(o.textSize||state.gost.dimensionTextHeight||state.gost.textHeight)));if(badDimText.length)warnings.push(`${badDimText.length} розмірних написів мають висоту поза типовим рядом креслярських шрифтів.`);else passed.push('Висота тексту розмірів входить до типового ряду креслярських висот.');
      const minOffset=dims.filter(o=>['linear','horizontal','vertical'].includes(o.kind||'linear')&&Math.abs(Number(o.offset)||10)<10);if(minOffset.length)warnings.push(`${minOffset.length} лінійних розмірів задані зі зміщенням менше 10 мм; відображення редактора збільшує його до 10 мм. Перевірте реальний інтервал.`);
      const descriptors=[];dims.forEach(o=>{const k=o.kind||'linear';if(!['linear','horizontal','vertical'].includes(k))return;const x1=Number(o.x),y1=Number(o.y),x2=Number(o.x2),y2=Number(o.y2);let a,b;if(k==='horizontal'){const side=(Number(o.offset)||10)>=0?1:-1,y=(side>0?Math.max(y1,y2):Math.min(y1,y2))+side*Math.max(10,Math.abs(Number(o.offset)||10));a={x:x1,y};b={x:x2,y};}else if(k==='vertical'){const side=(Number(o.offset)||10)>=0?1:-1,x=(side>0?Math.max(x1,x2):Math.min(x1,x2))+side*Math.max(10,Math.abs(Number(o.offset)||10));a={x,y:y1};b={x,y:y2};}else{const len=Math.hypot(x2-x1,y2-y1)||1,nx=-(y2-y1)/len,ny=(x2-x1)/len,off=(Math.sign(Number(o.offset)||10)||1)*Math.max(10,Math.abs(Number(o.offset)||10));a={x:x1+nx*off,y:y1+ny*off};b={x:x2+nx*off,y:y2+ny*off};}const vx=b.x-a.x,vy=b.y-a.y,len=Math.hypot(vx,vy)||1;descriptors.push({a,b,ux:vx/len,uy:vy/len,len});});
      let crowded=0;for(let i=0;i<descriptors.length;i++)for(let j=i+1;j<descriptors.length;j++){const a=descriptors[i],b=descriptors[j],cross=Math.abs(a.ux*b.uy-a.uy*b.ux);if(cross>.035)continue;const gap=Math.abs((b.a.x-a.a.x)*(-a.uy)+(b.a.y-a.a.y)*a.ux);const p1=(b.a.x-a.a.x)*a.ux+(b.a.y-a.a.y)*a.uy,p2=(b.b.x-a.a.x)*a.ux+(b.b.y-a.a.y)*a.uy,overlap=Math.min(a.len,Math.max(p1,p2))-Math.max(0,Math.min(p1,p2));if(gap<7&&overlap>1)crowded++;}
      if(crowded)warnings.push(`${crowded} пар паралельних розмірних ліній розташовані ближче 7 мм одна до одної або перекриваються. Перевірте рознесення.`);
      else passed.push('Перевірка проміжків між паралельними розмірами: явних інтервалів менше 7 мм не знайдено.');
      // Проверяем фактические линии выносок/размеров на пересечения между разными размерами.
      const drawnSegments=[];
      dims.filter(o=>['linear','horizontal','vertical'].includes(o.kind||'linear')).forEach(o=>{
        const group=annotationLayer.querySelector(`[data-id="${o.id}"]`);
        if(!group)return;
        group.querySelectorAll('line').forEach(el=>{
          const a={x:Number(el.getAttribute('x1')),y:Number(el.getAttribute('y1'))},b={x:Number(el.getAttribute('x2')),y:Number(el.getAttribute('y2'))};
          if([a.x,a.y,b.x,b.y].every(Number.isFinite)&&Math.hypot(b.x-a.x,b.y-a.y)>.5)drawnSegments.push({id:o.id,a,b});
        });
      });
      const crossingPairs=new Set();
      for(let i=0;i<drawnSegments.length;i++)for(let j=i+1;j<drawnSegments.length;j++){
        const a=drawnSegments[i],b=drawnSegments[j];if(a.id===b.id)continue;
        const rx=a.b.x-a.a.x,ry=a.b.y-a.a.y,sx=b.b.x-b.a.x,sy=b.b.y-b.a.y,den=rx*sy-ry*sx;
        if(Math.abs(den)<1e-8)continue;
        const qx=b.a.x-a.a.x,qy=b.a.y-a.a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
        if(t>.03&&t<.97&&u>.03&&u<.97)crossingPairs.add([a.id,b.id].sort().join('|'));
      }
      if(crossingPairs.size)warnings.push(`${crossingPairs.size} пар размерных/выносных линий пересекаются между собой. Разнесите размеры, чтобы убрать пересечения.`);
      else passed.push('Явных пересечений между линиями разных размерных объектов не найдено.');
      let unalignedChains=0;
      for(let i=0;i<dims.length;i++)for(let j=i+1;j<dims.length;j++){
        const a=dims[i],b=dims[j],ka=a.kind||'linear',kb=b.kind||'linear';
        if(ka!==kb||!['horizontal','vertical'].includes(ka))continue;
        const dimPosition=o=>{const x1=Number(o.x),y1=Number(o.y),x2=Number(o.x2),y2=Number(o.y2),raw=Number.isFinite(Number(o.offset))?Number(o.offset):10,off=(Math.sign(raw)||1)*Math.max(10,Math.abs(raw));
          if(ka==='horizontal'){const side=off>=0?1:-1,base=side>0?Math.max(y1,y2):Math.min(y1,y2);return base+side*Math.abs(off);}
          const side=off>=0?1:-1,base=side>0?Math.max(x1,x2):Math.min(x1,x2);return base+side*Math.abs(off);
        };
        const baselineA=dimPosition(a),baselineB=dimPosition(b);
        const aa=(ka==='horizontal'?[Number(a.x),Number(a.x2)]:[Number(a.y),Number(a.y2)]).sort((u,v)=>u-v);
        const bb=(ka==='horizontal'?[Number(b.x),Number(b.x2)]:[Number(b.y),Number(b.y2)]).sort((u,v)=>u-v);
        const adjacent=Math.abs(aa[1]-bb[0])<.5||Math.abs(bb[1]-aa[0])<.5;
        if(adjacent&&Math.abs(baselineA-baselineB)>.5)unalignedChains++;
      }
      if(unalignedChains)warnings.push(`${unalignedChains} пар соседних размеров цепочки расположены на разных уровнях. Выставьте для них одинаковое смещение, чтобы размерные линии совпали по одной прямой.`);
      passed.push('Виносні лінії формуються з виходом за наконечник; короткі розміри мають автоматичне зовнішнє розміщення стрілок.');
    } else info.push('Розмірних позначень немає — перевірка розмірних стрілок пропущена.');

    const hatch=state.objects.filter(o=>o.type==='hatch');
    const invalidHatch=hatch.filter(o=>!['single','cross','triple','solid'].includes(o.pattern||'single')||!Number.isFinite(Number(o.spacing||3))||Number(o.spacing||3)<.5);
    if(invalidHatch.length)warnings.push(`${invalidHatch.length} штриховок мають невідомий шаблон або занадто малий крок.`);else if(hatch.length)passed.push(`Штриховки (${hatch.length}) мають підтримувані шаблони й допустимий крок.`);
    const unboundedHatch=hatch.filter(o=>!o.boundaryOf&&!o.closed);if(unboundedHatch.length)warnings.push(`${unboundedHatch.length} штриховок не прив’язані до закритого контуру; перевірте, чи вони не виходять за межі.`);
    const offPage=[];state.objects.filter(o=>o.type!=='reference'&&!o.hidden).forEach(o=>{const b=objectBounds(o);if(b&&(b.x<-.2||b.y<-.2||b.x+b.w>d.w+.2||b.y+b.h>d.h+.2))offPage.push(o);});if(offPage.length)warnings.push(`${offPage.length} видимих об’єктів частково виходять за межі листа.`);else passed.push('Видимі об’єкти не виходять за фізичні межі аркуша.');
    const refs=state.objects.filter(o=>o.type==='reference'&&!o.exportable);if(refs.length)info.push(`${refs.length} допоміжних референсів виключено з друку та обміну.`);
    if(state.gost.profile==='dstu-gost-ua')info.push('Профіль ДСТУ/ISO має навчальний характер. Автоматична перевірка не замінює нормоконтроль і не підтверджує юридичну відповідність конкретному стандарту.');

    const list=$('gostCheckResults');list.innerHTML='';
    const groups=[...errors.map(text=>({level:'bad',text})),...warnings.map(text=>({level:'warn',text})),...passed.map(text=>({level:'good',text})),...info.map(text=>({level:'info',text}))];
    groups.forEach(item=>{const row=document.createElement('div');row.className='gost-result '+item.level;const mark={bad:'✕',warn:'⚠',good:'✓',info:'ⓘ'}[item.level];row.textContent=mark+' '+item.text;list.appendChild(row);});
    const total=errors.length+warnings.length;
    $('gostSummary').textContent=errors.length?`Знайдено помилок: ${errors.length}; попереджень: ${warnings.length}. Виправте помилки та перегляньте попередження. Це попередній автоматичний контроль, не сертифікація.`:warnings.length?`Критичних помилок не знайдено; попереджень: ${warnings.length}. Перевірте їх за завданням і вимогами викладача.`:'Критичних помилок і попереджень за доступними автоматичними правилами не знайдено. Це не замінює нормоконтроль.';
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
  function textValuesFromForm(){return{text:$('textContent').value,font:$('textFontCustom').value.trim()||$('textFont').value,size:clamp(Number($('textSize').value)||5,.5,50),widthFactor:clamp((Number($('textWidthFactor').value)||100)/100,.25,3),rotation:Number($('textRotation').value)||0,align:$('textAlign').value,baseline:$('textBaseline').value,lineHeight:clamp(Number($('textLineHeight').value)||4,.5,100),letterSpacing:clamp(Number($('textLetterSpacing').value)||0,-2,10),lettering:$('textLettering').value||state.gost.lettering||'B-S',color:$('textColor').value,bold:$('textBold').checked,italic:$('textItalic').checked,underline:$('textUnderline').checked,overline:$('textOverline').checked,strike:$('textStrike').checked,frame:$('textFrame').checked};}
  function openTextDialog(position,existing){editingTextId=existing?.id||null;const o=existing||{};$('textModalTitle').textContent=existing?'Редактирование текста':'Создание текста';$('textContent').value=o.text??'Текст';const font=o.font||state.gost.fontFamily||'GOST type B,Arial,sans-serif';$('textFontCustom').value='';$('textFont').value=font;if($('textFont').value!==font)$('textFontCustom').value=font;$('textLettering').value=o.lettering||state.gost.lettering||'B-S';$('textSize').value=o.size||Number($('defaultTextSize').value)||5;$('textWidthFactor').value=Math.round((o.widthFactor||1)*100);$('textRotation').value=o.rotation||0;$('textAlign').value=o.align||'start';$('textBaseline').value=o.baseline||'alphabetic';$('textLineHeight').value=o.lineHeight||((o.size||5)*1.25);$('textLetterSpacing').value=o.letterSpacing||0;$('textColor').value=o.color||'#20252a';$('textBold').checked=!!o.bold;$('textItalic').checked=!!o.italic;$('textUnderline').checked=!!o.underline;$('textOverline').checked=!!o.overline;$('textStrike').checked=!!o.strike;$('textFrame').checked=!!o.frame;$('textPosX').value=mm(position?.x??o.x??0);$('textPosY').value=mm(position?.y??o.y??0);$('textModal').classList.remove('hidden');$('textContent').focus();}
  let editingTemplateTextId=null;
  function openTemplateTextDialog(element){
    const id=element?.getAttribute('data-template-text-id');if(!id)return;
    const stored=state.templateTextOverrides?.[state.titleForm]?.[id]||{};
    const saved=stored.source===element.getAttribute('data-template-source')?stored:{};
    const readAttr=(name,fallback)=>element.getAttribute(name)??fallback;
    const anchor=saved.anchor||readAttr('data-template-anchor','start');
    const slanted=typeof saved.slanted==='boolean'?saved.slanted:readAttr('data-template-slanted','false')==='true';
    const lettering=(saved.lettering)||((saved.font||readAttr('data-template-font','')).includes('type A')?(slanted?'A-S':'A-V'):(slanted?'B-S':'B-V'));
    const existing={
      text:saved.text??element.textContent??'',
      x:Number(saved.x??readAttr('data-template-x',0)),y:Number(saved.y??readAttr('data-template-y',0)),
      size:Number(saved.size??readAttr('data-template-size',2.5)),widthFactor:Number(saved.widthFactor??readAttr('data-template-width-factor',1)),font:saved.font||readAttr('data-template-font','GOST type B,Arial,sans-serif'),
      rotation:Number(saved.rotation??readAttr('data-template-rotation',0)),align:anchor==='middle'?'middle':anchor==='end'?'end':'start',
      color:saved.color||readAttr('data-template-color','#000000'),bold:typeof saved.bold==='boolean'?saved.bold:readAttr('data-template-bold','false')==='true',
      italic:typeof saved.italic==='boolean'?saved.italic:readAttr('data-template-italic','false')==='true',
      underline:!!saved.underline,overline:!!saved.overline,strike:!!saved.strike,letterSpacing:Number(saved.letterSpacing)||0,lettering
    };
    editingTemplateTextId=id;openTextDialog(existing,existing);editingTemplateTextId=id;
    $('textModalTitle').textContent='Редактирование текста шаблона';
  }
  function closeTextDialog(){ $('textModal').classList.add('hidden'); editingTextId=null; editingTemplateTextId=null; }
  function editDrawingAnnotationText(o){
    if(!o)return;
    if(o.type==='text'||o.type==='techReq'){openTextDialog(o,o);return;}
    if(o.type==='table'){
      const cells=Array.isArray(o.cells)?o.cells:[];
      const current=Array.from({length:(o.rows||1)},(_,r)=>Array.from({length:(o.cols||1)},(_,c)=>cells[r*(o.cols||1)+c]||'').join('\t')).join('\n');
      const changed=prompt('Текст таблицы: столбцы разделяйте Tab, строки — Enter',current);if(changed===null)return;
      const rows=changed.split(/\r?\n/).map(line=>line.split('\t'));
      const next=Array((o.rows||1)*(o.cols||1)).fill('');rows.slice(0,o.rows||1).forEach((row,r)=>row.slice(0,o.cols||1).forEach((v,c)=>next[r*(o.cols||1)+c]=v));
      commit();o.cells=next;renderAll();setMessage('Текст ячеек таблицы изменён');return;
    }
    const key=['roughness','section','dimension'].includes(o.type)?'label':'text';
    const fallback=o.type==='roughness'?'Ra 3,2':o.type==='section'?'А':'';
    const changed=prompt('Новое содержимое:',o[key]??fallback);if(changed===null)return;
    commit();o[key]=changed;renderAll();setMessage('Содержимое обозначения изменено');
  }
  function applyTextDialog(){
    const value=textValuesFromForm();if(!value.text.trim()&&!editingTemplateTextId){setMessage('Введите текст надписи');$('textContent').focus();return;}
    value.x=mm($('textPosX').value);value.y=mm($('textPosY').value);
    if(editingTemplateTextId){
      const id=editingTemplateTextId,form=state.titleForm||'user-template';commit();
      state.templateTextOverrides[form]=state.templateTextOverrides[form]||{};
      state.templateTextOverrides[form][id]={source:document.querySelector(`#templateLayer [data-template-text-id=\"${id}\"]`)?.getAttribute('data-template-source')??'',text:value.text,x:value.x,y:value.y,size:value.size,widthFactor:value.widthFactor,font:value.font,color:value.color,rotation:value.rotation,anchor:(value.align==='middle'||value.align==='center')?'middle':value.align==='end'?'end':'start',slanted:String(value.lettering||'B-S').endsWith('S'),lettering:value.lettering,bold:value.bold,italic:value.italic,underline:value.underline,overline:value.overline,strike:value.strike,letterSpacing:value.letterSpacing};
      state.dirty=true;renderTemplate();renderAll();$('saveState').textContent='Є незбережені зміни';persistAutosave();setMessage('Текст шаблона и его оформление обновлены');closeTextDialog();return;
    }
    value.layer='annotation';if(editingTextId){const target=state.objects.find(o=>o.id===editingTextId);if(target){commit();Object.assign(target,value);renderAll();setMessage('Текст и его оформление обновлены');}}else addObject({type:'text',...value});closeTextDialog();
  }
  function dimensionLabelBasePosition(o){
    const textSize=clamp(Number(o.textSize)||state.gost.dimensionTextHeight||state.gost.textHeight||5,1.8,20),kind=o.kind||'linear';
    if(kind==='radius'||kind==='diameter'){
      const cx=Number(o.x),cy=Number(o.y),dx=Number(o.x2)-cx,dy=Number(o.y2)-cy,r=Math.hypot(dx,dy);if(!Number.isFinite(r)||r<.01)return{x:cx,y:cy};
      const ux=dx/r,uy=dy/r,nx=-uy,ny=ux,offset=textSize*(kind==='diameter'?.85:.75)+1;
      return kind==='diameter'?{x:cx-nx*offset,y:cy-ny*offset}:{x:(cx+Number(o.x2))/2-nx*offset,y:(cy+Number(o.y2))/2-ny*offset};
    }
    if(kind==='angular'){
      const vx=Number(o.x),vy=Number(o.y),aStart=Math.atan2(Number(o.y2)-vy,Number(o.x2)-vx),aEnd=Math.atan2(Number(o.y3)-vy,Number(o.x3)-vx);let delta=(aEnd-aStart+Math.PI*2)%(Math.PI*2),start=aStart,end=aEnd;if(delta>Math.PI){delta=Math.PI*2-delta;start=aEnd;end=aStart;}const mid=start+delta/2,rr=clamp(Number(o.radius)||12,2,1000)+textSize*.8+1.5;return{x:vx+Math.cos(mid)*rr,y:vy+Math.sin(mid)*rr};
    }
    const x1=Number(o.x),y1=Number(o.y),x2=Number(o.x2),y2=Number(o.y2),dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(!Number.isFinite(len)||len<.01)return{x:x1,y:y1};
    const rawOffset=Number.isFinite(Number(o.offset))?Number(o.offset):10,off=(Math.sign(rawOffset)||1)*Math.max(10,Math.abs(rawOffset));let ax,ay,bx,by,labelNx,labelNy;
    if(kind==='horizontal'){const side=off>=0?1:-1,base=side>0?Math.max(y1,y2):Math.min(y1,y2),dimY=base+side*Math.abs(off);ax=x1;bx=x2;ay=by=dimY;labelNx=0;labelNy=side;}
    else if(kind==='vertical'){const side=off>=0?1:-1,base=side>0?Math.max(x1,x2):Math.min(x1,x2),dimX=base+side*Math.abs(off);ax=bx=dimX;ay=y1;by=y2;labelNx=1;labelNy=0;}
    else{const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;ax=x1+nx*off;ay=y1+ny*off;bx=x2+nx*off;by=y2+ny*off;const rotation=Math.atan2(uy,ux)*180/Math.PI;if(rotation>90||rotation<-90){labelNx=-nx;labelNy=-ny;}else{labelNx=nx;labelNy=ny;}}
    const labelOffset=textSize*.75+1;return{x:(ax+bx)/2-labelNx*labelOffset,y:(ay+by)/2-labelNy*labelOffset};
  }
  function beginDimensionLabelDrag(e,id){
    const o=state.objects.find(x=>x.id===id&&x.type==='dimension');if(!o||o.locked)return;
    const group=e.target.closest?.('.drawing-object[data-id]'),label=group?.querySelector('[data-dimension-label]'),base=dimensionLabelBasePosition(o),rendered=label?{x:Number(label.getAttribute('x')),y:Number(label.getAttribute('y'))-(Number(o.textSize)||state.gost.dimensionTextHeight||state.gost.textHeight||5)*.08}:null;
    const labelDx=rendered&&Number.isFinite(rendered.x)?mm(rendered.x-base.x):(Number(o.labelDx)||0),labelDy=rendered&&Number.isFinite(rendered.y)?mm(rendered.y-base.y):(Number(o.labelDy)||0);
    state.dimensionLabelDrag={id,start:pointFromEvent(e,true),labelDx,labelDy,historyBefore:snapshot()};
    e.preventDefault();e.stopPropagation();try{svg.setPointerCapture(e.pointerId);}catch(_){}
  }
  function eraseObjectAtEvent(e){
    const target=e.target.closest?.('.drawing-object[data-id]');if(!target)return false;
    const id=target.getAttribute('data-id'),o=state.objects.find(x=>x.id===id);if(!o||o.locked)return false;
    if(state.erasing?.seen.has(id))return false;
    if(!state.erasing)state.erasing={seen:new Set(),historyBefore:snapshot()};
    state.erasing.seen.add(id);state.objects=state.objects.filter(x=>x.id!==id);state.selectedIds=state.selectedIds.filter(x=>x!==id);renderAll();return true;
  }
  function beginDimensionExtensionDrag(e,id,end){
    const object=state.objects.find(o=>o.id===id);
    if(!object||object.type!=='dimension'||object.locked)return;
    const spec=dimensionExtensionSpec(object,end);if(!spec)return;
    state.selectedIds=[id];
    state.dimensionExtensionDrag={id,end,field:dimensionExtensionField(end),base:deep(spec.base),axis:deep(spec.axis),spec:deep(spec),pointerStart:pointFromEvent(e,true),originalValue:spec.value,pointerId:e.pointerId,historyBefore:snapshot(),changed:false};
    e.preventDefault();e.stopPropagation();
    try{svg.setPointerCapture(e.pointerId);}catch(_){}
    drawingArea.classList.add('moving-dimension-extension');
    setMessage(`Перетаскивается только ${end==='start'?'первая':'вторая'} ножка размера. Противоположная ножка останется на месте.`);
  }
  function beginDimensionExtensionGapDrag(e,id,end){
    const object=state.objects.find(o=>o.id===id);
    if(!object||object.type!=='dimension'||object.locked)return;
    const spec=dimensionExtensionGapSpec(object,end);if(!spec)return;
    state.selectedIds=[id];
    state.dimensionExtensionDrag={id,end,part:'front',field:dimensionExtensionGapField(end),origin:deep(spec.origin),axis:deep(spec.axis),max:spec.max,spec:deep(spec),pointerStart:pointFromEvent(e,true),originalValue:spec.value,pointerId:e.pointerId,historyBefore:snapshot(),changed:false};
    e.preventDefault();e.stopPropagation();
    try{svg.setPointerCapture(e.pointerId);}catch(_){}
    drawingArea.classList.add('moving-dimension-extension');
    setMessage(`Тяни зелёную ручку ${end==='start'?'первой':'второй'} ножки: к детали — зазор уменьшается, от детали — увеличивается. Вторая ножка не меняется.`);
  }
  function onCanvasPointerDown(e){
    if(state.pendingPolarCenter&&e.button===0){const p=pointFromEvent(e,true);state.pendingPolarCenter=false;setPolarCenter(p);$('polarArrayModal').classList.remove('hidden');setMessage(`Центр массива выбран: X ${p.x.toFixed(2)} мм · Y ${p.y.toFixed(2)} мм`);e.preventDefault();return;}
    if(e.button===1||e.button===2||state.space){
      // Middle-button, right-button and Space+left drag pan the sheet. Capture
      // at the viewport before SVG tools can select, draw or edit an object.
      e.preventDefault();e.stopPropagation();
      state.pan={x:e.clientX,y:e.clientY,originX:state.viewPan.x,originY:state.viewPan.y,pointerId:e.pointerId,button:e.button,moved:false};
      drawingArea.classList.add('dragging');
      try{drawingArea.setPointerCapture(e.pointerId);}catch(_){try{svg.setPointerCapture(e.pointerId);}catch(__){}}
      return;
    }
    if(state.tool==='straightCut'&&e.button===0){
      const p=pointFromEvent(e,true),width=Number($('cutoutNotchWidth').value);
      if(!Number.isFinite(width)||width<=0){setMessage('Задай положительную ширину проходного выреза');return;}
      state.straightCutDraft={start:p,current:p,pointerId:e.pointerId,width,mode:$('straightCutMode')?.value||'noBottom'};
      previewLayer.innerHTML='';e.preventDefault();e.stopPropagation();
      try{svg.setPointerCapture(e.pointerId);}catch(_){}
      setMessage(`Проведи прямой проход под любым углом и отпусти в нужной точке. Ширина ${mm(width)} мм.`);return;
    }
    if(state.duplicatePlacement&&e.button===0){const p=pointFromEvent(e,true);state.duplicatePlacement.cursor=p;state.duplicatePlacement.dragging=true;renderDuplicatePreview(p);e.preventDefault();e.stopPropagation();try{svg.setPointerCapture(e.pointerId);}catch(_){}return;}if(state.tool==='eraser'){state.erasing={seen:new Set(),historyBefore:snapshot()};eraseObjectAtEvent(e);e.preventDefault();return;}
    const extensionGapHandle=e.target.closest?.('[data-dimension-extension-gap-handle]');if(extensionGapHandle&&state.tool==='select'){const objGroup=extensionGapHandle.closest('.drawing-object[data-id]');if(objGroup){beginDimensionExtensionGapDrag(e,objGroup.getAttribute('data-id'),extensionGapHandle.getAttribute('data-dimension-extension-gap-handle'));return;}}
    const extensionHandle=e.target.closest?.('[data-dimension-extension-handle]');if(extensionHandle&&state.tool==='select'){const objGroup=extensionHandle.closest('.drawing-object[data-id]');if(objGroup){beginDimensionExtensionDrag(e,objGroup.getAttribute('data-id'),extensionHandle.getAttribute('data-dimension-extension-handle'));return;}}
    const labelHandle=e.target.closest?.('[data-dimension-label-handle]');if(labelHandle&&state.tool==='select'){const objGroup=labelHandle.closest('.drawing-object[data-id]');if(objGroup){beginDimensionLabelDrag(e,objGroup.getAttribute('data-id'));return;}}
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
    if(state.tool==='moveFace'&&e.button===0){
      const raw=pointFromEvent(e,true),face=findEditableFaceAt(raw);
      if(!face){setMessage('Наведите курсор ближе к стороне замкнутого многоугольника или обычного прямоугольника');return;}
      const object=face.object;
      state.selectedIds=[object.id];state.faceSelection={id:object.id,edgeIndex:face.hit.edgeIndex};
      const normal=faceNormal(face.points,face.hit.edgeIndex);
      state.faceDrag={id:object.id,edgeIndex:face.hit.edgeIndex,sourcePoints:deep(face.points),originalObject:deep(object),normal,start:raw,pointerId:e.pointerId,historyBefore:snapshot(),valid:false,validOffset:0};
      $('polygonFaceOffset').value='0';renderAll();e.preventDefault();e.stopPropagation();
      try{svg.setPointerCapture(e.pointerId);}catch(_){}
      drawingArea.classList.add('moving-face');setMessage(`Выбрана грань ${face.hit.edgeIndex+1}. Перетащите её; Shift — шаг 0,5 мм. Можно ввести точное смещение слева.`);return;
    }
    if(state.tool==='split'){const raw=pointFromEvent(e,true),clickedId=target?.getAttribute('data-id')||null;applySplitTool(raw,clickedId);return;}
    if(state.tool==='cutout'||state.tool==='cutoutNoWalls'||state.tool==='cutoutNoBottom'){
      const p=pointFromEvent(e),clickedId=target?.getAttribute('data-id')||null;
      const mode=state.tool==='cutoutNoWalls'?'noWalls':state.tool==='cutoutNoBottom'?'noBottom':'walls';
      applyEdgeCutout(p,clickedId,mode);return;
    }
    if(state.tool==='cutoutInner'){placeInnerCutout(pointFromEvent(e));return;}
    if(state.tool==='selectRegion'){selectRegionAtPoint(pointFromEvent(e,true));return;}
    if(state.tool==='hatch'){hatchRegionAtPoint(pointFromEvent(e,true));return;}
    if(state.tool==='select'){
      if(target){const id=target.getAttribute('data-id'),hitObj=state.objects.find(o=>o.id===id),group=hitObj?.groupId?state.objects.filter(o=>o.groupId===hitObj.groupId):[hitObj],groupIds=group.filter(Boolean).map(o=>o.id);if(e.shiftKey){const allSelected=groupIds.every(gid=>state.selectedIds.includes(gid));state.selectedIds=allSelected?state.selectedIds.filter(x=>!groupIds.includes(x)):[...new Set([...state.selectedIds,...groupIds])];}else if(!groupIds.every(gid=>state.selectedIds.includes(gid)))state.selectedIds=groupIds;renderAll();const objs=getSelected().filter(o=>!o.locked&&!(o.type==='reference'&&o.locked));if(objs.length)state.drag={ids:objs.map(o=>o.id),start:pointFromEvent(e),originals:deep(objs),historyBefore:snapshot(),moved:false};else setMessage('Выбранные объекты заблокированы');}
      else{if(!e.shiftKey)state.selectedIds=[];state.selectionRect={start:pointFromEvent(e,true),current:pointFromEvent(e,true),initial:[...state.selectedIds]};renderAll();}return;
    }
    const p=pointFromEvent(e);if(state.tool==='ruler'){state.points.push(p);if(state.points.length===1){setMessage('Укажите конец линейки');return;}const a=state.points[0],b=p;state.points=[];if(Math.hypot(b.x-a.x,b.y-a.y)<1){previewLayer.innerHTML='';setMessage('Линейка слишком короткая');return;}previewLayer.innerHTML='';commit();state.ruler={a:deep(a),b:deep(b)};renderRuler();setMessage('Линейка установлена. Выберите параллельную или перпендикулярную привязку');return;}if(state.tool==='freehand'){state.freehandDraft=[pointFromEvent(e,true)];previewLayer.innerHTML='';try{svg.setPointerCapture(e.pointerId);}catch(_){}return;}if(state.tool==='point'){addObject({type:'point',x:p.x,y:p.y,size:.7});return;}
    if(state.tool==='techReq'){const value=prompt('Технические требования (каждая строка — отдельный пункт):','1. Неуказанные радиусы 2 мм.\n2. Острые кромки притупить.');if(value!==null&&value.trim())addObject({type:'techReq',x:p.x,y:p.y,text:value,size:clamp(Number($('defaultTextSize').value)||5,.5,50),lineHeight:4,layer:'annotation'});return;}
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
      state.points.push(p);if(state.points.length<3){setMessage(`Точка ${state.points.length+1} выноски`);return;}
      const label=prompt('Текст выноски:','Примечание');
      if(label&&label.trim()){
        const choice=prompt('Окончание выноски по ГОСТ 2.316-2008:\n1 — стрелка (к контуру / поверхности)\n2 — точка (к участку изображения)\n3 — без маркера (от другой линии)','1');
        if(choice!==null){const termination=String(choice).trim()==='2'?'dot':String(choice).trim()==='3'?'none':'arrow';addObject({type:'leader',points:deep(state.points),text:label.trim(),termination,layer:'annotation'});}
      }
      state.points=[];previewLayer.innerHTML='';return;
    }
    if(state.tool==='arc'){
      state.points.push(p);if(state.points.length<3){setMessage(['Укажите центр дуги','Укажите начальную точку дуги','Укажите конечную точку дуги'][state.points.length]);return;}const [c,s,t]=state.points,r=Math.hypot(s.x-c.x,s.y-c.y);if(r>.1)addObject({type:'arc',x:c.x,y:c.y,r,start:Math.atan2(s.y-c.y,s.x-c.x),end:Math.atan2(t.y-c.y,t.x-c.x),layer:'geometry'});state.points=[];return;
    }
    if(state.tool==='arc3'){
      state.points.push(p);
      if(state.points.length<3){setMessage(state.points.length===1?'Укажите точку, через которую должна пройти дуга':'Укажите конечную точку дуги');return;}
      const [start,through,end]=state.points;state.points=[];previewLayer.innerHTML='';
      try{const curve=arcThroughThreePoints(start,through,end);addObject({type:'arc',x:curve.center.x,y:curve.center.y,r:curve.radius,start:curve.startAngle,end:curve.endAngle,layer:'geometry',constructedBy:'three-points'});}
      catch(error){setMessage(error?.message||'Не удалось построить дугу по трём точкам');}
      return;
    }
    if(state.tool==='dimAngle'){
      state.points.push(p);if(state.points.length<3){setMessage(`Точка ${state.points.length+1} углового размера`);return;}const [v,a,b]=state.points;addObject({type:'dimension',kind:'angular',x:v.x,y:v.y,x2:a.x,y2:a.y,x3:b.x,y3:b.y,radius:12,textSize:state.gost.dimensionTextHeight||7,textOrientation:'horizontal',extensionGap:1,extensionBeyond:2,labelDx:0,labelDy:0,layer:'annotation'});state.points=[];return;
    }
    if(state.tool==='polygon'){
      state.points.push(p);if(state.points.length<2){setMessage('Укажите центр и размер многоугольника');return;}
      const [c,rp]=state.points,pickedRadius=Math.hypot(rp.x-c.x,rp.y-c.y),n=clamp(Number($('polygonSides').value)||6,3,24),a0=Math.atan2(rp.y-c.y,rp.x-c.x),mode=$('polygonMode')?.value||'circumradius',measured=mode==='acrossFlats'?pickedRadius*2:pickedRadius;
      const pts=regularPolygonVertices(c,n,measured,{mode,angle:a0}).map(q=>({x:mm(q.x),y:mm(q.y)}));
      addObject({type:'polyline',points:pts,closed:true,layer:'geometry',polygonSizeMode:mode,polygonMeasuredSize:mm(measured)});state.points=[];setMessage(mode==='acrossFlats'?`Правильный многоугольник построен по размеру между гранями: ${measured.toFixed(2)} мм`:mode==='inradius'?`Правильный многоугольник построен по апофеме: ${pickedRadius.toFixed(2)} мм`:`Правильный многоугольник построен по радиусу до вершины: ${pickedRadius.toFixed(2)} мм`);return;
    }
    if(state.tool==='star6'){
      state.points.push(p);
      if(state.points.length<2){setMessage('Укажите центр шестиконечной звезды, затем радиус до вершины');return;}
      const [center,edge]=state.points;state.points=[];previewLayer.innerHTML='';
      const radius=Math.hypot(edge.x-center.x,edge.y-center.y);
      if(radius<.1){setMessage('Радиус звезды должен быть больше 0,1 мм');return;}
      const angle=Math.atan2(edge.y-center.y,edge.x-center.x),points=sixPointStarOutline(center,radius,{angle}).map(q=>({x:mm(q.x),y:mm(q.y)}));
      const before=snapshot(),created={id:newId(),type:'polyline',name:'Шестиконечная звезда',points,closed:true,layer:'geometry',color:'#20252a',width:state.gost.mainLine,starOutline:true};
      state.objects.push(created);state.selectedIds=[created.id];commit(before);renderAll();setMessage('Шестиконечная звезда создана одним замкнутым контуром без внутренних линий');return;
    }
    if(state.tool==='trim'){
      const clickedId=target?.getAttribute('data-id')||null;
      const subject=(clickedId&&state.objects.find(o=>o.id===clickedId))||
        (state.selectedIds.length===1&&state.objects.find(o=>o.id===state.selectedIds[0]));
      if(!subject){setMessage('Щёлкните по отрезку, дуге, окружности или замкнутому контуру, который нужно усечь');return;}
      const result=trimLegacyCurve(subject,pointFromEvent(e,true),state.objects,{hitTolerance:Math.max(.4,8/Math.max(.2,state.zoom)),makeId:newId});
      if(!result.ok){setMessage(result.reason||'Не удалось усечь объект');return;}
      commit();state.objects=state.objects.filter(o=>!result.remove.includes(o.id));state.objects.push(...result.add);state.selectedIds=result.add.map(o=>o.id);renderAll();
      setMessage(`Усечение выполнено: создано частей ${result.add.length}. Можно продолжать на других объектах.`);return;
    }
    if(!state.points.length){state.points=[p];setMessage('Укажите вторую точку');return;}
    const a=state.points[0];state.points=[];previewLayer.innerHTML='';const len=Math.hypot(p.x-a.x,p.y-a.y);if(len<.05)return;
    if(state.tool==='line')addObject({type:'line',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='xline')addObject({type:'xline',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'construction',lineRole:'thin',dash:'6 3'});
    else if(state.tool==='ray')addObject({type:'ray',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'construction',lineRole:'thin',dash:'6 3'});
    else if(state.tool==='construction')addObject({type:'construction',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'construction',dash:'3 2'});
    else if(state.tool==='centerline')addObject({type:'centerline',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'construction',dash:GOST_LINE_PATTERNS.dashDotThin});
    else if(state.tool==='rect')addObject({type:'rect',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='roundRect')addObject({type:'rect',x:a.x,y:a.y,x2:p.x,y2:p.y,rx:clamp(Number($('roundingRadius').value)||0,0,Math.min(Math.abs(p.x-a.x),Math.abs(p.y-a.y))/2)});
    else if(state.tool==='circle'){const factor=$('circleInputMode')?.value === 'diameter' ? 0.5 : 1;addObject({type:'circle',x:a.x,y:a.y,x2:mm(a.x+(p.x-a.x)*factor),y2:mm(a.y+(p.y-a.y)*factor)});}
    else if(state.tool==='ellipse')addObject({type:'ellipse',x:a.x,y:a.y,x2:p.x,y2:p.y});
    else if(state.tool==='breakline')addObject({type:'breakline',points:[a,p]});
    else if(state.tool==='section'){
      const direction=prompt('Направление взгляда для разреза:\n1 — со стороны слева от линии от первой точки ко второй\n2 — со стороны справа','1');
      if(direction!==null)addObject({type:'section',x:a.x,y:a.y,x2:p.x,y2:p.y,label:'А',viewSide:String(direction).trim()==='2'?-1:1,layer:'annotation'});
    }
    else if(state.tool==='hatch')addObject({type:'hatch',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:'annotation',spacing:clamp(Number($('hatchSpacing').value)||3,.5,100),angle:hatchAngleValue(),pattern:$('hatchPattern').value,width:clamp(Number($('hatchWidth').value)||state.gost.thinLine,.05,1),color:$('hatchColor').value||'#20252a'});
    else if(['dimension','dimAuto','dimH','dimV','dimRad','dimDia'].includes(state.tool)){
      const kind=state.tool==='dimAuto'?(Math.abs(p.x-a.x)>=Math.abs(p.y-a.y)*2?'horizontal':Math.abs(p.y-a.y)>=Math.abs(p.x-a.x)*2?'vertical':'linear'):state.tool==='dimH'?'horizontal':state.tool==='dimV'?'vertical':state.tool==='dimRad'?'radius':state.tool==='dimDia'?'diameter':'linear';
      const requestedOffset=Number($('dimensionOffset').value),offsetSign=requestedOffset<0?-1:1,offset=offsetSign*Math.max(10,Math.abs(Number.isFinite(requestedOffset)?requestedOffset:10));
      if(Math.abs(requestedOffset||0)<10)setMessage('Для стандартного оформления отступ от контуру установлен не менее 10 мм');
      addObject({type:'dimension',kind,x:a.x,y:a.y,x2:p.x,y2:p.y,offset:Number.isFinite(offset)?offset:10,textSize:state.gost.dimensionTextHeight||7,arrowPlacement:'auto',textOrientation:'horizontal',extensionGap:1,extensionBeyond:2,labelDx:0,labelDy:0,layer:'annotation'});
    }
  }
  function finishPath(){if((state.tool==='polyline'||state.tool==='spline')&&state.points.length>=2){addObject({type:state.tool==='spline'?'spline':'polyline',points:deep(state.points),closed:false});state.points=[];previewLayer.innerHTML='';}else if(state.tool==='polyline'||state.tool==='spline'){state.points=[];previewLayer.innerHTML='';setMessage('Нужно минимум две точки');}}
  function updatePolygonFaceDrag(point,shiftKey=false){
    const drag=state.faceDrag;if(!drag)return;
    let offset=(point.x-drag.start.x)*drag.normal.x+(point.y-drag.start.y)*drag.normal.y;
    if(shiftKey)offset=Math.round(offset/.5)*.5;
    offset=Number(offset.toFixed(4));
    const result=moveClosedPolylineEdge(drag.sourcePoints,drag.edgeIndex,offset);
    if(!result.ok){setMessage(result.reason||'Нельзя переместить выбранную грань');return;}
    const object=state.objects.find(o=>o.id===drag.id);if(!object)return;
    Object.assign(object,deep(drag.originalObject));
    if(Math.abs(offset)>1e-6)setEditablePolygonFacePoints(object,result.points);
    drag.valid=Math.abs(offset)>1e-6;drag.validOffset=offset;
    state.faceSelection={id:drag.id,edgeIndex:drag.edgeIndex};
    $('polygonFaceOffset').value=offset.toFixed(2);renderAll();
    setMessage(`Грань ${drag.edgeIndex+1}: смещение ${offset>0?'+':''}${offset.toFixed(2)} мм${shiftKey?' · шаг 0,5 мм':''}`);
  }
  function onPointerMove(e){const raw=pointFromEvent(e,true),p=pointFromEvent(e);$('coordinates').textContent=`X: ${p.x.toFixed(2)} · Y: ${p.y.toFixed(2)} мм`;
    if(state.pan){if(state.pan.pointerId!==undefined&&e.pointerId!==state.pan.pointerId)return;const dx=e.clientX-state.pan.x,dy=e.clientY-state.pan.y;if(Math.hypot(dx,dy)>2)state.pan.moved=true;state.viewPan.x=state.pan.originX+dx;state.viewPan.y=state.pan.originY+dy;svg.style.transform=`translate(${state.viewPan.x}px, ${state.viewPan.y}px)`;return;}
    if(state.faceDrag){if(state.faceDrag.pointerId!==undefined&&e.pointerId!==state.faceDrag.pointerId)return;updatePolygonFaceDrag(raw,e.shiftKey);return;}
    if(state.tool==='moveFace'){renderFaceHover(findEditableFaceAt(raw));return;}
    if(state.straightCutDraft){if(state.straightCutDraft.pointerId!==undefined&&e.pointerId!==state.straightCutDraft.pointerId)return;state.straightCutDraft.current=raw;renderStraightPassPreview();return;}
    if(state.duplicatePlacement){state.duplicatePlacement.cursor=raw;renderDuplicatePreview(raw);return;}
    if(state.erasing){eraseObjectAtEvent(e);return;}
    if(state.dimensionExtensionDrag){const d=state.dimensionExtensionDrag;if(d.pointerId!==undefined&&e.pointerId!==d.pointerId)return;const o=state.objects.find(x=>x.id===d.id);if(o){const value=d.part==='front'?dimensionExtensionGapFromDrag(d.spec,raw,d.pointerStart,d.originalValue,0,d.max):dimensionExtensionFromDrag(d.spec,raw,d.pointerStart,d.originalValue,0,Infinity);if(value===null)return;o[d.field]=mm(value);d.changed=Math.abs(value-d.originalValue)>.001;renderAll();setMessage(d.part==='front'?`Начало ${d.end==='start'?'первой':'второй'} ножки: зазор ${value.toFixed(1)} мм · противоположная ножка не меняется`:`Продолжение ${d.end==='start'?'первой':'второй'} ножки: ${value.toFixed(1)} мм · противоположная не меняется`);}return;}
    if(state.dimensionLabelDrag){const d=state.dimensionLabelDrag,o=state.objects.find(x=>x.id===d.id);if(o){o.labelDx=mm(d.labelDx+raw.x-d.start.x);o.labelDy=mm(d.labelDy+raw.y-d.start.y);o.labelManualPositioned=true;renderAll();}return;}
    if(state.rotateDrag){applyRotateDrag(raw,e.shiftKey);return;}
    if(state.resize){applyResize(raw,e.shiftKey);return;}
    if(state.drag){const dx=p.x-state.drag.start.x,dy=p.y-state.drag.start.y;if(Math.abs(dx)+Math.abs(dy)>.03){state.drag.moved=true;state.drag.ids.forEach((id,i)=>{const o=state.objects.find(x=>x.id===id);if(o){Object.assign(o,deep(state.drag.originals[i]));translateObject(o,dx,dy);}});renderAll();}return;}
    if(state.selectionRect){state.selectionRect.current=raw;drawPreview(raw);return;}
    if(state.freehandDraft){const last=state.freehandDraft[state.freehandDraft.length-1];if(Math.hypot(raw.x-last.x,raw.y-last.y)>=.25)state.freehandDraft.push(raw);previewLayer.innerHTML='';const path=add(previewLayer,'path',{d:smoothPath(state.freehandDraft,Number($('freehandSmooth').value)||0),fill:'none',stroke:'#078db2','stroke-width':clamp(Number($('freehandWidth').value)||state.gost.thinLine,.05,3),'stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':'1 0'});return;}
    if(state.points.length||state.splitPending)drawPreview(p);
  }
  function finishPan(pointerId=null){if(!state.pan||(pointerId!==null&&state.pan.pointerId!==pointerId))return false;state.pan=null;drawingArea.classList.remove('dragging');state.dirty=true;$('saveState').textContent='Изменён вид чертежа';persistAutosave();return true;}
  function onPointerUp(e){if(state.pan){if(e&&state.pan.pointerId!==e.pointerId)return;const pan=state.pan;finishPan(e?.pointerId??null);if(pan.button===2&&!pan.moved&&(state.tool==='polyline'||state.tool==='spline'))finishPath();return;}if(state.dimensionExtensionDrag){const drag=state.dimensionExtensionDrag;if(e&&drag.pointerId!==e.pointerId)return;state.dimensionExtensionDrag=null;drawingArea.classList.remove('moving-dimension-extension');if(e?.type==='pointercancel'){restore(drag.historyBefore);setMessage('Изменение ножки отменено');return;}if(drag.changed){recordHistory(drag.historyBefore);setMessage(`${drag.part==='front'?'Начало':'Продолжение'} ${drag.end==='start'?'первой':'второй'} ножки изменено отдельно`);}else setMessage('Длина ножки не изменена');renderAll();return;}if(state.faceDrag){if(e&&state.faceDrag.pointerId!==e.pointerId)return;const drag=state.faceDrag;state.faceDrag=null;drawingArea.classList.remove('moving-face');if(e?.type==='pointercancel'){const object=state.objects.find(o=>o.id===drag.id);if(object)Object.assign(object,deep(drag.originalObject));renderAll();setMessage('Перемещение грани отменено');return;}if(drag.valid)recordHistory(drag.historyBefore);else{const object=state.objects.find(o=>o.id===drag.id);if(object)Object.assign(object,deep(drag.originalObject));}renderAll();setMessage(drag.valid?`Грань перемещена на ${drag.validOffset.toFixed(2)} мм`:'Грань выбрана. Введите точное смещение и нажмите «Применить»');return;}if(state.straightCutDraft){if(e&&state.straightCutDraft.pointerId!==e.pointerId)return;const draft=state.straightCutDraft;state.straightCutDraft=null;if(e?.type==='pointercancel'){previewLayer.innerHTML='';setMessage('Прямой проход отменён');return;}applyStraightPassCut(draft.start,pointFromEvent(e,true),draft.width,draft.mode);return;}if(state.duplicatePlacement?.dragging){const cursor=state.duplicatePlacement.cursor||state.duplicatePlacement.anchor;finishDuplicatePlacement(cursor);return;}if(state.erasing){const r=state.erasing;state.erasing=null;if(r.seen.size)recordHistory(r.historyBefore);setMessage(r.seen.size?`Стерто объектов: ${r.seen.size}`:'Объектов под ластиком нет');renderAll();return;}if(state.dimensionLabelDrag){const r=state.dimensionLabelDrag;state.dimensionLabelDrag=null;const o=state.objects.find(x=>x.id===r.id);if(o&&(Math.abs(o.labelDx-r.labelDx)>.001||Math.abs(o.labelDy-r.labelDy)>.001))recordHistory(r.historyBefore);renderAll();setMessage('Положение размерного числа изменено');return;}if(state.freehandDraft){const pts=state.freehandDraft;state.freehandDraft=null;previewLayer.innerHTML='';if(pts.length>1){const smooth=Number($('freehandSmooth').value)||0;addObject({type:'freehand',points:deep(pts),smooth,layer:'geometry',width:clamp(Number($('freehandWidth').value)||state.gost.thinLine,.05,3)});}else setMessage('Свободная линия слишком короткая');return;}if(state.rotateDrag){const r=state.rotateDrag;state.rotateDrag=null;drawingArea.classList.remove('rotating');if(Math.abs(r.delta)>.0001){recordHistory(r.historyBefore);setMessage(`Поворот завершён: ${(r.delta*180/Math.PI).toFixed(1)}°`);}else setMessage('Поворот отменён');renderAll();return;}if(state.resize){const r=state.resize;state.resize=null;drawingArea.classList.remove('resizing');const changed=JSON.stringify(r.originals)!==JSON.stringify(r.ids.map(id=>state.objects.find(o=>o.id===id)).filter(Boolean));if(changed)recordHistory(r.historyBefore);renderAll();setMessage(changed?'Размер выбранных объектов изменён':'Размер не изменён');return;}if(state.drag){if(state.drag.moved){recordHistory(state.drag.historyBefore);setMessage('Объекты перемещены');}state.drag=null;}if(state.selectionRect){const r=state.selectionRect,a=r.start,b=r.current||r.start,minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);const ids=state.objects.filter(o=>{const bb=objectBounds(o);return bb&&bb.x>=minX&&bb.y>=minY&&bb.x+bb.w<=maxX&&bb.y+bb.h<=maxY;}).map(o=>o.id);state.selectedIds=r.initial.concat(ids).filter((id,i,a)=>a.indexOf(id)===i);state.selectionRect=null;previewLayer.innerHTML='';renderAll();setMessage(`Выделено объектов: ${state.selectedIds.length}`);}}
  function intersectLines(a,b,c,d){const den=(a.x-b.x)*(c.y-d.y)-(a.y-b.y)*(c.x-d.x);if(Math.abs(den)<1e-8)return null;const t=((a.x-c.x)*(c.y-d.y)-(a.y-c.y)*(c.x-d.x))/den,u=-((a.x-b.x)*(a.y-c.y)-(a.y-b.y)*(a.x-c.x))/den;if(t<0||t>1||u<0||u>1)return null;return{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y),t};}
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
      if(o.holes)o.holes=o.holes.map(r=>r.map(p=>transformPoint(p,c,angle,scale,flip)));
      if(o.hatchSegments)o.hatchSegments=o.hatchSegments.map(s=>({a:transformPoint(s.a,c,angle,scale,flip),b:transformPoint(s.b,c,angle,scale,flip),angle:s.angle}));
      ['x','x2','x3'].forEach((k,i)=>{const yk=['y','y2','y3'][i];if(o[k]!==undefined&&o[yk]!==undefined){const p=transformPoint({x:o[k],y:o[yk]},c,angle,scale,flip);o[k]=p.x;o[yk]=p.y;}});
    }
    if(o.type==='dimension'&&rotating&&['horizontal','vertical'].includes(o.kind))o.kind='linear';
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
    if(o.holes)o.holes=o.holes.map(r=>r.map(reflect));
    if(o.hatchSegments)o.hatchSegments=o.hatchSegments.map(s=>({a:reflect(s.a),b:reflect(s.b),angle:s.angle}));
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

  function beginDuplicatePlacement(objects){
    const movable=objects.filter(o=>!o.locked&&!o.hidden);
    if(!movable.length){setMessage('Выбранные объекты заблокированы или скрыты');return false;}
    selectTool('select');
    state.duplicatePlacement={originals:deep(movable),anchor:selectionCenter(movable),historyBefore:snapshot(),cursor:null,dragging:false};
    previewLayer.innerHTML='';setMessage(`Дублирование: ${movable.length} объектов. Наведите курсор на место копии и щёлкните или перетащите.`);
    return true;
  }
  function renderDuplicatePreview(cursor){
    previewLayer.innerHTML='';const placement=state.duplicatePlacement;if(!placement||!cursor)return;
    const dx=mm(cursor.x-placement.anchor.x),dy=mm(cursor.y-placement.anchor.y);
    const wrapper=add(previewLayer,'g',{transform:`translate(${dx} ${dy})`,opacity:.68,'pointer-events':'none','data-editor-overlay':'true'});
    const nodes=[...svg.querySelectorAll('.drawing-object[data-id]')];
    for(const original of placement.originals){
      const source=nodes.find(node=>node.getAttribute('data-id')===original.id);if(!source)continue;
      const clone=source.cloneNode(true);clone.removeAttribute('data-id');
      clone.querySelectorAll('[data-editor-overlay]').forEach(el=>el.remove());
      clone.setAttribute('pointer-events','none');clone.setAttribute('aria-hidden','true');
      wrapper.appendChild(clone);
    }
  }
  function finishDuplicatePlacement(cursor){
    const placement=state.duplicatePlacement;if(!placement)return;
    const dx=mm(cursor.x-placement.anchor.x),dy=mm(cursor.y-placement.anchor.y),groupMap=new Map();
    const clones=placement.originals.map(original=>{
      const clone=deep(original);clone.id=newId();clone.name=original.name?`${original.name} копия`:'';
      if(original.groupId){if(!groupMap.has(original.groupId))groupMap.set(original.groupId,`group_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);clone.groupId=groupMap.get(original.groupId);}
      translateObject(clone,dx,dy);return clone;
    });
    state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);state.duplicatePlacement=null;previewLayer.innerHTML='';
    recordHistory(placement.historyBefore);renderAll();setMessage(`Создано копий: ${clones.length} · смещение X ${dx.toFixed(2)} мм, Y ${dy.toFixed(2)} мм`);
  }
  function offsetPolylineVertices(points, distance, closed=false){
    if(!Array.isArray(points)||points.length<2)return null;
    const source=points.map(p=>({x:Number(p.x),y:Number(p.y)}));
    if(source.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
    const count=source.length,edgeCount=closed?count:count-1,normals=[];
    for(let i=0;i<edgeCount;i++){const a=source[i],b=source[(i+1)%count],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1e-8)return null;normals.push({x:-dy/len,y:dx/len});}
    return source.map((p,i)=>{
      if(!closed&&(i===0||i===count-1)){const n=normals[i===0?0:normals.length-1];return{x:p.x+n.x*distance,y:p.y+n.y*distance};}
      const prev=normals[(i-1+normals.length)%normals.length],next=normals[i%normals.length],sx=prev.x+next.x,sy=prev.y+next.y,sl=Math.hypot(sx,sy);
      if(sl<1e-8)return{x:p.x+next.x*distance,y:p.y+next.y*distance};
      const mx=sx/sl,my=sy/sl,den=mx*next.x+my*next.y,miter=Math.abs(den)>0.12?distance/den:distance*Math.sign(distance||1)*8;
      const limited=clamp(miter,-Math.abs(distance)*8,Math.abs(distance)*8);
      return{x:p.x+mx*limited,y:p.y+my*limited};
    });
  }
  function lineLineFillet(a,b,radius){
    if(!a||!b||a.type!=='line'||b.type!=='line'||a.locked||b.locked)return null;
    const p={x:a.x,y:a.y},p2={x:a.x2,y:a.y2},q={x:b.x,y:b.y},q2={x:b.x2,y:b.y2};
    const d1={x:p2.x-p.x,y:p2.y-p.y},d2={x:q2.x-q.x,y:q2.y-q.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(d1,d2);
    if(Math.abs(den)<1e-8)return null;
    const qp={x:q.x-p.x,y:q.y-p.y},t=cross(qp,d2)/den,intersection={x:p.x+d1.x*t,y:p.y+d1.y*t};
    const nearest=(line)=>{const ds=Math.hypot(intersection.x-line.x,intersection.y-line.y),de=Math.hypot(intersection.x-line.x2,intersection.y-line.y2),key=ds<=de?'start':'end',point=key==='start'?{x:line.x,y:line.y}:{x:line.x2,y:line.y2},other=key==='start'?{x:line.x2,y:line.y2}:{x:line.x,y:line.y};return{key,point,other,length:Math.min(ds,de),available:Math.max(ds,de)};};
    const na=nearest(a),nb=nearest(b),unit=(v)=>{const l=Math.hypot(v.x,v.y)||1;return{x:v.x/l,y:v.y/l};},vectorPoint=n=>n.length<1e-6?n.other:n.point,u=unit({x:vectorPoint(na).x-intersection.x,y:vectorPoint(na).y-intersection.y}),v=unit({x:vectorPoint(nb).x-intersection.x,y:vectorPoint(nb).y-intersection.y});
    const cosine=clamp(u.x*v.x+u.y*v.y,-1,1),theta=Math.acos(cosine);
    if(theta<1e-4||Math.PI-theta<1e-4)return null;
    const tangent=radius/Math.tan(theta/2);if(!Number.isFinite(tangent)||tangent<=0||tangent>na.available+1e-6||tangent>nb.available+1e-6)return null;
    const bis=unit({x:u.x+v.x,y:u.y+v.y}),centerDistance=radius/Math.sin(theta/2),center={x:intersection.x+bis.x*centerDistance,y:intersection.y+bis.y*centerDistance};
    const ta={x:intersection.x+u.x*tangent,y:intersection.y+u.y*tangent},tb={x:intersection.x+v.x*tangent,y:intersection.y+v.y*tangent};
    const setEnd=(line,near,point)=>{if(near.key==='start'){line.x=point.x;line.y=point.y;}else{line.x2=point.x;line.y2=point.y;}};
    setEnd(a,na,ta);setEnd(b,nb,tb);
    let start=Math.atan2(ta.y-center.y,ta.x-center.x),end=Math.atan2(tb.y-center.y,tb.x-center.x),sweep=((end-start)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    if(sweep>Math.PI){const swap=start;start=end;end=swap;}
    return{type:'arc',x:center.x,y:center.y,r:radius,start,end,layer:'geometry',name:'Сопряжение'};
  }
  function applyAction(action){const objs=getSelected();
    if(action==='showAll'){if(state.objects.some(o=>o.hidden)){commit();state.objects.forEach(o=>o.hidden=false);renderAll();setMessage('Все скрытые объекты снова отображаются');}else setMessage('Нет скрытых объектов');return;}
    if(!objs.length){setMessage('Сначала выберите один или несколько объектов');return;}
    if(action==='centerMarks'){const circles=objs.filter(o=>o.type==='circle');if(!circles.length){setMessage('Выберите одну или несколько окружностей');return;}const before=snapshot(),created=circles.map(o=>({id:newId(),type:'centerMark',x:o.x,y:o.y,size:Math.min(8,Math.max(3,Math.hypot(o.x2-o.x,o.y2-o.y)*.35)),layer:'annotation'}));state.objects.push(...created);state.selectedIds=created.map(o=>o.id);recordHistory(before);renderAll();setMessage(`Добавлено обозначений центров: ${created.length}`);return;}
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
    if(action==='duplicate'){beginDuplicatePlacement(objs);return;}
    if(action==='rotate'){$('objectRotationAngle').focus();$('objectRotationAngle').select();setMessage('Введите угол в панели свойств и нажмите «Повернуть»; либо тяните круглую ручку над выделением.');return;}
    if(action==='mirror'){openMirrorDialog(objs);return;}
    if(action==='scale'){const k=Number(prompt('Коэффициент масштабирования:','2'));if(!Number.isFinite(k)||k<=0)return;commit();const c=selectionCenter(objs);objs.forEach(o=>transformObj(o,c,0,k));renderAll();setMessage(`Масштабирование ×${k} выполнено`);return;}
    if(action==='offset'){const dist=Number(prompt('Расстояние эквидистанты, мм:','2'));if(!Number.isFinite(dist)||!dist)return;commit();const clones=[];objs.filter(o=>!o.locked).forEach(o=>{const n=deep(o);n.id=newId();if(['line','construction','centerline'].includes(o.type)){const dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1,ox=-dy/len*dist,oy=dx/len*dist;translateObject(n,ox,oy);clones.push(n);}else if(o.type==='circle'){const old=Math.hypot(o.x2-o.x,o.y2-o.y),r=old+dist;if(r>0&&old>1e-8){n.x2=n.x+(o.x2-o.x)/old*r;n.y2=n.y+(o.y2-o.y)/old*r;clones.push(n);}}else if(o.type==='arc'){const r=Number(o.r)+dist;if(r>0){n.r=r;clones.push(n);}}else if(o.type==='polyline'||o.type==='spline'||o.type==='freehand'){const points=offsetPolylineVertices(o.points,dist,!!o.closed);if(points){n.type='polyline';n.points=points;clones.push(n);}}else if(o.type==='rect'){const sign=dist>0?1:-1;n.x-=sign*Math.abs(dist);n.y-=sign*Math.abs(dist);n.x2+=sign*Math.abs(dist);n.y2+=sign*Math.abs(dist);if(n.x2>n.x&&n.y2>n.y)clones.push(n);}});if(clones.length){state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);}renderAll();setMessage(`Эквидистанта создана: ${clones.length} из ${objs.length} объектов; поддерживаются отрезки, окружности, дуги, прямоугольники и ломаные`);return;}
    if(action==='fillet'||action==='chamfer'){const value=Number(prompt(action==='fillet'?'Радиус скругления, мм:':'Размер фаски, мм:','2'));if(!Number.isFinite(value)||value<=0)return;let changed=0;commit();if(action==='fillet'&&objs.length===2&&objs.every(o=>o.type==='line')){const arc=lineLineFillet(objs[0],objs[1],value);if(arc){arc.id=newId();state.objects.push(arc);state.selectedIds=[objs[0].id,objs[1].id,arc.id];changed=1;}}else{objs.forEach(o=>{if(o.type==='rect'){const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2);if(action==='fillet'){o.rx=Math.min(value,(x2-x1)/2,(y2-y1)/2);}else{o.type='polyline';o.closed=true;o.points=[{x:x1+value,y:y1},{x:x2-value,y:y1},{x:x2,y:y1+value},{x:x2,y:y2-value},{x:x2-value,y:y2},{x:x1+value,y:y2},{x:x1,y:y2-value},{x:x1,y:y1+value}];delete o.x;delete o.y;delete o.x2;delete o.y2;}changed++;}});}renderAll();setMessage(`${action==='fillet'?'Скругление':'Фаска'}: ${changed?`обработано ${changed} элементов`:'не выполнено — выберите прямоугольник или две пересекающиеся линии с достаточной длиной'}`);return;}
    if(action==='arrayRect'){const cols=clamp(Number(prompt('Количество столбцов:','3'))||3,1,30),rows=clamp(Number(prompt('Количество строк:','2'))||2,1,30),dx=Number(prompt('Шаг по X, мм:','15')),dy=Number(prompt('Шаг по Y, мм:','15'));if(!Number.isFinite(dx)||!Number.isFinite(dy))return;commit();const clones=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(r===0&&c===0)continue;objs.forEach(o=>{const n={...deep(o),id:newId()};translateObject(n,c*dx,r*dy);clones.push(n);});}state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Создан прямоугольный массив: ${cols} × ${rows}`);return;}
    if(action==='arrayPolar'){openPolarArrayDialog(objs);return;}if(action==='repeatPolarArray'){repeatPolarArray();return;}
    if(action==='split'||action==='trim'){selectTool(action);setMessage(action==='split'?'Щёлкните по открытой линии один раз или по двум точкам границы замкнутого контура. Выбор объекта не обязателен.':'Выберите отрезок и укажите сторону, которую нужно усечь.');}
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
  function makeDocument(){return{app:'Kompas Online',version:14,format:state.format,fileName:state.fileName,title:deep(state.title),titleForm:state.titleForm||'user-template',templateTextOverrides:deep(state.templateTextOverrides||{}),objects:deep(state.objects),ruler:deep(state.ruler),rulerMode:state.rulerMode,rulerVisible:state.rulerVisible,gost:deep(state.gost),assignmentDimensions:state.assignmentDimensions||'',viewPan:deep(state.viewPan),zoom:state.zoom,grid:state.grid,gridStep:gridStep(),snap:state.snap,objectSnap:state.objectSnap,ortho:state.ortho,template:state.template,visible:deep(visible),lineVisibility:{main:$('showMainLines')?.checked!==false,thin:$('showThinLines')?.checked!==false,center:$('showCenterLines')?.checked!==false},snapModes:{endpoint:$('snapEndpointToggle')?.checked!==false,midpoint:$('snapMidpointToggle')?.checked!==false,center:$('snapCenterToggle')?.checked!==false,intersection:$('snapIntersectionToggle')?.checked!==false,quadrant:$('snapQuadrantToggle')?.checked!==false,tangent:$('snapTangentToggle')?.checked!==false}};}
  function fileStamp(ms){try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(ms));}catch(e){return new Date(ms).toLocaleString();}}
  async function saveProject(options={}){
    let name=String(options.name||$('filenameField')?.value||state.fileName||'Кресленик_1').trim();
    if(options.saveAs){const asked=prompt('Название нового файла:',name+' — копия');if(asked===null)return;name=asked.trim();}
    if(!name){alert('Укажите название файла.');return;}
    state.title=readTitleValues();
    state.fileName=name;
    renderTemplate();
    const now=Date.now(),createNew=!!options.forceNew||!!options.saveAs||!state.projectId,id=createNew?`drawing_${now}_${Math.random().toString(36).slice(2,8)}`:state.projectId;
    let previous=null;if(!createNew&&id){try{previous=await libraryCall('readonly','get',id);}catch(e){}}
    const doc=makeDocument();doc.fileName=name;
    const record={id,name,createdAt:previous?.createdAt||now,updatedAt:now,format:state.format,objectCount:state.objects.length,data:doc};
    try{
      await libraryCall('readwrite','put',record);
      state.projectId=id;state.fileName=name;state.dirty=false;$('filenameField').value=name;renderTemplate();
      $('saveState').textContent=storageMode==='memory'?'Временно збережено':'Збережено в браузері';
      setMessage(storageMode==='memory'?`Файл «${name}» тимчасово збережено в пам’яті вкладки. Завантажте JSON-копію.`:`Файл «${name}» збережено у списку`);
      persistAutosave();
      if(!$('filesModal').classList.contains('hidden'))await renderProjectLibrary();
      return true;
    }catch(err){alert('Не удалось сохранить файл: '+err.message);setMessage('Помилка збереження');return false;}
  }
  function exportProjectFile(doc,name){
    let payload=doc;
    if(!payload){
      state.title=readTitleValues();
      if(state.titleForm==='lab5-template'){
        if(!state.title.scale)state.title.scale='1:1';
        if(state.title.liter==='У')state.title.liter='';
        if(state.title.mass==='—')state.title.mass='';
      }
      state.fileName=$('filenameField').value.trim()||state.fileName||'Кресленик_1';
      renderTemplate();
      payload=makeDocument();
    }
    const packaged=createProjectFile(payload);
    const safeName=(name||payload.fileName||state.fileName||'Кресленик_1').replace(/[\\/:*?"<>|]/g,'_');
    downloadBlob(new Blob([JSON.stringify(packaged,null,2)],{type:'application/vnd.kompas-online.project+json'}),`${safeName}.kcad`);
    setMessage(`Полный проект «${safeName}» экспортирован: геометрия, размеры, текст, рамка и оформление`);
  }
  async function exportSavedProject(id){const rec=await libraryCall('readonly','get',id);if(rec)exportProjectFile(rec.data,rec.name);}
  async function applyLoadedDocument(doc,projectId=null,nameOverride=null){
    if(!doc||!Array.isArray(doc.objects)||!window.KompasTemplate.dimensions(doc.format||'A4P'))throw new Error('Неверный формат проекта');
    if(state.dirty&&!confirm('Есть несохранённые изменения. Открыть другой файл и заменить текущий чертёж?'))return false;
    state.titleForm=(!doc.titleForm||doc.titleForm==='form1')?'user-template':doc.titleForm;state.format=['lab5-template','technical-a3-template'].includes(state.titleForm)?'A3P':(doc.format||'A4P');$('paperFormat').value=state.format;state.fileName=nameOverride||doc.fileName||'Імпортований_кресленик';state.projectId=projectId;state.title=Object.assign({},state.title,doc.title||{});state.templateTextOverrides=deep(doc.templateTextOverrides||{});
    state.ruler=doc.ruler||null;state.rulerMode=doc.rulerMode||'off';state.rulerVisible=doc.rulerVisible!==false;state.assignmentDimensions=String(doc.assignmentDimensions||'');$('assignmentDimensions').value=state.assignmentDimensions;mergeSavedGost(doc.gost||{});if(state.gost.profile==='dstu-gost-ua'&&Number(state.gost.thinLine)===.18)state.gost.thinLine=.25;if(!state.gost.lettering)state.gost.lettering='B-S';state.viewPan=deep(doc.viewPan||{x:0,y:0});if(Number.isFinite(Number(doc.zoom)))state.zoom=clamp(Number(doc.zoom),MIN_ZOOM,MAX_ZOOM);if(typeof doc.grid==='boolean')state.grid=doc.grid;if(Number.isFinite(Number(doc.gridStep)))$('gridStep').value=String(clamp(Number(doc.gridStep),.1,100));if(typeof doc.snap==='boolean')state.snap=doc.snap;if(typeof doc.objectSnap==='boolean')state.objectSnap=doc.objectSnap;if(typeof doc.ortho==='boolean')state.ortho=doc.ortho;if(typeof doc.template==='boolean')state.template=doc.template;if(doc.visible)Object.assign(visible,doc.visible);else{state.template=true;visible.template=true;}if(doc.lineVisibility){$('showMainLines').checked=doc.lineVisibility.main!==false;$('showThinLines').checked=doc.lineVisibility.thin!==false;$('showCenterLines').checked=doc.lineVisibility.center!==false;}if(doc.snapModes){$('snapEndpointToggle').checked=doc.snapModes.endpoint!==false;$('snapMidpointToggle').checked=doc.snapModes.midpoint!==false;$('snapCenterToggle').checked=doc.snapModes.center!==false;$('snapIntersectionToggle').checked=doc.snapModes.intersection!==false;$('snapQuadrantToggle').checked=doc.snapModes.quadrant!==false;$('snapTangentToggle').checked=doc.snapModes.tangent!==false;}
    $('templateToggle').checked=state.template;$('templateVisible').checked=visible.template;$('geometryVisible').checked=visible.geometry;$('dimensionsVisible').checked=visible.dimensions;$('constructionVisible').checked=visible.construction;$('referenceVisibleToggle').checked=visible.reference;$('referenceVisibleToggleSecondary').checked=visible.reference;$('gridToggle').checked=state.grid;$('snapToggle').checked=state.snap;$('objectSnapToggle').checked=state.objectSnap;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');const gridPattern=svg.querySelector('#gridPattern');if(gridPattern){const step=gridStep();gridPattern.setAttribute('width',step);gridPattern.setAttribute('height',step);gridPattern.querySelector('path').setAttribute('d',`M ${step} 0 L 0 0 0 ${step}`);}
    state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];state.history=[];state.redo=[];updateHistoryButtons();
    applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;syncTitleInputs();renderTemplate();renderAll();updateZoom();state.dirty=false;$('saveState').textContent=projectId?'Файл відкрито':'Импортированный файл';setMessage('Кресленик відкрито');return true;
  }
  async function loadProject(file){
    try{
      const raw=JSON.parse(await file.text());
      const doc=readProjectFile(raw);
      const sourceName=projectFileBaseName(file.name,doc.fileName||'Кресленик_1');
      const importedName=`${sourceName} — импорт`;
      doc.fileName=importedName;
      const ok=await applyLoadedDocument(doc,null,importedName);
      if(!ok)return;
      state.projectId=null;state.fileName=importedName;$('filenameField').value=importedName;
      const saved=await saveProject({name:importedName,forceNew:true});
      if(saved)setMessage(`Импортирован новый файл «${importedName}». Все объекты и оформление восстановлены; исходный файл не изменён.`);
    }catch(err){alert(`Не удалось импортировать проект: ${err.message}`);}
  }
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
  function exportSvg(){const clone=svg.cloneNode(true);clone.querySelector('#previewLayer')?.remove();clone.querySelector('#rulerLayer')?.remove();clone.querySelectorAll('[data-editor-overlay]').forEach(n=>n.remove());clone.querySelector('#selectionLayer')?.remove();removePrivateReferences(clone);clone.querySelector('#gridRect')?.setAttribute('visibility','hidden');clone.setAttribute('xmlns',NS);const d=dimensions();clone.setAttribute('width',d.w+'mm');clone.setAttribute('height',d.h+'mm');const source='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);downloadBlob(new Blob([source],{type:'image/svg+xml;charset=utf-8'}),`${state.fileName||'drawing'}.svg`);setMessage('SVG экспортирован');}
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
  function openPrintDialog(){
    const d=dimensions(),fmt=String(state.format||'A4P').replace(/[PL]$/,'');
    $('printPageDimensions').textContent=`Аркуш ${fmt}: ${d.w} × ${d.h} мм (${(d.w/25.4).toFixed(2)} × ${(d.h/25.4).toFixed(2)} дюйма).`;
    $('printModal').classList.remove('hidden');
  }
  function printSvgStage(svgNode,w,h){
    const old=document.getElementById('printStage');if(old)old.remove();
    const stage=document.createElement('div');stage.id='printStage';stage.style.width=`${w}mm`;stage.style.height=`${h}mm`;stage.style.background='#fff';stage.style.margin='0';
    svgNode.setAttribute('width',`${w}mm`);svgNode.setAttribute('height',`${h}mm`);svgNode.setAttribute('viewBox',`0 0 ${w} ${h}`);svgNode.setAttribute('preserveAspectRatio','none');svgNode.style.width=`${w}mm`;svgNode.style.height=`${h}mm`;svgNode.style.maxWidth='none';svgNode.style.maxHeight='none';svgNode.style.display='block';svgNode.style.margin='0';svgNode.style.transform='none';svgNode.style.boxShadow='none';stage.appendChild(svgNode);
    document.body.appendChild(stage);document.body.classList.add('kompas-printing');
    let style=document.getElementById('dynamicPrintStyle');if(!style){style=document.createElement('style');style.id='dynamicPrintStyle';document.head.appendChild(style);}
    style.textContent=`@page{size:${w}mm ${h}mm;margin:0}@media print{html,body{width:${w}mm!important;height:${h}mm!important;margin:0!important;padding:0!important;background:#fff!important;overflow:hidden!important}body.kompas-printing>*:not(#printStage){display:none!important}body.kompas-printing>#printStage{display:block!important;position:static!important;width:${w}mm!important;height:${h}mm!important;margin:0!important;padding:0!important;overflow:hidden!important}#printStage svg{display:block!important;width:${w}mm!important;height:${h}mm!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;box-shadow:none!important}}`;
    let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;document.body.classList.remove('kompas-printing');stage.remove();style.textContent='';window.removeEventListener('afterprint',cleanup);};window.addEventListener('afterprint',cleanup,{once:true});
    try{window.print();}finally{setTimeout(()=>{if(document.body.classList.contains('kompas-printing'))cleanup();},120000);}
  }
  function buildPrintableSvg(includeReferences=true){
    const parser=new DOMParser(),doc=parser.parseFromString(exportSvgSource(),'image/svg+xml');if(doc.querySelector('parsererror'))throw new Error('Не вдалося підготувати SVG для друку.');const root=doc.documentElement;
    root.querySelector('#previewLayer')?.remove();root.querySelector('#rulerLayer')?.remove();root.querySelector('#selectionLayer')?.remove();root.querySelector('#gridRect')?.setAttribute('visibility','hidden');root.querySelectorAll('[data-hit-area],[data-selection-outline]').forEach(n=>n.remove());
    if(!includeReferences)root.querySelectorAll('[data-reference-exportable]').forEach(n=>n.remove());
    root.querySelectorAll('[data-reference-exportable="false"]').forEach(n=>n.remove());
    if(!state.template||!visible.template)root.querySelector('#templateLayer')?.setAttribute('data-print-hidden','true');
    root.setAttribute('xmlns',NS);return root;
  }
  function doPrintDocument(){
    try{const d=dimensions(),include=$('printIncludeReferences').checked,root=buildPrintableSvg(include);$('printModal').classList.add('hidden');printSvgStage(root,d.w,d.h);setMessage(`Підготовлено аркуш ${d.w}×${d.h} мм для друку/PDF. У діалозі друку встановіть масштаб 100%.`);}
    catch(e){alert('Не вдалося підготувати друк: '+e.message);}
  }
  function printCalibrationSheet(){
    const ns=NS,root=document.createElementNS(ns,'svg');root.setAttribute('xmlns',ns);root.setAttribute('viewBox','0 0 210 297');root.setAttribute('width','210mm');root.setAttribute('height','297mm');root.setAttribute('preserveAspectRatio','none');
    const el=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;root.appendChild(n);return n;};
    el('rect',{x:0,y:0,width:210,height:297,fill:'#fff'});el('rect',{x:5,y:5,width:200,height:287,fill:'none',stroke:'#777','stroke-width':.15});
    const addScale=(x1,y1,x2,y2,label)=>{const vertical=Math.abs(x2-x1)<.01;el('line',{x1,y1,x2,y2,stroke:'#000','stroke-width':.35});if(vertical){el('line',{x1:x1-3,y1,x2:x1+3,y2:y1,stroke:'#000','stroke-width':.3});el('line',{x1:x2-3,y1:y2,x2:x2+3,y2:y2,stroke:'#000','stroke-width':.3});}else{el('line',{x1,y1:y1-3,x2:x1,y2:y1+3,stroke:'#000','stroke-width':.3});el('line',{x1:x2,y1:y2-3,x2:x2,y2:y2+3,stroke:'#000','stroke-width':.3});}el('text',{x:(x1+x2)/2+(vertical?6:0),y:(y1+y2)/2-4,'font-size':4,'font-family':'Arial,sans-serif','text-anchor':vertical?'start':'middle',fill:'#000'},label);};
    el('text',{x:105,y:34,'font-size':6,'font-family':'Arial,sans-serif','text-anchor':'middle',fill:'#000'},'ПЕРЕВІРКА МАСШТАБУ ДРУКУ');el('text',{x:105,y:43,'font-size':3.5,'font-family':'Arial,sans-serif','text-anchor':'middle',fill:'#000'},'Друкуйте у режимі 100% / Actual size — без Fit to page');
    addScale(55,100,155,100,'100 мм');addScale(80,150,80,250,'100 мм');addScale(55,70,105,70,'50 мм');
    el('text',{x:105,y:270,'font-size':3.2,'font-family':'Arial,sans-serif','text-anchor':'middle',fill:'#000'},'Після друку виміряйте контрольні відрізки лінійкою.');el('text',{x:105,y:277,'font-size':3.2,'font-family':'Arial,sans-serif','text-anchor':'middle',fill:'#000'},'Якщо 100 мм не дорівнює 100 мм — перевірте масштаб у вікні друку.');
    $('printModal').classList.add('hidden');printSvgStage(root,210,297);setMessage('Підготовлено контрольний аркуш A4 з відрізками 100 мм та 50 мм.');
  }
  function printDocument(){openPrintDialog();}

  function dxfPair(code,value){return`${code}\n${value}\n`;}
  function exportDxf(){
    let s='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n9\n$DWGCODEPAGE\n3\nUTF-8\n9\n$INSUNITS\n70\n4\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n5\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0\n0\nLTYPE\n2\nDASHED\n70\n0\n3\nDashed __ __ __\n72\n65\n73\n2\n40\n9\n49\n6\n49\n-3\n0\nLTYPE\n2\nCENTER\n70\n0\n3\nCenter __ . __ . __\n72\n65\n73\n4\n40\n11.1\n49\n5\n49\n-3\n49\n0.1\n49\n-3\n0\nLTYPE\n2\nPHANTOM\n70\n0\n3\nPhantom __ . . __\n72\n65\n73\n6\n40\n17.3\n49\n5\n49\n-4\n49\n0.1\n49\n-4\n49\n0.1\n49\n-4\n0\nLTYPE\n2\nDOT\n70\n0\n3\nDotted line . . .\n72\n65\n73\n2\n40\n3\n49\n1\n49\n-2\n0\nENDTAB\n0\nTABLE\n2\nLAYER\n70\n3\n0\nLAYER\n2\ngeometry\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nannotation\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nconstruction\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
    const y=v=>-v;
    const dxfLtype=o=>{if(!o||!o.dash||o.dash==='none')return 'CONTINUOUS';const p=normalizeGostDashPattern(o.dash);if(p===GOST_LINE_PATTERNS.dashDotTwoDots)return 'PHANTOM';if(p===GOST_LINE_PATTERNS.dashDotThin||p===GOST_LINE_PATTERNS.dashDotThinLong)return 'CENTER';if(p===GOST_LINE_PATTERNS.dotted)return 'DOT';return 'DASHED';};
    const dxfStyle=o=>{if(!o)return'';const hex=String(o.color||'').match(/^#([0-9a-f]{6})$/i);return dxfPair(6,dxfLtype(o))+dxfPair(370,Math.round((Number(o.width)||.35)*100))+(hex?dxfPair(420,parseInt(hex[1],16)):'');};
    const writeLine=(a,b,layer='geometry',style=null)=>{s+='0\nLINE\n'+dxfPair(8,layer)+dxfStyle(style)+dxfPair(10,a.x)+dxfPair(20,y(a.y))+dxfPair(30,0)+dxfPair(11,b.x)+dxfPair(21,y(b.y))+dxfPair(31,0);};
    const writeText=(x,yy,text,size=3,layer='annotation',rotation=0,style=null)=>{s+='0\nTEXT\n'+dxfPair(8,layer)+dxfStyle(style)+dxfPair(10,x)+dxfPair(20,y(yy))+dxfPair(30,0)+dxfPair(40,size)+dxfPair(50,-rotation)+dxfPair(1,text||'');};
    state.objects.forEach(o=>{
      const layer=layerFor(o);
      if(o.type==='point'){
        s+='0\nPOINT\n'+dxfPair(8,layer)+dxfStyle(o)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0);
      } else if(['xline','ray'].includes(o.type)){
        const name=o.type==='xline'?'XLINE':'RAY',dx=o.x2-o.x,dy=o.y2-o.y,len=Math.hypot(dx,dy)||1;
        s+='0\n'+name+'\n'+dxfPair(8,layer)+dxfStyle(o)+dxfPair(10,o.x)+dxfPair(20,y(o.y))+dxfPair(30,0)+dxfPair(11,dx/len)+dxfPair(21,-dy/len)+dxfPair(31,0);
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
        if(Array.isArray(o.hatchSegments))o.hatchSegments.forEach(segment=>writeLine(segment.a,segment.b,layer,o));
        else {
          const x1=Math.min(o.x,o.x2),x2=Math.max(o.x,o.x2),y1=Math.min(o.y,o.y2),y2=Math.max(o.y,o.y2),step=Math.max(.5,o.spacing||4);
          const emitFamily=(ang)=>{const a=ang*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),extent=Math.hypot(x2-x1,y2-y1),cx=(x1+x2)/2,cy=(y1+y2)/2;for(let k=-extent;k<=extent;k+=step){const px=cx-sn*k,py=cy+cs*k,dx=cs*extent,dy=sn*extent;const p1={x:px-dx,y:py-dy},p2={x:px+dx,y:py+dy};const hits=[];[[{x:x1,y:y1},{x:x2,y:y1}],[{x:x2,y:y1},{x:x2,y:y2}],[{x:x2,y:y2},{x:x1,y:y2}],[{x:x1,y:y2},{x:x1,y:y1}]].forEach(e=>{const h=intersectLines(p1,p2,e[0],e[1]);if(h)hits.push({x:h.x,y:h.y});});if(hits.length>=2)writeLine(hits[0],hits[1],layer);}};
          if(o.pattern!=='solid'){emitFamily(o.angle??45);if(o.pattern==='cross')emitFamily((o.angle??45)+90);}
        }
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
      const dashMap={DASHED:GOST_LINE_PATTERNS.dashed,CENTER:GOST_LINE_PATTERNS.dashDotThin,PHANTOM:GOST_LINE_PATTERNS.dashDotTwoDots,DOT:GOST_LINE_PATTERNS.dotted};
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
      else if(type==='XLINE'||type==='RAY'){const x=X(get(10)),y0=Y(get(20)),dx=get(11),dy=-get(21);out.push({...base,type:type==='XLINE'?'xline':'ray',x,y:y0,x2:x+dx,y2:y0+dy,layer:'construction'});}
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
  function syncTitleInputs(){const t=state.title;const isLab5=state.titleForm==='lab5-template';$('titleField').value=t.title||'';$('codeField').value=t.code||'';$('materialField').value=t.material||'';$('scaleField').value=t.scale||(isLab5?'1:1':'');$('sheetField').value=t.sheet||'';$('sheetsField').value=t.sheets||'1';$('companyField').value=t.company||'';$('literField').value=isLab5?(t.liter==='У'?'':(t.liter??'')):(t.liter||'У');$('massField').value=isLab5?(t.mass==='—'?'':(t.mass??'')):(t.mass||'—');$('developerField').value=t.developer||'';$('checkerField').value=t.checker||'';$('technicalField').value=t.technical||'';$('normativeField').value=t.normative||'';$('approvedField').value=t.approved||'';$('filenameField').value=state.fileName||'Кресленик_1';if($('titleFormSelect'))$('titleFormSelect').value=state.titleForm||'form1';}
  function readTitleValues(){return{title:$('titleField').value,code:$('codeField').value,material:$('materialField').value,scale:$('scaleField').value,sheet:$('sheetField').value,sheets:$('sheetsField').value,company:$('companyField').value,liter:$('literField').value,mass:$('massField').value,developer:$('developerField').value,checker:$('checkerField').value,technical:$('technicalField').value,normative:$('normativeField').value,approved:$('approvedField').value};}
  function applyTitle(){const before=snapshot();state.title=readTitleValues();if(state.titleForm==='lab5-template'){if(!state.title.scale)state.title.scale='1:1';if(state.title.liter==='У')state.title.liter='';if(state.title.mass==='—')state.title.mass='';}state.fileName=$('filenameField').value.trim()||'Кресленик_1';recordHistory(before);syncTitleInputs();renderTemplate();renderAll();state.dirty=true;$('saveState').textContent='Є незбережені зміни';persistAutosave();setMessage('Основний напис оновлено');}
  function setFormat(fmt){if(['lab5-template','technical-a3-template'].includes(state.titleForm)&&fmt!=='A3P'){fmt='A3P';setMessage('Для выбранного шаблона установлен обязательный формат А3, книжный');}commit();state.format=fmt;renderTemplate();setZoom(Math.min(state.zoom,2.5));$('paperFormat').value=fmt;setMessage(`Формат листа: ${fmt}`);}
  function fillNewDocumentChoices(){
    $('newDocFormat').innerHTML=$('paperFormat').innerHTML;$('newDocTemplate').innerHTML=$('titleFormSelect').innerHTML;
    $('newDocFormat').value=state.format||'A4P';$('newDocTemplate').value=state.titleForm||'user-template';$('newDocName').value=state.fileName||'Кресленик_1';$('newDocProfile').value=state.gost.profile==='eskd-study'?'eskd-study':'dstu-gost-ua';
    const match=String($('newDocFormat').value).match(/(P|L)$/);$('newDocOrientation').value=match?match[1]:'P';updateNewDocumentPreview();
  }
  function updateNewDocumentPreview(){
    const template=$('newDocTemplate').value||'user-template',fixedA3=['lab5-template','technical-a3-template'].includes(template);if(fixedA3){$('newDocFormat').value='A3P';$('newDocOrientation').value='P';}const fmt=fixedA3?'A3P':($('newDocFormat').value||'A4P'),d=window.KompasTemplate.dimensions(fmt),v=$('newDocPreview');
    v.setAttribute('viewBox',`0 0 ${d.w} ${d.h}`);v.innerHTML='';const bg=svgEl('rect',{x:0,y:0,width:d.w,height:d.h,fill:'#fff'});v.appendChild(bg);
    const previewData=template==='lab5-template'?{...state.title,title:state.title.title||'Лабораторная работа №5',code:state.title.code||'КТ-24.ЛР5.001',scale:'1:1',liter:'',mass:'',company:state.title.company||'Шосткинский фаховый колледж'}:(template==='technical-a3-template'?{...state.title,title:state.title.title||'Корпус',code:state.title.code||'8.090220 АР ХХ ХХ 01',company:state.title.company||'ШЦМГУ'}:state.title);window.KompasTemplate.render(v,fmt,previewData,template);
    const desc={'lab5-template':'Лист А3, книжный: рамка 20/5 мм, архивные графы слева и основная надпись ЕСКД/ГОСТ, форма 1.','technical-a3-template':'Лист А3 по вашему образцу: та же рамка и основная надпись ЕСКД/ГОСТ, форма 1; поля редактируются.','user-template':'Ваш собственный шаблон із боковыми служебными графами и расширенной основной надписью.','gost-form1':'Форма 1 — первый лист графического документа.','form2':'Форма 2 — первый лист текстового документа.','form2a':'Форма 2а — следующий лист.','form2b-odd':'Форма 2б — дополнительные графы слева.','form2b-even':'Форма 2б — дополнительные графы справа.','spec-form1':'Спецификация — первый лист.','spec-form1a':'Спецификация — последующие листы.','blank':'Чистая рамка без штампа.'};$('newDocTemplateHint').textContent=desc[template]||'';
  }
  function newDocument(){fillNewDocumentChoices();$('newDocModal').classList.remove('hidden');}
  function createNewDocument(){
    if((state.objects.length||state.dirty)&&!confirm('Создать новый чертёж? Несохранённые изменения будут потеряны.'))return;
    const template=$('newDocTemplate').value||'user-template',fmt=['lab5-template','technical-a3-template'].includes(template)?'A3P':($('newDocFormat').value||'A4P'),name=$('newDocName').value.trim()||'Кресленик_1',profile=$('newDocProfile').value;
    state.objects=[];state.selectedIds=[];state.templateTextOverrides={};state.assignmentDimensions='';$('assignmentDimensions').value='';state.ruler=null;state.rulerMode='off';state.rulerVisible=true;state.viewPan={x:0,y:0};state.projectId=null;state.titleForm=template;$('rulerMode').value='off';$('rulerVisible').checked=true;state.format=fmt;state.fileName=name;$('paperFormat').value=fmt;$('titleFormSelect').value=template;$('templateQuickSelect').value=template;$('filenameField').value=name;
    const isLab5=template==='lab5-template',isTechnicalA3=template==='technical-a3-template';state.title={title:isLab5?'Лабораторная работа №5':(isTechnicalA3?'Корпус':'Найменування деталі'),code:isLab5?'КТ-24.ЛР5.001':(isTechnicalA3?'8.090220 АР ХХ ХХ 01':'КРЕСЛЕННЯ.001'),material:'',scale:(isLab5||isTechnicalA3)?'1:1':'',sheet:'',sheets:'1',company:isLab5?'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ':(isTechnicalA3?'ШЦМГУ':''),liter:isLab5?'':'У',mass:isLab5?'':'—',developer:isLab5?'Кушвид О.А.':'',checker:isLab5?'Базиль Б.':'',technical:'',normative:'',approved:''};
    state.gost={profile,mainLine:.5,thinLine:.25,textHeight:5,dimensionTextHeight:7,dimensionTextDefaultsVersion:3,textDefaultsVersion:2,arrowLength:3.5,dimensionArrowVersion:2,precision:1,lettering:'B-S',fontFamily:'GOST type B,Arial,sans-serif'};applyGostControls();
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
    try{const raw=localStorage.getItem('kompasOnlineAutosave');if(!raw){setMessage('Автосохранение не найдено');return;}const doc=JSON.parse(raw);if(!doc||!Array.isArray(doc.objects))throw new Error('Повреждённый файл автосохранения');commit();state.titleForm=(!doc.titleForm||doc.titleForm==='form1')?'user-template':doc.titleForm;state.format=['lab5-template','technical-a3-template'].includes(state.titleForm)?'A3P':(doc.format||'A4P');state.fileName=doc.fileName||'Автовідновлення';state.projectId=doc.projectId||null;state.title=Object.assign({},state.title,doc.title||{});state.ruler=doc.ruler||null;state.rulerMode=doc.rulerMode||'off';state.rulerVisible=doc.rulerVisible!==false;state.assignmentDimensions=String(doc.assignmentDimensions||'');$('assignmentDimensions').value=state.assignmentDimensions;mergeSavedGost(doc.gost||{});if(state.gost.profile==='dstu-gost-ua'&&Number(state.gost.thinLine)===.18)state.gost.thinLine=.25;if(!state.gost.lettering)state.gost.lettering='B-S';state.viewPan=deep(doc.viewPan||{x:0,y:0});if(typeof doc.template==='boolean')state.template=doc.template;if(doc.visible)Object.assign(visible,doc.visible);if(doc.lineVisibility){$('showMainLines').checked=doc.lineVisibility.main!==false;$('showThinLines').checked=doc.lineVisibility.thin!==false;$('showCenterLines').checked=doc.lineVisibility.center!==false;}if(doc.snapModes){$('snapEndpointToggle').checked=doc.snapModes.endpoint!==false;$('snapMidpointToggle').checked=doc.snapModes.midpoint!==false;$('snapCenterToggle').checked=doc.snapModes.center!==false;$('snapIntersectionToggle').checked=doc.snapModes.intersection!==false;$('snapQuadrantToggle').checked=doc.snapModes.quadrant!==false;$('snapTangentToggle').checked=doc.snapModes.tangent!==false;}$('templateToggle').checked=state.template;$('templateVisible').checked=visible.template;$('geometryVisible').checked=visible.geometry;$('dimensionsVisible').checked=visible.dimensions;$('constructionVisible').checked=visible.construction;$('referenceVisibleToggle').checked=visible.reference;$('referenceVisibleToggleSecondary').checked=visible.reference;applyGostControls();$('rulerMode').value=state.rulerMode;$('rulerVisible').checked=state.rulerVisible;state.objects=doc.objects.filter(o=>o&&supportedTypes.has(o.type));state.selectedIds=[];$('paperFormat').value=state.format;syncTitleInputs();renderTemplate();renderAll();setMessage('Автосохранение восстановлено');}catch(e){alert('Не удалось восстановить автосохранение: '+e.message);}
  }
  function copySelected(){const objs=getSelected();if(!objs.length){setMessage('Сначала выберите объекты для копирования');return;}state.clipboard=deep(objs);setMessage(`Скопировано объектов: ${objs.length}`);}
  function pasteClipboard(){if(!state.clipboard.length){setMessage('Буфер обмена пуст');return;}commit();const clones=state.clipboard.map(o=>({...deep(o),id:newId()}));clones.forEach(o=>translateObject(o,5,5));state.objects.push(...clones);state.selectedIds=clones.map(o=>o.id);renderAll();setMessage(`Вставлено объектов: ${clones.length}`);}
  function setupToolCategories(){
    const panel=$('toolsPanel'),nav=$('toolCategoryTabs');if(!panel||!nav)return;
    const headingMap=[
      ['ВЫБОР И ГЕОМЕТРИЯ','geometry'],['РАЗМЕРЫ','dimensions'],['ОБОЗНАЧЕНИЯ И ОФОРМЛЕНИЕ','annotations'],
      ['РЕДАКТИРОВАНИЕ','editing'],['УПРАВЛЕНИЕ ОБЪЕКТАМИ','editing'],['ВЫРАВНИВАНИЕ','editing'],
      ['ТОЧНЫЙ ВВОД КООРДИНАТ','precision'],['ПАРАМЕТРЫ ПОСТРОЕНИЯ','precision'],['ЛИНЕЙКА И ТОЧНОСТЬ','precision'],
      ['РЕФЕРЕНС / ПОДЛОЖКА','reference'],['ЕСКД / ГОСТ','standards'],['ПРОВЕРКА РАЗМЕРОВ ПО ЗАДАНИЮ','standards'],
      ['ШТРИХОВКА','sheet'],['БІБЛИОТЕКА ШАБЛОНІВ','sheet'],['СЛОИ','sheet']
    ];
    let category='geometry';
    [...panel.children].forEach(el=>{
      if(el===nav)return;
      if(el.classList.contains('panel-heading')){const t=(el.textContent||'').trim().toUpperCase();const m=headingMap.find(([key])=>t.includes(key));if(m)category=m[1];}
      el.dataset.toolCategory=category;
    });
    const activate=value=>{nav.querySelectorAll('[data-tool-category]').forEach(b=>{const on=b.dataset.toolCategory===value;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});[...panel.children].forEach(el=>{if(el===nav)return;el.style.display=(value==='all'||el.dataset.toolCategory===value)?'':'none';});};
    nav.querySelectorAll('[data-tool-category]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.toolCategory)));
    activate('geometry');
  }
  setupToolCategories();
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>selectTool(b.dataset.tool)));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>applyAction(b.dataset.action)));
  $('newBtn').addEventListener('click',newDocument);$('createNewDocBtn').addEventListener('click',createNewDocument);$('closeNewDocModal').addEventListener('click',()=>$('newDocModal').classList.add('hidden'));$('cancelNewDocBtn').addEventListener('click',()=>$('newDocModal').classList.add('hidden'));$('newDocModal').addEventListener('click',e=>{if(e.target===$('newDocModal'))$('newDocModal').classList.add('hidden');});$('newDocTemplate').addEventListener('change',()=>{if(['lab5-template','technical-a3-template'].includes($('newDocTemplate').value)){$('newDocFormat').value='A3P';$('newDocOrientation').value='P';}updateNewDocumentPreview();});$('newDocFormat').addEventListener('change',()=>{const v=$('newDocFormat').value,m=v.match(/(P|L)$/);if(m)$('newDocOrientation').value=m[1];updateNewDocumentPreview();});$('newDocOrientation').addEventListener('change',()=>{const v=$('newDocFormat').value;if(/^(A[0-5])[PL]$/.test(v)){const base=v.slice(0,2);$('newDocFormat').value=base+$('newDocOrientation').value;updateNewDocumentPreview();}});$('coordinateApplyBtn').addEventListener('click',applyNumericCoordinate);$('restoreAutosaveBtn').addEventListener('click',restoreAutosave);$('saveBtn').addEventListener('click',()=>saveProject());$('saveToLibraryBtn').addEventListener('click',()=>saveProject());$('saveAsLibraryBtn').addEventListener('click',()=>saveProject({saveAs:true}));$('saveJsonBtn').addEventListener('click',()=>exportProjectFile());$('exportProjectBtn')?.addEventListener('click',()=>exportProjectFile());$('openBtn').addEventListener('click',openProjectLibrary);$('openLibraryBtn').addEventListener('click',openProjectLibrary);$('loadJsonBtn').addEventListener('click',()=>$('fileInput').click());$('importProjectBtn')?.addEventListener('click',()=>$('fileInput').click());$('importJsonFromLibraryBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>{if(e.target.files[0])loadProject(e.target.files[0]);e.target.value='';});$('closeFilesModal').addEventListener('click',()=>$('filesModal').classList.add('hidden'));$('filesModal').addEventListener('click',e=>{if(e.target===$('filesModal'))$('filesModal').classList.add('hidden');});$('fileSearch').addEventListener('input',renderProjectLibrary);$('newFromLibraryBtn').addEventListener('click',()=>{$('filesModal').classList.add('hidden');newDocument();});function changeTitleTemplate(value){if(!value)return;commit();const wasLab5=state.titleForm==='lab5-template';state.titleForm=value;if(value==='technical-a3-template'||value==='lab5-template'){state.format='A3P';$('paperFormat').value='A3P';}if(value==='technical-a3-template'){if(!state.title.title||state.title.title==='Лабораторная работа №5'||state.title.title==='Найменування деталі')state.title.title='Корпус';if(!state.title.code||state.title.code==='КТ-24.ЛР5.001'||state.title.code==='КРЕСЛЕННЯ.001')state.title.code='8.090220 АР ХХ ХХ 01';if(!state.title.company||state.title.company.includes('Шосткинський'))state.title.company='ШЦМГУ';if(!state.title.scale)state.title.scale='1:1';}if(value==='lab5-template'){if(!state.title.scale)state.title.scale='1:1';if(state.title.liter==='У')state.title.liter='';if(state.title.mass==='—')state.title.mass='';}else if(wasLab5){if(!state.title.liter)state.title.liter='У';if(!state.title.mass)state.title.mass='—';}syncTitleInputs();renderTemplate();setMessage('Шаблон аркуша змінено; геометрію креслення збережено');}
  $('titleFormSelect').addEventListener('change',e=>changeTitleTemplate(e.target.value));
  $('templateQuickSelect').addEventListener('change',e=>changeTitleTemplate(e.target.value));
  $('mirrorAxisMode').addEventListener('change',e=>$('mirrorCustomPoints').classList.toggle('hidden',e.target.value!=='custom'));$('closeMirrorModal').addEventListener('click',closeMirrorDialog);$('cancelMirrorBtn').addEventListener('click',closeMirrorDialog);$('applyMirrorBtn').addEventListener('click',applyMirrorDialog);$('mirrorModal').addEventListener('click',e=>{if(e.target===$('mirrorModal'))closeMirrorDialog();});
  $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);$('deleteBtn').addEventListener('click',deleteSelected);$('deleteSelectedBtn').addEventListener('click',deleteSelected);
  $('gridBtn').addEventListener('click',()=>{$('gridToggle').checked=!$('gridToggle').checked;$('gridToggle').dispatchEvent(new Event('change'));});$('snapBtn').addEventListener('click',()=>{$('objectSnapToggle').checked=!$('objectSnapToggle').checked;state.objectSnap=$('objectSnapToggle').checked;setMessage(`Привязки к объектам ${state.objectSnap?'включены':'выключены'}`);});$('orthoBtn').addEventListener('click',()=>{$('orthoToggle').checked=!$('orthoToggle').checked;state.ortho=$('orthoToggle').checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  $('rulerVisible').addEventListener('change',e=>{state.rulerVisible=e.target.checked;renderRuler();});$('rulerMode').addEventListener('change',e=>{state.rulerMode=e.target.value;setMessage(state.rulerMode==='off'?'Привязка к линейке выключена':state.ruler?'Режим линейки: '+(state.rulerMode==='parallel'?'параллельно':'перпендикулярно'):'Сначала поставьте линейку инструментом «Линейка»');});$('clearRulerBtn').addEventListener('click',()=>{commit();state.ruler=null;state.rulerMode='off';$('rulerMode').value='off';renderRuler();setMessage('Линейка убрана');});
  $('gridToggle').addEventListener('change',e=>{state.grid=e.target.checked;$('gridRect').setAttribute('visibility',state.grid?'visible':'hidden');});$('gridStep').addEventListener('change',()=>{const pattern=svg.querySelector('#gridPattern');const step=gridStep();pattern.setAttribute('width',step);pattern.setAttribute('height',step);pattern.querySelector('path').setAttribute('d',`M ${step} 0 L 0 0 0 ${step}`);});$('snapToggle').addEventListener('change',e=>state.snap=e.target.checked);$('objectSnapToggle').addEventListener('change',e=>state.objectSnap=e.target.checked);$('orthoToggle').addEventListener('change',e=>{state.ortho=e.target.checked;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';});
  ['snapEndpointToggle','snapMidpointToggle','snapCenterToggle','snapIntersectionToggle','snapQuadrantToggle','snapTangentToggle'].forEach(id=>$(id)?.addEventListener('change',()=>{snapCandidateCache=null;setMessage('Режимы объектной привязки обновлены');}));
  ['showMainLines','showThinLines','showCenterLines'].forEach(id=>$(id)?.addEventListener('change',()=>renderAll()));
  $('drawingLineRole')?.addEventListener('change',()=>setMessage('Тип линии для новых примитивов изменён'));$('drawingLineWidth')?.addEventListener('change',()=>setMessage('Толщина новой линии обновлена'));$('objectLineRole')?.addEventListener('change',e=>{const selected=getSelected().filter(o=>roleOf(o));if(!selected.length)return;commit();selected.forEach(o=>{o.lineRole=e.target.value;o.width=e.target.value==='main'?state.gost.mainLine:state.gost.thinLine;if(e.target.value==='center')o.dash=GOST_LINE_PATTERNS.dashDotThin;else if(o.type!=='centerline')o.dash='';});renderAll();});
  $('templateToggle').addEventListener('change',e=>{const before=snapshot();state.template=e.target.checked;commit(before);renderTemplate();});$('geometryVisible').addEventListener('change',e=>{const before=snapshot();visible.geometry=e.target.checked;commit(before);renderAll();});$('dimensionsVisible').addEventListener('change',e=>{const before=snapshot();visible.dimensions=e.target.checked;commit(before);renderAll();});$('constructionVisible').addEventListener('change',e=>{const before=snapshot();visible.construction=e.target.checked;commit(before);renderAll();});$('templateVisible').addEventListener('change',e=>{const before=snapshot();visible.template=e.target.checked;commit(before);renderTemplate();});
  $('paperFormat').addEventListener('change',e=>setFormat(e.target.value));$('fitBtn').addEventListener('click',()=>{resetViewPan();const d=dimensions(),w=drawingArea.clientWidth-70,h=drawingArea.clientHeight-70;setZoom(Math.min(w/d.w,h/d.h));});$('zoomIn').addEventListener('click',()=>setZoom(state.zoom*1.15));$('zoomOut').addEventListener('click',()=>setZoom(state.zoom/1.15));
  ['titleField','codeField','materialField','scaleField','sheetField','sheetsField','companyField','literField','massField','developerField','checkerField','technicalField','normativeField','approvedField','filenameField'].forEach(id=>$(id).addEventListener('input',()=>{state.dirty=true;$('saveState').textContent='Є незбережені зміни';}));
  $('applyTitleBtn').addEventListener('click',applyTitle);$('svgBtn').addEventListener('click',exportSvg);$('dxfBtn').addEventListener('click',exportDxf);$('exportDxfBtn').addEventListener('click',exportDxf);$('importDxfBtn').addEventListener('click',()=>$('dxfInput').click());$('dxfInput').addEventListener('change',e=>{if(e.target.files[0])importDxf(e.target.files[0]);e.target.value='';});$('svgInput').addEventListener('change',e=>{if(e.target.files[0])importSvg(e.target.files[0]);e.target.value='';});$('csvInput').addEventListener('change',e=>{if(e.target.files[0])importCsv(e.target.files[0]);e.target.value='';});$('importSvgBtn').addEventListener('click',()=>$('svgInput').click());$('importCsvBtn').addEventListener('click',()=>$('csvInput').click());$('exportCsvBtn').addEventListener('click',exportCsv);$('importHpglBtn').addEventListener('click',()=>$('hpglInput').click());$('hpglInput').addEventListener('change',e=>{if(e.target.files[0])importHpgl(e.target.files[0]);e.target.value='';});$('exportHpglBtn').addEventListener('click',exportHpgl);$('pngBtn').addEventListener('click',exportPng);$('exportJpgBtn').addEventListener('click',exportJpg);$('exportWebpBtn').addEventListener('click',exportWebp);$('exportBmpBtn').addEventListener('click',exportBmp);$('printBtn').addEventListener('click',printDocument);$('printNowBtn').addEventListener('click',doPrintDocument);$('printCalibrationBtn').addEventListener('click',printCalibrationSheet);$('printPreflightBtn').addEventListener('click',()=>{$('printModal').classList.add('hidden');checkGost();});$('closePrintModal').addEventListener('click',()=>$('printModal').classList.add('hidden'));$('printModal').addEventListener('click',e=>{if(e.target===$('printModal'))$('printModal').classList.add('hidden');});$('kompasBridgeBtn').addEventListener('click',()=>$('kompasBridgeModal').classList.remove('hidden'));$('closeKompasBridgeBtn').addEventListener('click',()=>$('kompasBridgeModal').classList.add('hidden'));$('closeBridgeBottomBtn').addEventListener('click',()=>$('kompasBridgeModal').classList.add('hidden'));$('kompasBridgeModal').addEventListener('click',e=>{if(e.target===$('kompasBridgeModal'))$('kompasBridgeModal').classList.add('hidden');});$('bridgeExportDxfBtn').addEventListener('click',()=>{exportDxf();$('kompasBridgeModal').classList.add('hidden');});$('addTextBtn').addEventListener('click',()=>selectTool('text'));$('circleInputMode')?.addEventListener('change',e=>setMessage(e.target.value==='diameter'?'Окружность: после центра задайте диаметр':'Окружность: после центра задайте радиус'));$('placeInnerCutoutBtn').addEventListener('click',()=>selectTool('cutoutInner'));
  $('applyObjectGeometryBtn').addEventListener('click',applySelectedGeometry);
  $('applyPolygonFaceOffsetBtn').addEventListener('click',()=>{
    const selection=state.faceSelection,object=selection&&state.objects.find(o=>o.id===selection.id);
    if(!object||object.locked){setMessage('Сначала выберите незаблокированную грань инструментом «Переместить грань»');return;}
    const offset=Number($('polygonFaceOffset').value);if(!Number.isFinite(offset)){setMessage('Введите корректное смещение в миллиметрах');return;}
    applyFaceOffset(object,selection.edgeIndex,offset,snapshot());
  });
  $('objectColor').addEventListener('change',e=>{const o=getSelected()[0];if(o){commit();getSelected().forEach(x=>x.color=e.target.value);renderAll();}});
  $('objectTextSize').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>{const requested=clamp(Number(e.target.value)||5,.5,50);if(['text','techReq'].includes(o.type))o.size=requested;else if(o.type==='dimension'){o.textSize=GOST_DIMENSION_TEXT_HEIGHTS.reduce((best,v)=>Math.abs(v-requested)<Math.abs(best-requested)?v:best,GOST_DIMENSION_TEXT_HEIGHTS[0]);}else o.textSize=requested;});renderAll();}});
  $('dimensionTextHeight').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);const value=Number(e.target.value);if(!dims.length||!GOST_DIMENSION_TEXT_HEIGHTS.includes(value))return;commit();dims.forEach(o=>o.textSize=value);renderAll();setMessage(`Высота размерных чисел: ${value.toLocaleString('ru-RU')} мм (ГОСТ 2.304, тип Б)`);});
  $('dimensionShowValue').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length){e.target.checked=true;setMessage('Выберите незаблокированный размер');return;}commit();dims.forEach(o=>o.hideValue=!e.target.checked);renderAll();setMessage(e.target.checked?'Числовое значение размера показано':'Числовое значение размера скрыто');});
  $('defaultDimensionTextHeight').addEventListener('change',e=>{const value=Number(e.target.value);if(!GOST_DIMENSION_TEXT_HEIGHTS.includes(value))return;commit();state.gost.dimensionTextHeight=value;state.gost.dimensionTextDefaultsVersion=3;persistAutosave();setMessage(`Новые размеры будут создаваться с высотой чисел ${value.toLocaleString('ru-RU')} мм`);});
  $('dimensionArrowPlacement').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;commit();dims.forEach(o=>o.arrowPlacement=e.target.value);renderAll();setMessage(`Размещение стрелок: ${e.target.value==='auto'?'автоматически':e.target.value==='inside'?'внутри':'снаружи'}`);});
  $('dimensionTextOrientation').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;commit();dims.forEach(o=>o.textOrientation=e.target.value);renderAll();setMessage('Ориентация размерного числа обновлена');});
  $('dimensionArrowStyle').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;commit();dims.forEach(o=>{o.arrowStyle=e.target.value;delete o.arrowStartStyle;delete o.arrowEndStyle;});renderAll();setMessage('Стиль обеих размерных стрелок обновлён');});
  $('dimensionArrowStartStyle').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;commit();dims.forEach(o=>{if(e.target.value==='inherit')delete o.arrowStartStyle;else o.arrowStartStyle=e.target.value;});renderAll();setMessage('Стиль первой размерной стрелки обновлён');});
  $('dimensionArrowEndStyle').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;commit();dims.forEach(o=>{if(e.target.value==='inherit')delete o.arrowEndStyle;else o.arrowEndStyle=e.target.value;});renderAll();setMessage('Стиль второй размерной стрелки обновлён');});
  // Use a hoisted function declaration: these bindings are registered during
  // startup, before the remaining viewport navigation listeners are installed.
  function updateSelectedDimension(field,input,min,max,message){
    $(input).addEventListener('change',e=>{
      const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);
      if(!dims.length)return;
      const value=clamp(Number(e.target.value)||0,min,max);
      commit();dims.forEach(o=>o[field]=value);renderAll();setMessage(message);
    });
  }
  updateSelectedDimension('arrowSize','dimensionArrowSize',.8,12,'Размер стрелок обновлён');
  updateSelectedDimension('labelRotationDeg','dimensionLabelRotation',-360,360,'Поворот размерного числа обновлён отдельно от размерной линии');
  // Live range controls make dimension editing easier; one drag is a single undo step.
  function syncDimensionLengthSliders(dims){
    if(!dims?.length)return;
    const key=dims.map(o=>o.id).join('|');
    const reset=key!==dimensionSliderSelectionKey;
    dimensionSliderSelectionKey=key;
    const controls=[
      ['dimensionSelectedOffsetSlider',Math.max(10,Math.abs(Number(dims[0].offset)||10)),10,200],
      ['dimensionExtensionStartSlider',dimensionExtensionValue(dims[0],'start'),0,50],
      ['dimensionExtensionEndSlider',dimensionExtensionValue(dims[0],'end'),0,50],
      ['dimensionExtensionGapStartSlider',dimensionExtensionGapSpec(dims[0],'start')?.value??dimensionExtensionGapValue(dims[0],'start'),0,50],
      ['dimensionExtensionGapEndSlider',dimensionExtensionGapSpec(dims[0],'end')?.value??dimensionExtensionGapValue(dims[0],'end'),0,50],
    ];
    for(const [id,rawValue,min,baseMax] of controls){
      const slider=$(id);if(!slider)continue;
      const value=Math.max(min,Number(rawValue)||0);
      const currentMax=reset?baseMax:(Number(slider.max)||baseMax);
      // Reset the range for a newly selected dimension, or grow it if a
      // numeric/step/drag edit already exceeds the current slider range.
      // Do not grow while the thumb is still moving: that would shift the
      // thumb under the pointer and make the slider feel jumpy.
      const nextMax=reset?Math.max(baseMax,value*1.25):Math.max(currentMax,value+Math.max(.1,Number(slider.step)||.1));
      slider.min=String(min);
      slider.max=String(Math.max(nextMax,value+Math.max(.1,Number(slider.step)||.1)));
      slider.value=String(value);
    }
  }
  function bindDimensionLiveSlider(sliderId,numberId,field,min,max,message,transformValue=null,adaptiveMax=false){
    const slider=$(sliderId);let before=null;
    const dimensions=()=>getSelected().filter(o=>o.type==='dimension'&&!o.locked);
    const begin=()=>{if(!before&&dimensions().length)before=snapshot();};
    slider.addEventListener('pointerdown',begin);
    slider.addEventListener('keydown',begin);
    slider.addEventListener('input',e=>{
      const dims=dimensions();if(!dims.length)return;begin();
      const raw=Number(e.target.value);
      const value=clamp(raw,min,adaptiveMax?Infinity:max);
      dims.forEach(o=>o[field]=transformValue?transformValue(o,value):value);
      const firstValue=Number(dims[0][field]);
      $(numberId).value=String(Number(firstValue.toFixed(2)));
      renderAll();
    });
    const finish=()=>{
      if(adaptiveMax){
        const currentMax=Number(slider.max)||max;
        const currentValue=Number(slider.value);
        const step=Math.max(.1,Number(slider.step)||.1);
        if(Number.isFinite(currentValue)&&currentValue>=currentMax-step*.51){
          slider.max=String(Math.max(currentMax*2,currentValue+step*10));
        }
      }
      if(!before)return;
      const original=before;before=null;
      if(JSON.stringify(original.objects)!==JSON.stringify(state.objects)){commit(original);setMessage(message);}
    };
    slider.addEventListener('change',finish);
    slider.addEventListener('pointercancel',finish);
    slider.addEventListener('blur',finish);
  }
  bindDimensionLiveSlider('dimensionLabelRotationSlider','dimensionLabelRotation','labelRotationDeg',-360,360,'Поворот размерного числа применён');
  bindDimensionLiveSlider('dimensionSelectedOffsetSlider','dimensionSelectedOffset','offset',10,Infinity,'Длина выносных ножек обновлена',(o,value)=>(Number(o.offset)<0?-1:1)*value,true);
  bindDimensionLiveSlider('dimensionExtensionStartSlider','dimensionExtensionStart','extensionBeyondStart',0,Infinity,'Длина первой ножки обновлена',null,true);
  bindDimensionLiveSlider('dimensionExtensionEndSlider','dimensionExtensionEnd','extensionBeyondEnd',0,Infinity,'Длина второй ножки обновлена',null,true);
  bindDimensionLiveSlider('dimensionExtensionGapStartSlider','dimensionExtensionGapStart','extensionGapStart',0,Infinity,'Начало первой ножки обновлено',(o,value)=>Math.min(value,dimensionExtensionGapSpec(o,'start')?.max??value),true);
  bindDimensionLiveSlider('dimensionExtensionGapEndSlider','dimensionExtensionGapEnd','extensionGapEnd',0,Infinity,'Начало второй ножки обновлено',(o,value)=>Math.min(value,dimensionExtensionGapSpec(o,'end')?.max??value),true);
  $('resetDimensionLabelRotation').addEventListener('click',()=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;commit();dims.forEach(o=>o.labelRotationDeg=0);$('dimensionLabelRotation').value='0';$('dimensionLabelRotationSlider').value='0';renderAll();setMessage('Поворот размерного числа сброшен до 0°');});
  document.querySelectorAll('[data-dimension-rotation-step]').forEach(button=>button.addEventListener('click',()=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length){setMessage('Выберите незаблокированный размер');return;}const step=Number(button.dataset.dimensionRotationStep)||0;if(!step)return;const before=snapshot();dims.forEach(o=>o.labelRotationDeg=clamp((Number(o.labelRotationDeg)||0)+step,-360,360));commit(before);renderAll();setMessage(`Поворот цифры изменён на ${step>0?'+':''}${step}°`);}));
  document.querySelectorAll('[data-dimension-extension-step]').forEach(button=>button.addEventListener('click',()=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length){setMessage('Выберите незаблокированный размер');return;}const end=button.dataset.dimensionExtensionSide==='end'?'end':'start',field=dimensionExtensionField(end),step=Number(button.dataset.dimensionExtensionStep)||0;if(!step)return;const before=snapshot();dims.forEach(o=>o[field]=Math.max(0,Math.round((dimensionExtensionValue(o,end)+step)*10)/10));commit(before);renderAll();setMessage(`Изменена только ${end==='start'?'первая':'вторая'} ножка на ${step>0?'+':''}${step.toFixed(1)} мм`);}));
  for(const [end,inputId] of [['start','dimensionExtensionGapStart'],['end','dimensionExtensionGapEnd']])$(inputId).addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;const raw=Number(e.target.value);if(!Number.isFinite(raw))return;const field=dimensionExtensionGapField(end),before=snapshot();dims.forEach(o=>o[field]=Math.min(Math.max(0,raw),dimensionExtensionGapSpec(o,end)?.max??Infinity));commit(before);renderAll();setMessage(`Начало ${end==='start'?'первой':'второй'} ножки обновлено`);});
  for(const [end,inputId] of [['start','dimensionExtensionStart'],['end','dimensionExtensionEnd']])$(inputId).addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;const value=Number(e.target.value);if(!Number.isFinite(value))return;const field=dimensionExtensionField(end),before=snapshot();dims.forEach(o=>o[field]=Math.max(0,value));commit(before);renderAll();setMessage(`Обновлена только ${end==='start'?'первая':'вторая'} ножка`);});
  document.querySelectorAll('[data-dimension-offset-step]').forEach(button=>button.addEventListener('click',()=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length){setMessage('Выберите незаблокированный размер');return;}const step=Number(button.dataset.dimensionOffsetStep)||0;if(!step)return;const before=snapshot();dims.forEach(o=>{const current=Number(o.offset)||10,side=current<0?-1:1;o.offset=side*Math.max(10,Math.round((Math.abs(current)+step)*10)/10);});commit(before);renderAll();setMessage(`Отступ размерной линии изменён на ${step>0?'+':''}${step.toFixed(1)} мм`);}));
  $('dimensionSelectedOffset').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;const raw=Number(e.target.value);if(!Number.isFinite(raw))return;const value=(raw<0?-1:1)*Math.max(10,Math.abs(raw)||10);commit();dims.forEach(o=>o.offset=value);renderAll();setMessage('Отступ размерной линии обновлён; сторона размера сохранена');});
  $('dimensionExtensionGap').addEventListener('change',e=>{const dims=getSelected().filter(o=>o.type==='dimension'&&!o.locked);if(!dims.length)return;const value=clamp(Number(e.target.value)||0,0,5);commit();dims.forEach(o=>{o.extensionGap=value;delete o.extensionGapStart;delete o.extensionGapEnd;});renderAll();setMessage('Общий зазор обеих ножек обновлён');});updateSelectedDimension('labelDx','dimensionLabelDx',-200,200,'Положение числа по X обновлено');updateSelectedDimension('labelDy','dimensionLabelDy',-200,200,'Положение числа по Y обновлено');
  $('editContentBtn').addEventListener('click',()=>{const o=getSelected().find(x=>['text','techReq','leader','roughness','tolerance','weld','dimension','section','table'].includes(x.type));if(!o){setMessage('Выберите текст, обозначение или таблицу для редактирования');return;}editDrawingAnnotationText(o);});
  $('editTextFormatBtn').addEventListener('click',()=>{const o=getSelected().find(x=>x.type==='text'||x.type==='techReq');if(o)openTextDialog(o,o);else setMessage('Выберите текстовый объект');});
  $('addReferenceBtn').addEventListener('click',()=>$('referenceInput').click());
  $('addReferenceRibbonBtn').addEventListener('click',()=>$('referenceInput').click());
  $('gostRibbonBtn').addEventListener('click',checkGost);
  $('referenceInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importReference(f);e.target.value='';});
  // Capture navigation gestures before SVG drawing tools. Right-drag is the
  // primary pan gesture; middle-drag and Space+left remain available.
  drawingArea.addEventListener('pointerdown',e=>{if(e.button===1||e.button===2||(state.space&&e.button===0))onCanvasPointerDown(e);},{capture:true});
  drawingArea.addEventListener('auxclick',e=>{if(e.button===1||e.button===2){e.preventDefault();e.stopPropagation();}},{capture:true});
  drawingArea.addEventListener('contextmenu',e=>{e.preventDefault();},{capture:true});
  drawingArea.addEventListener('lostpointercapture',e=>{if(state.pan&&state.pan.pointerId===e.pointerId)finishPan(e.pointerId);});
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
  $('checkGostBtn').addEventListener('click',checkGost);$('saveAssignmentDimensionsBtn').addEventListener('click',()=>{const next=String($('assignmentDimensions').value||'').trim();if(next!==state.assignmentDimensions){commit();state.assignmentDimensions=next;state.dirty=true;persistAutosave();$('saveState').textContent='Есть несохранённые изменения';}checkGost();setMessage('Список размеров задания сохранён и проверен');});$('assignmentDimensions').addEventListener('change',()=>{const next=String($('assignmentDimensions').value||'').trim();if(next!==state.assignmentDimensions){commit();state.assignmentDimensions=next;state.dirty=true;persistAutosave();$('saveState').textContent='Есть несохранённые изменения';}});$('normalizeGostBtn').addEventListener('click',normalizeSelectedToGost);$('increaseDrawingTextBtn').addEventListener('click',()=>enlargeAllDrawingText(5));
  $('closeGostModal').addEventListener('click',()=>$('gostModal').classList.add('hidden'));
  $('closeGostModalBottom').addEventListener('click',()=>$('gostModal').classList.add('hidden'));
  $('gostModal').addEventListener('click',e=>{if(e.target===$('gostModal'))$('gostModal').classList.add('hidden');});
  $('closeTextModal').addEventListener('click',closeTextDialog);$('cancelTextBtn').addEventListener('click',closeTextDialog);$('applyTextBtn').addEventListener('click',applyTextDialog);$('textModal').addEventListener('click',e=>{if(e.target===$('textModal'))closeTextDialog();});
  $('applyObjectRotationBtn').addEventListener('click',()=>rotateSelectedBy(Number($('objectRotationAngle').value)||0));
  $('objectRotationSlider').addEventListener('input',e=>{$('objectRotationAngle').value=e.target.value;});$('objectRotationSlider').addEventListener('change',e=>{rotateSelectedBy(Number(e.target.value)||0);e.target.value=0;$('objectRotationAngle').value='0';});$('objectRotationAngle').addEventListener('change',e=>{if(Number.isFinite(Number(e.target.value)))$('objectRotationSlider').value=clamp(Number(e.target.value),-180,180);});
  document.querySelectorAll('[data-rotate-step]').forEach(b=>b.addEventListener('click',()=>rotateSelectedBy(Number(b.dataset.rotateStep))));
  $('hatchSelectedBoundaryBtn').addEventListener('click',createHatchFromSelectedBoundary);$('findClosedLoopsHatchBtn').addEventListener('click',findAndHatchClosedRegions);$('hatchSelectedRegionBtn').addEventListener('click',hatchSelectedRegion);
  function updateHatchAngleControls(){
    const angle=hatchAngleValue();
    $('hatchAngleSlider').value=String(Math.max(0,Math.min(179,Math.round(angle))));
    document.querySelectorAll('[data-hatch-angle]').forEach(button=>button.setAttribute('aria-pressed',String(Math.abs(Number(button.dataset.hatchAngle)-angle)<1e-8)));
  }
  function setHatchAngle(value){$('hatchAngle').value=String(value);updateHatchAngleControls();}
  $('hatchAngle').addEventListener('input',updateHatchAngleControls);
  $('hatchAngleSlider').addEventListener('input',()=>setHatchAngle($('hatchAngleSlider').value));
  document.querySelectorAll('[data-hatch-angle]').forEach(button=>button.addEventListener('click',()=>setHatchAngle(button.dataset.hatchAngle)));
  updateHatchAngleControls();
  $('objectWidth').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.width=clamp(Number(e.target.value)||.35,.05,3));renderAll();}});$('objectDash').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>{if(e.target.value==='WAVE'){o.linePattern='wave';o.width=state.gost.thinLine;delete o.dash;}else if(e.target.value==='ZIGZAG'){o.linePattern='zigzag';o.width=state.gost.thinLine;delete o.dash;}else{o.linePattern='';o.dash=e.target.value;}});renderAll();}});$('objectLayer').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.layer=e.target.value);renderAll();}});$('objectName').addEventListener('change',e=>{if(getSelected().length===1){commit();getSelected()[0].name=e.target.value;renderAll();}});$('objectLocked').addEventListener('change',e=>{if(getSelected().length){commit();getSelected().forEach(o=>o.locked=e.target.checked);renderAll();setMessage(e.target.checked?'Объекты заблокированы':'Блокировка снята');}});
  $('lockAllObjectsBtn').addEventListener('click',()=>{if(!state.objects.length){setMessage('На листе пока нет объектов');return;}const targets=state.objects.filter(o=>!o.locked);if(!targets.length){setMessage('Все объекты уже заблокированы');return;}commit();targets.forEach(o=>o.locked=true);renderAll();setMessage(`Заблокировано объектов: ${targets.length}`);});
  $('unlockAllObjectsBtn').addEventListener('click',()=>{const targets=state.objects.filter(o=>o.locked);if(!targets.length){setMessage('Нет заблокированных объектов');return;}commit();targets.forEach(o=>o.locked=false);renderAll();setMessage(`Разблокировано объектов: ${targets.length}`);});
  annotationLayer.addEventListener('dblclick',e=>{
    if(state.tool!=='select')return;
    const group=e.target.closest?.('.drawing-object[data-id]');if(!group)return;
    const obj=state.objects.find(o=>o.id===group.getAttribute('data-id'));
    if(!obj||!['text','techReq','leader','roughness','tolerance','weld','dimension','section','table'].includes(obj.type))return;
    e.preventDefault();e.stopPropagation();state.selectedIds=[obj.id];renderAll();editDrawingAnnotationText(obj);
  });
  // Double-clicking any blank place in a visible title-block template creates a new text object there.
  templateLayer.addEventListener('dblclick',e=>{
    if(state.tool!=='select'||e.target.closest?.('[data-template-text-id]'))return;
    e.preventDefault();e.stopPropagation();const p=pointFromEvent(e,true);openTextDialog({x:p.x,y:p.y},null);setMessage('Новая надпись: введите текст и нажмите «Применить текст»');
  });
  svg.addEventListener('pointerdown',e=>{if(e.button!==1&&e.button!==2&&!state.space)onCanvasPointerDown(e);});svg.addEventListener('dblclick',e=>{e.preventDefault();if(state.tool==='polyline'||state.tool==='spline'){finishPath();return;}if(state.tool==='select'&&!e.target.closest?.('.drawing-object[data-id]')&&!e.target.closest?.('[data-template-text-id]')){const p=pointFromEvent(e,true);openTextDialog({x:p.x,y:p.y},null);setMessage('Новая надпись: введите текст и нажмите «Применить текст»');}});svg.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);window.addEventListener('pointercancel',onPointerUp);
  // Bind wheel navigation directly to the viewport in capture phase. The
  // drawing area is not natively scrollable: its content is moved only through
  // viewPan, so the browser cannot scroll the page instead of zooming the CAD.
  drawingArea.addEventListener('wheel',e=>{
    if(!drawingArea.contains(e.target))return;
    const {deltaX,deltaY}=normalizeWheelDeltas(e,{width:drawingArea.clientWidth,height:drawingArea.clientHeight});
    if(deltaX===0&&deltaY===0)return;
    e.preventDefault();e.stopPropagation();
    if(e.shiftKey){state.viewPan.x-=deltaY||deltaX;updateZoom();persistAutosave();return;}
    if(e.altKey){state.viewPan.y-=deltaY||deltaX;updateZoom();persistAutosave();return;}
    if(deltaY===0&&deltaX!==0){state.viewPan.x-=deltaX;updateZoom();persistAutosave();return;}
    setZoomAt(state.zoom*wheelZoomFactor(deltaY),e.clientX,e.clientY);
    persistAutosave();
  },{capture:true,passive:false});
  window.addEventListener('keydown',e=>{const tag=document.activeElement.tagName;if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='t'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){selectTool('text');e.preventDefault();}if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){state.space=true;e.preventDefault();}if(e.key==='Enter'&&(state.tool==='polyline'||state.tool==='spline'))finishPath();if(e.key==='F8'){state.ortho=!state.ortho;$('orthoToggle').checked=state.ortho;$('orthoStatus').textContent=state.ortho?'Вкл.':'Выкл.';}if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA','SELECT'].includes(tag))deleteSelected();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();$('openBtn').click();}if((e.ctrlKey||e.metaKey)&&e.key==='0'){e.preventDefault();$('fitBtn').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newDocument();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();if(e.shiftKey)redo();else undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();redo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();copySelected();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();pasteClipboard();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();applyAction('duplicate');}if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key.toLowerCase()==='r'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();applyAction('arrayPolar');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();toggleReferenceLock();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!['INPUT','TEXTAREA'].includes(tag)){e.preventDefault();state.selectedIds=state.objects.map(o=>o.id);renderAll();}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!['INPUT','TEXTAREA','SELECT'].includes(tag)&&state.selectedIds.length&&!e.repeat){e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;const movable=getSelected().filter(o=>!o.locked);if(!movable.length){setMessage('Выбранные объекты заблокированы');return;}commit();movable.forEach(o=>translateObject(o,dx,dy));renderAll();}if(e.key==='Escape'){if(state.straightCutDraft){state.straightCutDraft=null;previewLayer.innerHTML='';setMessage('Прямой проход отменён');}if(state.duplicatePlacement){state.duplicatePlacement=null;previewLayer.innerHTML='';setMessage('Дублирование отменено');}if(state.rotateDrag){const before=state.rotateDrag.historyBefore;state.rotateDrag=null;drawingArea.classList.remove('rotating');restore(before);setMessage('Поворот отменён');}if(state.resize){const before=state.resize.historyBefore;state.resize=null;drawingArea.classList.remove('resizing');restore(before);setMessage('Изменение размера отменено');}if(state.faceDrag){const drag=state.faceDrag;state.faceDrag=null;const object=state.objects.find(o=>o.id===drag.id);if(object)Object.assign(object,deep(drag.originalObject));drawingArea.classList.remove('moving-face');renderAll();setMessage('Перемещение грани отменено');}if(state.dimensionExtensionDrag){const before=state.dimensionExtensionDrag.historyBefore;state.dimensionExtensionDrag=null;drawingArea.classList.remove('moving-dimension-extension');restore(before);setMessage('Изменение ножки отменено');}if(state.dimensionLabelDrag){const before=state.dimensionLabelDrag.historyBefore;state.dimensionLabelDrag=null;restore(before);setMessage('Перемещение размерного числа отменено');}if(state.erasing){state.erasing=null;renderAll();setMessage('Стирание завершено');}if(!$('filesModal').classList.contains('hidden'))$('filesModal').classList.add('hidden');if(!$('polarArrayModal').classList.contains('hidden'))$('polarArrayModal').classList.add('hidden');state.pendingPolarCenter=false;if(!$('mirrorModal').classList.contains('hidden'))closeMirrorDialog();if(state.referenceCalibration){state.referenceCalibration=null;setMessage('Калибровка референса отменена');}if(!$('textModal').classList.contains('hidden')){closeTextDialog();return;}state.freehandDraft=null;state.points=[];state.selectionRect=null;previewLayer.innerHTML='';selectTool('select');}});
  window.addEventListener('keyup',e=>{if(e.code==='Space')state.space=false;});window.addEventListener('blur',()=>{state.space=false;if(state.faceDrag){const drag=state.faceDrag;state.faceDrag=null;const object=state.objects.find(o=>o.id===drag.id);if(object)Object.assign(object,deep(drag.originalObject));drawingArea.classList.remove('moving-face');renderAll();}if(state.duplicatePlacement?.dragging){state.duplicatePlacement=null;previewLayer.innerHTML='';renderAll();}if(state.rotateDrag){const before=state.rotateDrag.historyBefore;state.rotateDrag=null;drawingArea.classList.remove('rotating');restore(before);}if(state.resize){const before=state.resize.historyBefore;state.resize=null;drawingArea.classList.remove('resizing');restore(before);}if(state.dimensionExtensionDrag){const r=state.dimensionExtensionDrag;state.dimensionExtensionDrag=null;drawingArea.classList.remove('moving-dimension-extension');if(r.changed)recordHistory(r.historyBefore);renderAll();}if(state.dimensionLabelDrag){const r=state.dimensionLabelDrag;state.dimensionLabelDrag=null;const o=state.objects.find(x=>x.id===r.id);if(o&&(Math.abs((o.labelDx||0)-r.labelDx)>.001||Math.abs((o.labelDy||0)-r.labelDy)>.001))recordHistory(r.historyBefore);renderAll();}if(state.erasing){const r=state.erasing;state.erasing=null;if(r.seen.size)recordHistory(r.historyBefore);renderAll();}if(state.pan)finishPan();});
  document.querySelectorAll('.panel-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.panel-tab').forEach(t=>t.classList.toggle('active',t===tab));$('toolsPanel').classList.toggle('hidden',tab.dataset.panel!=='tools');$('treePanel').classList.toggle('hidden',tab.dataset.panel!=='tree');}));
  $('helpBtn').addEventListener('click',()=>$('helpModal').classList.remove('hidden'));$('closeHelp').addEventListener('click',()=>$('helpModal').classList.add('hidden'));$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.add('hidden');});
  document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{const menu=btn.dataset.menu;if(menu==='file')openProjectLibrary();else if(menu==='edit')undo();else if(menu==='view')$('fitBtn').click();else if(menu==='insert')selectTool('text');else if(menu==='draw')selectTool('line');else if(menu==='format')$('applyTitleBtn').click();else $('helpBtn').click();}));
  applyGostControls();syncTitleInputs();renderTemplate();renderAll();updateZoom();fillNewDocumentChoices();selectTool('select');updateHistoryButtons();openProjectDb().catch(()=>{});
})();
