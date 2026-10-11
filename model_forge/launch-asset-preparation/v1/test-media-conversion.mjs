import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const recipe=fileURLToPath(new URL('./convert-launch-media.mjs',import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function wav(frequency=440) {
  const sampleRate=32768,frames=4096,bytes=Buffer.alloc(44+frames*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);
  bytes.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(12000*Math.sin(2*Math.PI*frequency*i/sampleRate)),44+i*2);
  return bytes;
}
async function fixture(t,format='audio') {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'urai-media-preservation-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const source=path.join(temp,'source'),out=path.join(temp,'candidate');await fs.mkdir(source);
  const input=format==='audio'?wav():Buffer.from('{"fixture":"original"}\n');
  const sourceFile=path.join(source,format==='audio'?'test.wav':'test.json');await fs.writeFile(sourceFile,input);
  const matrix=path.join(temp,'matrix.json');
  const record={id:'test',path:path.basename(sourceFile),sha256:sha(input),sourceSha:'synthetic-source-only',measured:{format,...(format==='audio'?{durationSeconds:0.125,sampleRate:32768,channels:1}:{})},budgets:{}};
  await fs.writeFile(matrix,JSON.stringify({assetMatrix:[record]}));
  return {temp,source,out,input,sourceFile,matrix,record};
}
function run(f,preload) {
  return spawnSync(process.execPath,[...(preload?['--import',preload]:[]),recipe,f.source,f.matrix,f.out],{encoding:'utf8',timeout:15000});
}
async function concurrentEdit(f,replacement) {
  const preload=path.join(f.temp,'concurrent-source-edit.mjs');
  await fs.writeFile(preload,`import fs from 'node:fs/promises';\nimport path from 'node:path';\nconst read=fs.readFile.bind(fs),target=${JSON.stringify(f.sourceFile)};let changed=false;\nfs.readFile=async function(file,...args){const result=await read(file,...args);if(typeof file==='string'&&path.resolve(file)===target&&!changed){changed=true;await fs.writeFile(target,Buffer.from(${JSON.stringify(replacement.toString('base64'))},'base64'));}return result;};\n`);
  return preload;
}
test('Actual WAV conversion retains verified source hashes and deterministic playable audio',async t=>{
  const f=await fixture(t),result=run(f);assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(await fs.readFile(path.join(f.out,'receipts/test.json'),'utf8'));
  assert.deepEqual(receipt.sourceInputPreservation,{verified:true,sha256Before:sha(f.input),sha256After:sha(f.input)});
  assert.equal(receipt.outputSha256,sha(await fs.readFile(path.join(f.out,receipt.outputPath))));
  assert.equal(receipt.repeatedByteHashExact,true);assert.equal(receipt.pcmBitExact,false);
  assert.equal(receipt.classification,'MACHINE_PREPARED_CANDIDATE_NEEDS_FOUNDER_LISTEN_REVIEW');
  assert.deepEqual(await fs.readFile(f.sourceFile),f.input);
});
test('Media hash mismatch refuses conversion and a preservation receipt',async t=>{
  const f=await fixture(t);f.record.sha256='0'.repeat(64);
  await fs.writeFile(f.matrix,JSON.stringify({assetMatrix:[f.record]}));
  const result=run(f);assert.equal(result.status,1);assert.match(result.stderr,/Source mismatch test/);
  assert.deepEqual(await fs.readdir(path.join(f.out,'receipts')),[]);
});
test('Concurrent descriptor edit cannot publish a source preservation receipt',async t=>{
  const f=await fixture(t,'json'),replacement=Buffer.from('{"fixture":"changed"}\n');
  const result=run(f,await concurrentEdit(f,replacement));
  assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/Source changed during conversion test/);
  assert.deepEqual(await fs.readdir(path.join(f.out,'receipts')),[]);
  assert.deepEqual(await fs.readFile(f.sourceFile),replacement);
});
test('Concurrent WAV edit cannot alter the verified audio input or publish preservation',async t=>{
  const f=await fixture(t);const baseline=run(f);assert.equal(baseline.status,0,baseline.stderr);
  const expected=sha(await fs.readFile(path.join(f.out,'audio/test.ogg')));
  await fs.rm(f.out,{recursive:true,force:true});
  const replacement=wav(880),result=run(f,await concurrentEdit(f,replacement));
  assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/Source changed during conversion test/);
  assert.equal(sha(await fs.readFile(path.join(f.out,'audio/test.ogg'))),expected,'FFmpeg must consume the originally hash-verified bytes');
  assert.deepEqual(await fs.readdir(path.join(f.out,'receipts')),[]);
  assert.deepEqual(await fs.readFile(f.sourceFile),replacement);
});
