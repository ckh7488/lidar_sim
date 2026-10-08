/* Geometry is sampled once per scene/seed, independently of weather and time. */
(function(root){
'use strict';
function sample(seed,scene,parameters={}){
  let hash=2166136261;for(const ch of scene)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  let state=(hash^(seed>>>0)^0x62478f19)>>>0;
  function uniform(){state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}
  const round=(v,n)=>Number(v.toFixed(n));
  function draw(key,a,b){const p=parameters[key];if(p){a=p.mean-Math.sqrt(3)*p.std;b=p.mean+Math.sqrt(3)*p.std;}const value=a+(b-a)*uniform();return round(p?Math.max(p.min,Math.min(p.max,value)):value,3)}
  return {terrainCm:draw('terrainCm',0,.5),pitchDeg:draw('pitchDeg',-.6,.6),rollDeg:draw('rollDeg',-.6,.6),wobbleDeg:draw('wobbleDeg',0,.7),wobblePhase:Math.floor(uniform()*360),wobbleCycles:1,opticalOffset:true,compensateWobble:false};
}
root.NoiseLabRandom={sample};if(typeof module!=='undefined')module.exports=root.NoiseLabRandom;
})(typeof self!=='undefined'?self:globalThis);
