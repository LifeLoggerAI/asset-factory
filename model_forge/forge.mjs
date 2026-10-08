#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import dns from 'node:dns/promises';
import { checkTriangleBudget } from './triangle-budget.mjs';
import { parseGlbContainer } from './glb-container.mjs';
import { ModelSpendClient } from './model-spend-client.mjs';
import { retrievePublicArtifact } from './protected-artifact.mjs';

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024;
const SUPPORTED_PROVIDERS = new Set(['meshy', 'tripo', 'rodin', 'replicate']);
const TRIPO_STABLE_MODEL = 'v3.1-20260211';
const DEFAULT_MAX_PROVIDER_ATTEMPTS = 1;
const MAX_PROVIDER_ATTEMPTS = 3;

function fail(message) {
  throw new Error(message);
}

function safeFailureMessage(error) {
  // Only trusted fixed diagnostics cross into persistent receipts or CLI output.
  const message = error instanceof Error ? error.message : '';
  if (message === 'MODEL_SPEND_BLOCKED: immutable executor source SHA required') return message;
  if ([
    'Provider metadata deadline exceeded',
    'Provider metadata transport failed or redirect rejected',
    'Provider metadata response has no readable body',
    'Provider metadata response exceeds the byte bound',
    'Provider metadata response is not a byte stream',
    'Provider metadata response is not valid UTF-8',
    'Provider metadata response is not valid JSON',
    'Provider metadata response must be a JSON object',
    'Provider metadata JSON exceeds structural bounds',
    'Provider metadata JSON contains a non-finite number',
    'Provider metadata retry exceeds the admission deadline',
    'Provider metadata HTTP request failed',
    'Read-only provider rate-limit retries exhausted',
    'Remote reference fixity requires protected materialization before Model Forge spend',
  ].includes(message)) return message;
  return 'Model Forge operation failed; protected reconciliation or source validation is required';
}

