/* Export model signals separately from hidden scene-material reference values. */
(function(root){'use strict';
function attach(result,input,cfg){
 const n=result.rayIds.length,kind=cfg.solarEnabled?'sun':cfg.reviewKind||cfg.weather||'none';
 const unsupported=kind==='sun',signal=new Float32Array(n),reflectivity=new Float32Array(n);
 // Weak-mode powers are expected photon counts; other modes use their own model powers.
 const scale=kind==='weak'?1600*(cfg.weakPhotons??100):1;
 let finite=0,min=Infinity,max=-Infinity;
 for(let i=0;i<n;i++){
  const r=result.nominalRanges[i]+result.rangeErrors[i],p=result.powers[i];
  // Do not inspect labels: a channel or its missingness must not reveal the noise label.
  if(!unsupported&&Number.isFinite(p)&&p>=0&&Number.isFinite(r)&&r>0){
   signal[i]=p/scale;reflectivity[i]=signal[i]*r*r;
   finite++;min=Math.min(min,reflectivity[i]);max=Math.max(max,reflectivity[i]);
  }else{signal[i]=NaN;reflectivity[i]=NaN;}
 }
 // The old solar array was 0 for surfaces and 1 for artifacts, not a signal.
 // Mark the entire mode unavailable, never just the positive-label points.
 if(unsupported)result.powers.fill(NaN);
 const materials=new Float32Array(input.ranges.length);materials.fill(NaN);
 if(input.albedo)for(let i=0;i<materials.length;i++)if(input.ranges[i]>0)materials[i]=input.albedo[i];
 result.signalProxy=signal;result.reflectivityProxy=reflectivity;
 result.referenceScan={ranges:input.ranges.slice(),surfaceReflectance:materials};
 result.channels={revision:20,pointCount:n,referenceRayCount:materials.length,
  signalProxy:{available:!unsupported,units:'relative model units',source:kind==='weak'?'expected photons / (1600 * weakPhotons)':'selected model power',observedPhotonCount:false},
  reflectivityProxy:{available:!unsupported,formula:'signalProxy * measuredRange^2',measuredRange:'nominalRanges + rangeErrors',incidenceCorrected:false,atmosphericLossCorrected:false,ousterCalibrated:false,range:[finite?min:null,finite?max:null],finiteCount:finite},
  referenceScan:{role:'debug/reference only; never a sensor input feature',index:'original beam index; use rayIds only to inspect the clean background',surfaceReflectance:'scene albedo assumption before incidence and weather; not the reflectivity of an intervening particle'},
  crossModeCalibration:false,fieldCalibrated:false,trainingApproved:false,
  limitation:unsupported?'Solar signal strength is not modeled. All signal/reflectivity/powers entries are NaN (JSON null).':kind==='fog'?'Fog powers are waveform-integrated quantities. Their scale is not calibrated to other modes.':'Signal is a model quantity, not device intensity. No Ouster sensitivity, quantization or reflectivity calibration is implemented.'};
 result.stats.channels={revision:20,reflectivityAvailable:!unsupported,reflectivityFinite:finite,fieldCalibrated:false};
 return result;
}
root.NoiseLabChannels={attach};if(typeof module!=='undefined')module.exports=root.NoiseLabChannels;
})(typeof self!=='undefined'?self:globalThis);
