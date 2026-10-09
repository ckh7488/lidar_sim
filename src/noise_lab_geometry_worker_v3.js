let newest=0;
const engines=new Map();let sequenceCache=null;
async function unpack64(s,T){const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new T(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())}
async function makeEngine(raw,beam,config){
 const values=await Promise.all([unpack64(raw.vertices,Float32Array),unpack64(raw.faces,Uint32Array),unpack64(raw.rho,Float32Array),unpack64(raw.terrain.vertices,Float32Array),unpack64(raw.terrain.faces,Uint32Array),unpack64(beam.directions,Float32Array),unpack64(beam.origins,Float32Array)]);
 const decoded={...raw,vertices:values[0],faces:values[1],rho:values[2],terrain:{...raw.terrain,vertices:values[3],faces:values[4]}},profile={...beam,dirs:values[5],offsets:values[6]};
 let engine=NoiseLabGeometry.engine(decoded,profile),layout=null;
 if(config.sceneVariation?.enabled){await NoiseLabScene.warm();engine.prepare(config.terrainCm);const o=config.sequence;layout=NoiseLabScene.create(engine,decoded,o.scene,o.seed,o.sourceBounds,o.anchors);engine=NoiseLabGeometry.engine(NoiseLabScene.compose(decoded,layout),profile);}
 return {engine,layout};
}
onmessage=async e=>{
 const {id,raw,beam,config}=e.data;newest=id;
 try{
  const engineKey=JSON.stringify([raw.id,beam.profileKey||beam.name,config.sceneVariation?.enabled?config.sequence?.seed:null,config.sceneVariation?.enabled?config.terrainCm:null]);
  if(!engines.has(engineKey)){engines.clear();engines.set(engineKey,makeEngine(raw,beam,config));}
  const {engine,layout}=await engines.get(engineKey);if(id!==newest)return;
  let castConfig=config,sequencePlan=null;
  if(config.sequence){
   engine.prepare(config.terrainCm);
   const free=config.sequence.mode==='free6dof',key=JSON.stringify([engineKey,config.sensorPose,config.terrainCm,config.sequence.seed,config.sequence.sourceBounds,free,config.sequence.randomStart]);
   if(sequenceCache?.key!==key){
    const model=free?NoiseLabFreePose:NoiseLabSequence,plan=model.plan(engine,config.sensorPose,config.sequence);
    const preview=Array.from({length:101},(_,i)=>{const p=model.at(plan,i/10);return {time:i/10,world:[p.x,p.y,p.motion6dof?p.worldZ:engine.terrainHeight(p.x,p.y)+p.height],yawDeg:p.yawDeg,pitchDeg:p.pitchDeg||0,rollDeg:p.rollDeg||0};});
    sequenceCache={key,plan,preview,model};
   }
   sequencePlan=sequenceCache.plan;
   if(config.sequence.enabled||config.sequence.randomStart)castConfig={...config,sensorPose:sequenceCache.model.at(sequencePlan,config.sequence.enabled?config.sequence.time:0)};
  }
  const value=await engine.cast(castConfig,async()=>{await new Promise(r=>setTimeout(r,0));return id===newest});
  if(value&&id===newest){value.summary.sequencePlan=sequencePlan;value.summary.sceneLayout=layout;value.summary.routePreview=config.sequence?.enabled?sequenceCache.preview:[];const transfers=Object.values(value.input).filter(x=>ArrayBuffer.isView(x)).map(x=>x.buffer);postMessage({id,...value},transfers);}
 }catch(error){if(id===newest)postMessage({id,error:String(error.stack||error)})}
};