function parseArgs(argv) {
  const out = { spec: '', providers: [], dryRun: false, out: 'model_forge/runs', resumeMeshyPreview: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--spec') out.spec = argv[++i] ?? '';
    else if (arg === '--providers') out.providers = String(argv[++i] ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    else if (arg === '--out') out.out = argv[++i] ?? out.out;
    else if (arg === '--resume-meshy-preview') out.resumeMeshyPreview = argv[++i] ?? '';
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
  if (spec.referenceViews !== undefined) {
    if (!spec.referenceViews || typeof spec.referenceViews !== 'object' || Array.isArray(spec.referenceViews)) fail('referenceViews must be an object');
    const allowedViews = new Set(['front', 'left', 'back', 'right']);
    for (const [view, ref] of Object.entries(spec.referenceViews)) {
      if (!allowedViews.has(view)) fail(`Unsupported reference view: ${view}`);
      if (typeof ref !== 'string' || !ref.trim()) fail(`referenceViews.${view} must be a non-empty string`);
      if (!(ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('data:') || fs.existsSync(ref))) fail(`referenceViews.${view} is not a URL, data URI, or file`);
    }
    if (!spec.referenceViews.front) fail('referenceViews.front is required');
    if (Object.keys(spec.referenceViews).length < 2) fail('referenceViews requires at least two views');
  }
  spec.generation = {
    maxProviderAttempts: Number(spec.generation?.maxProviderAttempts ?? DEFAULT_MAX_PROVIDER_ATTEMPTS),
    seed: spec.generation?.seed === undefined ? null : Number(spec.generation.seed),
  };
  if (!Number.isInteger(spec.generation.maxProviderAttempts) || spec.generation.maxProviderAttempts < 1 || spec.generation.maxProviderAttempts > MAX_PROVIDER_ATTEMPTS) {
    fail(`generation.maxProviderAttempts must be 1-${MAX_PROVIDER_ATTEMPTS}`);
  }
  if (spec.generation.seed !== null && (!Number.isInteger(spec.generation.seed) || spec.generation.seed < 0)) {
    fail('generation.seed must be a non-negative integer');
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
  if (provider === 'replicate') return 'REPLICATE_API_TOKEN';
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
  if (!Number.isSafeInteger(n) || n < 1024 * 1024 || n > DEFAULT_MAX_BYTES) fail('Artifact byte limit must be 1-250 MiB');
  return n;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isPrivateIpv6(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === '::1'
    || host === '::'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || /^fe[89ab]/.test(host)
    || host.startsWith('::ffff:127.')
    || host.startsWith('::ffff:10.')
    || host.startsWith('::ffff:192.168.')
    || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function assertPublicHttpUrl(value, label = 'URL') {
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${label} is invalid`); }
  if (!['https:', 'http:'].includes(parsed.protocol)) fail(`${label} uses unsupported protocol`);
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || isPrivateIpv4(host) || isPrivateIpv6(host)) fail(`${label} points to a private/local host`);
  return parsed.toString();
}

async function assertPublicResolvedUrl(value, label = 'URL') {
  const safe = assertPublicHttpUrl(value, label);
  const parsed = new URL(safe);
  let addresses;
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  } catch (error) {
    fail(`${label} hostname could not be resolved`);
  }
  if (!addresses.length) fail(`${label} hostname resolved to no addresses`);
  for (const entry of addresses) {
    if (entry.family === 4 && isPrivateIpv4(entry.address)) fail(`${label} resolves to a private IPv4 address`);
    if (entry.family === 6 && isPrivateIpv6(entry.address)) fail(`${label} resolves to a private IPv6 address`);
  }
  return safe;
}

function retryAfterMs(response, fallbackMs) {
  const raw = response.headers.get('retry-after');
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(fallbackMs, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(fallbackMs, date - Date.now()) : fallbackMs;
}

async function requestJson(url, init = {}, maxRateLimitRetries = 4, spend = null, model = null, readOnlyPost = false) {
  const method = String(init.method || 'GET').toUpperCase();
  if (readOnlyPost) {
    if (method !== 'POST' || !['https://api.hyper3d.com/api/v2/status', 'https://api.hyper3d.com/api/v2/download'].includes(url)) fail('Unrecognized read-only provider operation');
  } else if (method === 'POST') {
    if (!spend) fail('Paid provider leaf requires a protected Model Forge spend client');
    return spend.submit(url, init, model);
  } else if (!['GET', 'HEAD'].includes(method)) fail('Unrecognized provider mutation');
  if (!Number.isInteger(maxRateLimitRetries) || maxRateLimitRetries < 0 || maxRateLimitRetries > 4) fail('Read-only provider retries must be bounded to 0-4');
  const requestDeadline = Date.now() + Math.min(timeoutMs(), 120000);
  const remaining = () => {
    spend?.checkAdmission?.();
    const local = Math.floor(requestDeadline - Date.now());
    if (local <= 0) fail('Provider metadata deadline exceeded');
    return spend ? spend.remainingMs(local) : local;
  };
  const waitFor = (promise, signal) => new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new Error('Provider metadata deadline exceeded')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, () => { cleanup(); reject(new Error('Provider metadata transport failed or redirect rejected')); });
  });
  const boundedPayload = async (response, signal) => {
    const MAX_METADATA_BYTES = 65536;
    let reader;
    let finished = false;
    try {
      if (!response.body) {
        if (method === 'HEAD' || response.status === 204) return {};
        fail('Provider metadata response has no readable body');
      }
      reader = response.body.getReader();
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > MAX_METADATA_BYTES)) fail('Provider metadata response exceeds the byte bound');
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let bytes = 0;
      let text = '';
      while (true) {
        const chunk = await waitFor(Promise.resolve().then(() => reader.read()), signal);
        spend?.checkAdmission?.();
        if (chunk.done) { finished = true; break; }
        if (!(chunk.value instanceof Uint8Array)) fail('Provider metadata response is not a byte stream');
        bytes += chunk.value.byteLength;
        if (bytes > MAX_METADATA_BYTES) fail('Provider metadata response exceeds the byte bound');
        try { text += decoder.decode(new Uint8Array(chunk.value), { stream: true }); } catch { fail('Provider metadata response is not valid UTF-8'); }
      }
      try { text += decoder.decode(); } catch { fail('Provider metadata response is not valid UTF-8'); }
      spend?.checkAdmission?.();
      let payload;
      try { payload = text ? JSON.parse(text) : {}; } catch { fail('Provider metadata response is not valid JSON'); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('Provider metadata response must be a JSON object');
      const pending = [[payload, 0]];
      let nodes = 0;
      while (pending.length) {
        const [value, depth] = pending.pop();
        if (++nodes > 4096 || depth > 64) fail('Provider metadata JSON exceeds structural bounds');
        if (typeof value === 'number' && !Number.isFinite(value)) fail('Provider metadata JSON contains a non-finite number');
        if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push([child, depth + 1]);
      }
      return payload;
    } finally {
      if (reader) {
        if (!finished) {
          try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
        }
        try { reader.releaseLock(); } catch {}
      }
    }
  };
  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
    const signal = AbortSignal.timeout(remaining());
    const response = await waitFor(Promise.resolve().then(() => fetch(url, { ...init, redirect: 'error', signal })), signal);
    let payload;
    try {
      spend?.checkAdmission?.();
      payload = await boundedPayload(response, signal);
      spend?.checkAdmission?.();
    } catch (error) {
      try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch {}
      throw error;
    }
    if (response.status === 429 && attempt < maxRateLimitRetries) {
      const delay = retryAfterMs(response, Math.min(30000, 3000 * (attempt + 1)));
      if (!Number.isFinite(delay) || delay < 0 || delay > 30000 || delay >= remaining()) fail('Provider metadata retry exceeds the admission deadline');
      await waitFor(sleep(delay), signal);
      spend?.checkAdmission?.();
      continue;
    }
    if (!response.ok) fail('Provider metadata HTTP request failed');
    return { payload, response };
  }
  fail('Read-only provider rate-limit retries exhausted');
}

function assertTripoOk(payload, context) {
  if (payload?.code !== undefined && payload.code !== 0) fail('Tripo provider operation failed');
  return payload;
}

function providerFailureSummary(payload) {
  const status = ['failed', 'canceled', 'FAILED', 'CANCELED', 'Failed', 'cancelled', 'banned', 'expired'].includes(payload?.status) ? payload.status : 'failed';
  return JSON.stringify({ status });
}

async function pollJson(url, headers, isDone, isFailed, intervalMs = 3000, spend = null) {
  const deadline = Date.now() + (spend ? spend.remainingMs(timeoutMs()) : timeoutMs());
  while (Date.now() < deadline) {
    const { payload } = await requestJson(url, { headers }, 4, spend);
    if (isFailed(payload)) fail(`Provider task failed: ${providerFailureSummary(payload)}`);
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

function parseGlbCandidate(buffer) { return parseGlbContainer(buffer).gltf; }

function structuralCandidateReport(buffer, maxTriangles) {
  const gltf = parseGlbCandidate(buffer);
  const meshes = gltf.meshes?.length ?? 0;
  if (!meshes) fail('Candidate GLB contains no meshes');
  const { triangles, indexedTriangles, indexedTrianglePrimitives } = checkTriangleBudget(gltf, maxTriangles);
  const required = gltf.extensionsRequired ?? [];
  const unsafeRequired = required.filter((name) => ![
    'KHR_draco_mesh_compression',
    'EXT_meshopt_compression',
    'KHR_texture_basisu',
    'KHR_materials_unlit',
    'KHR_materials_transmission',
    'KHR_materials_ior',
    'KHR_materials_clearcoat',
    'KHR_materials_specular',
    'KHR_materials_emissive_strength',
  ].includes(name));
  if (unsafeRequired.length) fail(`Candidate requires unsupported extensions: ${unsafeRequired.join(', ')}`);
  return {
    meshes,
    nodes: gltf.nodes?.length ?? 0,
    materials: gltf.materials?.length ?? 0,
    images: gltf.images?.length ?? 0,
    animations: gltf.animations?.length ?? 0,
    trianglesEstimated: triangles,
    trianglesEstimatedFromIndexedTrianglePrimitives: indexedTriangles,
    indexedTrianglePrimitives,
    extensionsUsed: gltf.extensionsUsed ?? [],
    extensionsRequired: required,
    verdict: 'structurally-valid-candidate-not-visual-authority',
  };
}

async function downloadFile(url, destination, spend = null) {
  if (!spend) fail('Artifact retrieval requires an active protected spend admission');
  spend.checkAdmission();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const handle = fs.openSync(destination, 'w');
  try {
    const result = await retrievePublicArtifact(url, { hosts: spend.artifactHosts, maxBytes: maxBytes(), timeoutMs: spend.remainingMs(Math.min(timeoutMs(), 180000)), checkAdmission: () => spend.checkAdmission(), onChunk: chunk => fs.writeSync(handle, chunk) });
    fs.closeSync(handle); return { bytes: result.bytes, sha256: result.sha256 };
  } catch (error) {
    try { fs.closeSync(handle); } catch {}
    try { fs.unlinkSync(destination); } catch {}
    throw error;
  }
}

async function generateMeshy(spec, spend) {
  const key = process.env.MESHY_API_KEY;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const refsSource = spec.referenceViews
    ? ['front', 'left', 'back', 'right'].map((view) => spec.referenceViews[view]).filter(Boolean)
    : (spec.referenceImages ?? []);
  const refs = refsSource.map(ref => {
    if (!fs.existsSync(ref)) return ref;
    if (fs.statSync(ref).size > 16 * 1024 * 1024) fail('Meshy local reference exceeds the bounded inline input limit');
    return `data:${mimeFor(ref)};base64,${fs.readFileSync(ref).toString('base64')}`;
  });
  const model = process.env.URAI_MESHY_MODEL || 'meshy-7.1';
  let taskId;
  let pollUrl;

  if (refs.length > 1 && refs.every((v) => /^https?:|^data:/.test(v))) {
    const { payload } = await requestJson('https://api.meshy.ai/openapi/v1/multi-image-to-3d', {
      method: 'POST', headers,
      body: JSON.stringify({ image_urls: refs.slice(0, 4), ai_model: model, geometry_resolution: '2k', should_texture: true, enable_pbr: spec.target.pbr, topology: 'triangle', target_polycount: spec.target.maxTriangles, target_formats: ['glb'] }),
    }, 4, spend, model);
    taskId = payload.result;
    pollUrl = `https://api.meshy.ai/openapi/v1/multi-image-to-3d/${taskId}`;
  } else if (refs.length === 1 && /^https?:|^data:/.test(refs[0])) {
    const { payload } = await requestJson('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST', headers,
      body: JSON.stringify({ image_url: refs[0], ai_model: model, geometry_resolution: '4k', enable_pbr: spec.target.pbr, should_remesh: false, should_texture: true, target_formats: ['glb'] }),
    }, 4, spend, model);
    taskId = payload.result;
    pollUrl = `https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`;
  } else {
    const previewEndpoint = 'https://api.meshy.ai/openapi/v2/text-to-3d';
    const previewInit = {
      method: 'POST', headers,
      body: JSON.stringify({ mode: 'preview', prompt: spec.prompt, ai_model: model, geometry_resolution: '4k', should_remesh: false, target_formats: ['glb'] }),
    };
    let previewId;
    if (spend.previewCheckpoint) previewId = await spend.verifiedPreview(previewEndpoint, previewInit, model);
    else {
      const preview = await requestJson(previewEndpoint, previewInit, 4, spend, model);
      previewId = preview.payload.result;
      if (typeof previewId !== 'string' || !previewId) fail('Meshy preview returned no task identity; reconciliation required');
      spend.savePreviewCheckpoint(previewId, model);
    }
    await pollJson(`https://api.meshy.ai/openapi/v2/text-to-3d/${encodeURIComponent(previewId)}`, { Authorization: `Bearer ${key}` }, (p) => p.status === 'SUCCEEDED', (p) => ['FAILED', 'CANCELED'].includes(p.status), 3000, spend);
    const refine = await requestJson('https://api.meshy.ai/openapi/v2/text-to-3d', {
      method: 'POST', headers,
      body: JSON.stringify({ mode: 'refine', preview_task_id: previewId, enable_pbr: spec.target.pbr, texture_resolution: spec.target.textureResolution, target_formats: ['glb'] }),
    }, 4, spend, model);
    taskId = refine.payload.result;
    pollUrl = `https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`;
  }

  const result = await pollJson(pollUrl, { Authorization: `Bearer ${key}` }, (p) => p.status === 'SUCCEEDED', (p) => ['FAILED', 'CANCELED'].includes(p.status), 3000, spend);
  const url = result.model_urls?.glb ?? firstHttpUrl(result.model_urls);
  if (!url) fail('Meshy task completed without GLB URL');
  return { url, taskId, model, raw: result };
}

async function generateTripo(spec, spend) {
  const key = process.env.TRIPO_API_KEY;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const refs = spec.referenceImages ?? [];
  const views = spec.referenceViews ?? null;
  const model = process.env.URAI_TRIPO_MODEL || TRIPO_STABLE_MODEL;

  const common = {
    model_version: model,
    texture: true,
    pbr: spec.target.pbr,
    texture_quality: spec.target.textureResolution === '8k' ? 'extreme' : 'detailed',
    geometry_quality: 'detailed',
    face_limit: spec.target.maxTriangles,
    auto_size: true,
    ...(spec.generation.seed === null ? {} : { model_seed: spec.generation.seed, texture_seed: spec.generation.seed }),
  };

  const fileInput = (ref) => {
    if (!ref) return {};
    if (!/^https?:\/\//.test(ref)) fail('Tripo reference-driven generation currently requires public JPEG/PNG URLs; local/private references must be materialized and uploaded before paid execution');
    const parsed = new URL(assertPublicHttpUrl(ref, 'Tripo reference URL'));
    const ext = path.extname(parsed.pathname).toLowerCase();
    return { type: ext === '.png' ? 'png' : 'jpg', url: parsed.toString() };
  };

  let body;
  if (views) {
    body = {
      type: 'multiview_to_model',
      files: ['front', 'left', 'back', 'right'].map((view) => fileInput(views[view])),
      ...common,
    };
  } else if (refs.length === 1) {
    body = { type: 'image_to_model', file: fileInput(refs[0]), ...common };
  } else if (refs.length > 1) {
    fail('Use referenceViews for Tripo multiview so front/left/back/right ordering is explicit');
  } else {
    body = { type: 'text_to_model', prompt: spec.prompt.slice(0, 1024), ...common };
  }

  const create = await requestJson('https://api.tripo3d.ai/v2/openapi/task', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, 4, spend, model);
  const payload = assertTripoOk(create.payload, 'create task');
  const taskId = payload.data?.task_id;
  if (!taskId) fail('Tripo did not return a task identity; reconciliation required');
  const result = await pollJson(
    `https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(taskId)}`,
    { Authorization: `Bearer ${key}` },
    (p) => { assertTripoOk(p, 'task poll'); return p.data?.status === 'success'; },
    (p) => ['failed', 'cancelled', 'banned', 'expired'].includes(p.data?.status),
    3000, spend,
  );
  assertTripoOk(result, 'task result');
  const output = result.data?.output ?? {};
  const url = output.pbr_model || output.model || output.base_model;
  if (!url) fail('Tripo task completed without downloadable model output');
  return { url, taskId, model, creditsConsumed: output.consumed_credit ?? null, raw: result.data };
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function generateRodin(spec, spend) {
  const key = process.env.RODIN_API_KEY;
  const tier = process.env.URAI_RODIN_TIER || 'Gen-2.5-Medium';
  const refs = spec.referenceViews
    ? ['front', 'left', 'back', 'right'].map((view) => spec.referenceViews[view]).filter(Boolean)
    : (spec.referenceImages ?? []);
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
  form.append('quality_override', String(spec.target.maxTriangles));
  form.append('geometry_file_format', 'glb');
  form.append('material', spec.target.pbr ? 'PBR' : 'Shaded');
  form.append('texture_mode', spec.target.textureResolution === '8k' ? 'high' : 'medium');
  if (spec.target.textureResolution === '4k' || spec.target.textureResolution === '8k') form.append('addons', 'HighPack');
  if (spec.generation.seed !== null) form.append('seed', String(spec.generation.seed % 65536));
  form.append('is_symmetric', 'asymmetric');

  const { payload } = await requestJson('https://api.hyper3d.com/api/v2/rodin', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form }, 4, spend, tier);
  if (payload.error) fail('Rodin rejected generation despite transport success; reconciliation required');
  const taskUuid = payload.uuid;
  const subscriptionKey = payload.jobs?.subscription_key;
  if (!taskUuid || !subscriptionKey) fail('Rodin response missing uuid/subscription_key');
  const deadline = Date.now() + spend.remainingMs(timeoutMs());
  let delay = 5000;
  while (Date.now() < deadline) {
    await sleep(delay);
    const { payload: status } = await requestJson('https://api.hyper3d.com/api/v2/status', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription_key: subscriptionKey }) }, 4, spend, null, true);
    const states = Array.isArray(status.jobs) ? status.jobs.map((j) => j.status) : [];
    if (states.includes('Failed')) fail('Rodin provider task failed; reconciliation required');
    if (states.length && states.every((s) => s === 'Done')) break;
    delay = Math.min(delay + 5000, 30000);
  }
  if (Date.now() >= deadline) fail('Rodin task timed out');
  const { payload: downloads } = await requestJson('https://api.hyper3d.com/api/v2/download', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ task_uuid: taskUuid }) }, 4, spend, null, true);
  const glb = Array.isArray(downloads.list) ? downloads.list.find((item) => String(item.name ?? '').toLowerCase().endsWith('.glb')) : null;
  if (!glb?.url) fail('Rodin download list had no GLB');
  return { url: glb.url, taskId: taskUuid, model: tier, consumed: payload.consumed ?? null, raw: downloads };
}

