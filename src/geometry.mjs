/** Millimetre geometry helpers shared by the editor and tests. */
export const distance = (a,b) => Math.hypot(b.x-a.x,b.y-a.y);
export const snapToGrid = (p,step=5) => ({x:Math.round(p.x/step)*step,y:Math.round(p.y/step)*step});
export const normalizeRect = (a,b) => ({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)});
export const boundsOf = (pts) => { if(!pts?.length) return null; const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y); const x=Math.min(...xs),y=Math.min(...ys); return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y}; };
export const isValidSheet = (w,h) => Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0&&w<=3000&&h<=3000;
