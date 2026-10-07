import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

const [sourceRoot,matrixPath,outputDir]=process.argv.slice(2);
assert.ok(sourceRoot&&matrixPath&&outputDir,'Usage: node convert-launch-media.mjs SOURCE_ROOT MATRIX_JSON OUTPUT_DIR');
const relativeOutput=path.relative(path.resolve(sourceRoot),path.resolve(outputDir));
assert.ok(relativeOutput.startsWith('..'+path.sep)||path.isAbsolute(relativeOutput),'Candidate output must be outside the source tree');
const matrix=JSON.parse(await fs.readFile(matrixPath,'utf8')).assetMatrix;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(path.join(outputDir,'receipts'),{recursive:true});
function canonicalOgg(input,serial) {
  const raw=Buffer.from(input);let offset=0;
  while(offset<raw.length) {
    assert.equal(raw.subarray(offset,offset+4).toString(),'OggS');
    const segments=raw[offset+26];const size=27+segments+raw.subarray(offset+27,offset+27+segments).reduce((a,b)=>a+b,0);
    assert.ok(offset+size<=raw.length,'Truncated Ogg page');
    raw.writeUInt32LE(serial,offset+14);raw.writeUInt32LE(0,offset+22);let crc=0;
    for(const byte of raw.subarray(offset,offset+size)){crc^=byte<<24;for(let bit=0;bit<8;bit++)crc=((crc<<1)^((crc&0x80000000)?0x04c11db7:0))>>>0;}
    raw.writeUInt32LE(crc,offset+22);offset+=size;
  }
  assert.equal(offset,raw.length);return raw;
}
for(const asset of matrix.filter(a=>['svg','audio','json'].includes(a.measured.format))) {
  assert.ok(!path.isAbsolute(asset.path)&&!asset.path.split(/[\\/]/).includes('..'),'Source paths must stay inside source tree');
  assert.match(asset.id,/^[a-z0-9-]+$/);
  const sourcePath=path.join(sourceRoot,asset.path);const source=await fs.readFile(sourcePath);assert.equal(sha(source),asset.sha256,`Source mismatch ${asset.id}`);
  const receipt={id:asset.id,sourceSha:asset.sourceSha,sourcePath:asset.path,sourceBytes:source.length,sourceSha256:sha(source),classification:'MACHINE_PREPARED_CANDIDATE_NOT_ADMITTED'};
  if(asset.measured.format==='svg') {
    assert.equal(sharp.versions.sharp,'0.35.5');assert.equal(sharp.versions.rsvg,'2.63.2');
    const pixels=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const encoded=await sharp(source).webp({lossless:true,effort:6}).toBuffer();const repeated=await sharp(source).webp({lossless:true,effort:6}).toBuffer();
    assert.equal(sha(encoded),sha(repeated));assert.equal(sha(await sharp(encoded).ensureAlpha().raw().toBuffer()),sha(pixels.data));
    const outputPath=`textures/${asset.id}.lossless.webp`;await fs.mkdir(path.join(outputDir,'textures'),{recursive:true});await fs.writeFile(path.join(outputDir,outputPath),encoded);
    Object.assign(receipt,{outputPath,outputBytes:encoded.length,outputSha256:sha(encoded),rgbaPixelSha256:sha(pixels.data),decodedPixelHashExact:true,repeatedByteHashExact:true,pixels:pixels.info,toolchain:sharp.versions});
  } else if(asset.measured.format==='audio') {
    const outputPath=`audio/${asset.id}.ogg`;await fs.mkdir(path.join(outputDir,'audio'),{recursive:true});const file=path.join(outputDir,outputPath),repeat=file+'.repeat';
    const args=['-hide_banner','-loglevel','error','-y','-fflags','+bitexact','-i',sourcePath,'-map_metadata','-1','-map_chapters','-1','-c:a','libvorbis','-q:a','5','-flags:a','+bitexact','-f','ogg'];
    execFileSync('ffmpeg',[...args,file]);execFileSync('ffmpeg',[...args,repeat]);const serial=Buffer.from(asset.sha256,'hex').readUInt32LE(0);
    const encoded=canonicalOgg(await fs.readFile(file),serial),repeated=canonicalOgg(await fs.readFile(repeat),serial);assert.equal(sha(encoded),sha(repeated));await fs.writeFile(file,encoded);await fs.rm(repeat);
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
    assert.equal(Number(probe.format.duration),asset.measured.durationSeconds);assert.equal(Number(probe.streams[0].sample_rate),asset.measured.sampleRate);assert.equal(Number(probe.streams[0].channels),asset.measured.channels);
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-f','null','-']);
    Object.assign(receipt,{outputPath,outputBytes:encoded.length,outputSha256:sha(encoded),codec:'Vorbis q5',durationSeconds:Number(probe.format.duration),sampleRate:Number(probe.streams[0].sample_rate),channels:Number(probe.streams[0].channels),repeatedByteHashExact:true,containerDeterminism:'Ogg serial derived from source digest; standard Ogg page CRC recalculated',pcmBitExact:false,classification:'MACHINE_PREPARED_CANDIDATE_NEEDS_FOUNDER_LISTEN_REVIEW',toolchain:execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0]});
  } else {
    const outputPath=`descriptors/${asset.id}.json`;await fs.mkdir(path.join(outputDir,'descriptors'),{recursive:true});await fs.writeFile(path.join(outputDir,outputPath),source);Object.assign(receipt,{outputPath,outputBytes:source.length,outputSha256:sha(source),formatAlreadySatisfied:true,sourceBytesExact:true});
  }
  receipt.maxBytes=asset.budgets.maxBytes;receipt.byteBudgetPass=asset.budgets.maxBytes==null?'UNSET_UNMEASURED':receipt.outputBytes<=asset.budgets.maxBytes;
  await fs.writeFile(path.join(outputDir,'receipts',asset.id+'.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(asset.id,receipt.outputBytes,receipt.outputSha256);
}
