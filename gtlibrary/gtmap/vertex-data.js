/** Unity VertexAttributeFormat. MeshHelper exposes normalized integer channels as raw values. */
export function vertexColors(values,format){
 if(!values)return null;
 if(format===2)return values.map(v=>v/255); // UNorm8
 if(format===4)return values.map(v=>v/65535); // UNorm16
 if(format===3)return values.map(v=>Math.max(-1,v/127)); // SNorm8
 if(format===5)return values.map(v=>Math.max(-1,v/32767)); // SNorm16
 return values; // Float/Half/integer formats retain their original meaning, including HDR.
}