function replicateOfficialModel() {
  const model = process.env.URAI_REPLICATE_MODEL || 'tencent/hunyuan-3d-3.1';
  const parts = model.split('/');
  if (parts.length !== 2 || parts.some((part) => !/^[a-zA-Z0-9_.-]+$/.test(part))) {
    fail('URAI_REPLICATE_MODEL must be owner/name for an official Replicate model');
  }
  return model;
}

function replicatePredictionUrl(taskId, suppliedUrl) {
  if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)) {
    fail('Replicate returned an invalid prediction identity; reconciliation required');
  }
  const canonical = `https://api.replicate.com/v1/predictions/${taskId}`;
  let parsed;
  try { parsed = new URL(suppliedUrl); } catch { fail('Replicate returned an invalid prediction polling URL'); }
  if (typeof suppliedUrl !== 'string' || suppliedUrl !== canonical
    || parsed.origin !== 'https://api.replicate.com' || parsed.protocol !== 'https:'
    || parsed.username || parsed.password || parsed.search || parsed.hash
    || parsed.pathname !== `/v1/predictions/${taskId}`) {
    fail('Replicate prediction polling URL is not the trusted HTTPS endpoint for its task');
  }
  return canonical;
}

function assertReplicatePrediction(payload, taskId) {
  if (!payload || payload.id !== taskId) fail('Replicate polling response changed prediction identity; reconciliation required');
  if (payload.urls?.get !== undefined) replicatePredictionUrl(taskId, payload.urls.get);
}

