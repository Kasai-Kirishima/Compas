export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const normalizeAngle = (deg) => ((deg % 360) + 360) % 360;
export function constrainAngle(a, b, step = 15) {
  const d = distance(a, b); const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const snapped = Math.round(angle / (step * Math.PI / 180)) * (step * Math.PI / 180);
  return { x: a.x + d * Math.cos(snapped), y: a.y + d * Math.sin(snapped) };
}
export function lineProjection(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (!len2) return { ...a, t: 0 };
  const t = clamp(((p.x-a.x)*dx + (p.y-a.y)*dy) / len2, 0, 1);
  return { x: a.x+t*dx, y: a.y+t*dy, t };
}
export function boundsOfObject(o) {
  const pts = [];
  if (o.points) pts.push(...o.points);
  for (const k of ['a','b','c','center']) if (o[k]) pts.push(o[k]);
  if (o.x != null && o.y != null) {
    const w = o.w ?? 0, h = o.h ?? 0;
    pts.push({x:o.x,y:o.y},{x:o.x+w,y:o.y+h});
  }
  if (o.r != null && o.center) pts.push({x:o.center.x-o.r,y:o.center.y-o.r},{x:o.center.x+o.r,y:o.center.y+o.r});
  if (o.rx != null && o.center) pts.push({x:o.center.x-o.rx,y:o.center.y-o.ry},{x:o.center.x+o.rx,y:o.center.y+o.ry});
  if (!pts.length) return {x:0,y:0,w:0,h:0};
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
export function nearestPoint(p, objects, tolerance = 3) {
  let best = null;
  const priority = { endpoint:0, center:0, quadrant:0, segment:1, midpoint:2 };
  const consider = (q, type, id) => {
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) return;
    const d = distance(p, q);
    const closer = !best || d < best.distance - 1e-9;
    const tieBetter = best && Math.abs(d-best.distance) <= 1e-9 && (priority[type] ?? 3) < (priority[best.type] ?? 3);
    if (d <= tolerance && (closer || tieBetter)) best = { x:q.x, y:q.y, type, id, distance:d };
  };
  for (const o of objects) {
    if (o.hidden) continue;
    const dx = Number(o.dx) || 0, dy = Number(o.dy) || 0;
    const move = q => q ? ({x:q.x+dx, y:q.y+dy}) : null;
    if (['line','arrowLine','construction','ray','xline','ruler','centerline','dimension','dimH','dimV','dimDia','dimRad'].includes(o.type)) {
      const a = move(o.a || (o.x1!=null ? {x:o.x1,y:o.y1} : null));
      const b = move(o.b || (o.x2!=null ? {x:o.x2,y:o.y2} : null));
      if (a && b) {
        consider(a,'endpoint',o.id);
        consider(b,'endpoint',o.id);
        consider(lineProjection(p,a,b),'segment',o.id);
        consider(midpoint(a,b),'midpoint',o.id);
      }
    } else if (['circle','arc','centerMark','ellipse'].includes(o.type) && o.center) {
      const c = move(o.center);
      consider(c,'center',o.id);
      if (o.r) for (let i=0;i<4;i++) {
        const t=i*Math.PI/2;
        consider({x:c.x+o.r*Math.cos(t),y:c.y+o.r*Math.sin(t)},'quadrant',o.id);
      }
      if (o.rx && o.ry) {
        consider({x:c.x-o.rx,y:c.y},'quadrant',o.id);
        consider({x:c.x+o.rx,y:c.y},'quadrant',o.id);
        consider({x:c.x,y:c.y-o.ry},'quadrant',o.id);
        consider({x:c.x,y:c.y+o.ry},'quadrant',o.id);
      }
    } else if (o.points) {
      for (const point of o.points) consider(move(point),'endpoint',o.id);
      if (o.points.length > 1) {
        const n = o.points.length - (o.type === 'polygon' ? 0 : 1);
        for (let i=0;i<n;i++) {
          const a=move(o.points[i]), b=move(o.points[(i+1)%o.points.length]);
          consider(lineProjection(p,a,b),'segment',o.id);
          consider(midpoint(a,b),'midpoint',o.id);
        }
      }
    } else if (o.type === 'rect' && o.x!=null && o.y!=null) {
      const corners=[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}].map(move);
      for (let i=0;i<4;i++) {
        consider(corners[i],'endpoint',o.id);
        consider(lineProjection(p,corners[i],corners[(i+1)%4]),'segment',o.id);
      }
      consider(move({x:o.x+o.w/2,y:o.y+o.h/2}),'center',o.id);
    }
  }
  return best;
}
export function pathData(points, close = false) {
  if (!points?.length) return '';
  return `M ${points.map(p=>`${p.x} ${p.y}`).join(' L ')}${close?' Z':''}`;
}

// Smooth Catmull–Rom spline expressed as SVG cubic Bézier segments.
export function splinePathData(points, close = false) {
  if (!points?.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return pathData(points, close);
  const pts = points.map(p => ({x:Number(p.x), y:Number(p.y)}));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const segmentCount = close ? pts.length : pts.length - 1;
  for (let i=0; i<segmentCount; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length] || pts[i];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length] || p2;
    const c1 = {x:p1.x + (p2.x-p0.x)/6, y:p1.y + (p2.y-p0.y)/6};
    const c2 = {x:p2.x - (p3.x-p1.x)/6, y:p2.y - (p3.y-p1.y)/6};
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d + (close ? ' Z' : '');
}
export function svgEscape(s='') { return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
