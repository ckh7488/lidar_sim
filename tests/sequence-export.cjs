'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {ROOT}=require('../tools/runtime.cjs');
const out=path.join(ROOT,'outputs','sequence-range-'+Date.now()),args=['tools/sequence.cjs','--kind','range','--out',out];
const p=spawnSync(process.execPath,args,{cwd:ROOT,stdio:'inherit'});assert.equal(p.status,0);
const manifestBytes=fs.readFileSync(path.join(out,'manifest.json')),m=JSON.parse(manifestBytes);
assert.equal(m.complete,true);assert.equal(m.frameCount,101);assert.equal(m.fps,10);assert.equal(m.frames[0].time,0);assert.equal(m.frames.at(-1).time,10);
assert.equal(new Set(m.frames.map(f=>f.xyz_labels_sha256)).size,101);
let bytes=0;
for(let i=0;i<101;i++){const f=m.frames[i];assert.equal(f.time,i/10);assert.equal(fs.statSync(path.join(out,f.file)).size,f.bytes);bytes+=f.bytes;assert.deepEqual(f.dustSource,m.frames[0].dustSource);}
for(const i of [0,1,50,100]){
 const f=m.frames[i],d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,f.file))));
 assert.equal(d.schema,4);assert.equal(d.time,i/10);assert.deepEqual(d.sensorPose,f.sensorPose);assert.deepEqual(d.sequencePlan,m.sequencePlan);
 assert.equal(d.arrays.xyz.length,d.points*3);assert.equal(d.arrays.reflectivityProxy.length,d.points);assert.equal(d.referenceScan.surfaceReflectance.length,131072);
 const a=new Float32Array(d.arrays.xyz),h=crypto.createHash('sha256').update(Buffer.from(a.buffer)).update(Buffer.from(d.arrays.labels)).digest('hex');assert.equal(h,f.xyz_labels_sha256);
}
const again=spawnSync(process.execPath,args,{cwd:ROOT,encoding:'utf8'});assert.notEqual(again.status,0);assert(again.stderr.includes('EEXIST'));assert.deepEqual(fs.readFileSync(path.join(out,'manifest.json')),manifestBytes);
const report={passed:true,created:new Date().toISOString(),frames:m.frameCount,raysPerFrame:131072,durationS:10,fps:10,endpointInclusive:true,uniqueCoordinateLabelHashes:101,compressedBytes:bytes,elapsedS:m.elapsedS,existingOutputProtected:true,jsonRoundtripFrames:[0,1,50,100],folder:path.relative(ROOT,out),fieldCalibrated:false,trainingApproved:false};
fs.writeFileSync(path.join(ROOT,'outputs/validation-sequence-export-v21.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
