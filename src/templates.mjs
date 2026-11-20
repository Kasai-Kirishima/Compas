export const TEMPLATES = [
 {id:'lab4-reference-template',name:'Лабораторная работа №4',format:'A3P',description:'Учебный образец А3, книжная ориентация. Реконструкция по описанию архива.'},
 {id:'lab8-reference-template',name:'Лабораторная работа №8',format:'A3L',description:'Синяя рамка А3, альбомная ориентация, штамп «Корпус / Вариант 8 / ШЦМГУ».'},
 {id:'lab5-a4-reference-template',name:'Лабораторная работа №5',format:'A4P',description:'Учебный образец А4, книжная ориентация. Реконструкция по описанию архива.'},
 {id:'lab5-gost-a3-landscape',name:'ЛР №5 — форма 1',format:'A3L',description:'Учебная компоновка основной надписи формы 1, А3 альбомный.'},
 {id:'technical-gost-a3-landscape',name:'Технический чертёж — форма 1',format:'A3L',description:'Технический чертёж, форма 1, А3 альбомный.'},
 {id:'lab5-gost-a3-portrait',name:'ЛР №5 — форма 1',format:'A3P',description:'Учебная компоновка основной надписи формы 1, А3 книжный.'},
 {id:'technical-gost-a3-portrait',name:'Технический чертёж — форма 1',format:'A3P',description:'Технический чертёж, форма 1, А3 книжный.'}
];
export const FORMATS = {
 A5L:[210,148],A4P:[210,297],A4L:[297,210],A3P:[297,420],A3L:[420,297],A2P:[420,594],A2L:[594,420],A1P:[594,841],A1L:[841,594],A0P:[841,1189],A0L:[1189,841],
 A0x2:[1189,1682],A0x3:[1189,2523],A1x3:[841,1783],A1x4:[841,2378],A2x3:[594,1261],A2x4:[594,1682],A2x5:[594,2102],A3x3:[420,891],A3x4:[420,1189],A3x5:[420,1486],A3x6:[420,1783],A3x7:[420,2080],A4x3:[297,630],A4x4:[297,841],A4x5:[297,1051],A4x6:[297,1261],A4x7:[297,1471],A4x8:[297,1682],A4x9:[297,1892]
};
export function formatForTemplate(id){return TEMPLATES.find(t=>t.id===id)?.format || 'A3P';}