async function generateReplicate(spec, spend) {
  const key = process.env.REPLICATE_API_TOKEN;
  const model = replicateOfficialModel();
  const [owner, name] = model.split('/');
  const refs = spec.referenceImages ?? [];
  if (spec.referenceViews) {
    fail('Hunyuan 3D 3.1 accepts one image or one text prompt, not an ordered multiview pack; do not silently collapse referenceViews');
  }
  if (refs.length > 1) fail('Hunyuan 3D 3.1 accepts one image or one text prompt, not multiple referenceImages');

  const faceCount = Math.max(40000, Math.min(1500000, spec.target.maxTriangles));
  const input = {
    enable_pbr: spec.target.pbr,
    face_count: faceCount,
    generate_type: 'Normal',
  };
  if (refs.length === 1) {
    const ref = refs[0];
    if (!/^https?:\/\//.test(ref)) {
      fail('Replicate Hunyuan image-to-3D requires one public reference URI; local/private references must be uploaded through a governed provider file boundary before execution');
    }
    input.image = assertPublicHttpUrl(ref, 'Replicate Hunyuan reference URL');
  } else {
    input.prompt = spec.prompt.slice(0, 1024);
  }

  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const create = await requestJson(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  }, 2, spend, model);
  const prediction = create.payload;
  const taskId = prediction.id;
  const getUrl = replicatePredictionUrl(taskId, prediction.urls?.get);

  let current = prediction;
  if (current.status !== 'succeeded') {
    current = await pollJson(
      getUrl,
      { Authorization: `Bearer ${key}` },
      (p) => { assertReplicatePrediction(p, taskId); return p.status === 'succeeded'; },
      (p) => { assertReplicatePrediction(p, taskId); return ['failed', 'canceled'].includes(p.status); },
      3000, spend,
    );
  }
  const url = firstHttpUrl(current.output);
  if (!url) fail('Replicate Hunyuan prediction completed without output URI');
  return {
    url,
    taskId,
    model,
    metrics: current.metrics ?? null,
    version: current.version ?? null,
    raw: current,
  };
}

