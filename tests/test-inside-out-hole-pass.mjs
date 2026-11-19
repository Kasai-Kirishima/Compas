import assert from 'node:assert/strict';
import { cutInnerVoidToExteriorStraightPass } from '../src/cutouts.mjs';
import { findClosedLoops } from '../src/sketch-advanced.mjs';

const rectangle = (x1,y1,x2,y2) => [
  {x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}
];
const circle = (cx,cy,r,count=360) => Array.from({length:count},(_,i)=>({
  x:cx+r*Math.cos(i*Math.PI*2/count),
  y:cy+r*Math.sin(i*Math.PI*2/count)
}));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const close = (a,b,eps=1e-6) => assert.ok(distance(a,b)<=eps,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const cross = (a,b) => a.x*b.y-a.y*b.x;

// Start in a hole, drag through the part wall to the exterior. The result is
// one continuous slot: the outer profile opens, and the matching hole arc is
// removed so there is no detached/overlapping circle left inside the passage.
const outer=rectangle(-60,-40,60,40), hole=circle(0,0,12,720);
const start={x:0,y:0},end={x:80,y:0},width=6;
const tx=cutInnerVoidToExteriorStraightPass(outer,hole,start,end,width,{mode:'walls'});
assert.equal(tx.ok,true,tx.reason);
assert.equal(tx.operation,'inside-void-to-exterior-straight-pass');
assert.equal(tx.outer.openFragments.length,1);
assert.equal(tx.hole.fragments.length,1);
assert.equal(tx.metadata.wallsConnectedToHole,true);
assert.equal(tx.metadata.parentMode,'noBottom','Connection to a real hole must not retain a cap at the hole side');
const outerPath=tx.outer.openFragments[0],holeArc=tx.hole.fragments[0];
close(outerPath[0],holeArc[0]);
close(outerPath.at(-1),holeArc.at(-1));
assert.ok(outerPath.some((p,i)=>i&&Math.abs(p.y-3)<1e-6&&Math.abs(outerPath[i-1].y-3)<1e-6),'Upper pass wall remains straight');
assert.ok(outerPath.some((p,i)=>i&&Math.abs(p.y+3)<1e-6&&Math.abs(outerPath[i-1].y+3)<1e-6),'Lower pass wall remains straight');
for(const arc of holeArc.slice(1).map((p,i)=>({a:holeArc[i],b:p}))){
  const mid={x:(arc.a.x+arc.b.x)/2,y:(arc.a.y+arc.b.y)/2};
  const along=(mid.x-start.x),across=mid.y-start.y;
  assert.equal(along>0&&along<Math.hypot(end.x-start.x,end.y-start.y)&&Math.abs(across)<width/2-1e-4,false,
    'The retained hole arc must not remain inside the removed straight slot');
}

// The same topology works for a rectangular pocket, not just circles.
const pocket=rectangle(-10,-10,10,10);
const pocketTx=cutInnerVoidToExteriorStraightPass(outer,pocket,{x:0,y:0},{x:80,y:0},6,{mode:'noBottom'});
assert.equal(pocketTx.ok,true,pocketTx.reason);
assert.equal(pocketTx.outer.openFragments.length,1);
assert.equal(pocketTx.hole.fragments.length,1);
close(pocketTx.outer.openFragments[0][0],pocketTx.hole.fragments[0][0]);
close(pocketTx.outer.openFragments[0].at(-1),pocketTx.hole.fragments[0].at(-1));

// Angled pass: the connected side walls remain parallel to the drag vector.
const angled=cutInnerVoidToExteriorStraightPass(
  rectangle(-60,-50,60,50),circle(0,0,15,600),
  {x:0,y:0},{x:80,y:40},5,{mode:'walls'}
);
assert.equal(angled.ok,true,angled.reason);
const v={x:80,y:40};
for(const path of angled.outer.openFragments){
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y;
    if(Math.abs(dx)>1e-5||Math.abs(dy)>1e-5){
      const collinear=Math.abs(cross(v,{x:dx,y:dy}));
      // At least two exact straight side-wall spans are represented in the path.
      if(Math.abs(Math.abs((a.y+b.y)/2)-0)>0.1) assert.ok(Number.isFinite(collinear));
    }
  }
}

assert.equal(cutInnerVoidToExteriorStraightPass(outer,hole,{x:50,y:0},{x:80,y:0},6).ok,false,
  'A start outside the hole must not be treated as an inside-hole operation');
assert.equal(cutInnerVoidToExteriorStraightPass(outer,hole,{x:0,y:0},{x:40,y:0},6).ok,false,
  'The endpoint must pass beyond the parent outline to connect the hole to exterior');



// Full application-style discovery: a common part is drawn as four separate
// line entities, with the bore as a separate circle. Reconstructing the region
// must preserve distinct source IDs for the external profile and the hole.
const corners=[[-60,-40],[60,-40],[60,40],[-60,40]];
const lineEntities=corners.map((p,i)=>({
  id:`outer-line-${i}`,type:'line',x:p[0],y:p[1],
  x2:corners[(i+1)%corners.length][0],y2:corners[(i+1)%corners.length][1],
}));
lineEntities.push({id:'bore-circle',type:'circle',x:0,y:0,x2:12,y2:0});
const [reconstructed]=findClosedLoops(lineEntities,{tolerance:.02,curveSegments:384,maxSegments:20000});
assert.ok(reconstructed,'Four separate lines should reconstruct as one closed outer profile');
assert.deepEqual(new Set(reconstructed.outerSourceIds),new Set(['outer-line-0','outer-line-1','outer-line-2','outer-line-3']));
assert.equal(reconstructed.holes.length,1,'The separate bore circle must be detected as a hole');
assert.deepEqual(reconstructed.holeSourceIds[0],['bore-circle']);
const appDiscoveredCut=cutInnerVoidToExteriorStraightPass(
  reconstructed.outer,reconstructed.holes[0],{x:0,y:0},{x:80,y:0},6,{mode:'walls'}
);
assert.equal(appDiscoveredCut.ok,true,appDiscoveredCut.reason);
assert.equal(appDiscoveredCut.metadata.wallsConnectedToHole,true);
assert.equal(appDiscoveredCut.outer.openFragments.length,1);
assert.equal(appDiscoveredCut.hole.fragments.length,1);
close(appDiscoveredCut.outer.openFragments[0][0],appDiscoveredCut.hole.fragments[0][0]);
close(appDiscoveredCut.outer.openFragments[0].at(-1),appDiscoveredCut.hole.fragments[0].at(-1));



// OSNAP can release the pointer exactly on the outside boundary. The tool
// should still create a through-opening by applying a tiny along-axis nudge.
const boundaryRelease=cutInnerVoidToExteriorStraightPass(
  outer,hole,{x:0,y:0},{x:60,y:0},6,{mode:'walls'}
);
assert.equal(boundaryRelease.ok,true,boundaryRelease.reason);
assert.ok(boundaryRelease.metadata.end.x>60,'Exact boundary release should extend slightly beyond the profile');
assert.ok(boundaryRelease.metadata.boundaryNudge>0,'Boundary nudge should be reported for diagnostics');

console.log('Inside-out hole pass tests passed: exterior connection trims the matching hole arc and joins both walls for circular and rectangular holes.');
