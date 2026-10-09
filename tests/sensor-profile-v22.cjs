'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const Sensor=require('../tools/sensor-profile.cjs'),{createSimulator,ROOT}=require('../tools/runtime.cjs');
const metadata={beam_intrinsics:{beam_altitude_angles:Array.from({length:32},(_,i)=>15-i*.8),beam_azimuth_angles:Array.from({length:32},(_,i)=>i%2?1:-1),beam_to_lidar_transform:[1,0,0,16.721,0,1,0,0,0,0,1,0,0,0,0,1]},lidar_intrinsics:{lidar_to_sensor_transform:[-1,0,0,0,0,-1,0,0,0,0,1,38.195,0,0,0,1]},lidar_data_format:{columns_per_frame:128,pixels_per_column:32},sensor_info:{prod_line:'SYNTHETIC TEST FIXTURE, NOT OS1-32 CALIBRATION'}};
const b=Sensor.fromMetadata(metadata),raw=zlib.gunzipSync(Buffer.from(b.directions,'base64')),dirs=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
let maxAngleError=0;for(let row=0;row<32;row++){const i=row*128*3,alt=Math.asin(dirs[i+2])*180/Math.PI;maxAngleError=Math.max(maxAngleError,Math.abs(alt-metadata.beam_intrinsics.beam_altitude_angles[row]));const az=Math.atan2(-dirs[i+1],-dirs[i])*180/Math.PI;assert(Math.abs(az+metadata.beam_intrinsics.beam_azimuth_angles[row])<.00001);}
assert(maxAngleError<.01);assert.throws(()=>Sensor.fromMetadata({...metadata,beam_intrinsics:{...metadata.beam_intrinsics,beam_azimuth_angles:[0]}}));
async function main(){
 const dir=path.join(ROOT,'outputs','metadata-test-'+Date.now());fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'fixture.json');fs.writeFileSync(file,JSON.stringify(metadata));
 const sim=createSimulator(),small=await sim.run({kind:'range',sensorMetadata:file}),normal=await sim.run({kind:'range'});
 assert.equal(small.result.referenceScan.ranges.length,32*128);assert.equal(small.config.sensorProfile.rows,32);assert(small.config.sensorProfile.metadataSha256);
 assert.equal(normal.result.referenceScan.ranges.length,128*1024);assert(small.result.rayIds.every(i=>i<4096));
 const one=await sim.run({kind:'rain',sensorMetadata:file,seed:11,time:2,precipWorkers:1}),four=await sim.run({kind:'rain',sensorMetadata:file,seed:11,time:2,precipWorkers:4});
 for(const k of ['xyz','labels','rayIds','weatherParticleIds','world','worldIds'])assert.deepEqual(Array.from(one.result[k]),Array.from(four.result[k]),'partition mismatch '+k);
 console.log('PASS native 4-worker and serial ray/particle equivalence');
 console.log(JSON.stringify({passed:true,syntheticFixture:true,maxAngleErrorDeg:maxAngleError,profileCacheSwitchCorrect:true,fieldCalibrated:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
