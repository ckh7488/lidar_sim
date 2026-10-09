// Build scene-specific reachable viewpoint catalogs. No mesh or measured data is edited.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROOT,json,loadContext,loadRaw}=require('./geometry-assets.cjs');
const cfg=require('../configs/sensor_sampling_v19.json'),ctx=loadContext();
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function sceneSeed(name){let h=cfg.catalog_seed;for(const c of name)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function bounds(vertices,minZ=-Infinity){const b=[Infinity,Infinity,-Infinity,-Infinity];for(let k=0;k<vertices.length;k+=3)if(vertices[k+2]>minZ){b[0]=Math.min(b[0],vertices[k]);b[1]=Math.min(b[1],vertices[k+1]);b[2]=Math.max(b[2],vertices[k]);b[3]=Math.max(b[3],vertices[k+1]);}return b;}
const catalog={revision:19,seed:cfg.catalog_seed,config_sha256:sha(path.join(ROOT,'configs/sensor_sampling_v19.json')),scenes:{}};
for(const row of json('index').geometry_knobs_v3.scenes){
 const raw=loadRaw(row.id),engine=ctx.NoiseLabGeometry.engine(raw,{}),outdoor=/^(construction|crane_yard|apartment)_/.test(row.scene),step=outdoor?cfg.outdoor_grid_m:cfg.indoor_grid_m,radius=cfg.clearance_half_width_m,low=cfg.clearance_bottom_m,top=cfg.clearance_top_m;
 engine.prepare(0);
 let box=bounds(raw.terrain.vertices);if(outdoor){const b=bounds(raw.vertices,.2),m=cfg.outdoor_asset_margin_m;box=[Math.max(box[0],b[0]-m),Math.max(box[1],b[1]-m),Math.min(box[2],b[2]+m),Math.min(box[3],b[3]+m)];}
 const imin=Math.ceil((box[0]+radius)/step),imax=Math.floor((box[2]-radius)/step),jmin=Math.ceil((box[1]+radius)/step),jmax=Math.floor((box[3]-radius)/step),cache=new Map(),key=(i,j)=>i+','+j;
 // The open L-shaped corridor has no ceiling. Clip its walkable floor plan,
 // rather than allowing navigation around the open wall ends into the backing plane.
 function inScene(x,y){if(outdoor)return true;if(row.scene.startsWith('corridor_'))return [-radius,radius].every(dx=>[-radius,radius].every(dy=>cfg.corridor_floor_rectangles_xy.some(b=>x+dx>=b[0]&&y+dy>=b[1]&&x+dx<=b[2]&&y+dy<=b[3])));return engine.hasCeiling(x,y);}
 function free(i,j){const k=key(i,j);if(cache.has(k))return cache.get(k);const x=i*step,y=j*step,ok=i>=imin&&i<=imax&&j>=jmin&&j<=jmax&&engine.placementFree(x,y,radius,low,top)&&inScene(x,y);cache.set(k,ok);return ok;}
 if(!free(0,0))throw Error(row.scene+': historical origin is not a free navigation anchor');
 const queue=[[0,0]],seen=new Set(['0,0']);for(let at=0;at<queue.length;at++){const [i,j]=queue[at];for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=i+di,b=j+dj,k=key(a,b);if(seen.has(k)||!free(a,b))continue;if(engine.walkFree([i*step,j*step],[a*step,b*step],radius,low,top)){seen.add(k);queue.push([a,b]);}}}
 const rand=random(sceneSeed(row.scene));let candidates=[];
 for(const [i,j] of queue){const x=i*step+(rand()-.5)*step*.7,y=j*step+(rand()-.5)*step*.7;if(engine.placementFree(x,y,radius,low,top)&&engine.walkFree([i*step,j*step],[x,y],radius,low,top)&&inScene(x,y))candidates.push({x,y,rank:rand()});}
 candidates.sort((a,b)=>a.rank-b.rank);candidates=candidates.slice(0,6000);
 const positions=[],spacing=outdoor?cfg.outdoor_min_separation_m:cfg.indoor_min_separation_m;
 while(positions.length<cfg.count_per_scene){
  for(const p of candidates)p.distance=positions.length?Math.min(...positions.map(q=>Math.hypot(p.x-q.x,p.y-q.y))):1;
  candidates=candidates.filter(p=>!positions.length||p.distance>=spacing).sort((a,b)=>b.distance-a.distance);
  if(!candidates.length)throw Error(row.scene+': cannot find 40 separated free positions');
  const p=candidates.splice(Math.floor(rand()*Math.max(1,Math.ceil(candidates.length*.08))),1)[0];
  const round=x=>Math.round(x*1e6)/1e6;
  positions.push({x:round(p.x),y:round(p.y),height:round(cfg.height_above_ground_m[0]+rand()*(cfg.height_above_ground_m[1]-cfg.height_above_ground_m[0])),yawDeg:round(360*rand())});
 }
 // The entire allowed terrain interval is a linear height scaling. Check both ends.
 for(const cm of [0,.5]){engine.prepare(cm);for(const p of positions)if(!engine.placementFree(p.x,p.y,radius,low,top))throw Error(row.scene+': endpoint terrain clearance failed');}
 catalog.scenes[row.scene]={geometry_id:row.id,geometry_sha256:sha(path.join(ROOT,'data/noise_lab_v1',row.id+'.json')),seed:sceneSeed(row.scene),sampling_bounds_xy:box,reachable_grid_cells:queue.length,grid_step_m:step,min_spacing_m:spacing,positions};
 console.log(JSON.stringify({scene:row.scene,positions:positions.length,reachable:queue.length}));
}
fs.writeFileSync(path.join(ROOT,'data/noise_lab_v1/sensor_positions_v19.json'),JSON.stringify(catalog,null,2));
