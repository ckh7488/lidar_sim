/* Read-only review of already generated audit files. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.resolve(__dirname,'..');
async function jsonSnapshot(file){
 // The generator rewrites its manifest between frames. Never stream a torn JSON file.
 for(let i=0;i<5;i++){
  try{const data=fs.readFileSync(file);JSON.parse(data.toString('utf8'));return data;}
  catch(e){if(i===4)throw e;await new Promise(resolve=>setTimeout(resolve,20));}
 }
}
function serve(folder,port=18773){
 const run=path.resolve(folder),dist=path.join(ROOT,'dist'),src=path.join(ROOT,'src');
 if(!fs.existsSync(path.join(run,'manifest.json')))throw Error('Audit manifest is required');
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.method!=='GET')throw Error('Read only');
   const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let root,relative;
   if(p==='/'){root=src;relative='audit_review_v26.html';}
   else if(p==='/audit-review-v26.js'){root=src;relative='audit_review_v26.js';}
   else if(p.startsWith('/audit/')){root=run;relative=p.slice(7);}
   else if(p.startsWith('/assets/')){root=dist;relative=p.slice(1);}
   else throw Error('Unknown resource');
   const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('Unknown file');
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.gz':'application/gzip'};
   const snapshot=path.extname(file)==='.json'?await jsonSnapshot(file):null;
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});if(snapshot)res.end(snapshot);else fs.createReadStream(file).pipe(res);
  }catch(e){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end(e.message);}
 });server.listen(port,'127.0.0.1',()=>console.log('Audit review: http://127.0.0.1:'+server.address().port+'/'));
 return server;
}
if(require.main===module){if(process.argv.length!==3)throw Error('node tools/audit-review-server.cjs outputs/audit-100-v26-...');serve(process.argv[2]);}
module.exports={serve};
