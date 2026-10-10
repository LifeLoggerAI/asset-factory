#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);const modulepath=process.argv[2];if(!modulepath)throw Error('Usage: node khronos.mjs /abs/node_modules/gltf-validator');
const validator=require(modulepath);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function* files(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())yield*files(p);else if(p.endsWith('.glb'))yield p;}}
const result=[];let errors=0;const outdir=process.argv[4]?path.resolve(process.argv[4]):path.join(root,'receipts');fs.mkdirSync(path.join(outdir,'khronos'),{recursive:true});
const version=process.argv[3]||'1.0.2';
for(const file of [...files(path.join(root,'packages')),...files(path.join(root,'kits'))].filter(p=>p.split(path.sep).includes(version))){
 const bytes=fs.readFileSync(file);const hash=crypto.createHash('sha256').update(bytes).digest('hex');const r=await validator.validateBytes(new Uint8Array(bytes),{uri:path.relative(root,file),maxIssues:10000});
 const receipt={schemaVersion:'urai-gltf-khronos-static-validation-v1',sha256:hash,bytes:bytes.length,file:path.relative(root,file),validatorVersion:validator.version(),result:r,scope:'glTF conformance/static checks, not visual or runtime/device acceptance'};
 fs.writeFileSync(path.join(outdir,'khronos',hash+'.json'),JSON.stringify(receipt,null,2)+'\n');result.push({file:path.relative(root,file),sha256:hash,errors:r.issues.numErrors,warnings:r.issues.numWarnings,infos:r.issues.numInfos,receipt:`khronos/${hash}.json`});errors+=r.issues.numErrors;
}
fs.writeFileSync(path.join(outdir,'khronos-index.json'),JSON.stringify({schemaVersion:'urai-khronos-validation-index-v1',validatorVersion:validator.version(),files:result,totalErrors:errors},null,2)+'\n');console.log(JSON.stringify({files:result.length,errors,warningFiles:result.filter(x=>x.warnings).length}));if(errors)process.exitCode=1;