async function generate(provider, spec, spend) {
  if (provider === 'meshy') return generateMeshy(spec, spend);
  if (provider === 'tripo') return generateTripo(spec, spend);
  if (provider === 'rodin') return generateRodin(spec, spend);
  if (provider === 'replicate') return generateReplicate(spec, spend);
  fail(`Unsupported provider: ${provider}`);
}

function dryRunReceipt(spec, providers) {
  return {
    schemaVersion: 'urai-model-forge-plan-v1',
    dryRun: true,
    spendRequested: spendAllowed(),
    spendAuthorized: false,
    provider_call_authorized: false,
    execution_performed: false,
    assetId: spec.id,
    providers: providers.map((provider) => ({ provider, requiredEnv: requiredEnv(provider), configured: Boolean(process.env[requiredEnv(provider)]) })),
    target: spec.target,
    generationPolicy: spec.generation,
    referenceCount: spec.referenceViews ? Object.keys(spec.referenceViews).length : (spec.referenceImages ?? []).length,
    next: 'Paid leaves require exact source/request jobs, genuine bounded approval and atomic shared gateway reservations. The environment flag is opt-in only.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = path.resolve(args.spec);
  const specBytes = fs.readFileSync(specPath);
  const sourceSpecSha256 = crypto.createHash('sha256').update(specBytes).digest('hex');
  const spec = validateSpec(JSON.parse(specBytes.toString('utf8')));
  const providers = (args.providers.length ? args.providers : (spec.providers ?? ['meshy', 'tripo', 'rodin', 'replicate'])).map((v) => String(v).toLowerCase());
  if (!providers.length) fail('No providers selected');
  for (const p of providers) if (!SUPPORTED_PROVIDERS.has(p)) fail(`Unsupported provider: ${p}`);
  if (args.resumeMeshyPreview && (providers.length !== 1 || providers[0] !== 'meshy' || (spec.referenceImages?.length || spec.referenceViews))) fail('Preview resume requires one Meshy text-only provider');
  const previewCheckpoint = args.resumeMeshyPreview ? readJson(path.resolve(args.resumeMeshyPreview)) : null;

  if (args.dryRun) {
    console.log(JSON.stringify(dryRunReceipt(spec, providers), null, 2));
    return;
  }
  if (!spendAllowed()) fail('Provider execution requires deliberate opt-in plus genuine protected gateway admission; the environment flag does not authorize spend.');

  const runRoot = path.resolve(args.out, spec.id, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(runRoot, { recursive: true });
  const runReceipt = {
    schemaVersion: 'urai-model-forge-run-v1',
    assetId: spec.id,
    startedAt: new Date().toISOString(),
    providers: [],
    target: spec.target,
    generationPolicy: spec.generation,
  };

  for (const provider of providers) {
    const keyName = requiredEnv(provider);
    if (!process.env[keyName]) {
      runReceipt.providers.push({ provider, status: 'skipped-missing-credential', requiredEnv: keyName });
      continue;
    }
    const providerDir = path.join(runRoot, provider);
    fs.mkdirSync(providerDir, { recursive: true });
    const attempts = [];
    const spend = new ModelSpendClient({ provider, asset: spec.id, sourceSpecSha256, evidenceDir: path.join(providerDir, 'spend'), previewCheckpoint });
    let completed = false;
    for (let attempt = 1; attempt <= spec.generation.maxProviderAttempts && !completed; attempt += 1) {
      const startedAt = new Date().toISOString();
      const attemptDir = path.join(providerDir, `attempt-${attempt}`);
      fs.mkdirSync(attemptDir, { recursive: true });
      try {
        // Direct reference URIs do not establish immutable input bytes. The
        // current protected materializer must admit those paths separately.
        const references = [...(spec.referenceImages || []), ...Object.values(spec.referenceViews || {})];
        if (references.some(ref => /^https?:\/\//.test(ref))) fail('Remote reference fixity requires protected materialization before Model Forge spend');
        const result = await generate(provider, spec, spend);
        const candidatePath = path.join(attemptDir, 'candidate.glb');
        const artifact = await downloadFile(result.url, candidatePath, spend);
        spend.checkAdmission();
        const structural = structuralCandidateReport(fs.readFileSync(candidatePath), spec.target.maxTriangles);
        spend.checkAdmission();
        fs.writeFileSync(path.join(attemptDir, 'structural-validation.json'), `${JSON.stringify({
          schemaVersion: 'urai-glb-validation-v1',
          assetId: spec.id,
          provider,
          taskId: result.taskId,
          bytes: artifact.bytes,
          sha256: artifact.sha256,
          ...structural,
        }, null, 2)}\n`);
        const provenance = {
          schemaVersion: 'urai-model-candidate-provenance-v1',
          assetId: spec.id,
          provider,
          providerModel: result.model,
          taskId: result.taskId,
          attempt,
          startedAt,
          completedAt: new Date().toISOString(),
          sourceSpecSha256,
          referenceImages: spec.referenceImages ?? [],
          referenceViews: spec.referenceViews ?? null,
          prompt: spec.prompt,
          target: spec.target,
          generationPolicy: spec.generation,
          artifact: { file: 'candidate.glb', bytes: artifact.bytes, sha256: artifact.sha256 },
          providerUsage: {
            creditsConsumed: result.creditsConsumed ?? result.consumed ?? null,
            metrics: result.metrics ?? null,
            providerVersion: result.version ?? null,
          },
          productionAuthority: false,
          promotionAllowed: false,
          structuralValidation: structural,
          nextRequired: ['Blender cleanup/scale/LOD', 'standardized candidate review renders', 'literal in-scene rendered-pixel review', 'explicit approval', 'governed promotion'],
        };
        fs.writeFileSync(path.join(attemptDir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
        attempts.push({ attempt, status: 'candidate-structurally-valid', artifact: path.relative(runRoot, candidatePath), sha256: artifact.sha256, taskId: result.taskId, structuralValidation: path.relative(runRoot, path.join(attemptDir, 'structural-validation.json')) });
        completed = true;
      } catch (error) {
        attempts.push({ attempt, status: 'failed', error: safeFailureMessage(error), spendAttempts: structuredClone(spend.records) });
        // Polling/download/validation failures cannot grant another paid attempt.
        // A later invocation still needs independently reconciled gateway authority.
        break;
      }
    }
    const acceptedAttempt = attempts.find((entry) => entry.status === 'candidate-structurally-valid');
    runReceipt.providers.push({
      provider,
      status: acceptedAttempt ? 'candidate-structurally-valid' : 'failed',
      attempts,
      spendAttempts: structuredClone(spend.records),
      ...(acceptedAttempt ? { artifact: acceptedAttempt.artifact, sha256: acceptedAttempt.sha256, taskId: acceptedAttempt.taskId } : {}),
    });
  }
  runReceipt.completedAt = new Date().toISOString();
  runReceipt.completedCandidates = runReceipt.providers.filter((entry) => entry.status === 'candidate-structurally-valid').length;
  runReceipt.status = runReceipt.completedCandidates === providers.length ? 'completed' : (runReceipt.completedCandidates > 0 ? 'partial' : 'failed');
  fs.writeFileSync(path.join(runRoot, 'run-receipt.json'), `${JSON.stringify(runReceipt, null, 2)}\n`);
  console.log(JSON.stringify(runReceipt, null, 2));
  // Retain failed/blocked receipts and return a failing process status.
  if (runReceipt.status !== 'completed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`URAI_MODEL_FORGE_ERROR=${safeFailureMessage(error)}`);
  process.exitCode = 1;
});
