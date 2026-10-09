'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createReviewServer}=require('../tools/review-server.cjs'),{ROOT}=require('../tools/runtime.cjs'),Binary=require('../tools/binary-frame.cjs');
async function main(){
 const output=path.join(ROOT,'outputs','beam-review-v25-'+Date.now()),app=createReviewServer({port:0,outputRoot:output}),address=await app.listen(),base='http://127.0.0.1:'+address.port;
 const post=body=>fetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Lidar-Review':'1'},body:JSON.stringify(body)}),request={scene:'construction_v1',generator:'range',seed:73017,mode:'frame',time:3,sensor:'os1-32-u',beamUnit:{enabled:true,seed:17,boundDeg:.01}},records=[];
 async function run(body){const r=await post(body);assert.equal(r.status,202);let job=await r.json();while(job.status==='running'){await new Promise(r=>setTimeout(r,100));job=await(await fetch(base+'/api/jobs/'+job.id)).json();}assert.equal(job.status,'complete',job.error);const f=Binary.read(path.join(output,job.id,'0000.lsf.gz'));assert.deepEqual(job.request.beamUnit,body.beamUnit);assert.equal(job.request.sensor,body.sensor);assert.equal(f.metadata.config.sensorProfile.unit.seed,body.beamUnit.seed);records.push({sensor:body.sensor,unit:body.beamUnit.seed,enabled:body.beamUnit.enabled,frames:job.frames.length,hash:job.frames[0].hash});return {job,f};}
 try{
  for(const bad of [{sensor:'toString'},{sensor:['os1-32-u']},{sensor:'unknown'},{beamUnit:{enabled:'yes'}},{beamUnit:{seed:-1}},{beamUnit:{seed:4294967296}},{beamUnit:{boundDeg:.02}}])assert.equal((await post({...request,...bad})).status,400);
  const a=await run(request),b=await run({...request,sensor:'os1-32-g'});assert.equal(a.f.metadata.config.sensorProfile.columns,512);assert.equal(b.f.metadata.config.sensorProfile.columns,1024);assert.deepEqual(a.f.metadata.config.sensorProfile.unit,b.f.metadata.config.sensorProfile.unit);
  const off=await run({...request,beamUnit:{enabled:false,seed:17,boundDeg:.01}});assert.notEqual(a.job.frames[0].hash,off.job.frames[0].hash);
  const again=await run(a.job.request);assert.equal(a.job.frames[0].hash,again.job.frames[0].hash);
  const seq=await run({...request,mode:'sequence',fps:1});assert.equal(seq.job.frames.length,11);
  for(let i=0;i<11;i++){const f=Binary.read(path.join(output,seq.job.id,String(i).padStart(4,'0')+'.lsf.gz'));assert.deepEqual(f.metadata.config.sensorProfile.unit,a.f.metadata.config.sensorProfile.unit);assert.deepEqual(f.metadata.sequencePlan,seq.f.metadata.sequencePlan);}
  const report={passed:true,newSensorApiGuards:true,requestReplayExact:true,sequenceFrames:11,unitFixed:true,records};fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,report:path.join(output,'validation.json')}));
 }finally{app.server.close();app.server.closeAllConnections();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
