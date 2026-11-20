import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/project-file.mjs';
const source={name:'sample',sheet:{width:420,height:297,format:'A3L'},templateId:'lab8-reference-template',title:{title:'Корпус'},objects:[{id:'x',type:'circle',center:{x:1,y:2},r:3}],settings:{grid:true}};
const packed=createProject(source);const opened=parseProject(JSON.stringify(packed));
assert.equal(opened.name,'sample');assert.equal(opened.sheet.width,420);assert.equal(opened.templateId,'lab8-reference-template');assert.equal(opened.objects[0].r,3);assert.throws(()=>parseProject('{bad json'));
console.log('project-file: ok');
