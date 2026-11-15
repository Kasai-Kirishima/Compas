/* Ukrainian-language editable drawing sheet templates.
   Includes a user-provided custom A4 layout, educational vector reconstructions of GOST 2.104-2006 forms 1/2/2a/2b, plus GOST 2.106-96 specification layouts.
   These are editable teaching templates, not certified or legally attested standard files. */
(function () {
  const BLUE = '#000000';
  const TEXT = '#000000';
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
  function line(x1,y1,x2,y2,width=.22,color=BLUE){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" fill="none" vector-effect="non-scaling-stroke"/>`;}
  function rect(x,y,w,h,width=.25,color=BLUE){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;}
  function txt(x,y,value,size=2.25,anchor='start',rotate=0,opts={}){const h=Math.max(1.8,Number(size)||2.25);const transforms=(rotate||opts.slanted)?`translate(${x} ${y}) ${rotate?`rotate(${rotate}) `:''}${opts.slanted?'skewX(-15) ':''}translate(${-x} ${-y})`:'';const tr=transforms?` transform="${transforms}"`:'';return `<text x="${x}" y="${y}" font-family="${opts.fontFamily||'GOST type B,Arial,sans-serif'}" font-size="${h}" fill="${opts.color||TEXT}" text-anchor="${anchor}"${tr}${opts.weight?' font-weight="'+opts.weight+'"':''}${opts.italic?' font-style="italic"':''}>${esc(value)}</text>`;}
  function cell(x1,x2,y,value,size=1.55){return txt((x1+x2)/2,y,value,size,'middle');}
  function vlabel(x,y1,y2,value,size=1.65){return txt(x,(y1+y2)/2,value,size,'middle',-90);}
  function addAuxFields(s, yTop=5, yBottom=292, thinWidth=.25) {
    // Additional archival fields in the left 20 mm margin; labels are Ukrainian.
    const x1=5,x2=12,x3=20;
    const bands=[
      [yBottom-25,yBottom,'Інв. № ориг.'],
      [yBottom-60,yBottom-25,'Підпис і дата'],
      [yBottom-85,yBottom-60,'Взам. інв. №'],
      [yBottom-110,yBottom-85,'Інв. № дубл.'],
      [yBottom-145,yBottom-110,'Підпис і дата'],
      [yBottom-205,yBottom-145,'Довідковий №'],
      [yBottom-265,yBottom-205,'Перше застосування']
    ];
    bands.forEach(([a,b,label])=>{s+=rect(x1,a,x3-x1,b-a,thinWidth);s+=line(x2,a,x2,b,thinWidth);s+=vlabel((x1+x2)/2,a,b,label,1.55);});
    return s;
  }
  function form1(w,h,d) {
    let s='';
    s+=rect(0,0,w,h,.12,'#000000');
    // A4 portrait print frame: 20 mm left margin, 5 mm elsewhere.
    s+=rect(20,5,185,287,.5);
    s=addAuxFields(s,5,292,.25);
    // Upper document-index cell shown in the user's reference sheet.
    s+=rect(20,5,70,14,.25);s+=line(20,19,90,19,.18);
    // Form 1: main inscription is 185 x 55 mm, in the lower-right corner.
    const x0=20,x1=27,x2=37,x3=60,x4=75,x5=85,x6=155,x7=205;
    const y0=237,y1=242,y2=247,y3=252,y4=257,y5=262,y6=267,y7=272,y8=277,y9=282,y10=287,y11=292;
    s+=rect(x0,y0,185,55,.32);
    // Revision columns: 7 / 10 / 23 / 15 / 10 mm.
    [x1,x2,x3,x4,x5].forEach(x=>s+=line(x,y0,x,y11,.18));
    [y1,y2,y3,y4,y5].forEach(y=>s+=line(x0,y,x5,y,.18));
    s+=cell(x0,x1,241.1,'Зм.',1.35);s+=cell(x1,x2,241.1,'Арк.',1.35);s+=cell(x2,x3,241.1,'№ докум.',1.35);s+=cell(x3,x4,241.1,'Підпис',1.35);s+=cell(x4,x5,241.1,'Дата',1.35);
    // Approval / signature rows.
    s+=line(36.5,y5,36.5,y11,.18);s+=line(x3,y5,x3,y11,.18);s+=line(x4,y5,x4,y11,.18);
    [y6,y7,y8,y9,y10,y11].forEach(y=>s+=line(x0,y,x5,y,.18));
    const roles=[['Розробив',d.developer],['Перевірив',d.checker],['Т. контр.',d.technical],['Н. контр.',d.normative],['Затвердив',d.approved],['','']];
    roles.forEach((r,i)=>{const baseline=265.2+i*5;if(r[0])s+=txt(21.0,baseline,r[0],1.48);if(r[1])s+=txt(37.2,baseline,r[1],1.45);});
    // Product/document name, designation and material cells.
    s+=line(x5,252,x7,252,.20);s+=line(x5,277,x6,277,.18);
    s+=txt(87,246.5,'Найменування виробу / документа',1.6);
    s+=txt(87,255.8,d.title||'Найменування деталі',2.4);
    s+=txt(87,264.5,'Позначення: '+(d.code||'КРЕСЛЕННЯ.001'),1.7);
    s+=txt(87,282.0,'Матеріал: '+(d.material||'не зазначено'),1.65);
    // Right-hand data cells: literature, mass, scale, sheet and sheet count.
    s+=line(170,242,170,277,.18);s+=line(187,242,187,277,.18);s+=line(155,247,205,247,.16);s+=line(155,270,205,270,.16);s+=line(180,270,180,282,.18);s+=line(155,277,205,277,.18);s+=line(155,282,205,282,.18);
    s+=txt(157,246,'Літ.',1.45);s+=txt(171.5,246,'Маса',1.45);s+=txt(188,246,'Масштаб',1.4);
    s+=cell(155,170,264,d.liter||'У',1.9);s+=cell(170,187,264,d.mass||'—',1.9);s+=cell(187,205,264,d.scale||'1:1',2.2);
    s+=txt(157,276,'Арк.',1.4);s+=txt(181,276,'Аркушів',1.4);s+=cell(155,180,281,d.sheet||'1',2.5);s+=cell(180,205,281,d.sheets||'1',2.5);
    s+=txt(157,289.2,d.company||'Навчальний кресленик',1.45);
    // Captions under the frame.
    s+=txt(105,296,'Копіював',2.5,'middle',0,{italic:true});s+=txt(200,296,'Формат  '+(d.format||'А4'),1.65,'end',0,{italic:true});
    return s;
  }
  function form1Landscape(w,h,d,format){
    let s='';s+=rect(0,0,w,h,.12,'#000000');
    // On larger/landscape sheets the frame keeps 20 mm at left and 5 mm elsewhere.
    s+=rect(20,5,w-25,h-10,.32);
    const bx=w-190,by=h-60;
    // Additional fields run in the left margin as in Form 1.
    const bands=[[h-30,h-5,'Інв. № ориг.'],[h-65,h-30,'Підпис і дата'],[h-90,h-65,'Взам. інв. №'],[h-115,h-90,'Інв. № дубл.'],[h-150,h-115,'Підпис і дата'],[h-210,h-150,'Довідковий №'],[h-270,h-210,'Перше застосування']];
    bands.forEach(([a,b,label])=>{s+=rect(5,a,15,b-a,.2);s+=line(12,a,12,b,.18);s+=vlabel(8.5,a,b,label,1.55);});
    // Place the 185 x 55 mm Form 1 block exactly in the lower-right area.
    s+=rect(bx,by,185,55,.32);
    const xs=[bx,bx+7,bx+17,bx+40,bx+55,bx+65,bx+135,bx+185];
    xs.slice(1,6).forEach(x=>s+=line(x,by,x,by+55,.18));
    [by+5,by+10,by+15,by+20,by+25,by+30,by+35,by+40,by+45,by+50].forEach(y=>s+=line(bx,y,bx+65,y,.18));
    s+=cell(xs[0],xs[1],by+4,'Зм.',1.3)+cell(xs[1],xs[2],by+4,'Арк.',1.3)+cell(xs[2],xs[3],by+4,'№ докум.',1.3)+cell(xs[3],xs[4],by+4,'Підпис',1.3)+cell(xs[4],xs[5],by+4,'Дата',1.3);
    ['Розробив','Перевірив','Т. контр.','Н. контр.','Затвердив'].forEach((v,i)=>s+=txt(bx+1,by+18+i*5,v,1.42));
    s+=line(bx+65,by+15,bx+185,by+15,.18);s+=line(bx+65,by+40,bx+135,by+40,.18);
    s+=txt(bx+67,by+9,'Найменування виробу / документа',1.55);s+=txt(bx+67,by+21,d.title||'Найменування деталі',2.3);s+=txt(bx+67,by+29,'Позначення: '+(d.code||'КРЕСЛЕННЯ.001'),1.65);s+=txt(bx+67,by+36,'Матеріал: '+(d.material||'не зазначено'),1.6);s+=txt(bx+67,by+48,d.company||'Навчальний кресленик',1.5);
    s+=line(bx+135,by+5,bx+135,by+40,.18);s+=line(bx+152,by+5,bx+152,by+40,.18);s+=line(bx+170,by+5,bx+170,by+40,.18);s+=line(bx+65,by+15,bx+185,by+15,.16);s+=line(bx+135,by+35,bx+185,by+35,.16);s+=line(bx+157,by+35,bx+157,by+55,.16);
    s+=txt(bx+137,by+11,'Літ.',1.4);s+=txt(bx+154,by+11,'Маса',1.4);s+=txt(bx+171,by+11,'Масштаб',1.25);s+=cell(bx+135,bx+152,by+29,d.liter||'У',1.8);s+=cell(bx+152,bx+170,by+29,d.mass||'—',1.8);s+=cell(bx+170,bx+185,by+29,d.scale||'1:1',1.9);
    s+=txt(bx+137,by+44,'Арк.',1.35);s+=txt(bx+160,by+44,'Аркушів',1.35);s+=cell(bx+135,bx+157,by+52,d.sheet||'1',1.7);s+=cell(bx+157,bx+185,by+52,d.sheets||'1',1.7);
    s+=txt(bx+92,by+54,'Копіював',1.5,'middle');s+=txt(bx+183,by+54,'Формат '+(format||'А3').slice(0,2),1.5,'end');
    return s;
  }
  function form2a(w,h,d,format){
    let s='';s+=rect(0,0,w,h,.12,'#000000');
    s+=rect(20,5,w-25,h-10,.32);
    const bx=w-190,by=h-20;
    s+=rect(bx,by,185,15,.28);
    const widths=[7,10,23,15,10];let x=bx;widths.forEach(v=>{x+=v;s+=line(x,by,x,by+15,.17);});
    s+=line(bx,by+9,bx+65,by+9,.17);
    s+=cell(bx,bx+7,by+8,'Зм.',1.3);s+=cell(bx+7,bx+17,by+8,'Арк.',1.3);s+=cell(bx+17,bx+40,by+8,'№ докум.',1.3);s+=cell(bx+40,bx+55,by+8,'Підпис',1.3);s+=cell(bx+55,bx+65,by+8,'Дата',1.3);
    s+=line(bx+65,by+5,bx+175,by+5,.17);s+=line(bx+175,by,bx+175,by+15,.17);
    s+=txt(bx+67,by+11,d.code||'Позначення документа',1.65);s+=txt(bx+177,by+9,'Арк.',1.1,'middle');
    s+=txt(bx+92,by+14,'Копіював',1.45,'middle');s+=txt(bx+183,by+14,'Формат '+(format||'А3').slice(0,2),1.4,'end');
    // A concise reference strip for the continuation sheet.
    if(h>=280)[[h-30,h-5,'Інв. № ориг.'],[h-65,h-30,'Підпис і дата'],[h-90,h-65,'Взам. інв. №'],[h-115,h-90,'Інв. № дубл.'],[h-150,h-115,'Підпис і дата'],[h-210,h-150,'Довідковий №'],[h-270,h-210,'Перше застосування']].forEach(([a,b,label])=>{s+=rect(5,a,15,b-a,.2);s+=line(12,a,12,b,.18);s+=vlabel(8.5,a,b,label,1.5);});
    return s;
  }

  // Standardized, clean ESKD/GOST-style forms, kept separate from the user's custom template.
  function basicFrame(w,h){let s='';s+=rect(0,0,w,h,.12,'#000000');s+=rect(20,5,w-25,h-10,.32);return s;}
  function eskdForm1(w,h,d,format){
    let s=basicFrame(w,h);if(h>=280)s=addAuxFields(s,5,h-5);const bx=w-190,by=h-60;
    s+=rect(bx,by,185,55,.32);
    const X=[bx,bx+7,bx+17,bx+40,bx+55,bx+65,bx+135,bx+155,bx+170,bx+185];
    // Revision register and approval/signature columns.
    [1,2,3,4,5].forEach(i=>s+=line(X[i],by,X[i],by+55,.18));
    [5,10].forEach(v=>s+=line(bx,by+v,bx+65,by+v,.18));
    [19,28,37,46].forEach(v=>s+=line(bx,by+v,bx+65,by+v,.18));
    s+=cell(X[0],X[1],by+4,'Зм.',1.25)+cell(X[1],X[2],by+4,'Арк.',1.15)+cell(X[2],X[3],by+4,'№ докум.',1.15)+cell(X[3],X[4],by+4,'Підпис',1.15)+cell(X[4],X[5],by+4,'Дата',1.15);
    [['Розробив','developer'],['Перевірив','checker'],['Т. контр.','technical'],['Н. контр.','normative'],['Затвердив','approved']].forEach((r,i)=>{const y=by+16+i*9;s+=txt(bx+1, y,r[0],1.45);if(d[r[1]])s+=txt(bx+18,y,d[r[1]],1.35);});
    // Document name, designation and material.
    s+=line(X[5],by+15,X[9],by+15,.18);s+=line(X[5],by+37,X[8],by+37,.18);s+=line(X[5],by+46,X[9],by+46,.18);
    s+=txt(bx+67,by+5.5,'Найменування виробу / документа',1.45);
    s+=txt(bx+67,by+24,d.title||'Найменування деталі',2.15);
    s+=txt(bx+67,by+33,(d.code||'КРЕСЛЕННЯ.001'),1.45);
    s+=txt(bx+67,by+44,'Матеріал: '+(d.material||'не зазначено'),1.4);
    // Litera, mass, scale and sheet numbering.
    [X[7],X[8]].forEach(x=>s+=line(x,by,x,by+37,.18));
    s+=line(X[6],by+9,X[9],by+9,.18);s+=line(X[6],by+28,X[9],by+28,.18);s+=line(X[6],by+37,X[9],by+37,.18);s+=line(X[7]+5,by+28,X[7]+5,by+55,.18);
    s+=txt(X[6]+2,by+7,'Літ.',1.25);s+=txt(X[7]+2,by+7,'Маса',1.25);s+=txt(X[8]+2,by+7,'Масштаб',1.2);
    s+=cell(X[6],X[7],by+20,d.liter||'У',1.8)+cell(X[7],X[8],by+20,d.mass||'—',1.7)+cell(X[8],X[9],by+20,d.scale||'1:1',1.8);
    s+=txt(X[6]+2,by+34,'Арк.',1.2);s+=txt(X[7]+7,by+34,'Аркушів',1.2);
    s+=cell(X[6],X[7]+5,by+45,d.sheet||'',1.5)+cell(X[7]+5,X[9],by+45,d.sheets||'1',1.5);
    s+=txt(bx+92,by+54,'Копіював',1.4,'middle');s+=txt(bx+183,by+54,'Формат '+format,1.4,'end');
    return s;
  }
  function textForm2(w,h,d,format){
    // Form 2 is for the first/title page of text design documents. This is an editable teaching reconstruction.
    let s=basicFrame(w,h);if(h>=280)s=addAuxFields(s,5,h-5);
    const bx=w-190,by=h-60;s+=rect(bx,by,185,55,.32);
    const X=[bx,bx+7,bx+17,bx+40,bx+55,bx+65,bx+118,bx+145,bx+165,bx+185];
    X.slice(1,6).forEach(x=>s+=line(x,by,x,by+55,.18));
    [by+5,by+10,by+19,by+28,by+37,by+46].forEach(y=>s+=line(bx,y,bx+65,y,.18));
    s+=cell(X[0],X[1],by+4,'Зм.',1.2)+cell(X[1],X[2],by+4,'Арк.',1.1)+cell(X[2],X[3],by+4,'№ докум.',1.1)+cell(X[3],X[4],by+4,'Підпис',1.1)+cell(X[4],X[5],by+4,'Дата',1.1);
    [['Розробив','developer'],['Перевірив','checker'],['Т. контр.','technical'],['Н. контр.','normative'],['Затвердив','approved']].forEach((r,i)=>{let y=by+16+i*9;s+=txt(bx+1,y,r[0],1.35);if(d[r[1]])s+=txt(bx+18,y,d[r[1]],1.3);});
    s+=line(X[5],by+19,X[9],by+19,.18);s+=line(X[5],by+37,X[9],by+37,.18);s+=line(X[5],by+46,X[9],by+46,.18);
    s+=txt(bx+67,by+7,'Найменування текстового документа',1.45);s+=txt(bx+67,by+29,d.title||'Пояснювальна записка',2.0);s+=txt(bx+67,by+42,(d.code||'ДОКУМЕНТ.001'),1.4);
    s+=line(X[7],by+19,X[7],by+46,.18);s+=line(X[8],by+19,X[8],by+46,.18);
    s+=txt(X[6]+2,by+25,'Літ.',1.2);s+=txt(X[7]+2,by+25,'Арк.',1.2);s+=txt(X[8]+2,by+25,'Аркушів',1.2);
    s+=cell(X[6],X[7],by+34,d.liter||'У',1.5)+cell(X[7],X[8],by+34,d.sheet||'1',1.5)+cell(X[8],X[9],by+34,d.sheets||'1',1.5);
    s+=txt(bx+67,by+53,'Організація: '+(d.company||'Навчальна робота'),1.3);s+=txt(bx+183,by+54,'Формат '+format,1.35,'end');
    return s;
  }
  function textForm2b(w,h,d,format,even){
    // Form 2б is an alternate continuation-page layout for duplex text documents.
    let s=basicFrame(w,h);const bx=w-190,by=h-20;s+=rect(bx,by,185,15,.28);
    if(h>=280){const ax=even?w-20:5;const bands=[[5,35,'Перв. застос.'],[35,60,'Довідковий №'],[60,85,'Підпис і дата'],[85,110,'Інв. № дубл.'],[110,135,'Взам. інв. №'],[135,170,'Підпис і дата'],[170,h-20,'Інв. № ориг.']];bands.forEach(([a,b,label])=>{s+=rect(ax,a,15,b-a,.2);s+=line(ax+7,a,ax+7,b,.18);s+=vlabel(ax+7.5,a,b,label,1.35);});}
    const X=[bx,bx+7,bx+17,bx+40,bx+55,bx+65,bx+120,bx+145,bx+165,bx+185];
    X.slice(1,6).forEach(x=>s+=line(x,by,x,by+15,.17));
    s+=line(bx,by+9,bx+65,by+9,.17);s+=cell(X[0],X[1],by+8,'Зм.',1.15)+cell(X[1],X[2],by+8,'Арк.',1.1)+cell(X[2],X[3],by+8,'№ докум.',1.05)+cell(X[3],X[4],by+8,'Підпис',1.05)+cell(X[4],X[5],by+8,'Дата',1.05);
    s+=line(X[5],by+5,X[9],by+5,.17);[X[7],X[8]].forEach(x=>s+=line(x,by+5,x,by+15,.17));
    s+=txt(bx+67,by+12,d.code||'Позначення документа',1.4);s+=txt(X[6]+2,by+4,'Літ.',1.1);s+=txt(X[7]+2,by+4,'Арк.',1.1);s+=txt(X[8]+2,by+4,'Аркушів',1.1);
    s+=cell(X[6],X[7],by+13,d.liter||'У',1.4)+cell(X[7],X[8],by+13,d.sheet||'1',1.4)+cell(X[8],X[9],by+13,d.sheets||'1',1.4);
    s+=txt(bx+92,by+14,'Копіював',1.3,'middle');s+=txt(bx+183,by+14,'Формат '+format,1.3,'end');
    return s;
  }
  function specificationSheet(w,h,d,format,first){
    let s=basicFrame(w,h);const x0=20,y0=5,tableW=185,bottom=first?h-60:h-20,headerH=20,rowH=6;
    // ГОСТ 2.106-96 specification table: format, zone, position, designation, name, quantity, note.
    const rel=[6,6,8,70,63,10,22],scale=tableW/rel.reduce((a,b)=>a+b,0),cols=[x0];rel.forEach(v=>cols.push(cols[cols.length-1]+v*scale));
    s+=rect(x0,y0,tableW,bottom-y0,.28);
    cols.slice(1,-1).forEach(x=>s+=line(x,y0,x,bottom,.18));
    s+=line(x0,y0+headerH,x0+tableW,y0+headerH,.22);
    const labels=['Формат','Зона','Поз.','Позначення','Найменування','Кіл.','Примітка'];
    labels.forEach((v,i)=>{const cx=(cols[i]+cols[i+1])/2; s+=vlabel(cx,y0+2,y0+headerH-1,v,1.45);});
    for(let y=y0+headerH+rowH;y<bottom-.1;y+=rowH)s+=line(x0,y,x0+tableW,y,.16);
    const sections=[['Документація',0],['Деталі',3],['Стандартні вироби',7],['Інші вироби',11],['Матеріали',15]];
    sections.forEach(([label,row])=>{const y=y0+headerH+row*rowH+4.1;if(y<bottom-1)s+=txt(cols[3]+2,y,label,1.65,'start',0,{weight:'bold'});});
    if(first){s+=eskdForm1(w,h,d,format);}
    else {s+=form2a(w,h,d,format);}
    return s;
  }

  // Laboratory A4 portrait sheet rebuilt directly in millimetres.
  // Frame: 20 mm left, 5 mm top/right/bottom. Main title block: 185 x 55 mm.
  // Additional document designation field: 70 x 14 mm, with text rotated 180 degrees.
  function lab5Template(w,h,d={}){
    // This custom education template is designed only for portrait A4.
    if(Math.abs(w-210)>.01 || Math.abs(h-297)>.01){
      return eskdForm1(w,h,d,'A4');
    }
    let s='';
    // Standard drawing frame and left-side archival fields in the 20 mm binding margin.
    s+=rect(20,5,185,287,.5);
    s=addAuxFields(s,5,292,.25);

    // Additional document designation field (70 x 14 mm) at the upper-left of the frame.
    s+=rect(20,5,70,14,.25);
    s+=txt(55,13.4,d.code||'КТ-24.ЛР5.001',2.5,'middle',180,{fontFamily:'GOST type B,Arial,sans-serif'});

    // Main title block — exactly 185 x 55 mm, positioned at x=20, y=237.
    const x0=20,x1=27,x2=37,x3=60,x4=75,x5=85,x6=155,x7=205;
    const y0=237,y1=252,y2=262,y3=272,y4=277,y5=292;
    s+=rect(x0,y0,185,55,.5);

    // Left: revision register (65 x 15 mm).
    [x1,x2,x3,x4,x5].forEach(x=>s+=line(x,y0,x,y1,.25));
    [y0+5,y0+10].forEach(y=>s+=line(x0,y,x5,y,.25));
    s+=cell(x0,x1,y0+4,'Зм.',1.35);
    s+=cell(x1,x2,y0+4,'Арк.',1.35);
    s+=cell(x2,x3,y0+4,'№ докум.',1.35);
    s+=cell(x3,x4,y0+4,'Підп.',1.35);
    s+=cell(x4,x5,y0+4,'Дата',1.35);

    // Left: two educational sign-off rows. The name cell is wide enough for a full name.
    s+=line(x0,y2,x5,y2,.25);
    [x2,x3,x4].forEach(x=>s+=line(x,y1,x,y3,.25));
    s+=txt(x0+1.6,y1+6.2,'Виконав',2.15);
    s+=txt(x0+1.6,y2+6.2,'Перевірив',2.15);
    if(d.developer)s+=txt((x2+x3)/2,y1+6.2,d.developer,1.8,'middle');
    if(d.checker)s+=txt((x2+x3)/2,y2+6.2,d.checker,1.8,'middle');

    // Left: lower revision/signature cells retained as blank fields.
    [x1,x2,x3,x4,x5].forEach(x=>s+=line(x,y3,x,y5,.25));
    s+=line(x0,y4,x5,y4,.25);

    // Centre: document name and designation, plus institution, group and material.
    s+=line(x5,y1,x7,y1,.25);
    s+=line(x5,y3,x7,y3,.25);
    s+=line(x5,y4,x7,y4,.25);
    s+=txt((x5+x6)/2,y0+7.2,d.title||'Лабораторна робота 5',4.0,'middle');
    s+=txt((x5+x6)/2,y0+12.0,d.code||'КТ-24.ЛР5.001',2.2,'middle');

    // Institution is split across two centered lines; group is a separate third line.
    const company=String(d.company||'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ').trim();
    const words=company.split(/\s+/);let lineA='',lineB='';
    for(const word of words){
      if((lineA+' '+word).trim().length<=38)lineA=(lineA+' '+word).trim();
      else lineB=(lineB+' '+word).trim();
    }
    if(!lineB)lineB='';
    s+=txt((x5+x6)/2,y1+6.5,lineA,2.0,'middle');
    if(lineB)s+=txt((x5+x6)/2,y1+12.0,lineB,2.0,'middle');
    if(d.group)s+=txt((x5+x6)/2,y1+17.4,'Група '+d.group,2.0,'middle');
    s+=txt((x5+x6)/2,y3+3.6,'Матеріал: '+(d.material||'—'),1.8,'middle');

    // Right: literature, mass and scale.
    const rx=x6;
    s+=line(rx,y0+10,x7,y0+10,.25);
    s+=line(rx,y1,x7,y1,.25);
    s+=line(rx,y3,x7,y3,.25);
    s+=line(175,y0,175,y3,.25);
    s+=line(190,y0,190,y3,.25);
    s+=txt(165,y0+6.2,'Літ.',1.9,'middle');
    s+=txt(182.5,y0+6.2,'Маса',1.9,'middle');
    s+=txt(197.5,y0+6.2,'Масштаб',1.8,'middle');
    s+=txt(165,y1+12.5,d.liter||'У',3.3,'middle');
    s+=txt(182.5,y1+12.5,d.mass||'—',3.3,'middle');
    s+=txt(197.5,y1+12.5,d.scale||'1:1',3.0,'middle');

    // Sheet number and total. For a one-sheet document, the current-sheet cell is left blank.
    s+=line(180,y3,180,y4,.25);
    s+=txt(167.5,y3+3.55,'Лист: '+(d.sheet||''),1.65,'middle');
    s+=txt(192.5,y3+3.55,'Листів: '+(d.sheets||'1'),1.65,'middle');

    // Bottom cells: copying mark remains blank; sheet format is identified as A4.
    s+=line(x6,y4,x6,y5,.25);
    s+=txt((x5+x6)/2,y4+9.2,'Копіював',2.2,'middle',0,{italic:true});
    s+=txt((x6+x7)/2,y4+9.2,'Формат А4',2.2,'middle',0,{italic:true});
    return s;
  }

  function blankSheet(w,h){return basicFrame(w,h);}

  window.KompasTemplate={
    dimensions(format){
      const sizes={A0:[841,1189],A1:[594,841],A2:[420,594],A3:[297,420],A4:[210,297],A5:[148,210]};
      const extra={'A0x2':[1189,1682],'A0x3':[1189,2523],'A1x3':[841,1783],'A1x4':[841,2378],'A2x3':[594,1261],'A2x4':[594,1682],'A2x5':[594,2102],'A3x3':[420,891],'A3x4':[420,1189],'A3x5':[420,1486],'A3x6':[420,1783],'A3x7':[420,2080],'A4x3':[297,630],'A4x4':[297,841],'A4x5':[297,1051],'A4x6':[297,1261],'A4x7':[297,1471],'A4x8':[297,1682],'A4x9':[297,1892]};
      const key=String(format||'A4P');if(extra[key])return{w:extra[key][0],h:extra[key][1]};
      const m=key.match(/^(A[0-5])([PL])$/);if(!m)return{w:210,h:297};const z=sizes[m[1]];return m[2]==='L'?{w:z[1],h:z[0]}:{w:z[0],h:z[1]};
    },
    markup(format,data,form){
      const {w,h}=this.dimensions(format),d=data||{},f=form||'user-template';
      if(f==='lab5-template')return lab5Template(w,h,d);
      if(f==='blank')return blankSheet(w,h);
      if(f==='gost-form1')return eskdForm1(w,h,d,String(format).replace(/[PL]$/,''));
      if(f==='form2')return textForm2(w,h,d,String(format).replace(/[PL]$/,''));
      if(f==='form2a')return form2a(w,h,d,String(format).replace(/[PL]$/,''));
      if(f==='form2b-even')return textForm2b(w,h,d,String(format).replace(/[PL]$/,''),true);
      if(f==='spec-form1')return specificationSheet(w,h,d,String(format).replace(/[PL]$/,''),true);
      if(f==='spec-form1a')return specificationSheet(w,h,d,String(format).replace(/[PL]$/,''),false);
      if(f==='form2b-odd')return textForm2b(w,h,d,String(format).replace(/[PL]$/,''),false);
      // Backward-compatible alias: old saved projects used form1 for the exact user-provided template.
      if(f==='form1'||f==='user-template'){if(h<280)return eskdForm1(w,h,d,String(format).replace(/[PL]$/,''));return format==='A4P'?form1(w,h,d):form1Landscape(w,h,d,String(format).replace(/[PL]$/,''));}
      return format==='A4P'?form1(w,h,d):form1Landscape(w,h,d,String(format).replace(/[PL]$/,''));
    },
    render(layer,format,data,form){layer.innerHTML=this.markup(format,data,form||'user-template');}
  };
})();
