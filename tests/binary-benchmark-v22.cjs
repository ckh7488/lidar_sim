'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{read}=require('../tools/binary-frame.cjs');
const folders=process.argv.slice(2);if(!folders.length)throw Error('Pass one or more completed benchmark directories');
let count=0,bytes=0;for(const folder of folders){
 const report=JSON.parse(fs.readFileSync(path.join(folder,'report.json'),'utf8'));assert.equal(report.complete,true);
 for(const row of report.rows)for(let i=0;i<row.frames;i++){
  const file=path.join(folder,row.kind+'-'+String(i).padStart(3,'0')+'.lsf.gz'),{metadata:m,arrays:a}=read(file),n=m.points;
  assert.equal(m.schema,5);assert.equal(a.xyz.length,3*n);assert.equal(a.labels.length,n);assert(a.xyz.every(Number.isFinite));
  const hash=crypto.createHash('sha256').update(Buffer.from(a.xyz.buffer,a.xyz.byteOffset,a.xyz.byteLength)).update(Buffer.from(a.labels)).digest('hex');assert.equal(hash,m.xyz_labels_sha256);
  for(let j=0;j<n;j++){assert(Math.abs(a.measuredRanges[j]-a.nominalRanges[j]-a.rangeErrors[j])<1e-5);assert(Number.isSafeInteger(a.weatherParticleIds[j]));const clean=a['referenceScan.ranges'][a.rayIds[j]];assert(clean>0?Math.abs(clean-a.surfaceRanges[j])<.001:Number.isNaN(a.surfaceRanges[j]));}
  assert(Math.abs(m.stats.rangeError.baselineSurface.std-.06)<.002);if(m.kind==='sun')assert(a.signalProxy.every(Number.isNaN));
  count++;bytes+=fs.statSync(file).size;
 }
}
console.log(JSON.stringify({passed:true,frames:count,compressedBytes:bytes,hashesExact:true,rangeContractCheckedEveryPoint:true,safeParticleIds:true,baselineSigmaWithin2mm:true,trainingApproved:false}));
