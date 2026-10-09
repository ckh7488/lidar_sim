/* Fixed per-unit calibrated beam variation, not shot jitter or residual error. */
(function(root){
'use strict';
const rad=Math.PI/180;
function settings(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('beamUnit must be an object');
 const {enabled=false,seed=1,boundDeg=.01}=value;
 if(typeof enabled!=='boolean'||!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isFinite(boundDeg)||boundDeg<0||boundDeg>.01)throw Error('beamUnit requires enabled:boolean, uint32 seed and boundDeg in [0, 0.01]');
 return {enabled,seed,boundDeg};
}
function sample(value,rows){
 const s=settings(value);let state=(s.seed^0x4f553332)>>>0;
 const random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const bound=s.enabled?s.boundDeg:0,altitudeDeg=[],azimuthDeg=[];
 for(let row=0;row<rows;row++){altitudeDeg.push((2*random()-1)*bound);azimuthDeg.push((2*random()-1)*bound);}
 return {...s,distribution:'independent bounded uniform per channel/axis',meanDeg:0,stdDeg:bound/Math.sqrt(3),altitudeDeg,azimuthDeg,scope:'sensor unit, fixed across columns/frames/scenes/weather',calibrated:true,residualErrorDeg:0,shotJitterDeg:0,populationMeasured:false};
}
function apply(beam,value){
 const unit=sample(value,beam.h);
 if(!unit.enabled||!unit.boundDeg)return {...beam,unit};
 const R=beam.lidar_rotation||[1,0,0,0,1,0,0,0,1],dirs=new Float32Array(beam.dirs.length);
 // Return to the calibrated lidar frame before changing its elevation/azimuth.
 for(let row=0;row<beam.h;row++)for(let col=0;col<beam.w;col++){
  const k=3*(row*beam.w+col),v=beam.dirs,x=R[0]*v[k]+R[3]*v[k+1]+R[6]*v[k+2],y=R[1]*v[k]+R[4]*v[k+1]+R[7]*v[k+2],z=R[2]*v[k]+R[5]*v[k+1]+R[8]*v[k+2];
  const phi=Math.atan2(z,Math.hypot(x,y))+unit.altitudeDeg[row]*rad,theta=Math.atan2(y,x)-unit.azimuthDeg[row]*rad,a=Math.cos(phi)*Math.cos(theta),b=Math.cos(phi)*Math.sin(theta),c=Math.sin(phi);
  for(let j=0;j<3;j++)dirs[k+j]=R[j*3]*a+R[j*3+1]*b+R[j*3+2]*c;
 }
 return {...beam,dirs,unit};
}
const api={settings,sample,apply};root.NoiseLabBeamUnit=api;if(typeof module!=='undefined')module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
