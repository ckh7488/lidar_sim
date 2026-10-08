/* Keep one calculation per worker. Obsolete work must not delay the latest view. */
class LatestTaskWorker {
  constructor(url, onResult, onFailure, timeoutMs=60000) {
    this.url=url; this.onResult=onResult; this.onFailure=onFailure;
    this.timeoutMs=timeoutMs; this.worker=null; this.pending=null; this.timer=null;
  }
  cancel() {
    clearTimeout(this.timer); this.timer=null;
    if(this.pending && this.worker) { this.worker.terminate(); this.worker=null; }
    this.pending=null;
  }
  fail(error) {
    this.cancel();
    if(this.worker) { this.worker.terminate(); this.worker=null; }
    this.onFailure(error);
  }
  run(message) {
    this.cancel();
    try {
      if(!this.worker) {
        const w=this.worker=new Worker(this.url);
        w.onmessage=e=>{
          if(this.worker!==w || !this.pending || e.data.id!==this.pending.id)return;
          clearTimeout(this.timer); this.timer=null; this.pending=null;
          try { this.onResult(e); } catch(error) { this.fail(error); }
        };
        w.onerror=e=>{if(this.worker===w){e.preventDefault();this.fail(new Error(e.message||'계산기 실행 오류'));}};
        w.onmessageerror=()=>{if(this.worker===w)this.fail(new Error('계산 결과를 읽지 못했습니다'));};
      }
      this.pending=message;
      this.timer=setTimeout(()=>this.fail(new Error('계산이 60초 안에 완료되지 않았습니다')),this.timeoutMs);
      this.worker.postMessage(message);
    } catch(error) { this.fail(error); }
  }
}
