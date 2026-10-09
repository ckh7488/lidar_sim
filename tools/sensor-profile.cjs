'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const pack=a=>zlib.gzipSync(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).toString('base64');
function fromMetadata(m,sha='in-memory'){
 const b=m.beam_intrinsics||m,l=m.lidar_intrinsics||m,f=m.lidar_data_format||m.data_format||m,alt=b.beam_altitude_angles,az=b.beam_azimuth_angles,T=b.beam_to_lidar_transform,L=l.lidar_to_sensor_transform;
 if(!Array.isArray(alt)||!alt.length||!Array.isArray(az)||alt.length!==az.length||![...alt,...az].every(Number.isFinite))throw Error('Exact per-channel altitude and azimuth arrays are required');
 if(!Array.isArray(T)||T.length!==16||!Array.isArray(L)||L.length!==16||![...T,...L].every(Number.isFinite))throw Error('Both beam_to_lidar_transform and lidar_to_sensor_transform are required in mm');
 for(const [i,v] of [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1].entries())if(![3,7,11].includes(i)&&Math.abs(T[i]-v)>1e-8)throw Error('Unsupported non-translation beam_to_lidar_transform');
 if(Math.abs(T[7])>1e-8)throw Error('Nonzero beam Y offset requires an SDK-validated projector');
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){let dot=0;for(let k=0;k<3;k++)dot+=L[4*i+k]*L[4*j+k];if(Math.abs(dot-(i===j?1:0))>1e-6)throw Error('Invalid lidar rotation');}
 if(L[12]||L[13]||L[14]||L[15]!==1)throw Error('Invalid homogeneous transform');
 const h=alt.length,w=f.columns_per_frame??Number((m.config_params?.lidar_mode||m.lidar_mode||'').split('x')[0]);
 if(!Number.isInteger(w)||w<16||w>4096||h>256)throw Error('Valid columns_per_frame and <=256 channels required');
 if(f.pixels_per_column!==undefined&&f.pixels_per_column!==h)throw Error('Channel count disagrees with metadata; do not decimate a 128-row profile');
 const dirs=new Float32Array(h*w*3),offsets=new Float32Array(w*3),tx=T[3]/1000,tz=T[11]/1000;
 const rotate=v=>[0,1,2].map(a=>L[4*a]*v[0]+L[4*a+1]*v[1]+L[4*a+2]*v[2]);
 for(let col=0;col<w;col++){
  const encoder=-col*2*Math.PI/w,o=rotate([tx*Math.cos(encoder),tx*Math.sin(encoder),tz]);for(let a=0;a<3;a++)offsets[3*col+a]=o[a]+L[4*a+3]/1000;
  for(let row=0;row<h;row++){const theta=encoder-az[row]*Math.PI/180,phi=alt[row]*Math.PI/180,d=rotate([Math.cos(theta)*Math.cos(phi),Math.sin(theta)*Math.cos(phi),Math.sin(phi)]);dirs.set(d,3*(row*w+col));}
 }
 return {name:(m.sensor_info?.prod_line||m.prod_line||'metadata sensor')+' exact intrinsics',profileKey:sha,h,w,directions:pack(dirs),origins:pack(offsets),center_origin_m:[L[3]/1000,L[7]/1000,L[11]/1000],beam_altitude_angles:alt,beam_azimuth_angles:az,metadata_sha256:sha,optical_path_offset_m:Math.hypot(tx,tz),range_definition:'simulated optical-origin distance; Ouster packet range adds optical_path_offset_m',field_calibrated:false};
}
function load(file){const raw=fs.readFileSync(file);return fromMetadata(JSON.parse(raw),crypto.createHash('sha256').update(raw).digest('hex'));}
module.exports={load,fromMetadata};
