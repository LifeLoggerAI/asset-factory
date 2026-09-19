#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024;
const SUPPORTED_PROVIDERS = new Set(['meshy', 'tripo', 'rodin']);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const out = { spec: '', providers: [], dryRun: false, out: 'model_forge/runs' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--spec') out.spec = argv[++i] ?? '';
    else if (arg === '--providers') out.providers = String(argv[++i] ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    else if (arg === '--out') out.out = argv[++i] ?? out.out;
    else if (arg === '--dry-run') out.dryRun = true;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!out.spec) fail('--spec is required');
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function slug(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s || s.length > 120) fail('Invalid asset id');
  return s;
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) fail('Spec must be an object');
  spec.id = slug(spec.id);
  if (typeof spec.prompt !== 'string' || !spec.prompt.trim() || spec.prompt.length > 4000) fail('Spec prompt is required and must be <= 4000 chars');
  if (spec.referenceImages !== undefined) {
    if (!Array.isArray(spec.referenceImages) || spec.referenceImages.length > 5) fail('referenceImages must contain 0-5 items');
    for (const ref of spec.referenceImages) {
      if (typeof ref !== 'string' || !ref.trim()) fail('referenceImages values must be non-empty strings');
      if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('data:') || fs.existsSync(ref)) continue;
      fail(`Reference image is neither URL, data URI, nor existing file: ${ref}`);
    }
  }
  spec.target = {
    meters: Number(spec.target?.meters ?? 2),
    hero: spec.target?.hero !== false,
    maxTriangles: Number(spec.target?.maxTriangles ?? 120000),
    textureResolution: String(spec.target?.textureResolution ?? '4k'),
    pbr: spec.target?.pbr !== false,
  };
  if (!Number.isFinite(spec.target.meters) || spec.target.meters <= 0 || spec.target.meters > 1000) fail('target.meters invalid');
  if (!Number.isInteger(spec.target.maxTriangles) || spec.target.maxTriangles < 100 || spec.target.maxTriangles > 2000000) fail('target.maxTriangles invalid');
  return spec;
}

function requiredEnv(provider) {
  if (provider === 'meshy') return 'MESHY_API_KEY';
  if (provider === 'tripo') return 'TRIPO_API_KEY';
  if (provider === 'rodin') return 'RODIN_API_KEY';
  fail(`Unsupported provider: ${provider}`);
}

function spendAllowed() {
  return process.env.URAI_MODEL_FORGE_SPEND_AUTHORIZED === '1';
}

function timeoutMs() {
  const n = Number(process.env.URAI_MODEL_FORGE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 60000 ? n : DEFAULT_TIMEOUT_MS;
}

function maxBytes() {
  const n = Number(process.env.URAI_MODEL_FORGE_MAX_BYTES ?? DEFAULT_MAX_BYTES);
  return Number.isFinite(n) && n >= 1024 * 1024 ? n : DEFAULT_MAX_BYTES;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.min(timeoutMs(), 120000)) });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) fail(`HTTP ${response.status} from ${url}: ${JSON.stringify(payload).slice(0, 1200)}`);
  return { payload, response };
}

async function pollJson(url, headers, isDone, isFailed, intervalMs = 3000) {
  const deadline = Date.now() + timeoutMs();
  while (Date.now() < deadline) {
    const { payload } = await requestJson(url, { headers });
    if (isFailed(payload)) fail(`Provider task failed: ${JSON.stringify(payload).slice(0, 1200)}`);
    if (isDone(payload)) return payload;
    await sleep(intervalMs);
  }
  fail(`Provider task timed out after ${timeoutMs()} ms`);
}

function firstHttpUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = firstHttpUrl(item);
      if (found) return found;
    }
  }
  return null;
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(timeoutMs(), 180000)) });
  if (!response.ok) fail(`Artifact download failed ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes()) fail(`Artifact too large: ${declared}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > maxBytes()) fail(`Artifact too large after download: ${data.byteLength}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, data);
  return { bytes: data.byteLength, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}

async function generateMeshy(spec) {
  const key = process.env.MESHY_API_KEY;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const refs = spec.referenceImages ?? [];
  const model = process.env.URAI_MESHY_MODEL || 'meshy-7.1';
  let taskId;
  let pollUrl;

  if (refs.length > 1 && refs.every((v) => /^https?:|^data:/.test(v))) {
    const { payload } = await requestJson('https://api.meshy.ai/openapi/v1/multi-image-to-3d', {
      method: 'POST', headers,
      body: JSON.stringify({ image_urls: refs.slice(0, 4), ai_model: model, geometry_resolution: '2k', should_texture: true, enable_pbr: spec.target.pbr, topology: 'triangle', target_polycount: spec.target.maxTriangles, target_formats: ['glb'] }),
    });
    taskId = payload.result;
    pollUrl = `https://api.meshy.ai/openapi/v1/multi-image-to-3d/${taskId}`;
  } else if (refs.length === 1 && /^https?:|^data:/.test(refs[0])) {
    const { payload } = await requestJson('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST', headers,
      body: JSON.stringify({ image_url: refs[0], ai_model: model, geometry_resolution: '4k', enable_pbr: spec.target.pbr, should_remesh: true, target_polycount: spec.target.maxTriangles, should_texture: true, target_formats: ['glb'] }),
    });
    taskId = payload.result;
    pollUrl = `https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`;
  } else {
    const preview = await requestJson('https://api.meshy.ai/openapi/v2/text-to-3d', {
      method: 'POST', headers,
      body: JSON.stringify({ mode: 'preview', prompt: spec.prompt, ai_model: model, geometry_resolution: '4k', should_remesh: true, target_polycount: spec.target.maxTriangles, target_formats: ['glb'] }),
    });
    const previewId = preview.payload.result;
    await pollJson(`https://api.meshy.ai/openapi/v2/text-to-3d/${previewId}`, { Authorization: `Bearer ${key}` }, (p) => p.status === 'SUCCEEDED', (p) => ['FAILED', 'CANCELED'].includes(p.status));
    const refine = await requestJson('https://api.meshy.ai/openapi/v2/text-to-3d', {
      method: 'POST', headers,
      body: JSON.stringify({ mode: 'refine', preview_task_id: previewId, enable_pbr: spec.target.pbr, texture_resolution: spec.target.textureResolution, target_formats: ['glb'] }),
    });
    taskId = refine.payload.result;
    pollUrl = `https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`;
  }

  const result = await pollJson(pollUrl, { Authorization: `Bearer ${key}` }, (p) => p.status === 'SUCCEEDED', (p) => ['FAILED', 'CANCELED'].includes(p.status));
  const url = result.model_urls?.glb ?? firstHttpUrl(result.model_urls);
  if (!url) fail('Meshy task completed without GLB URL');
  return { url, taskId, model, raw: result };
}

async function generateTripo(spec) {
  const key = process.env.TRIPO_API_KEY;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const refs = spec.referenceImages ?? [];
  const model = process.env.URAI_TRIPO_MODEL || 'tripo-v3.1';
  const endpoint = refs.length ? 'image-to-model' : 'text-to-model';
  if (refs.length > 1) fail('Tripo adapter currently accepts one canonical reference image; use the primary/front view or Meshy/Rodin for multiview');
  const body = refs.length
    ? { input: refs[0], model, texture: true, pbr: spec.target.pbr, texture_quality: spec.target.textureResolution === '8k' ? 'detailed' : 'standard', geometry_quality: 'detailed', auto_size: true }
    : { prompt: spec.prompt, model, texture: true, pbr: spec.target.pbr, texture_quality: 'detailed' };
  const { payload } = await requestJson(`https://openapi.tripo3d.ai/v3/generation/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const taskId = payload.data?.task_id;
  if (!taskId) fail(`Tripo did not return task_id: ${JSON.stringify(payload)}`);
  const result = await pollJson(`https://openapi.tripo3d.ai/v3/tasks/${taskId}`, { Authorization: `Bearer ${key}` }, (p) => p.data?.status === 'success', (p) => ['failed', 'cancelled', 'canceled'].includes(p.data?.status), 3000);
  const url = result.data?.output?.model_url;
  if (!url) fail('Tripo task completed without model_url');
  return { url, taskId, model, creditsConsumed: result.data?.credits_consumed ?? null, raw: result.data };
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function generateRodin(spec) {
  const key = process.env.RODIN_API_KEY;
  const tier = process.env.URAI_RODIN_TIER || 'Gen-2.5-Medium';
  const refs = spec.referenceImages ?? [];
  const form = new FormData();
  if (refs.length) {
    if (!refs.every((v) => fs.existsSync(v))) fail('Rodin adapter uses local image files for image-to-3D; URLs should be downloaded into the workspace first');
    for (const ref of refs.slice(0, 5)) {
      const bytes = fs.readFileSync(ref);
      form.append('images', new Blob([bytes], { type: mimeFor(ref) }), path.basename(ref));
    }
  } else {
    form.append('prompt', spec.prompt);
  }
  form.append('tier', tier);
  form.append('mesh_mode', 'Raw');
  form.append('quality', spec.target.hero ? 'high' : 'medium');
  form.append('geometry_file_format', 'glb');
  form.append('material', spec.target.pbr ? 'PBR' : 'Shaded');
  form.append('texture_mode', spec.target.textureResolution === '8k' ? 'high' : 'medium');

  const { payload } = await requestJson('https://api.hyper3d.com/api/v2/rodin', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (payload.error) fail(`Rodin rejected generation: ${JSON.stringify(payload)}`);
  const taskUuid = payload.uuid;
  const subscriptionKey = payload.jobs?.subscription_key;
  if (!taskUuid || !subscriptionKey) fail('Rodin response missing uuid/subscription_key');
  const deadline = Date.now() + timeoutMs();
  let delay = 5000;
  while (Date.now() < deadline) {
    await sleep(delay);
    const { payload: status } = await requestJson('https://api.hyper3d.com/api/v2/status', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription_key: subscriptionKey }) });
    const states = Array.isArray(status.jobs) ? status.jobs.map((j) => j.status) : [];
    if (states.includes('Failed')) fail(`Rodin task failed: ${JSON.stringify(status)}`);
    if (states.length && states.every((s) => s === 'Done')) break;
    delay = Math.min(delay + 5000, 30000);
  }
  if (Date.now() >= deadline) fail('Rodin task timed out');
  const { payload: downloads } = await requestJson('https://api.hyper3d.com/api/v2/download', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ task_uuid: taskUuid }) });
  const glb = Array.isArray(downloads.list) ? downloads.list.find((item) => String(item.name ?? '').toLowerCase().endsWith('.glb')) : null;
  if (!glb?.url) fail(`Rodin download list had no GLB: ${JSON.stringify(downloads)}`);
  return { url: glb.url, taskId: taskUuid, model: tier, consumed: payload.consumed ?? null, raw: downloads };
}

