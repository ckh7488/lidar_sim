/* Shared, moving particle field. Review hypotheses; not an Ouster calibration. */
(function(root){
'use strict';
const PI=Math.PI, G=9.80665, LO=-18, HI=18, TOP=12, VOLUME=36*36*12;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), wrap=(x,a,b)=>a+((x-a)%(b-a)+(b-a))%(b-a);
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function sceneSeed(seed,key=''){let h=2166136261;for(const ch of key)h=Math.imul(h^ch.charCodeAt(0),16777619);return (seed^h)>>>0;}
function dustSource(seed){
  const random=rng(seed^0x5372c8ab);
  return {length:1.4+2*random(),width:.16+.24*random(),bend:.05+.30*random(),curveFrequency:1+1.8*random(),curvePhase:2*PI*random(),skew:.5*(random()-.5),height:.10+.10*random(),lift:.35+.40*random(),liftHeight:1+1.4*random(),liftOffset:.6*(random()-.5)};
}
function displayDust(world,velocities,ids,seed,fraction){
  const p=[],v=[],kept=[];
  for(let i=0;i<ids.length;i++)if(rng(seed^Math.imul(ids[i]+1,0x51f15e5))()<fraction){const k=3*i;p.push(world[k],world[k+1],world[k+2]);v.push(velocities[k],velocities[k+1],velocities[k+2]);kept.push(ids[i]);}
  return {world:new Float32Array(p),worldV:new Float32Array(v),worldIds:new Uint32Array(kept)};
}
function rainSpeed(mm){return 9.65-10.3*Math.exp(-.6*mm)}
function settling(microns){const d=microns*1e-6;return G*(2650-1.225)*d*d/(18*1.81e-5)}
function relaxation(v,u,tau,dt){const a=Math.exp(-dt/tau);return {v:u+(v-u)*a,dx:u*dt+(v-u)*tau*(1-a)}}
function config(c){return {mode:c.weather,seed:c.seed>>>0,flowPhase:2*PI*rng((c.seed>>>0)^0xc6ef3720)(),time:clamp(c.time||0,0,8),wind:clamp(c.motionWind??1,0,3),angle:(c.motionAngle??35)*PI/180,eddy:clamp(c.motionEddy??.7,0,1.5),rainRate:clamp(c.rainRate??5,1,20),snowN:clamp(c.snowN??3,0,10),sourceX:c.emitterX??5,sourceY:c.emitterY??0,dustFlux:clamp(c.dustFlux??.20,0,2),dustSize:clamp(c.dustSize??15,5,25),returnFactor:c.weatherReturn??(c.weather==='snow'?.5:.02),alpha:c.weatherAlpha??.002};}
let precipitationCache=null;
function precipitation(c){
  const key=JSON.stringify([c.mode,c.seed,c.rainRate,c.snowN]);
  if(precipitationCache?.key===key)return precipitationCache;
  const rand=rng(c.seed^(c.mode==='rain'?0xb431c789:0x789bad12)),lambda=4.1*c.rainRate**(-.21),dmin=1.5,dmax=6;
  const concentration=c.mode==='rain'?8000/lambda*(Math.exp(-lambda*dmin)-Math.exp(-lambda*dmax)):c.snowN;
  const n=Math.round(concentration*VOLUME),a=new Float32Array(n*7);
  for(let i=0;i<n;i++){const k=i*7;a[k]=LO+36*rand();a[k+1]=LO+36*rand();a[k+2]=TOP*rand();
    const d=c.mode==='rain'?-Math.log(Math.exp(-lambda*dmin)-rand()*(Math.exp(-lambda*dmin)-Math.exp(-lambda*dmax)))/lambda:1+7*rand()**2;
    a[k+3]=d/2000;a[k+4]=c.mode==='rain'?rainSpeed(d):.4+1.1*rand();a[k+5]=rand()*2*PI;a[k+6]=.3+.7*rand();
  }
  return precipitationCache={key,a,n,concentration,lambda};
}
function makeHash(input){
  const step=.004,na=Math.ceil(2*PI/step),ne=Math.ceil(PI/step),head=new Int32Array(na*ne),next=new Int32Array(input.ranges.length);head.fill(-1);const norms=new Float64Array(input.ranges.length);let offset=0;
  for(let i=0;i<input.ranges.length;i++){const k=i*3,d=input.directions;norms[i]=Math.hypot(d[k],d[k+1],d[k+2]);if(input.origins)offset=Math.max(offset,Math.hypot(input.origins[k]-input.sensor[0],input.origins[k+1]-input.sensor[1],input.origins[k+2]-input.sensor[2]));const az=Math.atan2(d[k+1],d[k]),el=Math.asin(clamp(d[k+2],-1,1)),x=Math.floor((az+PI)/(2*PI)*na)%na,y=clamp(Math.floor((el+PI/2)/PI*ne),0,ne-1),cell=y*na+x;next[i]=head[cell];head[cell]=i;}
  return {step,na,ne,head,next,norms,offset};
}
function within(o,d){let near=.5,far=100;for(let k=0;k<3;k++){const low=k===2?0:LO,high=k===2?TOP:HI;if(Math.abs(d[k])<1e-10){if(o[k]<low||o[k]>high)return null;continue}let a=(low-o[k])/d[k],b=(high-o[k])/d[k];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>=far)return null}return [near,far]}
function empty(input){const n=input.ranges.length;return {power:new Float32Array(n),range:new Float32Array(n),tau:new Float32Array(n),world:new Float32Array(),worldIds:new Uint32Array(),worldV:new Float32Array(),stats:{intersections:0,particles:0,displayed:0,collisionRejected:0,temporalCoherence:true}}}
function rainPosition(a,k,t,c){const phase=a[k+5],amp=c.mode==='snow'?.22:0,omega=1.4,wx=c.wind*Math.cos(c.angle),wy=c.wind*Math.sin(c.angle),x=a[k]+wx*t+amp*(Math.sin(omega*t+phase)-Math.sin(phase)),y=a[k+1]+wy*t+amp*(Math.cos(omega*.8*t+phase)-Math.cos(phase)),z=a[k+2]-a[k+4]*t;return [wrap(x,LO,HI),wrap(y,LO,HI),wrap(z,0,TOP),wx+amp*omega*Math.cos(omega*t+phase),wy-amp*omega*.8*Math.sin(omega*.8*t+phase),-a[k+4],Math.floor((x-LO)/36),Math.floor((y-LO)/36),Math.max(0,-Math.floor(z/TOP))];}
function precipitate(input,c,blocked,overlap){
  const start=performance.now(),p=precipitation(c),out=empty(input),h=makeHash(input),world=[],worldIds=[],worldV=[],stride=c.mode==='rain'?96:8;let intersections=0,rejected=0;
  const dirs=input.directions,orig=input.origins,center=input.sensor,candidateRows=new Map();
  for(let i=0;i<input.ranges.length;i++){const k=3*i,o=orig?orig.subarray(k,k+3):center,d=dirs.subarray(k,k+3),b=within(o,d);if(b)out.tau[i]=c.alpha*Math.max(0,Math.min(b[1],input.ranges[i]||100)-b[0]);}
  for(let i=0;i<p.n;i++){
    const k=7*i,pos=rainPosition(p.a,k,c.time,c),x=pos[0],y=pos[1],z=pos[2],a=p.a[k+3],dx=x-center[0],dy=y-center[1],dz=z-center[2],r=Math.hypot(dx,dy,dz);let clear=null;
    function visible(){if(clear!==null)return clear;const age=(50-z)/p.a[k+4],origin=[x-pos[3]*age,y-pos[4]*age,50];clear=!blocked(origin,pos);if(!clear)rejected++;return clear;}
    if(i%stride===0&&visible()){world.push(x,y,z);const cycle=pos[6]+1+3*(pos[7]+1)+9*pos[8];worldIds.push(i+cycle*p.n);worldV.push(pos[3],pos[4],pos[5]);}
    if(r<.45||r>34)continue;
    const az=Math.atan2(dy,dx),el=Math.asin(clamp(dz/r,-1,1)),angular=.001+(a+h.offset+.001)/r,ye=Math.ceil(angular/h.step)+1,xe=Math.ceil(angular/(h.step*Math.max(.15,Math.cos(el))))+1,
      bx=Math.floor((az+PI)/(2*PI)*h.na),by=Math.floor((el+PI/2)/PI*h.ne);
    for(let yy=Math.max(0,by-ye);yy<=Math.min(h.ne-1,by+ye);yy++)for(let xx=bx-xe;xx<=bx+xe;xx++){
      let id=h.head[yy*h.na+(xx%h.na+h.na)%h.na];
      while(id!==-1){const j=3*id,ox=orig?orig[j]:center[0],oy=orig?orig[j+1]:center[1],oz=orig?orig[j+2]:center[2],px=x-ox,py=y-oy,pz=z-oz,s=(px*dirs[j]+py*dirs[j+1]+pz*dirs[j+2])/h.norms[id],limit=input.ranges[id]||100;
        if(s>.5&&s<limit){const br=.001+.001*s,perp2=Math.max(0,px*px+py*py+pz*pz-s*s);if(perp2<(a+br)**2){const fraction=overlap(a,br,Math.sqrt(perp2)),power=c.returnFactor*fraction*Math.exp(-2*c.alpha*s)/(s*s)*(c.mode==='snow'?p.a[k+6]:1);if(visible()){intersections++;if(!candidateRows.has(id))candidateRows.set(id,[]);candidateRows.get(id).push(s,power);if(power>out.power[id]){out.power[id]=power;out.range[id]=s;}}}}id=h.next[id];
      }
    }
  }
  out.world=new Float32Array(world);out.worldIds=new Uint32Array(worldIds);out.worldV=new Float32Array(worldV);out.candidates=packCandidates(candidateRows,input.ranges.length);
  out.stats={intersections,particles:p.n,displayed:worldIds.length,displayStride:stride,collisionRejected:rejected,concentration:p.concentration,diameterRangeMm:c.mode==='rain'?[1.5,6]:[1,8],fallSpeedRange:c.mode==='rain'?[rainSpeed(1.5),rainSpeed(6)]:[.4,1.5],domain:[LO,HI,0,TOP],gravity:G,temporalCoherence:true,terminalBalance:true,smallRainReturnsOmitted:c.mode==='rain',simulationMs:performance.now()-start,fieldCalibrated:false,collisionModel:'backtraced straight path, snow flutter approximated',scanTiming:'instantaneous full scan'};
  return out;
}
function air(x,y,z,t,c){if(!c.patternLegacy){let u=c.wind*Math.cos(c.angle),v=c.wind*Math.sin(c.angle),w=0;for(const m of c.flowModes){const s=c.eddy*Math.sin(m[0]*x+m[1]*y+m[2]*z+m[3]*t+m[4]);u+=m[5]*s;v+=m[6]*s;w+=m[7]*s;}const dx=x-c.sourceX,dy=y-c.sourceY,a=dx*Math.cos(c.sourceAngle)+dy*Math.sin(c.sourceAngle),b=-dx*Math.sin(c.sourceAngle)+dy*Math.cos(c.sourceAngle),h=Math.max(0,z-(c.groundHeight?.(x,y)||0));const q=c.sourceProfile;w+=q.lift*Math.exp(-Math.abs(a-q.liftOffset*q.length)/(.55+.5*q.length)-Math.abs(b)/(.35+.6*q.width)-h/q.liftHeight);return [u,v,w*Math.tanh(h/.2)];}const q=c.flowPhase,dx=x-c.sourceX,dy=y-c.sourceY,e=c.eddy;
  // A curl field supplies reproducible eddies; this is not an obstacle-aware CFD solution.
  const ux=c.wind*Math.cos(c.angle)+e*(Math.sin(.9*y+.8*t+q)+.45*Math.cos(1.7*z-.5*t));
  const uy=c.wind*Math.sin(c.angle)+e*(Math.sin(1.1*z-.6*t+q)+.5*Math.cos(.8*x+.4*t));
  const uz=(e*(.55*Math.sin(1.1*x+.5*t)+.45*Math.cos(.9*y-.3*t+q))+.75*Math.exp(-(dx*dx+dy*dy)/2)*Math.exp(-Math.max(0,z)/2))*Math.tanh(Math.max(0,z)/.3);
  return [ux,uy,uz];
}
function dust(input,c,blocked){
  const start=performance.now(),rand=rng(c.shapeSeed^0x9823ad7),N=6000,world=[],worldV=[],ids=[],mass=[],diam=[],dt=.05,emissionDuration=8,parcelMass=c.dustFlux/1000*emissionDuration/N;let deposited=0,born=0,escaped=0;
  for(let i=0;i<N;i++){
    const birth=emissionDuration*rand(),d=clamp(c.dustSize*Math.exp((rand()-.5)*1.2),3,30),tau=settling(d)/G,angle=rand()*2*PI,r=.5*Math.sqrt(rand());
    let x=c.sourceX+r*Math.cos(angle),y=c.sourceY+r*Math.sin(angle),z=.18+.45*rand(),vx=0,vy=0,vz=.8+rand()*.4;
    if(!c.patternLegacy){const q=c.sourceProfile,a=q.length*(angle/(2*PI)-.5),width=q.width*(.7+.3*Math.sin(q.curveFrequency*a+q.curvePhase)),b=q.bend*(Math.sin(q.curveFrequency*a+q.curvePhase)+.35*Math.sin(2.1*a-c.flowPhase))+q.skew*a+width*Math.sqrt(-2*Math.log(Math.max(1e-8,r*r*4)))*Math.cos(i*2.399963);x=c.sourceX+a*Math.cos(c.sourceAngle)-b*Math.sin(c.sourceAngle);y=c.sourceY+a*Math.sin(c.sourceAngle)+b*Math.cos(c.sourceAngle);z=(blocked.groundHeight?.(x,y)||0)+.04+q.height*(z-.18)/.45;}
    if(birth>c.time||c.dustFlux===0)continue;born++;
    let alive=!blocked([x,y,2],[x,y,z]);if(!alive){deposited++;continue;}
    for(let t=birth;t<c.time-1e-9;t+=dt){const h=Math.min(dt,c.time-t),u=air(x,y,z,t,c),sx=relaxation(vx,u[0],tau,h),sy=relaxation(vy,u[1],tau,h),sz=relaxation(vz,u[2]-G*tau,tau,h),nx=x+sx.dx,ny=y+sy.dx,nz=z+sz.dx;
      if(nz<-.05||blocked([x,y,z],[nx,ny,nz])){alive=false;deposited++;break;}x=nx;y=ny;z=nz;vx=sx.v;vy=sy.v;vz=sz.v;
    }
    if(alive){if(Math.abs(x)<150&&Math.abs(y)<150&&z>=-.1&&z<120){world.push(x,y,z);worldV.push(vx,vy,vz);ids.push(i);mass.push(parcelMass);diam.push(d);}else escaped++;}
  }
  // Mass-conserving cloud-in-cell deposition. A parcel is many grains, never a return point.
  const cell=.25,max=[-Infinity,-Infinity,-Infinity],min=[Infinity,Infinity,Infinity];
  for(let i=0;i<world.length;i++) {const a=i%3;min[a]=Math.min(min[a],world[i]-.5);max[a]=Math.max(max[a],world[i]+.5);}
  const gx=ids.length?Math.floor(min[0]/cell)*cell:0,gy=ids.length?Math.floor(min[1]/cell)*cell:0,gz=ids.length?Math.floor(min[2]/cell)*cell:0,nx=ids.length?Math.ceil((max[0]-gx)/cell)+2:2,ny=ids.length?Math.ceil((max[1]-gy)/cell)+2:2,nz=ids.length?Math.ceil((max[2]-gz)/cell)+2:2,grid=new Float32Array(nx*ny*nz);
  for(let i=0;i<ids.length;i++){const k=3*i,xx=(world[k]-gx)/cell,yy=(world[k+1]-gy)/cell,zz=(world[k+2]-gz)/cell,ix=Math.floor(xx),iy=Math.floor(yy),iz=Math.floor(zz),fx=xx-ix,fy=yy-iy,fz=zz-iz,
    coefficient=mass[i]*3/(2650*diam[i]*1e-6)/(cell**3); // Qext=2 geometric-optics approximation.
    for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let d=0;d<2;d++)if(iz+d<nz)grid[((iz+d)*ny+iy+b)*nx+ix+a]+=coefficient*(a?fx:1-fx)*(b?fy:1-fy)*(d?fz:1-fz);
    for(let d=0;d<3;d++){min[d]=Math.min(min[d],world[k+d]-.5);max[d]=Math.max(max[d],world[k+d]+.5);}
  }
  const sample=(x,y,z)=>{const xx=(x-gx)/cell,yy=(y-gy)/cell,zz=(z-gz)/cell,ix=Math.floor(xx),iy=Math.floor(yy),iz=Math.floor(zz);if(ix<0||iy<0||iz<0||ix>=nx-1||iy>=ny-1||iz>=nz-1)return 0;const fx=xx-ix,fy=yy-iy,fz=zz-iz;let v=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let d=0;d<2;d++)v+=grid[((iz+d)*ny+iy+b)*nx+ix+a]*(a?fx:1-fx)*(b?fy:1-fy)*(d?fz:1-fz);return v;};
  const out=empty(input),candidateRows=new Map();let intersections=0;
  if(ids.length&&c.dustFlux>0)for(let i=0;i<input.ranges.length;i++){const k=3*i,o=input.origins?input.origins.subarray(k,k+3):input.sensor,d=input.directions.subarray(k,k+3);let lo=.5,hi=input.ranges[i]||100;
    for(let j=0;j<3;j++){if(Math.abs(d[j])<1e-9){if(o[j]<min[j]||o[j]>max[j]){hi=0;break}}else{let a=(min[j]-o[j])/d[j],b=(max[j]-o[j])/d[j];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);}}
    let tau=0,best=0,rr=0;for(let s=lo+.0625;s<hi;s+=.125){const alpha=sample(o[0]+s*d[0],o[1]+s*d[1],o[2]+s*d[2]),delta=alpha*.125,power=.12*alpha*.35*Math.exp(-2*(tau+.5*delta))/(s*s);tau+=delta;if(power>best){best=power;rr=s;}if(power>0){if(!candidateRows.has(i))candidateRows.set(i,[]);candidateRows.get(i).push(s,power*.125/.35);}}out.power[i]=best;out.range[i]=rr;out.tau[i]=tau;if(best>0)intersections++;
  }
  out.world=new Float32Array(world);out.worldIds=new Uint32Array(ids);out.worldV=new Float32Array(worldV);out.stats={intersections,particles:ids.length,displayed:ids.length,parcelsBorn:born,deposited,escaped,parcelMassKg:parcelMass,airborneMassKg:ids.length*parcelMass,emittedMassKg:born*parcelMass,gravity:G,diameterRangeMicrons:[3,30],settlingRangeMps:[settling(3),settling(30)],maxSettlingRe:1.225*settling(30)*30e-6/1.81e-5,temporalCoherence:true,gridCellM:cell,integrationStepM:.125,physicsStepS:dt,simulationMs:performance.now()-start,fieldCalibrated:false,scanTiming:'instantaneous full scan',collisionModel:'mesh segment intersection; deposited particles stop',flowModel:'procedural curl plus local lift with planar ground damping, not CFD',optics:'parcel mass to Qext=2 extinction; relative backscatter proxy'};
  out.candidates=packCandidates(candidateRows,input.ranges.length);const displayFraction=clamp(c.dustFlux/.25,0,1);Object.assign(out,displayDust(world,worldV,ids,c.shapeSeed,displayFraction));out.stats.displayed=out.worldIds.length;out.stats.displayFraction=displayFraction;out.stats.displayBasis='stable parcel-ID thinning, relative to 0.25g/s; optics use all mass parcels';out.stats.sourceProfile=c.sourceProfile;out.stats.shapeSeed=c.shapeSeed;out.stats.sourceModel=c.patternLegacy?'legacy circular volume':'scene-and-seed varied ground disturbance';out.stats.flowModel=c.patternLegacy?'legacy harmonic field':'seeded solenoidal Fourier modes plus anisotropic lift; ground damping, not CFD';return out;
}
function packCandidates(rows,n){const offsets=new Uint32Array(n+1),ranges=[],powers=[];for(let i=0;i<n;i++){for(let j=0,a=rows.get(i)||[];j<a.length;j+=2){ranges.push(a[j]);powers.push(a[j+1]);}offsets[i+1]=ranges.length;}return {offsets,ranges:new Float32Array(ranges),powers:new Float32Array(powers)};}
function simulate(input,cfg,blocked=()=>false,overlap){const c=config(cfg);c.patternLegacy=!!cfg.patternLegacy;c.shapeSeed=c.mode==='dust'?sceneSeed(c.seed,cfg.dustShapeKey||''):c.seed;if(c.mode==='dust')c.flowPhase=2*PI*rng(c.shapeSeed^0xc6ef3720)();c.sourceProfile=dustSource(c.shapeSeed);c.sourceAngle=c.flowPhase;c.groundHeight=blocked.groundHeight;const rand=rng(c.shapeSeed^0x8d216a3);c.flowModes=[];for(let i=0;i<10;i++){const k=[rand()-.5,rand()-.5,rand()-.5],v=[rand()-.5,rand()-.5,rand()-.5],norm=Math.hypot(...k),scale=(.7+3*rand())/norm;const a=[k[1]*v[2]-k[2]*v[1],k[2]*v[0]-k[0]*v[2],k[0]*v[1]-k[1]*v[0]],an=Math.hypot(...a)||1;c.flowModes.push(...[[...k.map(x=>x*scale),.2+rand(),2*PI*rand(),...a.map(x=>x/an*.28)]]);}if(!input.directions)throw Error('Moving weather requires explicit beam directions');const out=c.mode==='dust'?dust(input,c,blocked):precipitate(input,c,blocked,overlap);delete c.groundHeight;out.config=c;return out;}
root.NoiseLabMotion={simulate,config,rainSpeed,settling,relaxation,precipitation,rainPosition,air,within};if(typeof module!=='undefined')module.exports=root.NoiseLabMotion;
})(typeof self!=='undefined'?self:globalThis);
