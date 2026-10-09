'use strict';
const assert=require('node:assert/strict'),{attach}=require('../src/noise_lab_channels_v20.js');
const input={ranges:new Float32Array([10,20,0]),albedo:new Float32Array([.32,.32,0])};
function frame(labels=[0,1,2]){return {rayIds:new Uint32Array([0,1,2]),nominalRanges:new Float32Array([10,20,5]),rangeErrors:new Float32Array(3),powers:new Float32Array([.0032,.0008,.004]),labels:new Uint8Array(labels),stats:{}};}
const a=attach(frame(),input,{weather:'rain'}),b=attach(frame([2,0,1]),input,{weather:'rain'});
// The same diffuse return at twice the range is 4x weaker, but keeps its proxy.
assert(Math.abs(a.reflectivityProxy[0]-.32)<1e-6);assert(Math.abs(a.reflectivityProxy[1]-.32)<1e-6);
assert.deepEqual(a.signalProxy,b.signalProxy);assert.deepEqual(a.reflectivityProxy,b.reflectivityProxy);
assert(Number.isNaN(a.referenceScan.surfaceReflectance[2]));assert.equal(a.referenceScan.surfaceReflectance.length,3);
const weak=frame();weak.powers=Float32Array.from(weak.powers,x=>x*1600*50);
const w=attach(weak,input,{reviewKind:'weak',weakPhotons:50});
assert(Math.abs(w.reflectivityProxy[0]-.32)<1e-6);
const sun=attach(frame(),input,{solarEnabled:true});
for(const k of ['signalProxy','reflectivityProxy','powers']){assert(sun[k].every(Number.isNaN));assert.deepEqual(JSON.parse(JSON.stringify(Array.from(sun[k]))),[null,null,null]);}
assert.equal(sun.channels.reflectivityProxy.available,false);
const jitter=frame();jitter.rangeErrors[0]=.1;attach(jitter,input,{weather:'none'});
assert(jitter.reflectivityProxy[0]>a.reflectivityProxy[0]);
console.log('PASS: range compensation, label invariance, weak-mode units, solar missingness, material reference separation');
