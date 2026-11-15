const fs=require('fs');
global.window={};
require('./js/template.js');
const data={title:'Лабораторна робота 5',code:'КТ-24.ЛР5.001',material:'',scale:'',sheet:'',sheets:'1',company:'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ',liter:'У',mass:'—',developer:'Кушвид О.А.',checker:'Базиль Б.'};
const markup=window.KompasTemplate.markup('A4P',data,'lab5-template');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="white"/>${markup}</svg>`;
fs.writeFileSync('assets/template-lab5-blank.svg',svg);
