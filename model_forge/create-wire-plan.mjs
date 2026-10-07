import crypto from 'node:crypto';
import path from 'node:path';

// Signed request descriptors bind these exact creation bodies. The dispatcher
// compares actual wire values before reserving a create slot or contacting a provider.
export function createWirePlan(spec, provider, model) {
  const refs = spec.referenceViews ? ['front', 'left', 'back', 'right'].map((view) => spec.referenceViews[view]).filter(Boolean) : (spec.referenceImages ?? []);
  const json = (url, body, taskBinding) => ({ url, bodyType: 'JSON', body, ...(taskBinding ? { taskBinding } : {}) });
  if (provider === 'meshy') {
    if (refs.length > 1) return [json('https://api.meshy.ai/openapi/v1/multi-image-to-3d', { image_urls: refs.slice(0, 4), ai_model: model, geometry_resolution: '2k', should_texture: true, enable_pbr: spec.target.pbr, topology: 'triangle', target_polycount: spec.target.maxTriangles, target_formats: ['glb'] })];
    if (refs.length === 1) return [json('https://api.meshy.ai/openapi/v1/image-to-3d', { image_url: refs[0], ai_model: model, geometry_resolution: '4k', enable_pbr: spec.target.pbr, should_remesh: false, should_texture: true, target_formats: ['glb'] })];
    return [
      json('https://api.meshy.ai/openapi/v2/text-to-3d', { mode: 'preview', prompt: spec.prompt, ai_model: model, geometry_resolution: '4k', should_remesh: false, target_formats: ['glb'] }),
      json('https://api.meshy.ai/openapi/v2/text-to-3d', { mode: 'refine', preview_task_id: null, enable_pbr: spec.target.pbr, texture_resolution: spec.target.textureResolution, target_formats: ['glb'] }, { field: 'preview_task_id', operationIndex: 0 }),
    ];
  }
  if (provider === 'tripo') {
    if (refs.length) throw new Error('Tripo immutable reference-upload admission remains unavailable');
    return [json('https://api.tripo3d.ai/v2/openapi/task', { type: 'text_to_model', prompt: spec.prompt.slice(0, 1024), model_version: model, texture: true, pbr: spec.target.pbr, texture_quality: spec.target.textureResolution === '8k' ? 'extreme' : 'detailed', geometry_quality: 'detailed', face_limit: spec.target.maxTriangles, auto_size: true, ...(spec.generation.seed === null ? {} : { model_seed: spec.generation.seed, texture_seed: spec.generation.seed }) })];
  }
  if (provider === 'rodin') {
    const parts = [];
    for (const ref of refs.slice(0, 5)) {
      const bytes = spec.verifiedLocalReferences?.get(ref);
      if (!bytes) throw new Error('Rodin wire plan requires frozen actual reference bytes');
      const ext = path.extname(ref).toLowerCase();
      const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      parts.push(['images', { name: path.basename(ref), type, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }]);
    }
    if (!refs.length) parts.push(['prompt', spec.prompt]);
    parts.push(['tier', model], ['mesh_mode', 'Raw'], ['quality_override', String(spec.target.maxTriangles)], ['geometry_file_format', 'glb'], ['material', spec.target.pbr ? 'PBR' : 'Shaded'], ['texture_mode', spec.target.textureResolution === '8k' ? 'high' : 'medium']);
    if (['4k', '8k'].includes(spec.target.textureResolution)) parts.push(['addons', 'HighPack']);
    if (spec.generation.seed !== null) parts.push(['seed', String(spec.generation.seed % 65536)]);
    parts.push(['is_symmetric', 'asymmetric']);
    return [{ url: 'https://api.hyper3d.com/api/v2/rodin', bodyType: 'FORM', body: parts }];
  }
  if (provider === 'replicate') {
    if (refs.length) throw new Error('Replicate immutable reference-upload admission remains unavailable');
    return [json(`https://api.replicate.com/v1/models/${model}/predictions`, { input: { enable_pbr: spec.target.pbr, face_count: Math.max(40000, Math.min(1500000, spec.target.maxTriangles)), generate_type: 'Normal', prompt: spec.prompt.slice(0, 1024) } })];
  }
  throw new Error('Unsupported protected create provider');
}
