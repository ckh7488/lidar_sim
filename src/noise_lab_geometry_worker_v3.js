let newest=0;
const engines=new Map();
async function unpack64(s,T){const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new T(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())}
async function makeEngine(raw,beam){
  const values=await Promise.all([unpack64(raw.vertices,Float32Array),unpack64(raw.faces,Uint32Array),unpack64(raw.rho,Float32Array),unpack64(raw.terrain.vertices,Float32Array),unpack64(raw.terrain.faces,Uint32Array),unpack64(beam.directions,Float32Array),unpack64(beam.origins,Float32Array)]);
  return NoiseLabGeometry.engine({...raw,vertices:values[0],faces:values[1],rho:values[2],terrain:{...raw.terrain,vertices:values[3],faces:values[4]}},{...beam,dirs:values[5],offsets:values[6]});
}
onmessage=async e=>{
  const {id,raw,beam,config}=e.data;newest=id;
  try{
    if(!engines.has(raw.id)){engines.clear();engines.set(raw.id,makeEngine(raw,beam))}
    const engine=await engines.get(raw.id);if(id!==newest)return;
    const value=await engine.cast(config,async()=>{await new Promise(r=>setTimeout(r,0));return id===newest});
    if(value&&id===newest){const transfers=Object.values(value.input).filter(x=>ArrayBuffer.isView(x)).map(x=>x.buffer);postMessage({id,...value},transfers)}
  }catch(error){if(id===newest)postMessage({id,error:String(error)})}
};
