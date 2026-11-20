import { lineProjection, distance } from './geometry.mjs';

function nearestEdge(point, points, closed=false) {
  const count = closed ? points.length : points.length - 1;
  let best = null;
  for (let i=0;i<count;i++) {
    const a=points[i], b=points[(i+1)%points.length];
    const projected=lineProjection(point,a,b), d=distance(point,projected);
    if (!best || d<best.distance) best={index:i,point:{x:projected.x,y:projected.y},t:projected.t,distance:d};
  }
  return best;
}

/** Remove a finite-width interval around the closest point on an open path. */
export function removePathWindow(points, point, width, tolerance=5) {
  if (!Array.isArray(points) || points.length<2) return null;
  const hit=nearestEdge(point,points,false);
  if (!hit || hit.distance>Math.max(0, Number(tolerance)||0)) return null;
  const a=points[hit.index], b=points[hit.index+1], len=distance(a,b);
  if (len<1e-9) return null;
  const half=Math.max(0,Number(width)||0)/2/len;
  const t0=Math.max(0,hit.t-half), t1=Math.min(1,hit.t+half);
  if (t1-t0<1e-9) return null;
  const at=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const left=[...points.slice(0,hit.index+1),at(t0)];
  const right=[at(t1),...points.slice(hit.index+1)];
  const result=[];
  if (left.length>=2 && distance(left[0],left.at(-1))>1e-8) result.push(left);
  if (right.length>=2 && distance(right[0],right.at(-1))>1e-8) result.push(right);
  return result.length ? result : null;
}

/** Split an open path at its closest internal point. */
export function splitOpenPath(points, point, tolerance=5) {
  if (!Array.isArray(points) || points.length<2) return null;
  const hit=nearestEdge(point,points,false);
  if (!hit || hit.distance>tolerance || hit.t<1e-8 || hit.t>1-1e-8) return null;
  const a=points[hit.index],b=points[hit.index+1],q=hit.point;
  const first=[...points.slice(0,hit.index+1),q];
  const second=[q,...points.slice(hit.index+1)];
  if (first.length<2 || second.length<2) return null;
  return [first,second];
}

/** Split a simple closed polygon by a straight chord between two picked boundary points. */
export function splitClosedPolygon(points, pointA, pointB, tolerance=5) {
  if (!Array.isArray(points) || points.length<3) return null;
  const a=nearestEdge(pointA,points,true), b=nearestEdge(pointB,points,true);
  if (!a || !b || a.distance>tolerance || b.distance>tolerance) return null;
  if (a.index===b.index || distance(a.point,b.point)<1e-6) return null;
  const walk=(from,to)=>{
    const out=[from.point];
    let i=from.index;
    for(let guard=0;guard<points.length+1;guard++){
      i=(i+1)%points.length;
      if(i===to.index) break;
      out.push(points[i]);
    }
    out.push(to.point);
    return out;
  };
  const first=walk(a,b), second=walk(b,a);
  if(first.length<3 || second.length<3) return null;
  const area=arr=>Math.abs(arr.reduce((sum,p,i)=>{const q=arr[(i+1)%arr.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
  if(area(first)<1e-6 || area(second)<1e-6) return null;
  return [first,second];
}
