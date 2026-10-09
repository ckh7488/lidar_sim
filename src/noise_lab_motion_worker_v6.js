let motionEngineKey='',motionEngine=null,motionLatest=0;
async function motionUnpack(s,T){const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new T(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
async function motionObstacles(raw,beam,cm,layout){
  const key=raw.id+":"+(layout?.key||"base");
  if(motionEngineKey!==key){
    const v=await Promise.all([motionUnpack(raw.vertices,Float32Array),motionUnpack(raw.faces,Uint32Array),motionUnpack(raw.rho,Float32Array),motionUnpack(raw.terrain.vertices,Float32Array),motionUnpack(raw.terrain.faces,Uint32Array)]);
    await NoiseLabScene.warm();const decoded={...raw,vertices:v[0],faces:v[1],rho:v[2],terrain:{...raw.terrain,vertices:v[3],faces:v[4]}};motionEngine=NoiseLabGeometry.engine(NoiseLabScene.compose(decoded,layout),beam);motionEngineKey=key;
  }
  motionEngine.prepare(cm);return motionEngine.blocked;
}
onmessage=async e=>{
  const {id,raw,beam,terrainCm}=e.data;let {input,config}=e.data;motionLatest=id;
  try{
    self.onWeatherProgress=progress=>{if(id===motionLatest)postMessage({id,progress});};
    if(e.data.precipPartition){const blocked=await motionObstacles(raw,beam,terrainCm,config.sceneLayout);const motion=NoiseLabPrecipitation.simulate(input,config,blocked,NoiseLabWeather.overlap,NoiseLabReceiver,NoiseLabMotion);postMessage({id,motion});return;}
    const original=input,requested={...config};
    let edge=null;
    if(config.edgeMixing||(config.reviewKind==='edge'&&config.reviewEnabled!==false)){
      const blocked=await motionObstacles(raw,beam,terrainCm,config.sceneLayout);if(id!==motionLatest)return;
      const prepared=NoiseLabObservation.prepare(input,config,blocked.castRay,NoiseLabAtmosphere);input=prepared.input;edge=prepared.edge;
    }
    config={...config,radialSigma:0,radialSlope:0};
    if(config.reviewKind==='edge')config={...config,reviewKind:'',weather:'none',motionEnabled:false};
    const finish=r=>{
      NoiseLabObservation.finish(r,original,input,requested,edge);
      if(requested.reviewKind==='edge')r.stats.review=edge||{kind:'edge',enabled:false,bundles:0,mixed:0,maxBias:0};
      r.metrics=NoiseLabMetrics.describe(r.xyz,r.labels);
      return NoiseLabChannels.attach(r,original,requested);
    };
    if(config.reviewKind){let review;if(config.reviewKind==='fog')review=NoiseLabFullRange.fog(input,config,NoiseLabReceiver,NoiseLabAtmosphere);else if(config.reviewKind==='weak')review=NoiseLabAtmosphere.weak(input,config,NoiseLabReceiver);else {const blocked=await motionObstacles(raw,beam,terrainCm,config.sceneLayout);if(id!==motionLatest)return;review=NoiseLabAtmosphere.edge(input,config,blocked.castRay);}if(id===motionLatest)postMessage({id,result:finish(review)});return;}
    if(config.solarEnabled){const blocked=await motionObstacles(raw,beam,terrainCm,config.sceneLayout);if(id!==motionLatest)return;const review=NoiseLabFullRange.sunlight(input,config,NoiseLabReceiver,NoiseLabAtmosphere,blocked);if(id===motionLatest)postMessage({id,result:finish(review)});return;}
    let motion=null,solar=null;
    if(config.motionEnabled&&config.weatherEnabled){
      const blocked=await motionObstacles(raw,beam,terrainCm,config.sceneLayout);if(id!==motionLatest)return;
      motion=["rain","snow"].includes(config.weather)?(config.temporalWeather!==false&&config.precipWorkers>1&&typeof NodePartitionWorker!=='undefined'?await precipitationParallel(input,config,raw,beam,terrainCm,id):NoiseLabFullRange.precipitation(input,config,blocked,NoiseLabWeather.overlap,NoiseLabReceiver,NoiseLabMotion)):NoiseLabMotion.simulate(input,config,blocked,NoiseLabWeather.overlap);input.motion=motion;
    }
    if(config.solarEnabled){const blocked=await motionObstacles(raw,beam,terrainCm,config.sceneLayout);if(id!==motionLatest)return;solar=NoiseLabSolar.simulate(input,config,blocked,NoiseLabWeather.overlap);if(config.solarMode!=='reference')input.solar=solar;}
    const photon=(motion&&config.receiverMode!=='legacy')||input.solar;
    const r=photon?NoiseLabReceiver.simulate(input,config,NoiseLabCore):NoiseLabCore.simulate(input,config);
    if(solar){r.solar=solar;r.stats.solar=solar.stats;}
    if(motion){r.world=motion.world;r.worldIds=motion.worldIds;r.worldV=motion.worldV;r.stats.motion=motion.stats;r.motionConfig=motion.config;}
    if(id===motionLatest)postMessage({id,result:finish(r)});
  }catch(error){if(id===motionLatest)postMessage({id,error:String(error.stack||error)})}
};
