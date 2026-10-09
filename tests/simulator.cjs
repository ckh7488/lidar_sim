'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createSimulator,ROOT}=require('../tools/runtime.cjs');
const Random=require('../src/noise_lab_random_v4.js'),Parameters=require('../src/noise_lab_parameters_v18.js');
const registry=require('../configs/parameter_distributions_v18.json');
const hash=r=>crypto.createHash('sha256').update(Buffer.from(r.xyz.buffer,r.xyz.byteOffset,r.xyz.byteLength)).update(Buffer.from(r.labels)).digest('hex');
async function main(){
 const sim=createSimulator(),rows=[];
 for(let seed=0;seed<3000;seed++){
  const g=Random.sample(seed,'construction_v1',registry.parameters);
  for(const k of ['terrainCm','pitchDeg','rollDeg','wobbleDeg'])assert(g[k]>=registry.parameters[k].min&&g[k]<=registry.parameters[k].max);
  assert.deepEqual(g,Random.sample(seed,'construction_v1',registry.parameters));
 }
 for(const [weather,key,mean] of [['rain','rainRate',5],['snow','snowN',3],['fog','fogVisibility',500]]){
  const values=[];
  for(let seed=0;seed<5000;seed++){
   const cfg={weather,[key]:mean,seed,time:1};
   assert.equal(Parameters.apply(cfg,registry,'construction_v1',false)[key],mean);
   const a=Parameters.apply(cfg,registry,'construction_v1',true),b=Parameters.apply({...cfg,time:2},registry,'construction_v1',true);
   assert.equal(a[key],b[key]);values.push(a[key]);
  }
  const m=values.reduce((a,b)=>a+b)/values.length,std=Math.sqrt(values.reduce((a,b)=>a+(b-m)**2,0)/values.length);
  assert(Math.abs(m/mean-1)<.005);assert(Math.abs(std/mean-.05)<.003);
 }
 const base={scenario:'legacy-v23',scene:'construction_v1',seed:73031,time:3.25,sequence:false,dustPlacement:'manual',dustEmissionS:8},configs=[
  {kind:'dust'},{kind:'rain'},{kind:'snow'},{kind:'fog'},{kind:'sun'},{kind:'range'},
  {kind:'general',controls:{'general-mode':'weak'}},{kind:'general',controls:{'general-mode':'edge'}}
 ];
 let dust,range;
 for(const config of configs){
  const frame=await sim.run({...base,...config}),r=frame.result;
  assert(r.labels.length>1000);assert.equal(r.xyz.length,r.labels.length*3);assert(r.xyz.every(Number.isFinite));
  assert(r.labels.every(x=>x<=2));assert.equal(r.stats.training,false);
  assert.equal(r.signalProxy.length,r.labels.length);assert.equal(r.reflectivityProxy.length,r.labels.length);
  assert.equal(r.referenceScan.ranges.length,131072);assert.equal(r.referenceScan.surfaceReflectance.length,131072);
  if(config.kind==='sun'){
   assert(r.powers.every(Number.isNaN));assert(r.signalProxy.every(Number.isNaN));assert(r.reflectivityProxy.every(Number.isNaN));
   assert.equal(r.channels.reflectivityProxy.available,false);
  }else{
   assert(r.signalProxy.every(v=>Number.isFinite(v)&&v>=0));assert(r.reflectivityProxy.every(v=>Number.isFinite(v)&&v>=0));
   assert.equal(r.channels.reflectivityProxy.finiteCount,r.labels.length);
  }
  if(config.kind==='range'){range=frame;assert.equal(r.stats.dust,0);assert(r.stats.rangeError.surface.rms>.059&&r.stats.rangeError.surface.rms<.061);}
  if(config.kind==='dust'){dust=frame;assert(r.world.length>0);}
  if(['rain','snow'].includes(config.kind)){const s=frame.sensorPose.world;for(let i=0;i<r.world.length;i+=3)assert(Math.hypot(r.world[i]-s[0],r.world[i+1]-s[1],r.world[i+2]-s[2])<=100.2);}
  assert.notEqual(frame.sensorPose.id,'legacy');
  rows.push({kind:config.kind,mode:config.controls?.['general-mode'],pose:frame.sensorPose,points:r.labels.length,surface:r.stats.surface,noise:r.stats.dust,hash:hash(r),channels:r.channels});
  console.log(JSON.stringify(rows.at(-1)));
 }
 const replay=await sim.run({...base,kind:'dust'}),changed=await sim.run({...base,seed:73032,kind:'dust'});
 assert.equal(hash(dust.result),hash(replay.result));assert.notEqual(hash(dust.result),hash(changed.result));
 const legacy=await sim.run({...base,kind:'range',pose:'legacy'});
 assert.equal(legacy.sensorPose.id,'legacy');assert(legacy.result.stats.rangeError.baselineSurface.std>.058&&legacy.result.stats.rangeError.baselineSurface.std<.062);
 const first=await sim.run({...base,kind:'range',pose:0}),last=await sim.run({...base,kind:'range',pose:39,geometry:first.geometry});
 assert.notEqual(hash(first.result),hash(last.result));
 const fixed=await sim.run({...base,kind:'range',pose:0,seed:73032});
 assert.equal(first.sensorPose.id,fixed.sensorPose.id);assert.equal(first.sensorPose.x,fixed.sensorPose.x);assert.equal(first.sensorPose.y,fixed.sensorPose.y);assert.equal(first.sensorPose.height,fixed.sensorPose.height);
 // World particles must not bypass the noisy observed surface, a previous regression.
 const source=fs.readFileSync(path.join(ROOT,'src/noise_lab_motion_client_v6.js'),'utf8');
 const render=source.slice(source.indexOf('function renderSimulation(){'),source.indexOf('function motionSummary(){'));
 const vm=require('node:vm'),view={THREE:require('../vendor/three-0.160.1.min.js'),result:dust.result,simData:{scanInput:{}},category:'dust',motionActive:()=>true,clearMotionLines(){},draw(){},$:()=>({value:'world'}),right:{host:{dataset:{}},clouds:[],scene:{add(){}}},Float32Array,Uint8Array};
 view.cloud=(p,xyz,labels)=>{view.xyz=xyz;view.labels=labels;p.clouds=[{userData:{type:1},material:{}}]};
 vm.createContext(view);vm.runInContext(render+'\nrenderSimulation()',view);
 const surface=[];for(let i=0;i<dust.result.labels.length;i++)if(dust.result.labels[i]===0)surface.push(...dust.result.xyz.subarray(i*3,i*3+3));
 assert.deepEqual(Array.from(view.xyz.slice(0,surface.length)),surface);
 const report={passed:true,created:new Date().toISOString(),node:process.version,geometry_samples:3000,weather_samples_per_kind:5000,modes:rows,same_seed_exact:true,new_seed_changes:true,world_surface_preserved:true,precipitation_display_follows_sensor:true,legacy_pose_supported:true,manual_pose_holds_across_seeds:true,field_calibrated:false,training_approved:false};
 fs.mkdirSync(path.join(ROOT,'outputs'),{recursive:true});fs.writeFileSync(path.join(ROOT,'outputs/validation.json'),JSON.stringify(report,null,2));
 console.log('PASS: modes, seed replay, range RMS, world surface, parameter distributions');
}
main().catch(error=>{console.error(error);process.exitCode=1});
