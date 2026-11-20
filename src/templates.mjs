export const TEMPLATES = [
 {id:'lab4-reference-template',name:'Лабораторна робота №4',format:'A3P',description:'Навчальний зразок А3, книжкова орієнтація. Реконструкція за описом архіву.'},
 {id:'lab8-reference-template',name:'Лабораторна робота №8 — зразок «Корпус» (чорна рамка)',format:'A3L',description:'А3 альбомний 420×297 мм, перемальований за наданим зображенням: зовнішній контур, ліва смуга, верхній індекс та штамп 185×55 мм з іменами Кушвид О. і Базиль Б.'},
 {id:'lab8-a3-landscape-template',name:'Окрема рамка зразка — А3 альбомна (Кушвид / Базиль)',format:'A3L',description:'Окремий повністю чорний шаблон А3 альбомний 420×297 мм: ліва смуга із секціями, індекс та штамп 185×55 мм за зразком; Кушвид О. — розробник, Базиль Б. — перевірив.'},
 {id:'kompas-lab5-a4-template',name:'Імпортована рамка Kompas Online — ЛР №4/5',format:'A4P',description:'А4 книжковий 210×297 мм: чорна рамка й основний напис 185×55 мм, відновлені із завантаженого файла Kompas Online «лаб4КушвидОКт-24.kcad».'},
 {id:'lab5-a4-reference-template',name:'Лабораторна робота №5',format:'A4P',description:'Навчальний зразок А4, книжкова орієнтація. Реконструкція за описом архіву.'},
 {id:'lab5-gost-a4-portrait',name:'ЛР №5 — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A4P',description:'А4 книжковий: рамка 20 мм ліворуч і 5 мм з інших боків; основний напис форми 1, 185×55 мм.'},
 {id:'technical-gost-a4-portrait',name:'Технічний кресленик — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A4P',description:'А4 книжковий: рамка 20 мм ліворуч і 5 мм з інших боків; основний напис форми 1, 185×55 мм.'},
 {id:'lab5-gost-a3-landscape',name:'ЛР №5 — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A3L',description:'А3 альбомний: рамка 20/5/5/5 мм та основний напис форми 1 розміром 185×55 мм.'},
 {id:'technical-gost-a3-landscape',name:'Технічний кресленик — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A3L',description:'А3 альбомний: рамка 20/5/5/5 мм та основний напис форми 1 розміром 185×55 мм.'},
 {id:'lab5-gost-a3-portrait',name:'ЛР №5 — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A3P',description:'А3 книжковий: рамка 20/5/5/5 мм та основний напис форми 1 розміром 185×55 мм.'},
 {id:'technical-gost-a3-portrait',name:'Технічний кресленик — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A3P',description:'А3 книжковий: рамка 20/5/5/5 мм та основний напис форми 1 розміром 185×55 мм.'},
 {id:'lab5-gost-a2-landscape',name:'ЛР №5 — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A2L',description:'А2 альбомний: рамка 20/5/5/5 мм та основний напис форми 1 розміром 185×55 мм.'},
 {id:'technical-gost-a2-landscape',name:'Технічний кресленик — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A2L',description:'А2 альбомний: рамка 20/5/5/5 мм та основний напис форми 1 розміром 185×55 мм.'},
 {id:'technical-gost-a2-portrait',name:'Технічний кресленик — ДСТУ ГОСТ / ЄСКД, форма 1',format:'A2P',description:'А2 книжковий: рамка 20/5/5/5 мм та основний напис форми 1 розміром 185×55 мм.'}
];
export const FORMATS = {
 A5L:[210,148],A4P:[210,297],A4L:[297,210],A3P:[297,420],A3L:[420,297],A2P:[420,594],A2L:[594,420],A1P:[594,841],A1L:[841,594],A0P:[841,1189],A0L:[1189,841],
 A0x2:[1189,1682],A0x3:[1189,2523],A1x3:[841,1783],A1x4:[841,2378],A2x3:[594,1261],A2x4:[594,1682],A2x5:[594,2102],A3x3:[420,891],A3x4:[420,1189],A3x5:[420,1486],A3x6:[420,1783],A3x7:[420,2080],A4x3:[297,630],A4x4:[297,841],A4x5:[297,1051],A4x6:[297,1261],A4x7:[297,1471],A4x8:[297,1682],A4x9:[297,1892]
};
export function formatForTemplate(id){return TEMPLATES.find(t=>t.id===id)?.format || 'A3P';}

// Teaching sheet profile: 20 mm binding margin on the left, 5 mm on the other edges.
// This is a practical ESKD-style frame, not a declaration of certified compliance.
export function isGostTemplate(id) {
 return typeof id === 'string' && /^(lab5|technical)-gost-/.test(id);
}
export function getTemplateFrame(id,width,height) {
 if (!isGostTemplate(id)) {
  if(id==='lab8-reference-template'||id==='lab8-a3-landscape-template')return {x:4.5,y:4,width:409,height:285};
  if(id==='kompas-lab5-a4-template'||id==='kompas-import-a4-template')return {x:20,y:5,width:width-25,height:height-10};
  const margin=10;
  return {x:margin,y:margin,width:width-margin*2,height:height-margin*2};
 }
 return {x:20,y:5,width:width-25,height:height-10};
}
export function getForm1Bounds(width,height) {
 return {x:width-5-185,y:height-5-55,width:185,height:55};
}
