/* Ideal photon radiometry, deliberately distinct from an Ouster receiver model. */
(function(root){'use strict';
const RAD=Math.PI/180,H=6.62607015e-34,C=299792458;
function config(c){return {mode:c.solarMode||'reference',azimuth:c.sunAz??40,elevation:c.sunEl??10,irradiance:c.sunIrradiance??.8,wavelengthNm:850,bandwidthNm:10,apertureDiameterM:.008,pde:.15,opticalTransmission:.5,pulses:100,ifovRadiusDeg:.09,sunRadiusDeg:.266,skyFraction:.15,maxPhotonsPerWindow:500,binM:.25};}
function photons(radiance,c){const area=Math.PI*(c.apertureDiameterM/2)**2,omega=2*Math.PI*(1-Math.cos(c.ifovRadiusDeg*RAD)),dt=2*c.binM/C;return radiance*area*omega*c.bandwidthNm*c.opticalTransmission*c.pde*dt*c.pulses/(H*C/(c.wavelengthNm*1e-9));}
function simulate(input,cfg,blocked,overlap){
 const c=config(cfg),az=c.azimuth*RAD,el=c.elevation*RAD,sun=[Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)],n=input.ranges.length,background=new Float32Array(n),invalid=new Uint8Array(n),angular=new Float32Array(72*36),counts=new Uint32Array(72*36);let shadowed=0,direct=0,unsupported=0,mean=0,max=0;
 for(let i=0;i<n;i++){const k=3*i,d=input.directions.subarray(k,k+3),o=input.origins?input.origins.subarray(k,k+3):input.sensor,r=input.ranges[i];let L=c.irradiance*c.skyFraction/Math.PI;
  if(r){const norm=input.normals.subarray(k,k+3),p=[o[0]+r*d[0]+.002*norm[0],o[1]+r*d[1]+.002*norm[1],o[2]+r*d[2]+.002*norm[2]],inc=Math.max(0,norm[0]*sun[0]+norm[1]*sun[1]+norm[2]*sun[2]),shade=c.elevation<=0||inc===0||blocked(p,p.map((v,a)=>v+1000*sun[a]));if(shade)shadowed++;L=(input.albedo[i]||.24)*c.irradiance*(c.skyFraction+(shade?0:inc))/Math.PI;}
  else if(c.elevation>0){const angle=Math.acos(Math.max(-1,Math.min(1,d[0]*sun[0]+d[1]*sun[1]+d[2]*sun[2])));if(angle<(c.sunRadiusDeg+c.ifovRadiusDeg)*RAD&&!blocked(o,Array.from(o,(v,a)=>v+1000*sun[a]))){L+=c.irradiance/(2*Math.PI*(1-Math.cos(c.sunRadiusDeg*RAD)))*overlap(c.sunRadiusDeg*RAD,c.ifovRadiusDeg*RAD,angle);direct++;}}
  const b=.02+photons(L,c);background[i]=b;invalid[i]=b>c.maxPhotonsPerWindow?1:0;unsupported+=invalid[i];mean+=b;max=Math.max(max,b);
  const a=Math.min(71,Math.max(0,Math.floor((Math.atan2(d[1],d[0])+Math.PI)/(2*Math.PI)*72))),e=Math.min(35,Math.max(0,Math.floor((Math.asin(Math.max(-1,Math.min(1,d[2])))+Math.PI/2)/Math.PI*36))),j=e*72+a;angular[j]+=b;counts[j]++;
 }
 for(let j=0;j<angular.length;j++)if(counts[j])angular[j]/=counts[j];
 return {background,invalid,angular,angularCounts:counts,config:c,stats:{meanPhotons:mean/n,maxPhotons:max,shadowed,directSunRays:direct,unsupportedRays:unsupported,unsupportedRule:'above 500 expected photons/window: no receiver prediction; preserve reference geometry',fieldCalibrated:false,referenceSensor:'OS1-32 in FZD 2022, not universal Ouster guarantee',referenceResult:'no sunlight-induced detections observed in that study',opticsFitted:false,luxConversion:false}};
}
root.NoiseLabSolar={config,photons,simulate};if(typeof module!=='undefined')module.exports=root.NoiseLabSolar;
})(typeof self!=='undefined'?self:globalThis);
