/* Independent review approximation, not a port or calibration of a published model. */
(function(root){
'use strict';
const presets={rain:{concentration:40,diameterMm:1,returnFactor:.02,alpha:.002},snow:{concentration:8,diameterMm:3,returnFactor:.5,alpha:.004},fog:{concentration:0,diameterMm:0,returnFactor:0,alpha:.02}};
function config(c){
  const mode=c.weather||'none',p=presets[mode];
  if(!p||c.weatherEnabled===false)return {mode,enabled:false,alpha:0,concentration:0,diameterMm:0,returnFactor:0,beamHalfAngle:.001,beamRadius:.001};
  function number(key,fallback,min,max){const n=c[key]??fallback;if(!Number.isFinite(n)||n<min||n>max)throw Error('Invalid '+key);return n}
  return {mode,enabled:true,alpha:number('weatherAlpha',p.alpha,0,.2),concentration:mode==='fog'?0:number('weatherConcentration',p.concentration,0,100),diameterMm:mode==='fog'?0:number('weatherDiameter',p.diameterMm,.1,10),returnFactor:mode==='fog'?0:number('weatherReturn',p.returnFactor,0,1),beamHalfAngle:.001,beamRadius:.001};
}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function overlap(a,b,d){
  if(d>=a+b)return 0;
  if(d<=Math.abs(a-b))return Math.min(1,(a*a)/(b*b));
  const clip=x=>Math.max(-1,Math.min(1,x));
  const area=a*a*Math.acos(clip((d*d+a*a-b*b)/(2*d*a)))+b*b*Math.acos(clip((d*d+b*b-a*a)/(2*d*b)))-.5*Math.sqrt(Math.max(0,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));
  return Math.max(0,Math.min(1,area/(Math.PI*b*b)));
}
function ray(w,seed,id,limit){
  const out={tau:w.alpha*limit,best:0,range:0,intersections:0};
  if(!w.enabled||w.concentration===0||limit<=.5)return out;
  const rand=random((seed>>>0)^Math.imul(id+1,0x9e3779b1)^0x13491ac7),a=w.diameterMm/2000,b=w.beamRadius,k=w.beamHalfAngle;
  // A Poisson process in the swept beam volume gives depth-dependent interception probability.
  const volume=s=>Math.PI*((a+b+k*s)**3-(a+b)**3)/(3*k),v0=volume(.5),vend=volume(limit);
  let v=v0;
  while((v+=-Math.log(Math.max(1e-12,1-rand()))/w.concentration)<vend){
    const s=(Math.cbrt((a+b)**3+3*k*v/Math.PI)-(a+b))/k,beam=b+k*s,offset=(a+beam)*Math.sqrt(rand());
    const fraction=overlap(a,beam,offset),power=w.returnFactor*fraction*Math.exp(-2*w.alpha*s)/(s*s);
    out.intersections++;
    if(power>out.best){out.best=power;out.range=s;}
  }
  return out;
}
root.NoiseLabWeather={config,ray,overlap,presets};if(typeof module!=='undefined')module.exports=root.NoiseLabWeather;
})(typeof self!=='undefined'?self:globalThis);
