import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { verifyHomeRetainedSourceIdentity as verify } from './verify-home-retained-source-identity.mjs'

const ids = ['H00','A01_LEFT','A02_RIGHT','A03_TREE','S01_PUSH','S02_PULLBACK','S03_LEFT','S04_RIGHT','S05_CW_ARC','S06_CCW_ARC','S07_ELEVATION','S08_DIAGONAL']
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-home-source-'))
  t.after(() => fs.rmSync(root, { recursive:true, force:true }))
  const taskItems=[], evidenceItems=[], receiptItems=[]
  for (const id of ids) {
    const survey=id.startsWith('S'), type=survey?'video':'image', role=survey?'survey':id==='H00'?'hero':'anchor'
    const taskId='task-'+id, filename=id+'-01.'+(survey?'mp4':'png')
    const bytes=survey?Buffer.from('000000186674797069736f6d00000000','hex'):Buffer.from('89504e470d0a1a0a0101010101','hex')
    fs.writeFileSync(path.join(root,filename),bytes)
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex')
    taskItems.push({ id, taskId, role, expectedMedia:type })
    evidenceItems.push({id, bytes:bytes.length, sha256, width:1280, height:720})
    receiptItems.push({id, taskId, role, expectedMedia:type, taskStatus:'SUCCEEDED',outputs:[{filename,bytes:bytes.length,sha256,contentType:survey?'video/mp4':'image/png'}]})
  }
  const manifest={schemaVersion:'urai-runway-existing-task-retention-v1',worldId:'URAI-IW-001-QUIET-RESET',autobiographical:false,truthClass:'interpretive',provider:'runway',items:taskItems}
  const evidence={schemaVersion:'urai-home-materialized-sfm-evidence-v1',worldId:manifest.worldId,autobiographical:false,truthClass:'INTERPRETIVE',items:evidenceItems}
  const receipt={schemaVersion:'urai-runway-existing-task-retention-receipt-v1',worldId:manifest.worldId,autobiographical:false,truthClass:'interpretive',provider:'runway',operation:'GET_EXISTING_TASK_OUTPUT_ONLY',generationCallsExecuted:0,providerMutationPerformed:false,outputUrlsRetained:false,items:receiptItems}
  const files=['tasks.json','sfm.json','receipt.json'].map(f=>path.join(root,f))
  const flush=()=>[manifest,evidence,receipt].forEach((data,i)=>fs.writeFileSync(files[i],JSON.stringify(data)))
  flush()
  return { root, files, manifest, evidence, receipt, flush, run:()=>verify(...files,root) }
}
test('source receipt verifies twelve byte-identical historical interpretive inputs without promoting Gaussian',t=>{const x=fixture(t);const r=x.run();assert.equal(r.identityStatus,'PASS');assert.equal(r.files.length,12);assert.equal(r.gaussianTrained,false);assert.equal(r.productionArtAccepted,false)})
test('reject source mutation after prior SfM digest',t=>{const x=fixture(t);fs.appendFileSync(path.join(x.root,'S01_PUSH-01.mp4'),'x');assert.throws(x.run,/regular file\/length/)})
test('reject swapped task id',t=>{const x=fixture(t);x.receipt.items[0].taskId='different';x.flush();assert.throws(x.run,/task identity/)})
test('reject mismatch with immutable prior SHA',t=>{const x=fixture(t);x.evidence.items[1].sha256='0'.repeat(64);x.flush();assert.throws(x.run,/canonical hash/)})
test('reject symlink source bytes',t=>{const x=fixture(t);const f=path.join(x.root,'S01_PUSH-01.mp4');fs.renameSync(f,f+'.bak');fs.symlinkSync(f+'.bak',f);assert.throws(x.run,/regular file/)})
test('reject fabricated autobiography',t=>{const x=fixture(t);x.receipt.autobiographical=true;x.flush();assert.throws(x.run,/world\/truth/)})
test('reject provider mutation and URL retention',t=>{const x=fixture(t);x.receipt.outputUrlsRetained=true;x.flush();assert.throws(x.run,/read-only/)})
