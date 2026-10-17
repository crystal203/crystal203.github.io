// Field.GetFieldObjectsInRadius (0x63c712c): sphere against Bounds.ClosestPoint.
export function objectBounds(o){
 const p=o.position,b=o.nativeBounds;
 if(b)return b.map((v,i)=>v+p[i%3]);
 const r=o.collider||[-.25,-.2,.25,.2];
 // FieldObjectSpec default Hitbox: width .5, height .75, depth .4.
 return [p[0]+r[0],p[1],p[2]+r[1],p[0]+r[2],p[1]+.75,p[2]+r[3]];
}
export function sphereTouches(p,r,b){return Math.hypot(...p.map((v,i)=>v-Math.max(b[i],Math.min(b[i+3],v))))<=r;}
export function boundsTouch(a,b){return [0,1,2].every(i=>a[i]<=b[i+3]&&b[i]<=a[i+3]);}
export function actorBounds(game,p=game.state.position){const b=game.stage.nativeMechanics.characterHitboxes.default;return [...p.map((v,i)=>v-b.pivot[i]*b.size[i]),...p.map((v,i)=>v+(1-b.pivot[i])*b.size[i])];}
