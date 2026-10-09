/* Node transport for the same bundled browser worker program. */
'use strict';
const {parentPort,workerData}=require('node:worker_threads');
if(workerData.allowPartitions)globalThis.NodePartitionWorker=class {constructor(){const {Worker}=require('node:worker_threads');this.thread=new Worker(__filename,{workerData:{source:workerData.source}});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.(error));}postMessage(data){this.thread.postMessage(data);}terminate(){this.thread.terminate();}};
const warn=console.warn;console.warn=(...args)=>{if(!String(args[0]).startsWith('Scripts \"build/three.js\"'))warn(...args);};
globalThis.self=globalThis;globalThis.postMessage=value=>parentPort.postMessage(value);
// Execute the trusted built bundle in an isolated native worker global. Shadow
// CommonJS so bundled UMD libraries take their browser branch, as in the UI.
Function('module','exports','require',workerData.source)(undefined,undefined,undefined);
parentPort.on('message',async data=>{try{await globalThis.onmessage({data});}catch(e){parentPort.postMessage({id:data.id,error:String(e.stack||e)});}});
