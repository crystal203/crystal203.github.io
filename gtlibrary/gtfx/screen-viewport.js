/** Map an authored native game frame into a resizable preview without stretching it.
 * ScreenEffectObject still scales in its own game viewport; unused preview width
 * is padding. The game frame comes from the source script's baseAspect/baseSize.
 */
export function screenEffectViewport(camera,fields){
 const frameAspect=fields.baseAspect||2.08,actualAspect=(camera.right-camera.left)/(camera.top-camera.bottom);
 const fit=Math.min(1,actualAspect/frameAspect);
 return {aspect:frameAspect,orthographicSize:camera.top*fit,fit,actualAspect,frameAspect};
}
