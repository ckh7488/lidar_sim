const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const workers=[],timers=new Map();let tid=0,failCreation=false;
class FakeWorker {
  constructor(){if(failCreation)throw Error('blocked');workers.push(this);this.terminated=false;}
  postMessage(message){this.message=message;}
  terminate(){this.terminated=true;}
  reply(id){this.onmessage({data:{id,result:{}}});}
}
const ctx=vm.createContext({Worker:FakeWorker,setTimeout:f=>{timers.set(++tid,f);return tid},clearTimeout:id=>timers.delete(id)});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/noise_lab_jobs_v13.js'),'utf8')+'\nthis.LatestTaskWorker=LatestTaskWorker',ctx);
const received=[],errors=[];
const task=new ctx.LatestTaskWorker('test',e=>received.push(e.data.id),e=>errors.push(String(e)));
task.run({id:1});const first=workers.at(-1);
task.run({id:2});assert(first.terminated);first.reply(1);assert.deepEqual(received,[]);
const second=workers.at(-1);second.reply(1);assert.equal(task.pending.id,2);
second.reply(2);assert.deepEqual(received,[2]);assert.equal(timers.size,0);
task.run({id:3});assert.equal(workers.at(-1),second);second.reply(3);
task.run({id:4});task.cancel();assert(second.terminated);second.reply(4);assert.deepEqual(received,[2,3]);
task.run({id:5});workers.at(-1).onerror({preventDefault(){},message:'worker crash'});assert.equal(errors.length,1);assert.equal(task.pending,null);
task.run({id:6});workers.at(-1).onmessageerror();assert.equal(errors.length,2);
task.run({id:7});[...timers.values()][0]();assert.equal(errors.length,3);assert.equal(timers.size,0);
task.run({id:8});workers.at(-1).reply(8);assert.deepEqual(received,[2,3,8]);
task.onResult=()=>{throw Error('render failure')};task.run({id:9});workers.at(-1).reply(9);assert.equal(errors.length,4);
failCreation=true;task.run({id:10});assert.equal(errors.length,5);assert.equal(timers.size,0);
console.log(JSON.stringify({passed:true,cases:['cancel obsolete work','ignore stale replies','reuse idle worker','explicit cancel','worker error','message error','timeout','retry after failure','render error','creation error']}));
