export const PROJECT_FORMAT = 'kcad';
export const PROJECT_VERSION = 1;
export function createProject(state){
 return {format:PROJECT_FORMAT,version:PROJECT_VERSION,app:'CAD Geometry Core restored',savedAt:new Date().toISOString(),name:state.name||'Чертёж',sheet:structuredClone(state.sheet),templateId:state.templateId||'lab4-reference-template',title:structuredClone(state.title||{}),objects:structuredClone(state.objects||[]),settings:structuredClone(state.settings||{})};
}
export function parseProject(input){
 let data=typeof input==='string'?JSON.parse(input):input;
 if(!data||typeof data!=='object')throw new Error('Файл проекта пуст или повреждён');
 if(Array.isArray(data)) return {format:'kcad',version:0,name:'Импортированный чертёж',sheet:{width:297,height:420,format:'A3P'},templateId:'lab4-reference-template',title:{},objects:data,settings:{}};
 if(data.format && data.format!=='kcad' && data.format!=='cad-geometry-core')throw new Error('Неподдерживаемый формат проекта');
 const objects=Array.isArray(data.objects)?data.objects:(Array.isArray(data.geometry)?data.geometry:[]);
 return {format:'kcad',version:data.version||0,name:data.name||'Импортированный чертёж',sheet:{width:Number(data.sheet?.width)||297,height:Number(data.sheet?.height)||420,format:data.sheet?.format||'A3P'},templateId:data.templateId||data.template||'lab4-reference-template',title:data.title||data.titleFields||{},objects,settings:data.settings||{}};
}
