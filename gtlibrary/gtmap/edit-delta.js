export function captureMapDelta(selection,{insertions=[],editId=0,transform=value=>value}={}){
 const snapshots=selection.snapshot([...selection.records.values()]).map(transform).filter(Boolean).filter(snapshot=>selection.baseline.get(snapshot.id)!==JSON.stringify(snapshot));
 return {delta:true,snapshots,insertions:structuredClone(insertions),history:[],future:[],ids:[],editId};
}
