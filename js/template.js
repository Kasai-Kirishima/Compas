/* Editable vector sheet template inspired by the supplied KOMPAS screenshot. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
  function line(x1,y1,x2,y2,w=.25, color='#20252a') { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" vector-effect="non-scaling-stroke"/>`; }
  function rect(x,y,w,h,sw=.3) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#20252a" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>`; }
  function txt(x,y,s,size=2.3,anchor='start',rotate='') { const tr=rotate?` transform="rotate(${rotate} ${x} ${y})"`:''; return `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="#24292e" text-anchor="${anchor}"${tr}>${esc(s)}</text>`; }

  function portrait(w,h,d) {
    let a = '';
    // Outer sheet and the offset drawing frame (left margin 20 mm, other margins 5 mm).
    a += rect(0,0,w,h,.22);
    a += rect(8,5,w-13,h-10,.25);
    a += rect(20,5,w-25,h-10,.35);
    // Narrow registration fields in the left strip, matching the supplied template.
    a += rect(8,10,12,70,.25); a += line(14,10,14,80,.2); a += line(8,45,20,45,.2);
    a += rect(8,92,12,58,.25); a += line(14,92,14,150,.2);
    a += rect(8,172,12,62,.25); a += line(14,172,14,234,.2);
    a += line(8,112,20,112,.18); a += line(8,192,20,192,.18); a += line(8,212,20,212,.18);
    // Top identification cell resembling the narrow upper field in the reference.
    a += rect(32,5,78,14,.25); a += line(32,19,110,19,.18);
    a += txt(34,11,'ЛИСТ КОНСТРУКТОРСКОЙ ДОКУМЕНТАЦИИ',1.8);
    // Main title block at the bottom, retained as editable vector elements.
    const x=20, y=h-55, tw=w-25, th=50;
    a += rect(x,y,tw,th,.35);
    [x+10,x+22,x+36,x+100,x+132,x+156].forEach(v=>a+=line(v,y,v,y+th,.22));
    [y+7,y+14,y+23,y+34,y+42].forEach(v=>a+=line(x,v,x+tw,v,.22));
    // Smaller cells and labels.
    a += txt(x+1.5,y+4,'Изм.',1.8); a += txt(x+11.5,y+4,'Лист',1.8); a += txt(x+24,y+4,'№ докум.',1.8); a += txt(x+38,y+4,'Подп.',1.8); a += txt(x+102,y+4,'Дата',1.8);
    a += txt(x+1.5,y+11,'Разраб.',1.8); a += txt(x+1.5,y+20,'Пров.',1.8); a += txt(x+1.5,y+31,'Т.контр.',1.8); a += txt(x+1.5,y+39,'Н.контр.',1.8); a += txt(x+1.5,y+47,'Утв.',1.8);
    a += txt(x+38,y+19,'Наименование изделия',1.9);
    a += txt(x+38,y+31,d.title || 'Наименование детали',2.7);
    a += txt(x+38,y+40,`Материал: ${d.material || 'не указан'}`,2.1);
    a += txt(x+38,y+48, d.company || 'Учебный чертёж',2.0);
    a += txt(x+102,y+19,'Обозначение',1.8);
    a += txt(x+102,y+31,d.code || 'ЧЕРТЁЖ.001',2.5);
    a += txt(x+102,y+40,`Масштаб: ${d.scale || '1:1'}`,2.1);
    a += txt(x+133,y+19,'Лист',1.8); a += txt(x+144,y+31,d.sheet || '1',3.2,'middle');
    a += txt(x+158,y+19,'Листов',1.8); a += txt(x+tw-5,y+31,'1',3.2,'middle');
    a += txt(x+tw-3,y+47,'Формат A4',1.8,'end');
    // Side labels set vertically, like on the source screenshot.
    a += txt(11.5,34,'УЧЕБНЫЙ ЧЕРТЁЖ',1.8,'middle','-90');
    a += txt(17.5,120,'РЕГИСТРАЦИЯ',1.7,'middle','-90');
    a += txt(11.5,204,'СОГЛАСОВАНО',1.7,'middle','-90');
    return a;
  }

  function landscape(w,h,d) {
    let a='';
    a += rect(0,0,w,h,.22); a += rect(20,5,w-25,h-10,.35);
    const x=w-190, y=h-45, tw=185, th=40;
    // Left-side short registration marker and upper designation box.
    a += rect(20,10,12,40,.25); a += line(26,10,26,50,.2); a += txt(26,31,'ДОКУМЕНТ',1.7,'middle','-90');
    a += rect(32,5,80,14,.25); a += txt(34,11,'ЛИСТ КОНСТРУКТОРСКОЙ ДОКУМЕНТАЦИИ',1.8);
    a += rect(x,y,tw,th,.35);
    [x+10,x+22,x+36,x+100,x+132,x+156].forEach(v=>a+=line(v,y,v,y+th,.22));
    [y+7,y+14,y+25,y+33].forEach(v=>a+=line(x,v,x+tw,v,.22));
    a+=txt(x+1.5,y+4,'Изм.',1.8);a+=txt(x+11.5,y+4,'Лист',1.8);a+=txt(x+24,y+4,'№ докум.',1.8);a+=txt(x+38,y+4,'Подп.',1.8);
    a+=txt(x+1.5,y+12,'Разраб.',1.8);a+=txt(x+1.5,y+22,'Пров.',1.8);a+=txt(x+38,y+22,d.title||'Наименование детали',2.7);
    a+=txt(x+38,y+31,`Материал: ${d.material||'не указан'}`,2.1);a+=txt(x+102,y+12,'Обозначение',1.8);a+=txt(x+102,y+22,d.code||'ЧЕРТЁЖ.001',2.5);
    a+=txt(x+133,y+12,'Масштаб',1.8);a+=txt(x+144,y+22,d.scale||'1:1',2.6,'middle');a+=txt(x+158,y+12,'Лист',1.8);a+=txt(x+tw-5,y+22,d.sheet||'1',2.8,'middle');
    a+=txt(x+38,y+38,d.company||'Учебный чертёж',1.9);
    return a;
  }

  window.KompasTemplate = {
    dimensions(format) { return format==='A4L'?{w:297,h:210}:format==='A3L'?{w:420,h:297}:{w:210,h:297}; },
    render(layer, format, data) {
      const {w,h}=this.dimensions(format);
      layer.innerHTML = format==='A4P' ? portrait(w,h,data) : landscape(w,h,data);
    }
  };
})();
