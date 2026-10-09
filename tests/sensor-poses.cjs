'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROOT,json,loadContext,loadRaw,loadBeam}=require('../tools/geometry-assets.cjs');
const Poses=require('../src/noise_lab_poses_v19.js'),Random=require('../src/noise_lab_random_v4.js');
const registry=require('../configs/parameter_distributions_v18.json');
const digest=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
async function main(){
 const ctx=loadContext(),catalog=json('sensor_positions_v19'),full=loadBeam(),rows=[];
 // All channels/azimuth regions are covered at a reduced resolution for all 960 views.
 const beam={...full,h:16,w:128,dirs:new Float32Array(16*128*3),offsets:new Float32Array(128*3)};
 for(let row=0;row<16;row++)for(let col=0;col<128;col++)beam.dirs.set(full.dirs.subarray((row*8*full.w+col*8)*3,(row*8*full.w+col*8)*3+3),(row*128+col)*3);
 for(let col=0;col<128;col++)beam.offsets.set(full.offsets.subarray(col*8*3,col*8*3+3),col*3);
 for(const [scene,entry] of Object.entries(catalog.scenes)){
  assert.equal(entry.positions.length,40);
  assert.equal(new Set(entry.positions.map(p=>p.x+','+p.y)).size,40);
  assert.equal(new Set(Array.from({length:40},(_,seed)=>Poses.choose(catalog,scene,seed).index)).size,40);
  const raw=loadRaw(entry.geometry_id),engine=ctx.NoiseLabGeometry.engine(raw,beam),hashes=new Set();let hitsMin=Infinity,hitsMax=0;
  for(const cm of [0,.5]){engine.prepare(cm);for(const p of entry.positions)assert(engine.placementFree(p.x,p.y),scene+' clearance at '+cm);}
  for(let i=0;i<40;i++){
   const pose=Poses.choose(catalog,scene,42,i),g={...Random.sample(42+i,scene,registry.parameters),sensorPose:pose};
   assert(pose.height>=1.2&&pose.height<=2.1);assert(pose.yawDeg>=0&&pose.yawDeg<360);
   for(let j=0;j<i;j++)assert(Math.hypot(pose.x-entry.positions[j].x,pose.y-entry.positions[j].y)>=entry.min_spacing_m-2e-6);
   const a=await engine.cast(g),s=a.input.sensor;assert.equal(s[0],pose.x);assert.equal(s[1],pose.y);assert(Math.abs(s[2]-engine.terrainHeight(pose.x,pose.y)-pose.height)<1e-9);
   assert(a.summary.clean>100,scene+' unexpectedly empty');hitsMin=Math.min(hitsMin,a.summary.clean);hitsMax=Math.max(hitsMax,a.summary.clean);
   for(let k=0;k<a.input.origins.length;k+=3)assert(Math.hypot(...Array.from(a.input.origins.subarray(k,k+3),(v,j)=>v-s[j]))<.06);
   hashes.add(digest(a.input.ranges));
   if(i===0){const b=await engine.cast(g);assert.equal(digest(a.input.ranges),digest(b.input.ranges));assert.equal(digest(a.input.origins),digest(b.input.origins));}
  }
  assert.equal(hashes.size,40,scene+' has duplicate range scans');
  rows.push({scene,positions:40,reduced_rays:2048,unique_range_scans:hashes.size,hitsMin,hitsMax});console.log(JSON.stringify(rows.at(-1)));
 }
 // Analytic pose checks catch translating an old point cloud or forgetting yaw/origin components.
 const engine=ctx.NoiseLabGeometry.engine(loadRaw(catalog.scenes.corridor_v1.geometry_id),beam),g={...Random.sample(42,'corridor_v1',registry.parameters),terrainCm:0,pitchDeg:0,rollDeg:0,wobbleDeg:0};
 const a=await engine.cast({...g,sensorPose:{x:0,y:0,height:1.5,yawDeg:0}}),b=await engine.cast({...g,sensorPose:{x:0,y:0,height:1.5,yawDeg:90}});
 for(let k=0;k<a.input.directions.length;k+=3){assert(Math.abs(b.input.directions[k]+a.input.directions[k+1])<1e-6);assert(Math.abs(b.input.directions[k+1]-a.input.directions[k])<1e-6);}
 // Independent Three.js Euler transform verifies beam and optical-origin rotation in all six DoF.
 const T=ctx.THREE;
 for(const [yaw,pitch,roll]of [[0,25,0],[0,0,-25],[123,-18,21]]){
  const pose={x:0,y:0,height:1.5,worldZ:1.5,yawDeg:yaw,pitchDeg:pitch,rollDeg:roll,motion6dof:true};
  const moved=await engine.cast({...g,sensorPose:pose}),q=new T.Quaternion().setFromEuler(new T.Euler(roll*Math.PI/180,pitch*Math.PI/180,yaw*Math.PI/180,'ZYX'));
  for(let k=0;k<a.input.directions.length;k+=3){
   const expected=new T.Vector3().fromArray(a.input.directions,k).applyQuaternion(q);
   assert(expected.distanceTo(new T.Vector3().fromArray(moved.input.directions,k))<1e-6);
   const origin=new T.Vector3().fromArray(a.input.origins,k).sub(new T.Vector3(0,0,1.5)).applyQuaternion(q).add(new T.Vector3(0,0,1.5));
   assert(origin.distanceTo(new T.Vector3().fromArray(moved.input.origins,k))<1e-6);
  }
 }
 await assert.rejects(engine.cast({...g,sensorPose:{x:0,y:3,height:1.65,yawDeg:0}}),/intersects/);
 await assert.rejects(engine.cast({...g,sensorPose:{x:999,y:0,height:1.65,yawDeg:0}}),/terrain/);
 assert.throws(()=>Poses.choose(catalog,'room_v1',42,40),/Invalid/);
 const report={passed:true,created:new Date().toISOString(),node:process.version,total_positions:960,full_rays_per_production_scan:131072,checked_rays_per_pose:2048,terrain_endpoints_cm:[0,.5],same_pose_exact:true,unique_range_scans:true,collision_rejected:true,yaw_checked:true,pitchRollAndOpticalOriginsChecked:true,scenes:rows};
 fs.mkdirSync(path.join(ROOT,'outputs'),{recursive:true});fs.writeFileSync(path.join(ROOT,'outputs/sensor-pose-validation.json'),JSON.stringify(report,null,2));
 console.log('PASS: 960 positions, clearance, distinct ray-cast views, replay, yaw and invalid positions');
}
main().catch(e=>{console.error(e);process.exitCode=1});
