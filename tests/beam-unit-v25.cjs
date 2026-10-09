'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const Unit=require('../src/noise_lab_beam_unit_v25.js'),P=require('../tools/sensor-profile.cjs'),{createSimulator,ROOT}=require('../tools/runtime.cjs'),{summary,writeFrame}=require('../tools/frame-export.cjs'),Binary=require('../tools/binary-frame.cjs');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const unpack=s=>{const b=zlib.gunzipSync(Buffer.from(s,'base64'));return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const decode=b=>({...b,dirs:unpack(b.directions),offsets:unpack(b.origins)});
async function main(){
 const provenance=read('provenance/ouster-beams-v25.json');
 let maxError=0;const profiles=[];
 for(const source of provenance.sources){
  const raw=fs.readFileSync(path.join(ROOT,source.file));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),source.sha256);
  const b=decode(P.load(path.join(ROOT,source.file))),saved=read('data/noise_lab_v1/'+P.builtins[source.id]+'.json');assert.equal(saved.directions,b.directions);assert.equal(b.h,32);
  const off=Unit.apply(b,{enabled:false,seed:42}),zero=Unit.apply(b,{enabled:true,seed:42,boundDeg:0});assert.strictEqual(off.dirs,b.dirs);assert.strictEqual(zero.dirs,b.dirs);
  const a=Unit.apply(b,{enabled:true,seed:42}),again=Unit.apply(b,{enabled:true,seed:42}),different=Unit.apply(b,{enabled:true,seed:43});assert.deepEqual(a.dirs,again.dirs);assert.notDeepEqual(a.dirs,different.dirs);assert.strictEqual(a.offsets,b.offsets);
  // Independent spherical-angle check: no change of column phase or optical origin.
  for(let row=0;row<b.h;row++)for(let col=0;col<b.w;col++){
   const k=3*(row*b.w+col),d=a.dirs,R=b.lidar_rotation,x=R[0]*d[k]+R[3]*d[k+1]+R[6]*d[k+2],y=R[1]*d[k]+R[4]*d[k+1]+R[7]*d[k+2],z=R[2]*d[k]+R[5]*d[k+1]+R[8]*d[k+2];
   const expectedAlt=b.beam_altitude_angles[row]+a.unit.altitudeDeg[row],expectedAz=-col*360/b.w-b.beam_azimuth_angles[row]-a.unit.azimuthDeg[row];
   const errAlt=Math.abs(Math.atan2(z,Math.hypot(x,y))*180/Math.PI-expectedAlt),errAz=Math.abs(((Math.atan2(y,x)*180/Math.PI-expectedAz+540)%360)-180);
   maxError=Math.max(maxError,errAlt,errAz);assert(Math.abs(Math.hypot(x,y,z)-1)<1e-7);assert(errAlt<.00002&&errAz<.00002);
  }
  profiles.push({id:source.id,rows:b.h,columns:b.w});
 }
 let sum=0,sq=0,count=0;
 for(let seed=0;seed<2000;seed++)for(const v of [...Unit.sample({enabled:true,seed},32).altitudeDeg,...Unit.sample({enabled:true,seed},32).azimuthDeg]){assert(v>=-.01&&v<=.01);sum+=v;sq+=v*v;count++;}
 const mean=sum/count,std=Math.sqrt(sq/count-mean*mean);assert(Math.abs(mean)<.0001);assert(Math.abs(std-.01/Math.sqrt(3))<.0001);
 for(const value of [{seed:-1},{seed:1.2},{enabled:'yes'},{boundDeg:.011},{boundDeg:-.01},{boundDeg:NaN},null])assert.throws(()=>Unit.settings(value));
 assert.doesNotThrow(()=>Unit.settings({enabled:true,seed:4294967295}));
 const sim=createSimulator(),rows=[],dir=path.join(ROOT,'outputs','beam-unit-v25-'+Date.now());fs.mkdirSync(dir,{recursive:true});
 try{
  const base={kind:'range',scene:'construction_v1',seed:73017,pose:0,sequence:false,scenario:'legacy-v23',sensor:'os1-32-u',beamUnit:{enabled:true,seed:42},geometry:{terrainCm:0,pitchDeg:0,rollDeg:0,wobbleDeg:0},controls:{'range-enabled':false},precipWorkers:1};
  let first;
  for(const sensor of ['os1-32-u','os1-32-g','os1-128','os1-32-u']){
   const f=await sim.run({...base,sensor});assert.equal(f.result.referenceScan.ranges.length,sensor==='os1-32-u'?16384:sensor==='os1-32-g'?32768:131072);
   const hash=summary(f).xyz_labels_sha256;if(sensor==='os1-32-u'){if(first)assert.equal(hash,summary(first).xyz_labels_sha256);else first=f;}
   assert(f.result.xyz.every(Number.isFinite));assert.equal(f.geometrySummary.reportedUsing,'actual ray direction');
  }
  const other=await sim.run({...base,beamUnit:{enabled:true,seed:43}});assert.notEqual(summary(first).xyz_labels_sha256,summary(other).xyz_labels_sha256);assert.deepEqual(first.sensorPose,other.sensorPose);
  const off=await sim.run({...base,beamUnit:{enabled:false}}),zero=await sim.run({...base,beamUnit:{enabled:true,boundDeg:0}});assert.deepEqual(off.result.xyz,zero.result.xyz);
  const changed=await sim.run({...base,seed:9,time:10,kind:'dust',scene:'room_v1'});assert.deepEqual(changed.config.sensorProfile.unit,first.config.sensorProfile.unit);
  const file=path.join(dir,'unit-42.lsf.gz');writeFrame(file,first,summary(first));assert.deepEqual(Binary.read(file).metadata.config.sensorProfile,first.config.sensorProfile);
  for(const sensor of ['os1-32-u','os1-32-g'])for(const scene of sim.index.scenes){
   const f=await sim.run({...base,scene:scene.id,sensor});assert(f.result.xyz.every(Number.isFinite));assert(f.result.rayIds.every(v=>v<f.geometrySummary.rays));
   rows.push({sensor,scene:scene.id,points:f.result.labels.length,hash:summary(f).xyz_labels_sha256});console.log('PASS '+sensor+' '+scene.id);
  }
  for(const sensor of ['os1-32-u','os1-32-g'])for(const mode of ['dust','rain','snow','fog','sun','edge','weak']){
   const f=await sim.run({...base,sensor,kind:['edge','weak'].includes(mode)?'general':mode,controls:{'general-mode':mode},beamUnit:{enabled:true,seed:4294967295}});
   assert(f.result.xyz.every(Number.isFinite));assert(f.result.rayIds.every(v=>v<f.geometrySummary.rays));rows.push({sensor,mode,points:f.result.labels.length,hash:summary(f).xyz_labels_sha256});console.log('PASS '+sensor+' '+mode);
  }
  let unit,plan;
  for(const time of [0,5,10]){const f=await sim.run({sensor:'os1-32-u',beamUnit:{enabled:true,seed:42},kind:'range',time});if(unit){assert.deepEqual(f.config.sensorProfile.unit,unit);assert.deepEqual(f.sequencePlan,plan);}unit=f.config.sensorProfile.unit;plan=f.sequencePlan;}
  const report={passed:true,profiles,maxAngleErrorDeg:maxError,distribution:{count,mean,std,expectedStd:.01/Math.sqrt(3)},cases:rows,sequenceFixed:true,roundTrip:true,disabledEqualsZero:true,populationMeasured:false};fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,report:path.join(dir,'validation.json'),maxAngleErrorDeg:maxError}));
 }finally{sim.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
