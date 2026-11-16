import assert from 'node:assert/strict';
import { Line, Circle, Arc } from '../src/cad-geometry-trim.mjs';
import { eraseAlongPath } from '../src/eraser.mjs';

// Deterministic pseudo-random checks compare computed erase intervals with
// direct point-to-brush distance sampling. Seeded so the test is reproducible.
let seed = 0x2a5f19;
const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000; };
const pointSegDist = (p,a,b) => {
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
const pathDist=(p,path)=>path.length===1?pointSegDist(p,path[0],path[0]):Math.min(...path.slice(1).map((b,i)=>pointSegDist(p,path[i],b)));
const insideIntervals=(t, intervals)=>intervals.some(([a,b])=>t>=a-1e-7&&t<=b+1e-7);

for(let k=0;k<80;k++){
  const line=new Line({x:rand()*100-50,y:rand()*100-50},{x:rand()*100-50,y:rand()*100-50});
  const path=Array.from({length:2+Math.floor(rand()*3)},()=>({x:rand()*100-50,y:rand()*100-50}));
  const radius=1+rand()*8,tx=eraseAlongPath([line],path,radius);
  const intervals=tx.ok?tx.removed[0].intervals:[];
  for(let i=0;i<=120;i++){
    const t=i/120,inside=pathDist(line.pointAt(t),path)<=radius-1e-5;
    const erased=insideIntervals(t,intervals);
    if(pathDist(line.pointAt(t),path)<=radius-1e-5) assert.equal(erased,true,`Line missed erase in case ${k}, t=${t}`);
    if(pathDist(line.pointAt(t),path)>=radius+1e-5) assert.equal(erased,false,`Line false erase in case ${k}, t=${t}`);
  }
}

for(let k=0;k<40;k++){
  const circle=new Circle({x:rand()*60-30,y:rand()*60-30},8+rand()*25);
  const path=Array.from({length:2+Math.floor(rand()*2)},()=>({x:rand()*60-30,y:rand()*60-30}));
  const radius=1+rand()*6,tx=eraseAlongPath([circle],path,radius);
  const intervals=tx.ok?tx.removed[0].intervals:[];
  for(let i=0;i<240;i++){
    const t=i/240,p=circle.pointAtAngle(t*Math.PI*2),inside=pathDist(p,path)<=radius-1e-5;
    const erased=insideIntervals(t,intervals);
    if(pathDist(p,path)<=radius-1e-5) assert.equal(erased,true,`Circle missed erase in case ${k}, t=${t}`);
    if(pathDist(p,path)>=radius+1e-5) assert.equal(erased,false,`Circle false erase in case ${k}, t=${t}`);
  }
}

for(let k=0;k<30;k++){
  const sweep=(0.4+rand()*1.8)*(rand()<.5?-1:1);
  const arc=new Arc({x:rand()*30-15,y:rand()*30-15},10+rand()*20,rand()*Math.PI*2,sweep);
  const path=Array.from({length:2},()=>({x:rand()*40-20,y:rand()*40-20}));
  const radius=1+rand()*6,tx=eraseAlongPath([arc],path,radius);
  const intervals=tx.ok?tx.removed[0].intervals:[];
  for(let i=0;i<=160;i++){
    const t=i/160,inside=pathDist(arc.pointAt(t),path)<=radius-1e-5;
    const erased=insideIntervals(t,intervals);
    const p=arc.pointAt(t);
    if(pathDist(p,path)<=radius-1e-5) assert.equal(erased,true,`Arc missed erase in case ${k}, t=${t}`);
    if(pathDist(p,path)>=radius+1e-5) assert.equal(erased,false,`Arc false erase in case ${k}, t=${t}`);
  }
}
console.log('All deterministic eraser property checks passed (150 seeded geometries).');
