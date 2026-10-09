/* Column timing is independent of exported frame cadence. */
(function(root){'use strict';
function settings(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('motionSkew must be an object');
 for(const k of Object.keys(value))if(!['enabled','scanHz'].includes(k))throw Error('Unknown motionSkew setting: '+k);
 const enabled=value.enabled===undefined?false:value.enabled,scanHz=value.scanHz===undefined?10:value.scanHz;
 if(typeof enabled!=='boolean'||![10,20].includes(scanHz))throw Error('motionSkew requires boolean enabled and scanHz 10 or 20');
 return {enabled,scanHz};
}
function describe(value,columns,time,moving){
 const c=settings(value);
 if(!Number.isInteger(columns)||columns<1||!Number.isFinite(time)||time<0||time>10)throw Error('Invalid scan timing');
 if(c.enabled&&columns>1024&&c.scanHz===20)throw Error('20 Hz requires at most 1024 columns');
 const period=c.enabled?1/c.scanHz:0;
 return {revision:27,...c,model:c.enabled?'column acquisition with uncorrected sensor motion':'instantaneous',sensorMoving:!!moving,
  referenceTimeS:time,reference:'center of scan',columnCount:columns,columnIntervalS:period/columns,scanDurationS:period,
  firstOffsetS:c.enabled?(.5/columns-.5)*period:0,lastOffsetS:c.enabled?((columns-.5)/columns-.5)*period:0,
  order:'raw measurement column 0..width-1; all rows in a column share one timestamp',
  poseBoundary:'hold endpoint pose outside [0,10] s; timestamps are not clamped',
  reconstruction:c.enabled?'all measured ranges reconstructed at reference pose; no deskew':'reference pose',
  weatherTiming:'weather field frozen at referenceTimeS during a scan; animated between frames',
  imuSimulated:false,externalRotorSimulated:false};
}
function offset(timing,column){return timing.enabled?((column+.5)/timing.columnCount-.5)/timing.scanHz:0;}
function poseTime(time){return Math.max(0,Math.min(10,time));}
root.NoiseLabScanTiming={settings,describe,offset,poseTime};if(typeof module!=='undefined')module.exports=root.NoiseLabScanTiming;
})(typeof self!=='undefined'?self:globalThis);
