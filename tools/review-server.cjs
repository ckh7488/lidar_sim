/* Local review API; every frame comes from runtime.run(), never a display-only generator. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),os=require('node:os');
const {createSimulator,ROOT}=require('./runtime.cjs'),{summary,writeFrame}=require('./frame-export.cjs');
const DIST=path.join(ROOT,'dist'),policy=require('../configs/review_demo_v23.json');
const controlRules={dustFlux:[0,2],dustSize:[5,25],motionEddy:[0,1.5],rainRate:[1,20],snowN:[1,10],fogVisibility:[50,2000],fogVariation:[0,.8],fogScatterLog:[-5,0],motionWind:[0,6],motionAngle:[-180,180],sunAz:[-180,180],sunEl:[-10,80],sunWidth:[.5,8],sunProbability:[0,1],weakPhotons:[20,500],radialSigma:[0,.15],radialSlope:[0,5]};
function validate(body,index){
 const {scene,generator,seed,pose='random',mode='frame',time=3,fps=1,controls={},edgeMixing=false,randomScene=true}=body;
 if(!index.scenes.some(s=>s.id===scene))throw Error('알 수 없는 장소입니다.');
 const model=policy.generators.find(m=>m.id===generator);if(!model)throw Error('알 수 없는 생성기입니다.');
 if(model.outdoorOnly&&!/^(construction|crane_yard|apartment)_/.test(scene))throw Error('비·눈은 야외 장소에서만 생성할 수 있습니다.');
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('시드는 0~4294967295 정수입니다.');
 if(!['auto','random'].includes(pose)&&(!Number.isInteger(pose)||pose<0||pose>39))throw Error('시작점은 연속 랜덤, 자동 또는 1~40입니다.');
 if(!['frame','sequence'].includes(mode)||!Number.isFinite(time)||time<0||time>10||![1,2,5,10].includes(fps))throw Error('시각·프레임 간격이 올바르지 않습니다.');
 if(typeof randomScene!=='boolean'||typeof edgeMixing!=='boolean'||typeof controls!=='object'||!controls||Array.isArray(controls))throw Error('설정 형식이 올바르지 않습니다.');
 const clean={};for(const [k,v] of Object.entries(controls)){const range=controlRules[k];if(!range||typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1])throw Error('허용되지 않은 설정: '+k);clean[k]=v;}
 const kind=['edge','weak'].includes(generator)?'general':generator;if(kind==='general')clean['general-mode']=generator;
 return {request:{scene,generator,seed,pose,mode,time,fps,controls,edgeMixing,randomScene},options:{scene,kind,seed,pose,scenario:"random-v24",randomScene,sequence:true,controls:clean,edgeMixing},times:mode==='sequence'?Array.from({length:10*fps+1},(_,i)=>i/fps):[time]};
}
function createReviewServer({port=18769,outputRoot=path.join(ROOT,'outputs','review-demo')}={}){
 if(!fs.existsSync(path.join(DIST,'review_demo.html')))throw Error('먼저 python tools/build.py를 실행하세요.');
 const index=JSON.parse(fs.readFileSync(path.join(DIST,'assets/noise_lab_v1/index.json'),'utf8')),jobs=new Map();let active=null;
 const publicJob=j=>({id:j.id,status:j.status,request:j.request,frames:j.frames,total:j.times.length,currentTime:j.currentTime,progress:j.progress,preview:j.preview,error:j.error,elapsedS:((j.finished||Date.now())-j.started)/1000,manifestUrl:j.status==='complete'?'/api/jobs/'+j.id+'/manifest':null});
 async function run(j){
  let sim;try{
   sim=createSimulator({onProgress:p=>{j.progress=p;},onGeometry:g=>{j.preview={sensorPose:g.sensorPose,geometry:g.config,routePreview:g.routePreview,sequencePlan:g.sequencePlan,sceneLayout:g.sceneLayout};}});j.sim=sim;
   for(let i=0;i<j.times.length;i++){
    if(j.status==='cancelled')break;j.currentTime=j.times[i];j.progress={stage:'geometry',progress:0};
    const frame=await sim.run({...j.options,time:j.currentTime});if(j.status==='cancelled')break;
    const m=summary(frame),file=String(i).padStart(4,'0')+'.lsf.gz';writeFrame(path.join(j.folder,file),frame,m);
    j.frames.push({index:i,time:m.time,points:m.points,noise:m.stats.dust,uncertain:m.stats.uncertain||0,hash:m.xyz_labels_sha256,url:'/api/jobs/'+j.id+'/frames/'+i});
   }
   if(j.status!=='cancelled'){j.status='complete';j.finished=Date.now();fs.writeFileSync(path.join(j.folder,'manifest.json'),JSON.stringify({...publicJob(j),fieldCalibrated:false,trainingApproved:false},null,2),{flag:'wx'});}
  }catch(e){if(j.status!=='cancelled'){j.status='error';j.error=e.message;}}
  finally{j.finished??=Date.now();sim?.close();j.sim=null;if(active===j)active=null;fs.writeFileSync(path.join(j.folder,'status.json'),JSON.stringify(publicJob(j),null,2));}
 }
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.gz':'application/gzip','.zip':'application/zip'};
 const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const file=(p,type,download)=>{if(!fs.existsSync(p)||!fs.statSync(p).isFile())return send(404,{error:'파일을 찾을 수 없습니다.'});res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',type||mime[path.extname(p)]||'application/octet-stream');if(download)res.setHeader('Content-Disposition','attachment; filename="'+download+'"');fs.createReadStream(p).on('error',()=>res.destroy()).pipe(res);};
  try{
   const host=req.headers.host,allowed=['127.0.0.1:'+server.address().port,'localhost:'+server.address().port];if(!allowed.includes(host))return send(403,{error:'Local host only'});
   const url=new URL(req.url,'http://'+host),pathname=decodeURIComponent(url.pathname);
   if(req.method==='POST'){
    if(req.headers['x-lidar-review']!=='1'||(req.headers.origin&&!allowed.map(h=>'http://'+h).includes(req.headers.origin)))return send(403,{error:'Same-origin review request required'});
    let data='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)return send(413,{error:'설정이 너무 큽니다.'});data+=chunk.toString();}
    const body=JSON.parse(data||'{}');
    if(pathname==='/api/jobs'){
     if(active)return send(409,{error:'진행 중인 생성을 먼저 중지해 주세요.'});
     if(os.freemem()<16*1024**3)return send(503,{error:'여유 RAM 16GiB를 확보한 뒤 다시 실행하세요.'});
     const clean=validate(body,index),id=Date.now()+'-'+crypto.randomBytes(4).toString('hex'),folder=path.join(outputRoot,id);fs.mkdirSync(folder,{recursive:true});
     const j={id,folder,...clean,status:'running',frames:[],started:Date.now(),progress:{stage:'geometry',progress:0},preview:null,error:null};
     jobs.set(id,j);active=j;send(202,publicJob(j));void run(j);return;
    }
    const match=pathname.match(/^\/api\/jobs\/([\w-]+)\/cancel$/);if(match){const j=jobs.get(match[1]);if(!j)return send(404,{error:'알 수 없는 작업입니다.'});if(j.status==='running'){j.status='cancelled';j.sim?.close();}return send(200,publicJob(j));}
    return send(404,{error:'Unknown action'});
   }
   if(req.method!=='GET')return send(405,{error:'Method not allowed'});
   if(pathname==='/api/catalog')return send(200,{...policy,scenes:index.scenes.map(s=>({...s,geometry:index.geometry_knobs_v3.scenes.find(g=>g.scene===s.id),poses:index.sensor_positions_v19.scenes[s.id].positions})),active:active?.id||null,knownJobs:Array.from(jobs.keys()),sensor:'공개 OS1-128 · 128×1,024빔',fieldCalibrated:false,trainingApproved:false});
   const match=pathname.match(/^\/api\/jobs\/([\w-]+)(?:\/(frames)\/(\d+)|\/(manifest))?$/);
   if(match){const j=jobs.get(match[1]);if(!j)return send(404,{error:'이 서버 실행에서 만든 작업이 아닙니다.'});if(match[2]){const n=Number(match[3]);if(!j.frames[n])return send(404,{error:'아직 생성되지 않은 프레임입니다.'});return file(path.join(j.folder,String(n).padStart(4,'0')+'.lsf.gz'),'application/gzip',j.request.scene+'-'+j.request.generator+'-'+n+'.lsf.gz');}if(match[4]){if(j.status!=='complete')return send(409,{error:'생성 완료 후 받을 수 있습니다.'});return file(path.join(j.folder,'manifest.json'),'application/json; charset=utf-8','manifest-'+j.id+'.json');}return send(200,publicJob(j));}
   if(pathname.startsWith('/api/'))return send(404,{error:'Unknown API'});
   const p=path.resolve(DIST,'.'+(pathname==='/'?'/review_demo.html':pathname));if(!p.startsWith(DIST+path.sep))return send(403,{error:'Outside static root'});file(p);
  }catch(e){send(400,{error:e.message});}
 });
 server.on('close',()=>{if(active){active.status='cancelled';active.sim?.close();}});
 return {server,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server.address()));}),jobs};
}
if(require.main===module){const args=process.argv.slice(2);if(args.includes('--help'))console.log('python tools/build.py\nnode tools/review-server.cjs [--port 18769]\nOpen http://127.0.0.1:18769/ . Generated frames stay under outputs/review-demo; no automatic deletion.');else{const p=args.length===0?18769:args.length===2&&args[0]==='--port'?Number(args[1]):NaN;if(!Number.isInteger(p)||p<1024||p>65535)throw Error('Invalid --port');createReviewServer({port:p}).listen().then(a=>console.log('Review demo: http://127.0.0.1:'+a.port+'/')).catch(e=>{console.error(e.message);process.exitCode=1;});}}
module.exports={createReviewServer,validate};
