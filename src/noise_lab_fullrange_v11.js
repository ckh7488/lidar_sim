/* Review models with full range support; not a fitted commercial receiver. */
(function(root){'use strict';
const PI=Math.PI,MIN=.5,MAX=100;
const rng=s=>{let a=s>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const bin=r=>Math.min(4,Math.floor(r/20));
function kernelIntegral(lo,hi,a,b=.001){return PI*((a+b*hi)**3-(a+b*lo)**3)/(3*b);}
function sampleRange(lo,hi,a,rand,b=.001){return (Math.cbrt((a+b*lo)**3+rand()*((a+b*hi)**3-(a+b*lo)**3))-a)/b;}
function pack(rows,n){const offsets=new Uint32Array(n+1),ranges=[],powers=[];for(let i=0;i<n;i++){for(const v of rows.get(i)||[])ranges.push(v[0]),powers.push(v[1]);offsets[i+1]=ranges.length;}return {offsets,ranges:new Float32Array(ranges),powers:new Float32Array(powers)};}
function worldWeather(c,blocked,M,sensor,anchor=sensor){
 const rand=rng(c.seed^0x282fea7),p=[],v=[],ids=[],N=c.mode==='rain'?16000:12000,side=240,top=110;
 const lambda=4.1*c.rainRate**(-.21),lo=Math.exp(-lambda*1.5),hi=Math.exp(-lambda*6),wrap=x=>((x%side)+side)%side-side/2;
 for(let i=0;i<N;i++){
  const x0=side*(rand()-.5),y0=side*(rand()-.5),z0=top*rand(),mm=c.mode==='rain'?-Math.log(lo-rand()*(lo-hi))/lambda:1+7*rand()**2,speed=c.mode==='rain'?M.rainSpeed(mm):.4+1.1*rand(),phase=rand()*2*PI,amp=c.mode==='snow'?.22:0;
  const vx=c.wind*Math.cos(c.angle),vy=c.wind*Math.sin(c.angle),x=anchor[0]+wrap(x0+vx*c.time+side/2)+amp*Math.sin(1.4*c.time+phase),y=anchor[1]+wrap(y0+vy*c.time+side/2)+amp*Math.cos(1.12*c.time+phase),z=((z0-speed*c.time)%top+top)%top;
  if(Math.hypot(x-sensor[0],y-sensor[1],z-sensor[2])>MAX)continue;
  if(z<20&&blocked([x,y,120],[x,y,z]))continue;
  p.push(x,y,z);v.push(vx,vy,-speed);ids.push(i);
 }
 return {world:new Float32Array(p),worldV:new Float32Array(v),worldIds:new Uint32Array(ids)};
}
function precipitation(input,cfg,blocked,overlap,P,M){
 const start=performance.now(),c=M.config(cfg),n=input.ranges.length,power=new Float32Array(n),range=new Float32Array(n),tau=new Float32Array(n),rows=new Map(),hist=[0,0,0,0,0],lambda=4.1*c.rainRate**(-.21),emin=Math.exp(-lambda*1.5),emax=Math.exp(-lambda*6),concentration=c.mode==='rain'?8000/lambda*(emin-emax):c.snowN,maxRadius=c.mode==='rain'?.003:.004;
 let proposals=0,intersections=0,sheltered=0;
 // Cache overhead height by half-metre cells; boundaries remain an approximation.
 const roofCache=new Map();
 function roof(x,y){const a=Math.floor(x/.5),b=Math.floor(y/.5),key=a+','+b;if(roofCache.has(key))return roofCache.get(key);let z=0;const hit=blocked.castRay?.([a*.5+.25,b*.5+.25,99],[0,0,-1]);if(hit)z=99-hit.range;roofCache.set(key,z);return z;}
 for(let i=0;i<n;i++){
  const r=input.ranges[i],limit=r>0?Math.min(MAX,r):MAX,k=3*i,d=input.directions,o=input.origins||null,origin=o?o.subarray(k,k+3):input.sensor,rand=rng(c.seed^Math.imul(i+1,0x9e3779b1)^Math.imul(Math.round(c.time*1000)+1,0x85ebca6b));
  if(limit<=MIN)continue;tau[i]=c.alpha*(limit-MIN);
  const count=P.poisson(concentration*kernelIntegral(MIN,limit,.001+maxRadius),rand);
  for(let j=0;j<count;j++){
   const s=sampleRange(MIN,limit,.001+maxRadius,rand),mm=c.mode==='rain'?-Math.log(emin-rand()*(emin-emax))/lambda:1+7*rand()**2,a=mm/2000,br=.001+.001*s;proposals++;
   if(rand()>((br+a)/(br+maxRadius))**2)continue;
   const x=origin[0]+s*d[k],y=origin[1]+s*d[k+1],z=origin[2]+s*d[k+2];
   if(z<20&&z<roof(x,y)+.02){sheltered++;continue;}
   const fraction=overlap(a,br,(a+br)*Math.sqrt(rand())),powerHere=c.returnFactor*fraction*Math.exp(-2*c.alpha*s)/(s*s)*(c.mode==='snow'?.3+.7*rand():1);
   if(powerHere<=0)continue;intersections++;hist[bin(s)]++;
   if(!rows.has(i))rows.set(i,[]);rows.get(i).push([s,powerHere]);if(powerHere>power[i]){power[i]=powerHere;range[i]=s;}
  }
 }
 const world=worldWeather(c,blocked,M,input.sensor,cfg.weatherAnchor||input.sensor);
 return {power,range,tau,...world,candidates:pack(rows,n),config:c,stats:{intersections,particles:Math.round(concentration*4/3*PI*MAX**3),displayed:world.worldIds.length,concentration,proposals,sheltered,rangeHistogram:hist,rangeSupport:[MIN,MAX],fullRange:true,temporalCoherence:false,worldMotionCoherent:true,observationModel:'marked Poisson beam-volume sampling; independent scans, not tracked world particles',displayModel:'fixed illustrative moving sample, not proportional particle count',roofApproximationM:.5,gravity:9.80665,terminalBalance:true,simulationMs:performance.now()-start,fieldCalibrated:false,scanTiming:'instantaneous scan; per-beam samples regenerated at each time',diameterRangeMm:c.mode==='rain'?[1.5,6]:[1,8]}};
}
function fog(input,cfg,P,F){
 const scatterResponse=clamp(cfg.fogScatterResponse??.0005,0,1),c=F.config({...cfg,fogVisibility:cfg.fogVisibility??500,fogBackscatter:cfg.fogBackscatter!==false}),n=input.ranges.length,ranges=new Float32Array(n),labels=new Uint8Array(n),powers=new Float32Array(n),errors=new Float32Array(n),cache=new Map(),hist=[0,0,0,0,0],support=[0,0,0,0,0];let scatter=0,lost=0;
 if(!c.enabled)return F.fog(input,{...cfg,reviewEnabled:false},P);
 if(c.r2<=c.r1)throw Error('광학 겹침 완료 거리는 시작 거리보다 커야 합니다.');
 for(let i=0;i<n;i++){
  const r=input.ranges[i],limit=r>0?r:MAX,k=i*3,o=input.origins?input.origins.subarray(k,k+3):input.sensor,d=input.directions.subarray(k,k+3),response=cfg.surfaceModel&&input.response?input.response[i]:.35,key=r+'/'+response;
  let w=cache.get(key);if(!w){w=F.fogWave(r,response,c,F.field(c,o,d));if(!c.variation&&cache.size<4096)cache.set(key,w);}
  const rand=rng((cfg.observationSeed??c.seed)^Math.imul(i+1,0x9e3779b1)),mass=[],dr=w.dr;let total=0,softTotal=0;
  // A conditional photon-arrival surrogate replaces the all-rays argmax shell.
  for(let j=0;j<w.soft.length;j++){const lo=Math.max(.3,j*dr),hi=Math.min(limit,(j+1)*dr),v=hi>lo?scatterResponse*w.soft[j]*(hi-lo)/dr:0;mass.push(v);softTotal+=v;if(v>0)support[bin((lo+hi)/2)]++;}
  const hardTotal=r>0?w.solid.reduce((a,b)=>a+b,0):0;total=softTotal+hardTotal;
  const photons=P.poisson(total*c.photonGain,rand);if(photons<4){if(r)lost++;continue;}
  let selected=r,lab=0,selectedPower=hardTotal;
  if(rand()*total<softTotal){let u=rand()*softTotal;for(let j=0;j<mass.length;j++){u-=mass[j];if(u<=0&&mass[j]>0){selected=Math.max(.3,j*dr)+rand()*(Math.min(limit,(j+1)*dr)-Math.max(.3,j*dr));selectedPower=mass[j];break;}}lab=1;scatter++;hist[bin(selected)]++;}
  ranges[i]=selected;labels[i]=lab;powers[i]=selectedPower;
  const er=rng((cfg.observationSeed??c.seed)^Math.imul(i+1,0x6c8e9cf5));errors[i]=Math.sqrt(-2*Math.log(Math.max(1e-12,er())))*Math.cos(2*PI*er())*Math.hypot(cfg.radialSigma||0,(cfg.radialSlope||0)*selected);
 }
 const q={kind:'fog',enabled:true,config:c,alpha:Math.log(20)/c.visibility,scatteringRays:scatter,ambiguous:0,fullRange:true,rangeSupport:[.3,MAX],rangeHistogram:hist,positiveSupportBins:support,scatterResponse,scatterResponseBasis:'Temporary receiver-response assumption, not measured probability or fitted optical coefficient',model:'conditional detected-photon arrival surrogate with uncalibrated diffuse-return response',trainingEligible:false,fieldCalibrated:false,reason:'Not strongest-return Ouster electronics. Photon-weighted range support, no forced shell or equal-range quota.'};
 const r=F.reproject(input,cfg,ranges,labels,powers,errors,q);q.shellFraction=r.rangeShellFraction;q.shellWarning=false;return r;
}
function sunlight(input,cfg,P,F,blocked){
 const n=input.ranges.length,ranges=input.ranges.slice(),labels=new Uint8Array(n),powers=new Float32Array(n),errors=new Float32Array(n),az=(cfg.sunAz??40)*PI/180,el=(cfg.sunEl??10)*PI/180,width=(cfg.sunWidth??2)*PI/180,strength=cfg.sunProbability??.05,sun=[Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)],sensor=input.sensor;
 const clear=el>0&&!blocked(sensor,sensor.map((x,a)=>x+1000*sun[a])),enabled=cfg.sunEnabled!==false,hist=[0,0,0,0,0];let expected=0,noise=0,affected=0;
 for(let i=0;i<n;i++){
  const k=i*3,d=input.directions,angle=Math.acos(clamp(d[k]*sun[0]+d[k+1]*sun[1]+d[k+2]*sun[2],-1,1)),prob=enabled&&clear?strength*Math.exp(-.5*(angle/width)**2):0;expected+=prob;if(prob>1e-4)affected++;
  const rand=rng((cfg.seed>>>0)^Math.imul(i+1,0x38a3fe91)^Math.imul(Math.round((cfg.time||0)*1000)+1,0x85ebca6b));
  if(rand()<prob){ranges[i]=.3+(MAX-.3)*rand();labels[i]=1;powers[i]=1;noise++;hist[bin(ranges[i])]++;}
 }
 const q={kind:'sun',enabled,clearSunPath:clear,expectedFalseReturns:expected,affectedRays:affected,falseReturns:noise,rangeHistogram:hist,rangeSupport:[.3,MAX],angularSigmaDeg:width*180/PI,peakProbability:strength,source:'Linnhoff et al. 2022: solar-direction artifacts and full-range uniform Velodyne observations',assumptions:'Gaussian angular envelope and peak probability are review knobs; not measured fit. Single-return replacement.',apparentRangesCanExceedSurface:true,trainingEligible:false,fieldCalibrated:false};
 return F.reproject(input,cfg,ranges,labels,powers,errors,q);
}
root.NoiseLabFullRange={kernelIntegral,sampleRange,precipitation,fog,sunlight};if(typeof module!=='undefined')module.exports=root.NoiseLabFullRange;
})(typeof self!=='undefined'?self:globalThis);
