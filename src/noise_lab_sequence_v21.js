/* Seeded, collision-checked ground routes. Frame poses are continuous, not shuffled scans. */
(function(root){'use strict';
const duration=10,pi=Math.PI;
function hash(seed,text){let h=seed>>>0;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const ease=t=>t*t*t*(10+t*(-15+6*t));
function inside(engine,scene,x,y,r=.35){
 if(!engine.placementFree(x,y,r))return false;
 if(/^(construction|crane_yard|apartment)_/.test(scene))return true;
 if(scene.startsWith('corridor_'))return [-r,r].every(dx=>[-r,r].every(dy=>((x+dx>=-12&&x+dx<=12&&y+dy>=-3&&y+dy<=3)||(x+dx>=2&&x+dx<=12&&y+dy>=-11&&y+dy<=3))));
 return engine.hasCeiling(x,y);
}
function clearSegment(engine,scene,a,b,r=.35){
 if(!engine.walkFree([a.x,a.y],[b.x,b.y],r))return false;
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.25));
 for(let i=0;i<=steps;i++)if(!inside(engine,scene,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,r))return false;
 return true;
}
function plan(engine,start,options){
 const scene=options.scene,seed=options.seed>>>0,key=hash(seed,scene+':'+start.id),random=rng(key^0x814531ae),points=[{x:start.x,y:start.y}],lengths=[];
 if(!inside(engine,scene,start.x,start.y))throw Error('Sequence start is not a free ground position');
 let heading=start.yawDeg*pi/180;
 for(let leg=0;leg<3;leg++){
  const a=points.at(-1);let b=null;
  for(let attempt=0;attempt<160;attempt++){
   const angle=attempt<80?heading+(random()-.5)*pi*1.4:2*pi*random(),length=attempt<120?1+1.5*random():.35+.65*random();
   const candidate={x:a.x+Math.cos(angle)*length,y:a.y+Math.sin(angle)*length};
   if(clearSegment(engine,scene,a,candidate)){b=candidate;heading=angle;break;}
  }
  if(!b)throw Error('Could not construct a continuous free route for '+scene);
  lengths.push(Math.hypot(b.x-a.x,b.y-a.y));points.push(b);
 }
 const total=lengths.reduce((a,b)=>a+b),waypoints=[{...points[0],time:0,yawDeg:start.yawDeg,height:start.height}];let time=0,yaw=start.yawDeg;
 for(let i=0;i<3;i++){
  const dt=2+4*lengths[i]/total;time+=dt;yaw+=(random()-.5)*2*30*dt/1.875;
  waypoints.push({...points[i+1],time:i===2?duration:time,yawDeg:yaw,height:start.height});
 }
 // Sample the scene's ground footprint, not a fixed radius band around the sensor.
 const box=options.sourceBounds;
 if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[0]>=box[2]||box[1]>=box[3])throw Error('Sequence sourceBounds must be a valid scene footprint');
 const sourceRandom=rng(key^0x195b46ad);let source=null,sourceFallback=false;
 for(let attempt=0;attempt<512;attempt++){
  const b={x:box[0]+(box[2]-box[0])*sourceRandom(),y:box[1]+(box[3]-box[1])*sourceRandom()},d=Math.hypot(b.x-start.x,b.y-start.y);
  if(d>=.75&&d<=95&&inside(engine,scene,b.x,b.y,.35)){source=b;break;}
 }
 if(!source){const u=.3+.6*sourceRandom();source={x:start.x+(points[1].x-start.x)*u,y:start.y+(points[1].y-start.y)*u};sourceFallback=true;}
 if(!inside(engine,scene,source.x,source.y,.35))throw Error('Could not place a free dust source for '+scene);
 return {revision:21,id:scene+':'+seed+':'+start.id,scene,seed,durationS:duration,startPose:{...start},waypoints,distanceM:total,
  dustSource:{...source,z:engine.terrainHeight(source.x,source.y),placement:'uniform XY proposals in scene footprint, rejecting occupied/outside/distance <0.75 or >95m; stationary source',fallbackToRoute:sourceFallback},
  weatherAnchor:[start.x,start.y,engine.terrainHeight(start.x,start.y)+start.height],
  motion:'three straight free segments with quintic ease-in/out; stops at waypoints',peakSpeedMps:Math.max(...lengths.map((l,i)=>1.875*l/(waypoints[i+1].time-waypoints[i].time))),
  fieldCalibrated:false,scanTiming:'instantaneous scan at each frame pose; no within-scan motion distortion'};
}
function at(plan,time){
 if(!Number.isFinite(time)||time<0||time>duration)throw Error('Sequence time must be in [0,10]');
 const p=plan.waypoints;let i=0;while(i<p.length-2&&time>p[i+1].time)i++;
 const a=p[i],b=p[i+1],u=ease(Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time))));
 return {...plan.startPose,legacy:false,id:plan.id+'@'+time,sequenceId:plan.id,time,x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,height:a.height,yawDeg:a.yawDeg+(b.yawDeg-a.yawDeg)*u};
}
function apply(config,plan,options){
 const c={...config,dustEmissionS:options.dustEmissionS??10};
 if(options.dustPlacement!=='manual'){c.emitterX=plan.dustSource.x;c.emitterY=plan.dustSource.y;c.motionX=c.emitterX;c.motionY=c.emitterY;}
 if(options.enabled){c.observationSeed=hash(config.seed,'frame:'+Math.round(config.time*1000));c.weatherAnchor=plan.weatherAnchor;}
 c.sequence={enabled:!!options.enabled,id:plan.id,time:config.time,durationS:duration,dustPlacement:options.dustPlacement||'auto',dustSource:[c.emitterX,c.emitterY],weatherAnchor:c.weatherAnchor||null};
 return c;
}
root.NoiseLabSequence={plan,at,apply,inside,clearSegment,hash,duration};if(typeof module!=='undefined')module.exports=root.NoiseLabSequence;
})(typeof self!=='undefined'?self:globalThis);
