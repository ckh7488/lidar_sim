/* Optional Node worker-thread transport; physical field and ray ordering are unchanged. */
async function precipitationParallel(input,config,raw,beam,terrainCm,id){
 const started=performance.now(),children=[],n=input.ranges.length,count=config.precipWorkers,parts=[],progresses=new Array(count).fill(0);
 for(let part=0;part<count;part++)parts.push(new Promise((resolve,reject)=>{
  const lo=Math.floor(n*part/count),hi=Math.floor(n*(part+1)/count),sub={...input};
  for(const [k,v] of Object.entries(input))if(ArrayBuffer.isView(v)){
   if(v.length===n)sub[k]=v.slice(lo,hi);else if(v.length===3*n)sub[k]=v.slice(3*lo,3*hi);
  }
  const child=new NodePartitionWorker(),done=()=>child.terminate();children.push(child);
  child.onmessage=e=>{if(e.data.progress!==undefined){progresses[part]=e.data.progress;self.onWeatherProgress?.(progresses.reduce((a,b)=>a+b,0)/count);return;}if(e.data.error){done();reject(Error(e.data.error));}else{progresses[part]=1;done();resolve({lo,...e.data.motion});}};
  child.onerror=e=>{done();reject(Error(e.message));};
  child.postMessage({id,input:sub,config:{...config,precipWorkers:1,weatherDisplayFraction:input.ranges.length<=1024?1:.005},raw,beam,terrainCm,precipPartition:true});
 }));
 const rows=await Promise.all(parts).finally(()=>children.forEach(w=>w.terminate())),power=new Float32Array(n),range=new Float32Array(n),tau=new Float32Array(n),offsets=new Uint32Array(n+1),ranges=[],powers=[],particleIds=[],world=new Map();
 const stats={...rows[0].stats,intersections:0,particleTests:0,rangeHistogram:[0,0,0,0,0],simulationMs:0,parallelWorkers:count};
 for(const r of rows){
  power.set(r.power,r.lo);range.set(r.range,r.lo);tau.set(r.tau,r.lo);const base=ranges.length;
  for(let j=0;j<r.power.length;j++)offsets[r.lo+j]=base+r.candidates.offsets[j];
  for(const v of r.candidates.ranges)ranges.push(v);for(const v of r.candidates.powers)powers.push(v);for(const v of r.candidates.particleIds)particleIds.push(v);
  for(let j=0;j<r.worldIds.length;j++)world.set(r.worldIds[j],[...r.world.subarray(3*j,3*j+3),...r.worldV.subarray(3*j,3*j+3)]);
  stats.intersections+=r.stats.intersections;stats.particleTests+=r.stats.particleTests;stats.simulationMs=Math.max(stats.simulationMs,r.stats.simulationMs);
  for(let j=0;j<5;j++)stats.rangeHistogram[j]+=r.stats.rangeHistogram[j];
 }
 offsets[n]=ranges.length;const ids=Array.from(world.keys()).sort((a,b)=>a-b),xyz=[],velocity=[];
 for(const key of ids){const p=world.get(key);xyz.push(...p.slice(0,3));velocity.push(...p.slice(3));}stats.displayed=ids.length;stats.maxPartitionMs=stats.simulationMs;stats.simulationMs=performance.now()-started;
 return {power,range,tau,candidates:{offsets,ranges:new Float32Array(ranges),powers:new Float32Array(powers),particleIds:new Float64Array(particleIds)},world:new Float32Array(xyz),worldV:new Float32Array(velocity),worldIds:new Float64Array(ids),config:rows[0].config,stats};
}
