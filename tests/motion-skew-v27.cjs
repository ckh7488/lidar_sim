'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Timing=require('../src/noise_lab_scan_timing_v27.js'),Assets=require('../tools/geometry-assets.cjs');
const {createSimulator,ROOT}=require('../tools/runtime.cjs'),{summary,writeFrame}=require('../tools/frame-export.cjs'),Binary=require('../tools/binary-frame.cjs');
const {validate}=require('../tools/review-server.cjs');
async function analytic(){
 const ctx=Assets.loadContext(),T=ctx.THREE;
 vm.runInContext(fs.readFileSync(path.join(ROOT,'src/noise_lab_observation_v22.js'),'utf8'),ctx);
 const raw={seed:1,vertices:new Float32Array([20,-100,-10,20,100,-10,20,100,100,20,-100,100]),faces:new Uint32Array([0,1,2,0,2,3]),rho:new Float32Array([.3,.3,.3,.3]),terrain:{vertices:new Float32Array([-100,-100,0,100,-100,0,100,100,0,-100,100,0]),faces:new Uint32Array([0,1,2,0,2,3]),base_std_m:1}},w=64,h=3,dirs=new Float32Array(w*h*3),offsets=new Float32Array(w*3);
 for(let col=0;col<w;col++){offsets.set([.016*Math.cos(col*2*Math.PI/w),.016*Math.sin(col*2*Math.PI/w),.036],col*3);for(let row=0;row<h;row++){const d=new T.Vector3(1,(col/w-.5)*.8,.05+row*.05).normalize();dirs.set(d.toArray(),3*(row*w+col));}}
 const beam={w,h,dirs,offsets,center_origin_m:[0,0,.036]},engine=ctx.NoiseLabGeometry.engine(raw,beam),rad=Math.PI/180;
 const at=(t,mode)=>{const d=t-5;return {x:mode==='translation'||mode==='six'?2*d:0,y:mode==='six'?.4*d:0,worldZ:3+(mode==='six'?.5*d:0),height:3,yawDeg:mode==='yaw'||mode==='six'?90*d:0,pitchDeg:mode==='six'?25*d:0,rollDeg:mode==='six'?-35*d:0,motion6dof:true};};
 const base={terrainCm:0,pitchDeg:.3,rollDeg:-.2,wobbleDeg:0,wobbleCycles:2,wobblePhase:5,opticalOffset:true,sensorPose:at(5,'six'),sequence:{time:5,enabled:true},motionSkew:{enabled:true,scanHz:10}};
 let maxRangeError=0,maxXYZError=0,maxDistortion=0;
 for(const mode of ['translation','yaw','six'])for(const hz of [10,20])for(const compensate of [false,true]){
  const c={...base,wobbleDeg:.4,compensateWobble:compensate,motionSkew:{enabled:true,scanHz:hz}},v=await engine.cast(c,null,t=>at(t,mode)),input=v.input;
  const result={rayIds:Uint32Array.from({length:w*h},(_,i)=>i),labels:new Uint8Array(w*h),nominalRanges:input.ranges.slice(),rangeErrors:new Float32Array(w*h),powers:new Float32Array(w*h),stats:{}};
  ctx.NoiseLabObservation.finish(result,input,input,{seed:1,time:5,radialSigma:0,radialSlope:0},null);
  for(let i=0;i<w*h;i++){
   const col=i%w,dt=(-.5+(col+.5)/w)/hz,p=at(5+dt,mode),euler=p=>new T.Quaternion().setFromEuler(new T.Euler((p.rollDeg||0)*rad,(p.pitchDeg||0)*rad,p.yawDeg*rad,'ZYX'));
   const mount=new T.Quaternion().setFromEuler(new T.Euler(c.rollDeg*rad,c.pitchDeg*rad,0,'ZYX')),phase=-col*2*Math.PI/w*c.wobbleCycles+c.wobblePhase*rad,wobble=new T.Quaternion().setFromEuler(new T.Euler(c.wobbleDeg*Math.cos(phase)*rad,c.wobbleDeg*Math.sin(phase)*rad,0,'ZYX'));
   const q=euler(p).multiply(mount).multiply(wobble),o=new T.Vector3().fromArray(offsets,col*3).applyQuaternion(q).add(new T.Vector3(p.x,p.y,p.worldZ)),d=new T.Vector3().fromArray(dirs,i*3).applyQuaternion(q),expected=(20-o.x)/d.x;
   maxRangeError=Math.max(maxRangeError,Math.abs(input.ranges[i]-expected));assert(Math.abs(input.ranges[i]-expected)<.00002,'moving ray must hit actual wall');
   const reference=euler(at(5,mode)).multiply(mount);if(compensate)reference.multiply(wobble);
   const reported=new T.Vector3().fromArray(offsets,col*3).applyQuaternion(reference).add(new T.Vector3(0,0,3)).addScaledVector(new T.Vector3().fromArray(dirs,i*3).applyQuaternion(reference),expected);
   const xyz=new T.Vector3().fromArray(result.xyz,i*3);maxXYZError=Math.max(maxXYZError,reported.distanceTo(xyz));assert(reported.distanceTo(xyz)<.00003,'must retain skew, not silently deskew');maxDistortion=Math.max(maxDistortion,Math.abs(xyz.x-20));
   assert.equal(result.timeOffsets[i],dt);assert.equal(input.timeOffsets[i],dt);
  }
 }
 assert(maxDistortion>.1);
 for(const wobble of [0,.7])for(const compensate of [false,true]){
  const c={...base,wobbleDeg:wobble,compensateWobble:compensate},off=await engine.cast({...c,motionSkew:{enabled:false}}),on=await engine.cast(c,null,()=>base.sensorPose);
  assert.deepEqual(off.input.ranges,on.input.ranges);assert.deepEqual(off.input.directions,on.input.directions);assert.deepEqual(off.input.origins,on.input.origins);
  assert.deepEqual(off.input.reportedDirections||off.input.directions,on.input.reportedDirections);assert.deepEqual(off.input.reportedOrigins||off.input.origins,on.input.reportedOrigins);
 }
 for(const time of [0,10]){const times=[];await engine.cast({...base,sequence:{time,enabled:true}},null,t=>{times.push(t);return base.sensorPose;});assert(times.every(t=>t>=0&&t<=10));assert(times.filter(t=>t===time).length===w/2);}
 return {maxRangeErrorM:maxRangeError,maxXYZErrorM:maxXYZError,maxDistortionM:maxDistortion,staticAndWobbleExact:true,endpointsHeld:true};
}
async function main(){
 const report={revision:27,created:new Date().toISOString(),passed:false,analytic:await analytic(),cases:[]},dir=path.join(ROOT,'outputs','motion-skew-v27-'+Date.now());fs.mkdirSync(dir,{recursive:true});console.log('OUTPUT '+dir);console.log('PASS analytic wall translation/yaw/6DoF and static/endpoint tests');
 for(const v of [null,true,[],{enabled:'on'},{enabled:null},{scanHz:0},{scanHz:15},{scanHz:'10'},{scanHz:null},{scanhz:10}])assert.throws(()=>Timing.settings(v));
 assert.deepEqual(Timing.settings(),{enabled:false,scanHz:10});assert.throws(()=>Timing.describe({enabled:true,scanHz:20},2048,0,true));
 const sim=createSimulator();try{
  const saved=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/validation-v26.json'),'utf8'));
  for(const [i,entry]of saved.cases.entries()){
   const opts={...entry.options,time:5},off=await sim.run(opts),m0=summary(off);assert.equal(m0.xyz_labels_sha256,entry.frames.find(f=>f.time===5).hash,'OFF changed v26 data: '+entry.id);assert(off.result.timeOffsets.every(v=>v===0));
   const scanHz=i%2?20:10,on=await sim.run({...opts,motionSkew:{enabled:true,scanHz}}),m=summary(on),a=on.result;
   assert.notEqual(m.xyz_labels_sha256,m0.xyz_labels_sha256,'moving scan unchanged');assert.deepEqual(on.sensorPose,off.sensorPose);assert.deepEqual(on.geometrySummary.sceneLayout,off.geometrySummary.sceneLayout);assert.deepEqual(on.sequencePlan.waypoints,off.sequencePlan.waypoints);
   assert.equal(m.scanTiming.enabled,true);assert.equal(m.scanTiming.scanHz,scanHz);assert.equal(on.config.scanTiming.enabled,true);assert(a.xyz.every(Number.isFinite));assert.equal(a.timeOffsets.length,a.labels.length);
   assert(a.channels.roles.observations.includes('timeOffsets'));assert(a.channels.roles.metadataNotFeatures.includes('scanTiming'));
   for(let j=0;j<a.labels.length;j++){const dt=((a.rayIds[j]%m.scanTiming.columnCount+.5)/m.scanTiming.columnCount-.5)/scanHz;assert.equal(a.timeOffsets[j],dt);assert(Math.abs(a.measuredRanges[j]-a.nominalRanges[j]-a.rangeErrors[j])<.00002);}
   for(const [tag,f]of [['off',off],['on',on]]){const file=path.join(dir,entry.id+'-'+tag+'.lsf.gz');writeFrame(file,f);const decoded=Binary.read(file);assert.deepEqual(decoded.arrays.xyz,f.result.xyz);assert.deepEqual(decoded.arrays.timeOffsets,f.result.timeOffsets);assert.deepEqual(decoded.metadata.scanTiming,summary(f).scanTiming);}
   report.cases.push({id:entry.id,scene:opts.scene,generator:entry.generator,sensor:opts.sensor,seed:opts.seed,scanHz,offHash:m0.xyz_labels_sha256,onHash:m.xyz_labels_sha256,points:m.points});
   console.log('PASS '+entry.id+' '+opts.scene+' '+entry.generator+' '+opts.sensor+' '+scanHz+'Hz ON / v26 OFF exact');
  }
  const base={kind:'range',sensor:'os1-32-u',seed:73017,time:3};
  for(const time of [0,10]){const f=await sim.run({...base,time,motionSkew:{enabled:true}});assert.equal(f.config.scanTiming.referenceTimeS,time);assert(f.result.xyz.every(Number.isFinite));}
  const first=await sim.run({...base,motionSkew:{enabled:true}});await sim.run({...base,motionSkew:{enabled:false}});const again=await sim.run({...base,motionSkew:{enabled:true}});assert.deepEqual(first.result.xyz,again.result.xyz);
  for(const time of [0,3,10]){const opts={...base,time,sequence:false};const off=await sim.run(opts),on=await sim.run({...opts,motionSkew:{enabled:true}});assert.deepEqual(off.result.xyz,on.result.xyz);assert.equal(on.config.scanTiming.referenceTimeS,time);assert.equal(on.config.scanTiming.sensorMoving,false);}
  const jsonFile=path.join(dir,'frame.json');writeFrame(jsonFile,first);assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile)).arrays.timeOffsets,Array.from(first.result.timeOffsets));
  const request={scene:'room_v1',generator:'range',seed:1};assert.equal(validate(request,sim.index).options.motionSkew.enabled,false);for(const v of [null,true,{enabled:'on'},{scanHz:15},{enabled:false,unexpected:1}])assert.throws(()=>validate({...request,motionSkew:v},sim.index));assert.equal(validate({...request,motionSkew:{enabled:true,scanHz:20}},sim.index).options.motionSkew.scanHz,20);
  report.passed=true;report.compatibleOffCases=report.cases.length;report.movingOnCases=report.cases.length;report.sensorProfiles=[...new Set(report.cases.map(r=>r.sensor))];report.scenes=[...new Set(report.cases.map(r=>r.scene))].length;report.generators=[...new Set(report.cases.map(r=>r.generator))];report.replayExact=true;report.staticXYZExact=true;report.fieldCalibrated=false;report.weatherFrozenWithinScan=true;
 }finally{sim.close();fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({passed:report.passed,analytic:report.analytic,cases:report.cases.length,output:dir}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
