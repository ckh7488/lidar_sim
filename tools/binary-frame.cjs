/* LSF1: UTF-8 JSON header followed by raw little-endian typed arrays. No decimal conversion. */
'use strict';
const fs=require('node:fs'),zlib=require('node:zlib');
const types={Float32Array:Float32Array,Float64Array:Float64Array,Uint8Array:Uint8Array,Uint32Array:Uint32Array};
function write(out,meta,arrays){
 if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw Error('LSF writer requires little endian');
 let offset=0;const buffers=[],entries={};
 for(const [name,a] of Object.entries(arrays)){if(!ArrayBuffer.isView(a)||!types[a.constructor.name])throw Error('Unsupported binary array '+name);const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength);entries[name]={type:a.constructor.name,length:a.length,offset,bytes:b.length};buffers.push(b);offset+=b.length;}
 const header=Buffer.from(JSON.stringify({...meta,binary:{format:'LSF1',byteOrder:'little',arrays:entries}}),'utf8'),prefix=Buffer.alloc(8);prefix.write('LSF1');prefix.writeUInt32LE(header.length,4);
 const content=Buffer.concat([prefix,header,...buffers]);fs.writeFileSync(out,out.endsWith('.gz')?zlib.gzipSync(content):content,{flag:'wx'});return {bytes:fs.statSync(out).size};
}
function read(file){
 const raw=fs.readFileSync(file),b=raw[0]===31&&raw[1]===139?zlib.gunzipSync(raw):raw;if(b.toString('ascii',0,4)!=='LSF1')throw Error('Invalid LSF magic');
 const n=b.readUInt32LE(4);if(n>b.length-8)throw Error('Invalid LSF header');const meta=JSON.parse(b.toString('utf8',8,8+n)),arrays={};
 for(const [name,e] of Object.entries(meta.binary.arrays)){const T=types[e.type];if(!T||e.bytes!==e.length*T.BYTES_PER_ELEMENT||e.offset<0||8+n+e.offset+e.bytes>b.length)throw Error('Invalid LSF array '+name);const payload=b.subarray(8+n+e.offset,8+n+e.offset+e.bytes);arrays[name]=new T(payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength));}
 return {metadata:meta,arrays};
}
module.exports={write,read};
