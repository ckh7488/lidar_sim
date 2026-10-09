/* Lazy world-space Poisson particles; terminal advection is independent of sensor pose. */
(function(root){'use strict';
const PI=Math.PI,CELL=.5,MAX=100;
const rng=s=>{let a=s>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}};
let cached=null;
function field(c,P,M){
 const key=JSON.stringify([c.seed,c.mode,c.rainRate,c.snowN]);if(cached?.key===key)return cached;
 const lambda=4.1*c.rainRate**(-.21),lo=Math.exp(-lambda*1.5),hi=Math.exp(-lambda*6),concentration=c.mode==='rain'?8000/lambda*(lo-hi):c.snowN;
 const speed=c.mode==='rain'?M.rainSpeed(-Math.log((lo+hi)/2)/lambda):.8,cells=new Map();
 function get(x,y,z){
  if([x,y,z].some(a=>a< -4096||a>4095))throw Error('Weather field outside supported +/-2048m world domain');
  const cellId=(x+4096)*67108864+(y+4096)*8192+z+4096;if(cells.has(cellId))return cells.get(cellId);
  const random=rng(c.seed^Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791)),n=P.poisson(concentration*CELL**3,random),out=[];
  if(n>=1024)throw Error('Weather cell particle limit exceeded');
  for(let j=0;j<n;j++){const px=(x+random())*CELL,py=(y+random())*CELL,pz=(z+random())*CELL,mm=c.mode==='rain'?-Math.log(lo-random()*(lo-hi))/lambda:1+7*random()**2;
   out.push({x:px,y:py,z:pz,a:mm/2000,albedo:c.mode==='snow'?.3+.7*random():1,id:cellId*1024+j+1});}
  // Bounded cache affects speed only; regeneration is independent of access order.
  if(cells.size>=350000)cells.clear();cells.set(cellId,out);return out;
 }
 return cached={key,get,speed,concentration,cells};
}
function simulate(input,cfg,blocked,overlap,P,M){
 const start=performance.now(),c=M.config(cfg),f=field({...c,seed:Array.from(cfg.dustShapeKey||'').reduce((h,ch)=>Math.imul(h^ch.charCodeAt(0),16777619),c.seed)>>>0},P,M),n=input.ranges.length,drift=[c.wind*Math.cos(c.angle)*c.time,c.wind*Math.sin(c.angle)*c.time,-f.speed*c.time],power=new Float32Array(n),range=new Float32Array(n),tau=new Float32Array(n),offsets=new Uint32Array(n+1),ranges=[],powers=[],particleIds=[],shown=new Map(),hist=[0,0,0,0,0],roofCache=new Map();let intersections=0,tested=0;
 function roof(x,y){const ix=Math.floor(x/.5),iy=Math.floor(y/.5),key=ix+','+iy;if(roofCache.has(key))return roofCache.get(key);const h=blocked.castRay?.([ix*.5+.25,iy*.5+.25,99],[0,0,-1]),v=h?99-h.range:blocked.groundHeight?.(x,y)??0;roofCache.set(key,v);return v;}
 for(let i=0;i<n;i++){
  if(i%2048===0)root.onWeatherProgress?.(i/n);
  const k=3*i,d=Array.from(input.directions.subarray(k,k+3)),worldOrigin=input.origins?Array.from(input.origins.subarray(k,k+3)):input.sensor,o=worldOrigin.map((v,a)=>v-drift[a]),limit=input.ranges[i]>0?input.ranges[i]:MAX,seen=new Set();
  // Float32 direction norms are not exactly one. Normalize before subtracting
  // squared projections, or long-range perpendicular distances acquire a bias.
  const norm=Math.hypot(...d);if(!(norm>.99&&norm<1.01))throw Error('Invalid weather ray direction');for(let a=0;a<3;a++)d[a]/=norm;
  tau[i]=c.alpha*Math.max(0,limit-.5);
  // Traverse center-line cells and their small expanded segment bounds. This covers
  // the complete conical beam, including particles across cell boundaries.
  let t=.5;const cell=o.map((v,a)=>Math.floor((v+d[a]*t)/CELL)),step=d.map(v=>v>=0?1:-1),delta=d.map(v=>Math.abs(v)>1e-10?CELL/Math.abs(v):Infinity),next=cell.map((v,a)=>Math.abs(d[a])>1e-10?((v+(step[a]>0?1:0))*CELL-o[a])/d[a]:Infinity);
  while(t<limit){
   const end=Math.min(limit,...next),radius=.005+.001*end,a=o.map((v,j)=>v+d[j]*t),b=o.map((v,j)=>v+d[j]*end),lo=a.map((v,j)=>Math.floor((Math.min(v,b[j])-radius)/CELL)),hi=a.map((v,j)=>Math.floor((Math.max(v,b[j])+radius)/CELL));
   for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){
    const key=(x+4096)*67108864+(y+4096)*8192+z+4096;if(seen.has(key))continue;seen.add(key);
    for(const p of f.get(x,y,z)){
     const dx=p.x-o[0],dy=p.y-o[1],dz=p.z-o[2],s=dx*d[0]+dy*d[1]+dz*d[2];if(s<.5||s>=limit)continue;
     const br=.001+.001*s,d2=Math.max(0,dx*dx+dy*dy+dz*dz-s*s);tested++;if(d2>(br+p.a)**2)continue;
     const wx=p.x+drift[0],wy=p.y+drift[1],wz=p.z+drift[2];if(wz<=roof(wx,wy)+.02)continue;
     const pw=c.returnFactor*p.albedo*overlap(p.a,br,Math.sqrt(d2))*Math.exp(-2*c.alpha*s)/(s*s);if(pw<=0)continue;
     intersections++;hist[Math.min(4,Math.floor(s/20))]++;ranges.push(s);powers.push(pw);particleIds.push(p.id);
     if(pw>power[i]){power[i]=pw;range[i]=s;}
     if(rng((p.id%4294967296)^Math.floor(p.id/4294967296))()<(cfg.weatherDisplayFraction??(n<=1024?1:.005)))shown.set(p.id,[wx,wy,wz]);
    }
   }
   t=end;if(t>=limit)break;for(let j=0;j<3;j++)if(next[j]<=end+1e-9){cell[j]+=step[j];next[j]+=delta[j];}
  }
  offsets[i+1]=ranges.length;
 }
 const ids=Array.from(shown.keys()).sort((a,b)=>a-b),world=[],vel=[];for(const id of ids){world.push(...shown.get(id));vel.push(c.wind*Math.cos(c.angle),c.wind*Math.sin(c.angle),-f.speed);}
 return {power,range,tau,world:new Float32Array(world),worldV:new Float32Array(vel),worldIds:new Float64Array(ids),candidates:{offsets,ranges:new Float32Array(ranges),powers:new Float32Array(powers),particleIds:new Float64Array(particleIds)},config:c,
  stats:{intersections,particles:Math.round(f.concentration*4/3*PI*MAX**3),displayed:ids.length,concentration:f.concentration,rangeHistogram:hist,rangeSupport:[.5,100],fullRange:true,temporalCoherence:true,worldMotionCoherent:true,observationModel:'persistent world-cell Poisson particles, conical beam intersection and terminal advection',displayModel:'deterministically thinned actual beam intersections; 0.5% for full scans, optical candidates unchanged',terminalSpeedMps:f.speed,gravity:9.80665,terminalBalance:true,roofApproximationM:.5,particleTests:tested,simulationMs:performance.now()-start,fieldCalibrated:false,scanTiming:'instantaneous frame; no per-beam timestamps',limitations:'One representative settling speed per weather distribution, no snow flutter, splash or accumulation; Poisson rain below 1.5mm contributes only mean extinction'}};
}
root.NoiseLabPrecipitation={field,simulate};if(typeof module!=='undefined')module.exports=root.NoiseLabPrecipitation;
})(typeof self!=='undefined'?self:globalThis);
