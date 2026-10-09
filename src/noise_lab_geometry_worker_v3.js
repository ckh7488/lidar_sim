let newest=0;
const engines=new Map();let sequenceCache=null;
async function unpack64(s,T){const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new T(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())}
async function makeEngine(raw,beam){
  const values=await Promise.all([unpack64(raw.vertices,Float32Array),unpack64(raw.faces,Uint32Array),unpack64(raw.rho,Float32Array),unpack64(raw.terrain.vertices,Float32Array),unpack64(raw.terrain.faces,Uint32Array),unpack64(beam.directions,Float32Array),unpack64(beam.origins,Float32Array)]);
  return NoiseLabGeometry.engine({...raw,vertices:values[0],faces:values[1],rho:values[2],terrain:{...raw.terrain,vertices:values[3],faces:values[4]}},{...beam,dirs:values[5],offsets:values[6]});
}
onmessage=async e=>{
  const {id,raw,beam,config}=e.data;newest=id;
  try{
    const engineKey=raw.id+':'+(beam.profileKey||beam.name);if(!engines.has(engineKey)){engines.clear();engines.set(engineKey,makeEngine(raw,beam))}
    const engine=await engines.get(engineKey);if(id!==newest)return;
    let castConfig=config,sequencePlan=null;
    if(config.sequence){
      engine.prepare(config.terrainCm);
      const key=JSON.stringify([raw.id,config.sensorPose,config.terrainCm,config.sequence.seed,config.sequence.sourceBounds]);
      if(sequenceCache?.key!==key){
        const plan=NoiseLabSequence.plan(engine,config.sensorPose,config.sequence);
        const preview=Array.from({length:101},(_,i)=>{const p=NoiseLabSequence.at(plan,i/10);return {time:i/10,world:[p.x,p.y,engine.terrainHeight(p.x,p.y)+p.height],yawDeg:p.yawDeg};});
        sequenceCache={key,plan,preview};
      }
      sequencePlan=sequenceCache.plan;
      if(config.sequence.enabled)castConfig={...config,sensorPose:NoiseLabSequence.at(sequencePlan,config.sequence.time)};
    }
    const value=await engine.cast(castConfig,async()=>{await new Promise(r=>setTimeout(r,0));return id===newest});
    if(value&&id===newest){value.summary.sequencePlan=sequencePlan;value.summary.routePreview=config.sequence?.enabled?sequenceCache.preview:[];const transfers=Object.values(value.input).filter(x=>ArrayBuffer.isView(x)).map(x=>x.buffer);postMessage({id,...value},transfers)}
  }catch(error){if(id===newest)postMessage({id,error:String(error)})}
};
