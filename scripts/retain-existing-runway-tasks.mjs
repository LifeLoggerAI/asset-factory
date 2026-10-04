#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const manifestPath = process.argv[2] || 'model_forge/evidence/home-runway-world001-tasks-20261004.json'
const outDir = process.argv[3] || '.artifacts/home-runway-world001'
const apiKey = String(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET || '').trim()
const apiVersion = String(process.env.RUNWAY_API_VERSION || '2024-11-06').trim()
const apiBase = 'https://api.dev.runwayml.com'
const maxBytes = Number(process.env.URAI_RUNWAY_RETENTION_MAX_BYTES || 536870912)

if (!apiKey) throw new Error('UrAi Runway credential is not available to this trusted workflow.')
if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('Invalid retention byte ceiling.')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (manifest?.provider !== 'runway' || manifest?.truthClass !== 'interpretive' || manifest?.autobiographical !== false) {
  throw new Error('Retention manifest truth/provider boundary invalid.')
}
if (!Array.isArray(manifest.items) || manifest.items.length !== 12) throw new Error('Exactly 12 existing Runway task IDs are required.')

const taskIdPattern = /^[0-9a-f-]{36}$/i
const seen = new Set()
const seenNames = new Set()
for (const item of manifest.items) {
  const normalizedId = String(item?.id || '')
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalizedId)) throw new Error('Invalid output identifier')
  if (seenNames.has(normalizedId)) throw new Error('Duplicate output identifier')
  seenNames.add(normalizedId)
  item.id = normalizedId
  if (!taskIdPattern.test(String(item?.taskId || ''))) throw new Error(`Invalid task ID for ${item?.id || 'unknown'}`)
  if (seen.has(item.taskId)) throw new Error(`Duplicate task ID ${item.taskId}`)
  seen.add(item.taskId)
}

// Retained source/evidence must never be replaced by a retry. mkdir is atomic
// and rejects existing directories, files and symlinks (including dangling ones).
fs.mkdirSync(path.dirname(path.resolve(outDir)), { recursive: true })
fs.mkdirSync(outDir)

function safeExt(contentType, url) {
  const byType = new Map([
    ['video/mp4', '.mp4'],
    ['image/png', '.png'],
    ['image/jpeg', '.jpg'],
    ['image/webp', '.webp'],
  ])
  if (byType.has(contentType)) return byType.get(contentType)
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (/^\.(mp4|png|jpe?g|webp)$/.test(ext)) return ext
  } catch {}
  return '.bin'
}

async function readLimited(response, ceiling) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared && declared > ceiling) throw new Error(`Provider output exceeds byte ceiling (${declared} > ${ceiling})`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Provider output had no readable body.')
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > ceiling) {
      await reader.cancel()
      throw new Error(`Provider output exceeded byte ceiling while streaming (${total} > ${ceiling})`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

const receipt = {
  schemaVersion: 'urai-runway-existing-task-retention-receipt-v1',
  generatedAt: new Date().toISOString(),
  worldId: manifest.worldId,
  truthClass: 'interpretive',
  autobiographical: false,
  provider: 'runway',
  operation: 'GET_EXISTING_TASK_OUTPUT_ONLY',
  generationCallsExecuted: 0,
  providerMutationPerformed: false,
  outputUrlsRetained: false,
  apiVersion,
  sourceManifest: manifestPath,
  items: [],
}

for (const item of manifest.items) {
  const taskResponse = await fetch(`${apiBase}/v1/tasks/${encodeURIComponent(item.taskId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': apiVersion,
    },
    redirect: 'error',
  })
  if (!taskResponse.ok) throw new Error(`Runway task lookup failed for ${item.id}: HTTP ${taskResponse.status}`)
  const task = await taskResponse.json()
  if (String(task?.id || '') !== item.taskId) throw new Error(`Runway task identity mismatch for ${item.id}`)
  if (String(task?.status || '').toUpperCase() !== 'SUCCEEDED') throw new Error(`Existing Runway task ${item.id} is not SUCCEEDED (status=${String(task?.status || 'unknown')})`)
  if (!Array.isArray(task?.output) || task.output.length < 1) throw new Error(`Existing Runway task ${item.id} has no output URLs`)

  const outputs = []
  for (let index = 0; index < task.output.length; index += 1) {
    const outputUrl = String(task.output[index] || '')
    const parsed = new URL(outputUrl)
    if (parsed.protocol !== 'https:') throw new Error(`Non-HTTPS Runway output rejected for ${item.id}`)
    const mediaResponse = await fetch(outputUrl, { method: 'GET', redirect: 'follow' })
    if (!mediaResponse.ok) throw new Error(`Runway output download failed for ${item.id}[${index}]: HTTP ${mediaResponse.status}`)
    const contentType = String(mediaResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const bytes = await readLimited(mediaResponse, maxBytes)
    if (!bytes.length) throw new Error(`Runway output download was empty for ${item.id}[${index}]`)
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
    const ext = safeExt(contentType, outputUrl)
    const filename = `${item.id}-${String(index + 1).padStart(2, '0')}${ext}`
    fs.writeFileSync(path.join(outDir, filename), bytes)
    outputs.push({ filename, contentType: contentType || 'application/octet-stream', bytes: bytes.length, sha256 })
  }

  receipt.items.push({
    role: item.role,
    id: item.id,
    taskId: item.taskId,
    expectedMedia: item.expectedMedia,
    taskStatus: 'SUCCEEDED',
    outputs,
  })
  process.stdout.write(`Retained ${item.id}: ${outputs.length} output(s)\n`)
}

fs.writeFileSync(path.join(outDir, 'retention-receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
process.stdout.write(`Retention complete: ${receipt.items.length} tasks, zero generation calls.\n`)
