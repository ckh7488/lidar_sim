/* Live geometry hypotheses. Actual rays determine hits; nominal rays reconstruct uncorrected measurements. */
(function(root){
'use strict';
const rad=Math.PI/180;
function rotation(pitch,roll){const p=pitch*rad,r=roll*rad,cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);return [cp,sp*sr,sp*cr,0,cr,-sr,-sp,cp*sr,cp*cr]}
function product(a,b){const o=new Float64Array(9);for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)o[3*i+j]+=a[3*i+k]*b[3*k+j];return o}
function transform(m,v,offset,out,k){for(let a=0;a<3;a++)out[k+a]=m[3*a]*v[offset]+m[3*a+1]*v[offset+1]+m[3*a+2]*v[offset+2]}
function geometry(v,f){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(v,3));g.setIndex(new THREE.BufferAttribute(f,1));return g}
function engine(raw,beam){
  const objectGeometry=geometry(raw.vertices,raw.faces),groundGeometry=geometry(raw.terrain.vertices.slice(),raw.terrain.faces),
    objectBVH=new MeshBVHLib.MeshBVH(objectGeometry,{maxLeafTris:8}),groundBVH=new MeshBVHLib.MeshBVH(groundGeometry,{maxLeafTris:8});
  let terrainCm=-1;
  function ground(cm){if(cm===terrainCm)return;const p=groundGeometry.attributes.position.array,z=raw.terrain.vertices,scale=cm/100/raw.terrain.base_std_m;for(let k=2;k<p.length;k+=3)p[k]=z[k]*scale;groundGeometry.attributes.position.needsUpdate=true;groundBVH.refit();terrainCm=cm}
  async function cast(c,yieldStep){
    const start=performance.now();ground(c.terrainCm);
    const n=beam.h*beam.w,dirs=new Float32Array(3*n),origins=new Float32Array(3*n),nominalDirs=new Float32Array(3*n),nominalOrigins=new Float32Array(3*n),ranges=new Float32Array(n),response=new Float32Array(n),isGround=new Uint8Array(n),sensor=[0,0,1.65],mount=rotation(c.pitchDeg,c.rollDeg),rotations=[];
    const localOrigins=c.opticalOffset?beam.offsets:null,zero=[0,0,beam.center_origin_m[2]];
    for(let col=0;col<beam.w;col++){const theta=-col*2*Math.PI/beam.w,phase=c.wobbleCycles*theta+c.wobblePhase*rad;rotations.push(product(mount,rotation(c.wobbleDeg*Math.sin(phase),c.wobbleDeg*Math.cos(phase))))}
    let groundHits=0,clean=0;const ray=new THREE.Ray(),phase=(raw.seed%101)*.11;
    for(let i=0;i<n;i++){
      if(yieldStep&&i%4096===0&&await yieldStep(i,n)===false)return null;
      const k=3*i,col=i%beam.w,m=rotations[col],lo=localOrigins||zero,oi=localOrigins?col*3:0;
      transform(m,beam.dirs,k,dirs,k);transform(m,lo,oi,origins,k);origins[k+2]+=sensor[2];
      transform(mount,beam.dirs,k,nominalDirs,k);transform(mount,lo,oi,nominalOrigins,k);nominalOrigins[k+2]+=sensor[2];
      ray.origin.fromArray(origins,k);ray.direction.fromArray(dirs,k);
      let hit=objectBVH.raycastFirst(ray,THREE.DoubleSide,.3,100),g=groundBVH.raycastFirst(ray,THREE.DoubleSide,.3,hit?hit.distance:100),rho;
      if(g&&(!hit||g.distance<hit.distance)){hit=g;rho=.24;isGround[i]=1;groundHits++}else if(hit)rho=raw.rho[hit.face.a];
      if(hit&&hit.distance<100){clean++;ranges[i]=hit.distance;const x=hit.point,inc=Math.abs(hit.face.normal.dot(ray.direction)),gain=Math.exp(.24*Math.sin(.81*x.x+.31*x.y+phase)+.17*Math.sin(1.7*x.y-.44*x.x));response[i]=Math.max(.06,Math.min(.7,rho*gain))*inc}
    }
    const normals=new Float32Array(3*n),albedo=new Float32Array(n);
    // Surface illumination needs normals separately from the lidar incidence factor.
    for(let i=0;i<n;i++)if(ranges[i]){const k=3*i;ray.origin.fromArray(origins,k);ray.direction.fromArray(dirs,k);const hit=(isGround[i]?groundBVH:objectBVH).raycastFirst(ray,THREE.DoubleSide,.3,100);if(hit){const sign=hit.face.normal.dot(ray.direction)>0?-1:1;for(let a=0;a<3;a++)normals[k+a]=hit.face.normal.getComponent(a)*sign;albedo[i]=response[i]/Math.max(1e-6,Math.abs(hit.face.normal.dot(ray.direction)));}}
    const input={sensor,ranges,response,albedo,normals,ground:isGround,directions:dirs,origins};
    if(c.wobbleDeg>0&&!c.compensateWobble){input.reportedDirections=nominalDirs;input.reportedOrigins=nominalOrigins}
    return {input,summary:{config:{...c},clean,groundHits,rays:n,castMs:performance.now()-start,wobbleCalibrated:false,fieldValidated:false,reportedUsing:c.wobbleDeg>0&&!c.compensateWobble?'nominal direction, uncorrected angular error':'actual ray direction'}};
  }
  const motionRay=new THREE.Ray(),motionEnd=new THREE.Vector3();
  function blocked(a,b){motionRay.origin.fromArray(a);motionEnd.fromArray(b);motionRay.direction.copy(motionEnd).sub(motionRay.origin);const distance=motionRay.direction.length();if(distance<1e-7)return false;motionRay.direction.multiplyScalar(1/distance);return !!(objectBVH.raycastFirst(motionRay,THREE.DoubleSide,1e-5,distance)||groundBVH.raycastFirst(motionRay,THREE.DoubleSide,1e-5,distance));}
  function groundHeight(x,y){motionRay.origin.set(x,y,50);motionRay.direction.set(0,0,-1);const hit=groundBVH.raycastFirst(motionRay,THREE.DoubleSide,0,100);return hit?hit.point.z:0;}
  blocked.groundHeight=groundHeight;
  function castRay(o,d){motionRay.origin.fromArray(o);motionRay.direction.fromArray(d);let hit=objectBVH.raycastFirst(motionRay,THREE.DoubleSide,.3,100),g=groundBVH.raycastFirst(motionRay,THREE.DoubleSide,.3,hit?hit.distance:100),rho;if(g&&(!hit||g.distance<hit.distance)){hit=g;rho=.24;}else if(hit)rho=raw.rho[hit.face.a];if(!hit)return null;const x=hit.point,phase=(raw.seed%101)*.11,gain=Math.exp(.24*Math.sin(.81*x.x+.31*x.y+phase)+.17*Math.sin(1.7*x.y-.44*x.x));return {range:hit.distance,response:Math.max(.06,Math.min(.7,rho*gain))*Math.abs(hit.face.normal.dot(motionRay.direction))};}
  blocked.castRay=castRay;
  return {cast,castRay,blocked,groundHeight,prepare:ground};
}
root.NoiseLabGeometry={rotation,product,engine};
})(typeof self!=='undefined'?self:globalThis);
