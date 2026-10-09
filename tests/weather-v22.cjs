'use strict';
const assert=require('node:assert/strict'),W=require('../src/noise_lab_precipitation_v22.js'),M=require('../src/noise_lab_motion_v6.js'),P=require('../src/noise_lab_receiver_v7.js'),O=require('../src/noise_lab_weather_v4.js'),F=require('../src/noise_lab_atmosphere_v8.js');
const n=384,dirs=new Float32Array(n*3);for(let i=0;i<n;i++){const a=i*2*Math.PI/n;dirs.set([Math.cos(a),Math.sin(a),0],3*i);}
const input={ranges:new Float32Array(n),directions:dirs,sensor:[0,0,3]},blocked=()=>false;blocked.groundHeight=()=>0;
for(const mode of ['rain','snow']){
 const cfg={weather:mode,seed:1313,time:2,motionWind:1,motionAngle:20},a=W.simulate(input,cfg,blocked,O.overlap,P,M),b=W.simulate(input,{...cfg,time:2.01},blocked,O.overlap,P,M),replay=W.simulate(input,cfg,blocked,O.overlap,P,M);
 assert.deepEqual(a.world,replay.world);assert.deepEqual(a.candidates.ranges,replay.candidates.ranges);assert(a.stats.rangeHistogram.every(v=>v>0));
 const ids=new Map(Array.from(a.worldIds,(id,i)=>[id,i]));let common=0;
 for(let j=0;j<b.worldIds.length;j++){const i=ids.get(b.worldIds[j]);if(i===undefined)continue;common++;for(let k=0;k<3;k++)assert(Math.abs(b.world[3*j+k]-a.world[3*i+k]-.01*a.worldV[3*i+k])<.00002);}
 assert(common>20,'actual intersections must keep stable world IDs');assert(a.candidates.particleIds.every(Number.isSafeInteger));
 assert.equal(a.stats.temporalCoherence,true);console.log('PASS '+mode+' same-particle coherent motion '+common+' / range bins '+a.stats.rangeHistogram);
}
const c=F.config({seed:11,time:0,fogVariation:.25,motionWind:1.2,motionAngle:35}),dt=2,drift=[c.wind*Math.cos(c.windAngle)*dt,c.wind*Math.sin(c.windAngle)*dt,0];
const first=F.field(c,[1,2,3],[1,0,0]),advected=F.field({...c,time:dt},[1+drift[0],2+drift[1],3],[1,0,0]);for(let r=0;r<100;r+=.3)assert(Math.abs(first(r)-advected(r))<1e-12);
console.log('PASS fog density follows wind in world coordinates');
