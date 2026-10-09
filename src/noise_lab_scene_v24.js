/* Seeded additional props. Fixed buildings are preserved; placement is collision checked. */
(function(root){
'use strict';
const models=new Map();let warming;
const families={
 room:['table-set','desk','plant','bench'],corridor:['plant','bench','bin'],
 department_store:['table-set','plant','bench','display-rack'],warehouse:['pallet','drum','display-rack','factory-kit/hopper-square'],
 underground_parking:['city-kit-roads/construction-cone','city-kit-roads/construction-barrier','car-kit/delivery','bin'],
 construction:['car-kit/truck','car-kit/delivery-flat','city-kit-industrial/shipping-container-a','factory-kit/hopper-high-round','city-kit-roads/construction-cone','city-kit-roads/construction-fence'],
 crane_yard:['car-kit/truck-flat','city-kit-industrial/shipping-container-b','city-kit-industrial/shipping-container-c','factory-kit/hopper-high-square','city-kit-roads/construction-cone'],
 apartment:['plant','bench','car-kit/delivery','city-kit-roads/electricity-pole-single','city-kit-roads/light-curved','city-kit-roads/road-sign-warning']
};
function hash(seed,s){let h=seed>>>0;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
async function unpack(s,Type){const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new Type(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
function addPrimitive(parts,g,x,y,z,rx=0){g.rotateX(rx);g.translate(x,y,z);parts.push(g);}
function procedural(id){
 const p=[],box=(x,y,z,w,d,h)=>addPrimitive(p,new THREE.BoxGeometry(w,d,h),x,y,z),cyl=(x,y,z,r,h)=>addPrimitive(p,new THREE.CylinderGeometry(r,r,h,12),x,y,z,Math.PI/2);
 const chair=(x,y,turn=0)=>{const start=p.length;box(0,0,.48,.42,.42,.08);box(0,.18,.76,.42,.07,.55);for(const a of [-.16,.16])for(const b of [-.16,.16])cyl(a,b,.23,.025,.46);for(const g of p.slice(start)){g.rotateZ(turn);g.translate(x,y,0);}};
 if(id==='table-set'){cyl(0,0,.77,.65,.07);cyl(0,0,.38,.07,.72);cyl(0,0,.04,.35,.08);chair(-1,0,Math.PI/2);chair(1,0,-Math.PI/2);}
 if(id==='desk'){box(0,0,.76,1.4,.7,.07);for(const x of [-.6,.6])for(const y of [-.25,.25])box(x,y,.37,.07,.07,.7);chair(0,-.85,Math.PI);}
 if(id==='bench'){box(0,0,.48,1.65,.48,.08);box(0,.2,.76,1.65,.06,.5);for(const x of [-.65,.65])box(x,0,.22,.1,.4,.44);}
 if(id==='plant'){cyl(0,0,.22,.24,.44);cyl(0,0,.7,.035,1.0);for(const [x,y,z,r]of [[0,0,1.2,.42],[.24,0,1,.3],[-.15,.2,1.3,.3]])addPrimitive(p,new THREE.IcosahedronGeometry(r,1),x,y,z);}
 if(id==='bin'||id==='drum')cyl(0,0,id==='bin'?.34:.46,id==='bin'?.24:.3,id==='bin'?.68:.92);
 if(id==='pallet'){for(let i=0;i<5;i++)box(0,-.4+i*.2,.14,1.2,.15,.06);for(const x of [-.5,0,.5])box(x,0,.06,.12,1,.12);box(0,0,.43,.82,.68,.5);}
 if(id==='display-rack'){for(const z of [.2,.85,1.5])box(0,0,z,1.4,.55,.08);for(const x of [-.65,.65])for(const y of [-.22,.22])box(x,y,.82,.05,.05,1.65);}
 const v=[],f=[];for(const g of p){const a=g.attributes.position.array,offset=v.length/3;v.push(...a);if(g.index)for(const i of g.index.array)f.push(i+offset);else for(let i=0;i<a.length/3;i++)f.push(i+offset);g.dispose();}return normalize({id,label:id,v:new Float32Array(v),f:new Uint32Array(f)});
}
function normalize(m){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<m.v.length;i++)lo[i%3]=Math.min(lo[i%3],m.v[i]),hi[i%3]=Math.max(hi[i%3],m.v[i]);const center=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]];m.v=m.v.slice();for(let i=0;i<m.v.length;i++)m.v[i]-=center[i%3];m.size=hi.map((h,i)=>h-lo[i]);return m;}
function warm(){return warming??=(async()=>{for(const a of root.NoiseLabPropAssets||[]){const [v,f]=await Promise.all([unpack(a.vertices,Float32Array),unpack(a.faces,Uint32Array)]);models.set(a.id,normalize({id:a.id,label:a.label,v,f}));}for(const id of ['table-set','desk','plant','bench','bin','drum','pallet','display-rack'])models.set(id,procedural(id));})();}
function transformed(instance){const m=models.get(instance.asset);if(!m)throw Error('Unknown prop '+instance.asset);const c=Math.cos(instance.yaw*Math.PI/180),s=Math.sin(instance.yaw*Math.PI/180),v=new Float32Array(m.v.length);for(let k=0;k<v.length;k+=3){const x=m.v[k]*instance.scale,y=m.v[k+1]*instance.scale;v[k]=instance.x+c*x-s*y;v[k+1]=instance.y+s*x+c*y;v[k+2]=instance.z+m.v[k+2]*instance.scale;}return {vertices:v,faces:m.f,rho:new Float32Array(v.length/3).fill(instance.reflectance)};}
function compose(raw,layout){if(!layout?.instances?.length)return raw;const parts=[{vertices:raw.vertices,faces:raw.faces,rho:raw.rho},...layout.instances.map(transformed)];const vertices=new Float32Array(parts.reduce((n,p)=>n+p.vertices.length,0)),faces=new Uint32Array(parts.reduce((n,p)=>n+p.faces.length,0)),rho=new Float32Array(vertices.length/3);let vi=0,fi=0;for(const p of parts){vertices.set(p.vertices,vi);rho.set(p.rho,vi/3);for(const f of p.faces)faces[fi++]=f+vi/3;vi+=p.vertices.length;}return {...raw,id:raw.id+':'+layout.key,nv:vertices.length/3,nf:faces.length/3,vertices,faces,rho};}
function create(engine,raw,scene,seed,bounds,anchors){
 const family=scene.replace(/_v\d+$/,''),allowed=families[family];if(!allowed)throw Error('Unknown scene family');const random=rng(hash(seed,scene+':props-v24')),outdoor=['construction','crane_yard','apartment'].includes(family),target=(outdoor?6:3)+Math.floor(random()*(outdoor?8:5)),instances=[],boxes=[];
 for(let n=0;n<target;n++){
  const asset=allowed[Math.floor(random()*allowed.length)],m=models.get(asset),scale=.9+random()*.2,yaw=90*Math.floor(random()*4)+(random()-.5)*16,c=Math.abs(Math.cos(yaw*Math.PI/180)),s=Math.abs(Math.sin(yaw*Math.PI/180)),halfX=(c*m.size[0]+s*m.size[1])*scale/2,halfY=(s*m.size[0]+c*m.size[1])*scale/2,height=m.size[2]*scale,r=Math.hypot(halfX,halfY)+.12;
  for(let attempt=0;attempt<400;attempt++){
   const x=bounds[0]+r+(bounds[2]-bounds[0]-2*r)*random(),y=bounds[1]+r+(bounds[3]-bounds[1]-2*r)*random();if(bounds[2]-bounds[0]<2*r||bounds[3]-bounds[1]<2*r)break;
   if(!engine.placementFree(x,y,r,.015,height+.08))continue;
   if(!outdoor&&!NoiseLabSequence.inside(engine,scene,x,y,r))continue;
   if(anchors.some(a=>Math.abs(a.x-x)<halfX+.65&&Math.abs(a.y-y)<halfY+.65))continue;
   if(boxes.some(b=>Math.abs(b.x-x)<b.hx+halfX+.35&&Math.abs(b.y-y)<b.hy+halfY+.35))continue;
   // Requiring a free connection rejects points inside closed buildings too.
   if(!anchors.some(a=>engine.walkFree([a.x,a.y],[x,y],.12,.08,Math.min(height+.1,2.4))))continue;
   if(/electricity-pole|light-curved|road-sign/.test(asset)){const edge=Math.min(x-bounds[0],bounds[2]-x,y-bounds[1],bounds[3]-y);if(edge>Math.min(bounds[2]-bounds[0],bounds[3]-bounds[1])*.25)continue;}
   const z=engine.terrainHeight(x,y);instances.push({asset,label:m.label,x,y,z,yaw,scale,reflectance:.12+random()*.45,size:m.size.map(v=>v*scale)});boxes.push({x,y,hx:halfX,hy:halfY});break;
  }
 }
 return {revision:24,key:scene+':'+seed+':props-v24:'+hash(seed,JSON.stringify(instances)),scene,seed,requested:target,instances,baseStructures:'fixed',collisionPolicy:'conservative bounds, ground support, free connection, protected sensor anchors',fieldCalibrated:false};
}
root.NoiseLabScene={warm,create,compose,transformed,models,families,hash,rng};
})(typeof self!=='undefined'?self:globalThis);
