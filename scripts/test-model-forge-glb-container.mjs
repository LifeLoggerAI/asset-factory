import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseGlbContainer } from '../model_forge/glb-container.mjs';
import { checkTriangleBudget } from '../model_forge/triangle-budget.mjs';
const JSON_TYPE=0x4e4f534a, BIN_TYPE=0x004e4942;
const doc = () => ({asset:{version:'2.0'},buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}]});
function chunk(type,bytes){const h=Buffer.alloc(8);h.writeUInt32LE(bytes.length);h.writeUInt32LE(type,4);return Buffer.concat([h,bytes]);}
function pack(d,rest=[chunk(BIN_TYPE,Buffer.alloc(36))]){let j=Buffer.from(JSON.stringify(d));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);let b=Buffer.concat([Buffer.alloc(12),chunk(JSON_TYPE,j),...rest]);b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);return b;}
const cases = [
 ['valid embedded',()=>pack(doc()),true],
 ['valid JSON-only',()=>pack({asset:{version:'2.0'}},[]),true],
 ['valid external',()=>{let d=doc();d.buffers[0].uri='mesh.bin';return pack(d,[]);},true],
 ['valid optional unknown chunk',()=>pack(doc(),[chunk(BIN_TYPE,Buffer.alloc(36)),chunk(123,Buffer.alloc(4))]),true],
 ['valid BIN padding',()=>{let d=doc();d.buffers[0].byteLength=35;d.bufferViews[0].byteLength=35;return pack(d);},true],
 ['high-bit corrupted magic',()=>{let b=pack(doc());b[0]|=128;return b;},false],
 ['invalid UTF8 JSON',()=>{let b=pack(doc());b[21]=255;return b;},false],
 ['NULL JSON padding',()=>{let d=doc();let b=pack(d);let end=20+b.readUInt32LE(12);b[end-1]=0;return b;},false],
 ['missing BIN',()=>pack(doc(),[]),false],
 ['truncated chunk header',()=>pack(doc(),[Buffer.alloc(4)]),false],
 ['truncated BIN payload',()=>{let b=pack(doc());b.writeUInt32LE(40,b.length-44);return b;},false],
 ['unaligned chunk',()=>pack(doc(),[chunk(BIN_TYPE,Buffer.alloc(35))]),false],
 ['duplicate JSON',()=>pack(doc(),[chunk(JSON_TYPE,Buffer.from('{}  '))]),false],
 ['duplicate BIN',()=>pack(doc(),[chunk(BIN_TYPE,Buffer.alloc(36)),chunk(BIN_TYPE,Buffer.alloc(4))]),false],
 ['BIN after unknown',()=>pack(doc(),[chunk(123,Buffer.alloc(4)),chunk(BIN_TYPE,Buffer.alloc(36))]),false],
 ['too short BIN',()=>pack(doc(),[chunk(BIN_TYPE,Buffer.alloc(32))]),false],
 ['excess BIN',()=>pack(doc(),[chunk(BIN_TYPE,Buffer.alloc(40))]),false],
 ['undeclared BIN',()=>pack({asset:{version:'2.0'}}),false],
 ['external buffer with BIN',()=>{let d=doc();d.buffers[0].uri='mesh.bin';return pack(d);},false],
 ['negative buffer length',()=>{let d=doc();d.buffers[0].byteLength=-1;return pack(d);},false],
 ['view out of bounds',()=>{let d=doc();d.bufferViews[0].byteOffset=4;return pack(d);},false],
 ['view wrong buffer',()=>{let d=doc();d.bufferViews[0].buffer=4;return pack(d);},false],
 ['view negative offset',()=>{let d=doc();d.bufferViews[0].byteOffset=-1;return pack(d);},false],
 ['view fractional length',()=>{let d=doc();d.bufferViews[0].byteLength=1.5;return pack(d);},false],
 ['asset wrong version',()=>pack({asset:{version:'1.0'}},[]),false],
 ['JSON array',()=>pack([],[]),false],
 ['declared size mismatch',()=>{let b=pack(doc());b.writeUInt32LE(b.length+4,8);return b;},false],
];
const mesh = () => {let d=doc();d.extensionsRequired=['EXT_meshopt_compression'];d.buffers.push({byteLength:36});d.bufferViews[0]={buffer:1,byteLength:36,extensions:{EXT_meshopt_compression:{buffer:0,byteLength:36,byteStride:12,count:3,mode:'ATTRIBUTES'}}};return d;};
cases.push(
 ['valid Meshopt placeholder',()=>pack(mesh()),true],
 ['valid marked Meshopt placeholder',()=>{let d=mesh();d.buffers[1].extensions={EXT_meshopt_compression:{fallback:true}};return pack(d);},true],
 ['Meshopt must be required for placeholder',()=>{let d=mesh();delete d.extensionsRequired;return pack(d);},false],
 ['Meshopt range overflow',()=>{let d=mesh();d.bufferViews[0].extensions.EXT_meshopt_compression.byteOffset=1;return pack(d);},false],
 ['Meshopt source is fallback',()=>{let d=mesh();d.bufferViews[0].extensions.EXT_meshopt_compression.buffer=1;return pack(d);},false],
 ['uncompressed fallback view',()=>{let d=mesh();delete d.bufferViews[0].extensions;return pack(d);},false],
);
for (const [name,make,ok] of cases) test(name,()=>{if(ok)assert.doesNotThrow(()=>parseGlbContainer(make()));else assert.throws(()=>parseGlbContainer(make()));});
test('standalone CLI rejects missing BIN and keeps valid triangle evidence',()=>{const dir=mkdtempSync(path.join(tmpdir(),'urai-glb-'));try{for(const [name,b,code] of [['good',pack(doc()),0],['bad',pack(doc(),[]),1]]){const f=path.join(dir,name+'.glb');writeFileSync(f,b);const r=spawnSync(process.execPath,['model_forge/validate-glb.mjs',f],{encoding:'utf8'});assert.equal(r.status,code,r.stderr);if(!code)assert.equal(JSON.parse(r.stdout).trianglesEstimated,1);}}finally{rmSync(dir,{recursive:true,force:true});}});

test('actual provider intake shares container rejection',()=>{
 const source=readFileSync('model_forge/forge.mjs','utf8');
 const start=source.indexOf('function parseGlbCandidate('),end=source.indexOf('async function downloadFile(',start);
 assert(start>=0 && end>start);
 const intake=new Function('parseGlbContainer','checkTriangleBudget','fail',source.slice(start,end)+'\nreturn structuralCandidateReport;')(parseGlbContainer,checkTriangleBudget,(m)=>{throw new Error(m)});
 assert.throws(()=>intake(pack(doc(),[]),100),/Missing GLB BIN/);
 assert.equal(intake(pack(doc()),100).trianglesEstimated,1);
});
