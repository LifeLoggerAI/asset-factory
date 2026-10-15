import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const IDs = ['H00','A01_LEFT','A02_RIGHT','A03_TREE','S01_PUSH','S02_PULLBACK','S03_LEFT','S04_RIGHT','S05_CW_ARC','S06_CCW_ARC','S07_ELEVATION','S08_DIAGONAL']
const check = (ok, reason) => { if (!ok) throw new Error('HOME_SOURCE_IDENTITY: ' + reason) }
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'))
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

export function verifyHomeRetainedSourceIdentity(manifestPath, evidencePath, receiptPath, root) {
  const manifest = read(manifestPath), evidence = read(evidencePath), receipt = read(receiptPath)
  check(manifest.schemaVersion === 'urai-runway-existing-task-retention-v1', 'manifest schema')
  check(evidence.schemaVersion === 'urai-home-materialized-sfm-evidence-v1', 'evidence schema')
  check(receipt.schemaVersion === 'urai-runway-existing-task-retention-receipt-v1', 'receipt schema')
  check([manifest, evidence, receipt].every(item => item.worldId === 'URAI-IW-001-QUIET-RESET' && item.autobiographical === false), 'world/truth authority')
  check(manifest.truthClass === 'interpretive' && evidence.truthClass === 'INTERPRETIVE' && receipt.truthClass === 'interpretive', 'interpretive truth class')
  check([manifest, evidence, receipt].every(item => item.provider === 'runway'), 'provider source lineage')
  check(evidence.generationCallsExecuted === 0 && evidence.providerMutationPerformed === false && evidence.providerCreditsUsed === 0, 'historical zero-spend provenance')
  check(receipt.operation === 'GET_EXISTING_TASK_OUTPUT_ONLY' && receipt.generationCallsExecuted === 0 && receipt.providerMutationPerformed === false && receipt.outputUrlsRetained === false, 'read-only retention')
  const indexed = [manifest.items, evidence.items, receipt.items].map(items => {
    check(Array.isArray(items) && items.length === 12, 'twelve items required')
    const map = new Map(items.map(item => [item.id, item]))
    check(map.size === 12 && IDs.every(id => map.has(id)), 'missing, duplicate or extra source')
    return map
  })
  const [tasks, prior, retained] = indexed
  const rootPath = path.resolve(root)
  check(fs.lstatSync(rootPath).isDirectory(), 'source directory')
  const files = []
  for (const id of IDs) {
    const task = tasks.get(id), expected = prior.get(id), record = retained.get(id)
    const isSurvey = id.startsWith('S')
    const media = isSurvey ? 'video' : 'image'
    const extension = isSurvey ? 'mp4' : 'png'
    check(task.expectedMedia === media && record.expectedMedia === media && record.role === task.role, id + ' media/role')
    check(typeof expected.taskId === 'string' && task.taskId === expected.taskId && record.taskId === expected.taskId, id + ' canonical historical task identity')
    check(expected.fileName === id + '.' + extension, id + ' canonical historical filename')
    check(record.taskStatus === 'SUCCEEDED', id + ' completed task status')
    check(Array.isArray(record.outputs) && record.outputs.length === 1, id + ' output count')
    const output = record.outputs[0]
    check(output.filename === id + '-01.' + extension, id + ' filename')
    check(output.contentType === (isSurvey ? 'video/mp4' : 'image/png'), id + ' MIME')
    check(Number.isSafeInteger(output.bytes) && output.bytes > 0 && output.bytes <= 536870912, id + ' byte limit')
    check(/^[a-f0-9]{64}$/.test(output.sha256) && output.sha256 === expected.sha256 && output.bytes === expected.bytes, id + ' canonical hash/length')
    check(Number.isSafeInteger(expected.width) && expected.width > 0 && Number.isSafeInteger(expected.height) && expected.height > 0, id + ' dimensions')
    const filename = path.join(rootPath, output.filename)
    check(path.dirname(filename) === rootPath, id + ' path')
    const stat = fs.lstatSync(filename)
    check(stat.isFile() && !stat.isSymbolicLink() && stat.size === output.bytes, id + ' regular file/length')
    const bytes = fs.readFileSync(filename)
    check(digest(bytes) === expected.sha256, id + ' source bytes SHA-256')
    check(isSurvey ? (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') : bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), id + ' media signature')
    files.push({ id, taskId: task.taskId, filename: output.filename, sha256: output.sha256, bytes: output.bytes, width: expected.width, height: expected.height })
  }
  return { schemaVersion:'urai-home-source-identity-verified-v1', worldId:manifest.worldId, truthClass:'INTERPRETIVE', autobiographical:false, identityStatus:'PASS', files, generationCallsExecuted:0, temporalVisualAcceptance:false, metricScaleCalibrated:false, gaussianTrained:false, productionArtAccepted:false }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const args = process.argv.slice(2)
    check(args.length === 4, 'usage: <task-manifest> <sfm-evidence> <retention-receipt> <retained-dir>')
    console.log(JSON.stringify(verifyHomeRetainedSourceIdentity(...args), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
