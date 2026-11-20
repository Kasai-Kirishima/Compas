import {createProject} from '../src/project-file.mjs';
const demo=createProject({name:'Демо — корпус',sheet:{format:'A3L',width:420,height:297},templateId:'lab8-reference-template',title:{title:'Корпус',developer:'Кушвид О.',checker:'Базиль Б.'},objects:[{id:'base',type:'rect',x:30,y:70,w:140,h:65,color:'#20252a',width:.5},{id:'hole',type:'circle',center:{x:100,y:102.5},r:18,color:'#20252a',width:.5}]});
console.log(JSON.stringify(demo,null,2));