async function generate(provider, spec) {
  if (provider === 'meshy') return generateMeshy(spec);
  if (provider === 'tripo') return generateTripo(spec);
  if (provider === 'rodin') return generateRodin(spec);
  fail(`Unsupported provider: ${provider}`);
}

function dryRunReceipt(spec, providers) {
  return {
    schemaVersion: 'urai-model-forge-plan-v1',
    dryRun: true,
    spendAuthorized: spendAllowed(),
    assetId: spec.id,
    providers: providers.map((provider) => ({ provider, requiredEnv: requiredEnv(provider), configured: Boolean(process.env[requiredEnv(provider)]) })),
    target: spec.target,
    referenceCount: (spec.referenceImages ?? []).length,
    next: 'Provider execution remains blocked until URAI_MODEL_FORGE_SPEND_AUTHORIZED=1 and credentials are available.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = path.resolve(args.spec);
  const spec = validateSpec(readJson(specPath));
  const providers = (args.providers.length ? args.providers : (spec.providers ?? ['meshy', 'tripo', 'rodin'])).map((v) => String(v).toLowerCase());
  if (!providers.length) fail('No providers selected');
  for (const p of providers) if (!SUPPORTED_PROVIDERS.has(p)) fail(`Unsupported provider: ${p}`);

  if (args.dryRun) {
    console.log(JSON.stringify(dryRunReceipt(spec, providers), null, 2));
    return;
  }
  if (!spendAllowed()) fail('Provider execution is fail-closed. Set URAI_MODEL_FORGE_SPEND_AUTHORIZED=1 only after an explicit spend decision.');

  const runRoot = path.resolve(args.out, spec.id, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(runRoot, { recursive: true });
  const runReceipt = { schemaVersion: 'urai-model-forge-run-v1', assetId: spec.id, startedAt: new Date().toISOString(), providers: [], target: spec.target };

  for (const provider of providers) {
    const keyName = requiredEnv(provider);
    if (!process.env[keyName]) {
      runReceipt.providers.push({ provider, status: 'skipped-missing-credential', requiredEnv: keyName });
      continue;
    }
    const providerDir = path.join(runRoot, provider);
    fs.mkdirSync(providerDir, { recursive: true });
    const startedAt = new Date().toISOString();
    try {
      const result = await generate(provider, spec);
      const artifact = await downloadFile(result.url, path.join(providerDir, 'candidate.glb'));
      const provenance = {
        schemaVersion: 'urai-model-candidate-provenance-v1',
        assetId: spec.id,
        provider,
        providerModel: result.model,
        taskId: result.taskId,
        startedAt,
        completedAt: new Date().toISOString(),
        sourceSpecSha256: crypto.createHash('sha256').update(fs.readFileSync(specPath)).digest('hex'),
        referenceImages: spec.referenceImages ?? [],
        prompt: spec.prompt,
        target: spec.target,
        artifact: { file: 'candidate.glb', bytes: artifact.bytes, sha256: artifact.sha256 },
        providerUsage: { creditsConsumed: result.creditsConsumed ?? result.consumed ?? null },
        productionAuthority: false,
        promotionAllowed: false,
        nextRequired: ['GLB structural validation', 'Blender cleanup/scale/LOD', 'literal rendered-pixel review', 'explicit approval', 'governed promotion'],
      };
      fs.writeFileSync(path.join(providerDir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
      runReceipt.providers.push({ provider, status: 'candidate-downloaded', artifact: path.relative(runRoot, path.join(providerDir, 'candidate.glb')), sha256: artifact.sha256 });
    } catch (error) {
      runReceipt.providers.push({ provider, status: 'failed', error: String(error?.message ?? error) });
    }
  }
  runReceipt.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(runRoot, 'run-receipt.json'), `${JSON.stringify(runReceipt, null, 2)}\n`);
  console.log(JSON.stringify(runReceipt, null, 2));
}

main().catch((error) => {
  console.error(`URAI_MODEL_FORGE_ERROR=${error?.message ?? error}`);
  process.exitCode = 1;
});
