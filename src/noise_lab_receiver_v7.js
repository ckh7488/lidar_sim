/* Ideal independent photon-count windows, not a proprietary lidar receiver. */
(function(root){'use strict';
const rng=seed=>{let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}};
const gammaCoefficients=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
function logGamma(z){z-=1;let x=.99999999999980993;for(let i=0;i<8;i++)x+=gammaCoefficients[i]/(z+i+1);const t=z+7.5;return .9189385332046727+(z+.5)*Math.log(t)-t+Math.log(x);}
const cache=new Map();
function distribution(mean){
  if(mean<=0)return {mean:0,lo:0,cdf:new Float64Array([1])};
  // Background values are quantized by at most 0.25%; signal draws are not quantized.
  const key=Math.round(Math.log(mean)/Math.log(1.005)),mu=1.005**key;if(cache.has(key))return cache.get(key);
  const lo=Math.max(0,Math.floor(mu-12*Math.sqrt(mu)-16)),hi=Math.ceil(mu+12*Math.sqrt(mu)+16),pmf=new Float64Array(hi-lo+1),mode=Math.floor(mu),mid=mode-lo;
  pmf[mid]=Math.exp(-mu+mode*Math.log(mu)-logGamma(mode+1));
  for(let k=mode;k>lo;k--)pmf[k-lo-1]=pmf[k-lo]*k/mu;for(let k=mode;k<hi;k++)pmf[k-lo+1]=pmf[k-lo]*mu/(k+1);
  let sum=0;for(const v of pmf)sum+=v;let f=0;for(let i=0;i<pmf.length;i++){f+=pmf[i]/sum;pmf[i]=f;}pmf[pmf.length-1]=1;
  const value={mean:mu,lo,cdf:pmf};if(cache.size>2048)cache.clear();cache.set(key,value);return value;
}
function inverse(d,u){let lo=0,hi=d.cdf.length-1;while(lo<hi){const m=(lo+hi)>>1;if(d.cdf[m]<u)lo=m+1;else hi=m;}return lo+d.lo;}
function poisson(mean,rand){if(mean<=0)return 0;if(mean<40){let p=1,k=0;const limit=Math.exp(-mean);do{k++;p*=Math.max(1e-16,rand());}while(p>limit);return k-1;}
  // Transformed rejection; exact discrete acceptance via log(Poisson PMF).
  const b=.931+2.53*Math.sqrt(mean),a=-.059+.02483*b,inv=1.1239+1.1328/(b-3.4),vr=.9277-3.6224/(b-2);
  for(;;){const u=rand()-.5,v=rand(),us=.5-Math.abs(u);if(us<=0)continue;const k=Math.floor((2*a/us+b)*u+mean+.43);if(k<0)continue;if(us>=.07&&v<=vr)return k;if(us<.013&&v>us)continue;if(Math.log(v*inv/(a/(us*us)+b))<=-mean+k*Math.log(mean)-logGamma(k+1))return k;}
}
function threshold(d,windows,pfa){return Math.max(4,inverse(d,Math.exp(Math.log1p(-pfa)/windows))+1);}
function maximum(d,n,rand){return n?inverse(d,Math.exp(Math.log(Math.max(1e-16,rand()))/n)):0;}
function config(c){return {gain:c.photonGain??2e6,binM:.25,minRange:.3,maxRange:100,pfa:c.receiverPfa??1e-5,mode:c.receiverMode||'adaptive',baseBackground:.02};}
function select(candidates,bg,c,rand,includeEmpty=true){
  const windows=Math.ceil((c.maxRange-c.minRange)/c.binM),d=distribution(bg),K=c.mode==='fixed'?4:threshold(d,windows,c.pfa),groups=new Map();
  for(const a of candidates){if(a.range<c.minRange||a.range>=c.maxRange||a.power<=0)continue;const bin=Math.floor((a.range-c.minRange)/c.binM);if(!groups.has(bin))groups.set(bin,[]);groups.get(bin).push(a);}
  let win=null,best=-1,ties=0;function consider(count,item){if(count<K)return;if(count>best){best=count;win=item;ties=1;}else if(count===best&&rand()<1/(++ties))win=item;}
  for(const [bin,items] of groups){let count=poisson(d.mean,rand),dominant=count,chosen=null;for(const a of items){const photons=poisson(a.power*c.gain,rand);count+=photons;if(photons>dominant){dominant=photons;chosen=a;}}
    // Labels identify the largest simulated photon contribution, not measured ground truth.
    consider(count,chosen?{...chosen,bin}: {range:c.minRange+(bin+rand())*c.binM,power:count/c.gain,label:1,cause:'background',bin});}
  if(includeEmpty){const n=windows-groups.size,max=maximum(d,n,rand);if(max>=K){let rank=Math.min(n-1,Math.floor(rand()*n)),bin=0;for(;bin<windows;bin++)if(!groups.has(bin)&&rank--===0)break;consider(max,{range:Math.min(c.maxRange-1e-6,c.minRange+(bin+rand())*c.binM),power:max/c.gain,label:1,cause:'background',bin});}}
  return {winner:win,threshold:K,bgMean:d.mean,peak:Math.max(0,best)};
}
function simulate(input,cfg,core){
  const c=config(cfg),n=input.ranges.length,selected=new Float32Array(n),labels=new Uint8Array(n),causes=new Uint8Array(n),pw=new Float32Array(n),particleIds=new Float64Array(n),bg=input.solar?.background,skip=input.solar?.invalid,motion=input.motion;
  let dust=0,surface=0,lost=0,replaced=0,skyDust=0,backgroundReturns=0,minK=Infinity,maxK=0;
  const receiverSeed=(cfg.seed>>>0)^Math.imul(Math.round((cfg.time||0)*1000)+1,0x85ebca6b);
  for(let i=0;i<n;i++){
    const receiverRand=rng(receiverSeed^Math.imul(i+1,0x9e3779b1));
    const r=input.ranges[i],clean=r>0&&r<100,tau=motion?.tau[i]||0,items=[];
    if(clean)items.push({range:r,power:(cfg.surfaceModel&&input.response?input.response[i]:.35)*Math.exp(-2*tau)/(r*r),label:0,cause:'surface'});
    const extra=motion?.candidates;
    if(extra){for(let k=extra.offsets[i];k<extra.offsets[i+1];k++)items.push({range:extra.ranges[k],power:extra.powers[k],label:1,cause:'weather',particleId:extra.particleIds?.[k]||0});}
    else if(motion?.power[i]>0)items.push({range:motion.range[i],power:motion.power[i],label:1,cause:'weather'});
    const v=skip?.[i]?{winner:clean?{range:r,power:items[0].power,label:0,cause:'unmodeled'}:null,threshold:0}:select(items,bg?bg[i]:c.baseBackground,c,receiverRand,!!input.solar),w=v?.winner;
    if(v&&!skip?.[i]){minK=Math.min(minK,v.threshold);maxK=Math.max(maxK,v.threshold);}
    if(w){particleIds[i]=w.particleId||0;selected[i]=w.range;labels[i]=w.label;pw[i]=w.power;causes[i]=w.cause==='background'?2:w.label?1:0;if(w.label){dust++;if(clean)replaced++;else skyDust++;if(w.cause==='background')backgroundReturns++;}else surface++;}else if(clean)lost++;
  }
  // Preserve existing reconstruction and user radial-error layer, with a separate RNG stream.
  const result=core.simulate({...input,ranges:selected,motion:undefined,solar:undefined},{...cfg,weather:'none',dust:false,surfaceModel:false});
  const xyz=[],removed=[],rangeStats=[{n:0,sum:0,sum2:0,clipped:0},{n:0,sum:0,sum2:0,clipped:0}];
  for(let j=0;j<result.rayIds.length;j++){const id=result.rayIds[j],lab=labels[id];result.labels[j]=lab;result.powers[j]=pw[id];if(lab)xyz.push(...result.xyz.subarray(3*j,3*j+3));const s=rangeStats[lab],err=result.rangeErrors[j];s.n++;s.sum+=err;s.sum2+=err*err;if(result.nominalRanges[j]+err<=.3)s.clipped++;}
  for(let i=0;i<n;i++)if(input.ranges[i]>0&&(!selected[i]||labels[i])){const k=3*i,r=input.ranges[i];for(let a=0;a<3;a++)removed.push((input.origins?input.origins[k+a]:input.sensor[a])+r*input.directions[k+a]);}
  const rs=rangeStats.map(s=>({...s,mean:s.n?s.sum/s.n:0,rms:s.n?Math.sqrt(s.sum2/s.n):0,std:s.n?Math.sqrt(Math.max(0,s.sum2/s.n-(s.sum/s.n)**2)):0}));
  result.weatherParticleIds=Float64Array.from(result.rayIds,id=>particleIds[id]);result.config={...result.config,...cfg};result.dust=new Float32Array(xyz);result.removed=new Float32Array(removed);result.returnCauses=causes;
  Object.assign(result.stats,{surface,dust,lost,replaced,skyDust,clean:input.ranges.reduce((s,r)=>s+(r>0&&r<100),0),surfaceModel:!!cfg.surfaceModel,noiseFraction:dust/Math.max(1,dust+surface),weather:{mode:cfg.weather||'none',enabled:!!motion,intersections:motion?.stats.intersections||0,alpha:cfg.weatherAlpha||0,temporalCoherence:!!motion,sensorCalibrated:false},model:'photon-window-review-v7',receiver:{...c,minThreshold:minK,maxThreshold:maxK,backgroundReturns,independentWindows:true,backgroundQuantizationMaxRelativeError:.00251,fieldCalibrated:false}});
  result.stats.rangeError.surface=rs[0];result.stats.rangeError.dust=rs[1];return result;
}
root.NoiseLabReceiver={distribution,inverse,poisson,threshold,maximum,select,config,simulate,rng};if(typeof module!=='undefined')module.exports=root.NoiseLabReceiver;
})(typeof self!=='undefined'?self:globalThis);
