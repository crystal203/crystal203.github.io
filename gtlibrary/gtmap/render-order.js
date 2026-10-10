/** Unity transparent sorting layers precede material queue and object distance. */
export function renderOrder(queue,layerIndex,sortingLayer=0,order=0,layers=[]){
 const base=layers.findIndex(l=>l.name==='Default');
 const index=layers.findIndex(l=>typeof sortingLayer==='string'?l.name===sortingLayer:(l.uniqueID>>>0)===(sortingLayer>>>0));
 return (index<0||base<0?0:index-base)*100000+queue*20+layerIndex+(order||0)*.001;
}
