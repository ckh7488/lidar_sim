let motionEngineKey='',motionEngine=null,motionLatest=0;
async function motionUnpack(s,T){const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new T(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
async function motionObstacles(raw,beam,cm){
  if(motionEngineKey!==raw.id){
    const v=await Promise.all([motionUnpack(raw.vertices,Float32Array),motionUnpack(raw.faces,Uint32Array),motionUnpack(raw.rho,Float32Array),motionUnpack(raw.terrain.vertices,Float32Array),motionUnpack(raw.terrain.faces,Uint32Array)]);
    motionEngine=NoiseLabGeometry.engine({...raw,vertices:v[0],faces:v[1],rho:v[2],terrain:{...raw.terrain,vertices:v[3],faces:v[4]}},beam);motionEngineKey=raw.id;
  }
  motionEngine.prepare(cm);return motionEngine.blocked;
}
onmessage=async e=>{
  const {id,input,config,raw,beam,terrainCm}=e.data;motionLatest=id;
  try{
    if(config.reviewKind){let review;if(config.reviewKind==='fog')review=NoiseLabFullRange.fog(input,config,NoiseLabReceiver,NoiseLabAtmosphere);else if(config.reviewKind==='weak')review=NoiseLabAtmosphere.weak(input,config,NoiseLabReceiver);else {const blocked=await motionObstacles(raw,beam,terrainCm);if(id!==motionLatest)return;review=NoiseLabAtmosphere.edge(input,config,blocked.castRay);}review.metrics=NoiseLabMetrics.describe(review.xyz,review.labels);if(id===motionLatest)postMessage({id,result:review});return;}
    if(config.solarEnabled){const blocked=await motionObstacles(raw,beam,terrainCm);if(id!==motionLatest)return;const review=NoiseLabFullRange.sunlight(input,config,NoiseLabReceiver,NoiseLabAtmosphere,blocked);review.metrics=NoiseLabMetrics.describe(review.xyz,review.labels);if(id===motionLatest)postMessage({id,result:review});return;}
    let motion=null,solar=null;
    if(config.motionEnabled&&config.weatherEnabled){
      const blocked=await motionObstacles(raw,beam,terrainCm);if(id!==motionLatest)return;
      motion=["rain","snow"].includes(config.weather)?NoiseLabFullRange.precipitation(input,config,blocked,NoiseLabWeather.overlap,NoiseLabReceiver,NoiseLabMotion):NoiseLabMotion.simulate(input,config,blocked,NoiseLabWeather.overlap);input.motion=motion;
    }
    if(config.solarEnabled){const blocked=await motionObstacles(raw,beam,terrainCm);if(id!==motionLatest)return;solar=NoiseLabSolar.simulate(input,config,blocked,NoiseLabWeather.overlap);if(config.solarMode!=='reference')input.solar=solar;}
    const photon=(motion&&config.receiverMode!=='legacy')||input.solar;
    const r=photon?NoiseLabReceiver.simulate(input,config,NoiseLabCore):NoiseLabCore.simulate(input,config);r.metrics=NoiseLabMetrics.describe(r.xyz,r.labels);
    if(solar){r.solar=solar;r.stats.solar=solar.stats;}
    if(motion){r.world=motion.world;r.worldIds=motion.worldIds;r.worldV=motion.worldV;r.stats.motion=motion.stats;r.motionConfig=motion.config;}
    if(id===motionLatest)postMessage({id,result:r});
  }catch(error){if(id===motionLatest)postMessage({id,error:String(error.stack||error)})}
};
