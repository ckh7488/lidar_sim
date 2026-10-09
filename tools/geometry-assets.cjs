'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const json=name=>JSON.parse(fs.readFileSync(path.join(ROOT,'data/noise_lab_v1',name+'.json'),'utf8'));
function unpack(s,T){const b=zlib.gunzipSync(Buffer.from(s,'base64'));return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
function loadContext(){const c={console:{warn(){}},Math,Number,Object,Array,performance,Float32Array,Float64Array,Uint8Array,Uint32Array};c.self=c;vm.createContext(c);for(const p of ['vendor/three-0.160.1.min.js','vendor/three-mesh-bvh-0.7.6.umd.js','src/noise_lab_scan_timing_v27.js','src/noise_lab_geometry_v3.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,p),'utf8'),c);return c;}
function loadRaw(id){const raw=json(id);return {...raw,vertices:unpack(raw.vertices,Float32Array),faces:unpack(raw.faces,Uint32Array),rho:unpack(raw.rho,Float32Array),terrain:{...raw.terrain,vertices:unpack(raw.terrain.vertices,Float32Array),faces:unpack(raw.terrain.faces,Uint32Array)}};}
function loadBeam(){const b=json('beam_profiles_v2');return {...b,dirs:unpack(b.directions,Float32Array),offsets:unpack(b.origins,Float32Array)};}
module.exports={ROOT,json,loadContext,loadRaw,loadBeam};
