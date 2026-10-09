/* Collision-checked center translation plus independent yaw/pitch/roll. */
(function(root){'use strict';
const hash=(seed,s)=>{let h=seed>>>0;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const rng=seed=>()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
const ease=t=>t*t*t*(10+t*(-15+6*t));
function world(e,p){return [p.x,p.y,e.terrainHeight(p.x,p.y)+p.height];}
function plan(engine,anchor,options){
 const {scene,seed,sourceBounds:box}=options,random=rng(hash(seed,scene+':'+anchor.id+':6dof')),outdoor=/^(construction|crane_yard|apartment)_/.test(scene),maxHeight=outdoor?6:2.2,radius=.3;
 const bounds=p=>p.x>box[0]+radius&&p.x<box[2]-radius&&p.y>box[1]+radius&&p.y<box[3]-radius&&p.height>=.8&&p.height<=maxHeight;
 let start={...anchor,pitchDeg:0,rollDeg:0,worldZ:world(engine,anchor)[2]};
 if(options.randomStart){
  for(let i=0;i<800;i++){
   const candidate={...anchor,x:box[0]+(box[2]-box[0])*random(),y:box[1]+(box[3]-box[1])*random(),height:.8+(maxHeight-.8)*random(),yawDeg:random()*360,pitchDeg:(random()-.5)*50,rollDeg:(random()-.5)*50,index:null,id:scene+':random:'+seed};
   if(!bounds(candidate)||engine.terrainHeight(candidate.x,candidate.y)===null)continue;
   const w=world(engine,candidate),anchors=options.anchors||[anchor];if(!engine.bodyFree(w,radius))continue;
   if(!anchors.some(a=>engine.sweepFree(world(engine,a),w,radius)))continue;
   start={...candidate,worldZ:w[2]};break;
  }
  if(start.index!==null)throw Error('Could not find a random collision-free 3D start');
 }
 if(!engine.bodyFree([start.x,start.y,start.worldZ],radius))throw Error('6DoF start collides');
 const points=[{...start,time:0}],lengths=[];let heading=start.yawDeg*Math.PI/180;
 for(let leg=0;leg<4;leg++){
  const a=points.at(-1);let next;
  for(let attempt=0;attempt<320;attempt++){
   const angle=heading+(random()-.5)*Math.PI*2,len=attempt<200?1+2*random():.3+random()*.7,candidate={x:a.x+Math.cos(angle)*len,y:a.y+Math.sin(angle)*len,height:Math.max(.8,Math.min(maxHeight,a.height+(random()-.5)*1.5)),yawDeg:a.yawDeg+(random()-.5)*130,pitchDeg:(random()-.5)*50,rollDeg:(random()-.5)*50};
   if(!bounds(candidate)||Math.abs(candidate.height-a.height)<.04||engine.terrainHeight(candidate.x,candidate.y)===null)continue;
   candidate.worldZ=world(engine,candidate)[2];if(!engine.sweepFree([a.x,a.y,a.worldZ],[candidate.x,candidate.y,candidate.worldZ],radius))continue;
   next=candidate;heading=angle;break;
  }
  if(!next)throw Error('Could not find a collision-free 6DoF route');
  lengths.push(Math.hypot(next.x-a.x,next.y-a.y,next.worldZ-a.worldZ));points.push(next);
 }
 const total=lengths.reduce((a,b)=>a+b);let time=0;for(let i=1;i<points.length;i++){time+=10*lengths[i-1]/total;points[i].time=i===points.length-1?10:time;const dt=points[i].time-points[i-1].time;for(const k of ['yawDeg','pitchDeg','rollDeg']){const limit=(k==='yawDeg'?90:40)*dt/1.875,prev=points[i-1][k];points[i][k]=prev+Math.max(-limit,Math.min(limit,points[i][k]-prev));}}
 const sourceRandom=rng(hash(seed,scene+':dust-source-v24')),anchors=options.anchors||[anchor];let source;
 for(let i=0;i<1000;i++){const x=box[0]+(box[2]-box[0])*sourceRandom(),y=box[1]+(box[3]-box[1])*sourceRandom();if(!NoiseLabSequence.inside(engine,scene,x,y,.2))continue;if(!anchors.some(a=>engine.walkFree([a.x,a.y],[x,y],.12)))continue;source={x,y,z:engine.terrainHeight(x,y)};break;}
 if(!source)throw Error('Could not place a reachable dust source');
 return {revision:24,id:scene+':'+seed+':'+start.id,scene,seed,durationS:10,startPose:start,waypoints:points,distanceM:total,dustSource:{...source,placement:'uniform reachable free ground proposals; stationary source'},weatherAnchor:[start.x,start.y,start.worldZ],motion:'6DoF; swept 0.3m bounding sphere conservatively enclosed in each segment AABB',bodyRadiusM:radius,heightRangeM:[.8,maxHeight],pitchRollRangeDeg:[-25,25],peakSpeedMps:1.875*total/10,fieldCalibrated:false,scanTiming:'instantaneous scan; no within-scan motion distortion'};
}
function at(plan,time){if(!Number.isFinite(time)||time<0||time>10)throw Error('Time outside 0..10');const p=plan.waypoints;let i=0;while(i<p.length-2&&time>p[i+1].time)i++;const a=p[i],b=p[i+1],u=ease((time-a.time)/(b.time-a.time)),out={...plan.startPose,time,id:plan.id+'@'+time,sequenceId:plan.id,legacy:false,motion6dof:true};for(const k of ['x','y','height','worldZ','yawDeg','pitchDeg','rollDeg'])out[k]=a[k]+(b[k]-a[k])*u;return out;}
root.NoiseLabFreePose={plan,at};if(typeof module!=='undefined')module.exports=root.NoiseLabFreePose;
})(typeof self!=='undefined'?self:globalThis);
