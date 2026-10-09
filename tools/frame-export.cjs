'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
function summary(frame){
 const r=frame.result;
 return {schema:4,channels:r.channels,sensorPose:frame.sensorPose,sequencePlan:frame.sequencePlan,scene:frame.scene,kind:frame.kind,seed:frame.seed,time:frame.time,points:r.labels.length,
  xyz_labels_sha256:crypto.createHash('sha256').update(Buffer.from(r.xyz.buffer,r.xyz.byteOffset,r.xyz.byteLength)).update(Buffer.from(r.labels)).digest('hex'),
  units:'m',coordinates:'world XYZ, Z up',field_calibrated:false,training_approved:false,geometry:frame.geometry,config:frame.config,stats:r.stats};
}
function writeFrame(out,frame,metadata=summary(frame)){
 const r=frame.result,arrays={};
 for(const k of ['xyz','labels','rayIds','nominalRanges','rangeErrors','powers','signalProxy','reflectivityProxy','world','worldV','worldIds'])if(ArrayBuffer.isView(r[k]))arrays[k]=Array.from(r[k]);
 const data=JSON.stringify({...metadata,arrays,referenceScan:Object.fromEntries(Object.entries(r.referenceScan).map(([k,v])=>[k,Array.from(v)]))});
 fs.writeFileSync(out,out.endsWith('.gz')?zlib.gzipSync(data):data,{flag:'wx'});
 return {bytes:fs.statSync(out).size};
}
module.exports={summary,writeFrame};
