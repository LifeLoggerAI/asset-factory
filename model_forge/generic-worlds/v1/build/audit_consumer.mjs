#!/usr/bin/env node
// Standalone actual GLTFLoader/THREE.LOD audit and four cardinal eye-height views.
// This does not invoke UrAi runtime, a provider, promotion or physical devices.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = {};
for (let i = 2; i < process.argv.length; i += 2) flags[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!flags.tools || !flags.browser || !flags.playwright || !flags.report) {
  throw Error('Usage: node audit_consumer.mjs --tools /abs/node_modules --browser /abs/chromium --playwright /abs/playwright --report /abs/new/receipt.json [--version 1.0.3]');
}
const output = path.resolve(flags.report);
if (fs.existsSync(output)) throw Error('Receipt exists; choose a new immutable path');
const version = flags.version || '1.0.3';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const require = createRequire(import.meta.url);
const {chromium} = require(flags.playwright);
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png'};
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const base = pathname.startsWith('/three/') ? path.join(flags.tools, 'three') : root;
    const relative = pathname.startsWith('/three/') ? pathname.slice(7) : pathname === '/' ? 'build/review.html' : pathname.slice(1);
    const target = path.resolve(base, relative);
    if (!target.startsWith(base + path.sep) || !fs.statSync(target).isFile()) throw Error('invalid path');
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    fs.createReadStream(target).pipe(res);
  } catch {res.statusCode = 404; res.end('unavailable');}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const worlds = [];
try {
  browser = await chromium.launch({executablePath: flags.browser, headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']});
  const page = await browser.newPage({viewport: {width: 1200, height: 800}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready === true, {timeout: 60000});
  for (const id of fs.readdirSync(path.join(root, 'packages')).sort()) {
    const dir = path.join(root, 'packages', id, version);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    const urls = [0, 1, 2].map(level => `/packages/${id}/${version}/lod${level}.glb`);
    const sourceHashes = urls.map((_, level) => hash(path.join(dir, `lod${level}.glb`)));
    const imported = await page.evaluate(async ({urls, profiles}) => {
      const THREE = await import('three');
      const {GLTFLoader} = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const lod = new THREE.LOD();
      const scene = new THREE.Scene();
      const geometries = new Set(), materials = new Set(), textures = new Set();
      const imports = [];
      for (let level = 0; level < urls.length; level++) {
        const asset = await loader.loadAsync(urls[level]);
        asset.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(asset.scene);
        const expected = profiles[['desktop', 'xr', 'mobile'][level]].measuredStatic.bounds;
        const actual = {min: bounds.min.toArray(), max: bounds.max.toArray()};
        if (['min', 'max'].some(key => actual[key].some((value, axis) => Math.abs(value - expected[key][axis]) > 1e-4))) {
          throw Error('Imported bounds disagree with manifest: ' + urls[level]);
        }
        let meshCount = 0;
        asset.scene.traverse(object => {
          if (!object.isMesh) return;
          meshCount++; geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
          }
        });
        if (!meshCount) throw Error('Actual import has no render geometry');
        imports.push({level, url: urls[level], bounds: actual, meshCount});
        lod.addLevel(asset.scene, [0, 12, 28][level]);
      }
      scene.add(lod); scene.updateMatrixWorld(true);
      const camera = new THREE.PerspectiveCamera(60, 1, .035, 150);
      const renderer = new THREE.WebGLRenderer({antialias: false});
      renderer.setSize(256, 256);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
      const selection = [];
      try {
        for (const [distance, expected] of [[5, 0], [20, 1], [35, 2], [20, 1], [5, 0]]) {
          camera.position.set(0, 1.69, distance); camera.lookAt(0, 1.69, 0); camera.updateMatrixWorld();
          lod.update(camera);
          const visible = lod.levels.map((level, index) => level.object.visible ? index : -1).filter(index => index >= 0);
          if (visible.length !== 1 || visible[0] !== expected) throw Error('LOD switch or switch-back failed');
          renderer.render(scene, camera); renderer.getContext().finish();
          selection.push({distanceMeters: distance, level: visible[0], renderCalls: renderer.info.render.calls});
        }
        if (!selection.some(step => step.renderCalls > 0)) throw Error('LOD rendered no geometry');
        return {imports, selection, actualRendered: true, geometries: geometries.size, materials: materials.size, textures: textures.size};
      } finally {
        for (const texture of textures) {texture.dispose(); texture.image?.close?.();}
        for (const material of materials) material.dispose();
        for (const geometry of geometries) geometry.dispose();
        renderer.dispose(); renderer.forceContextLoss();
      }
    }, {urls, profiles: manifest.profiles});
    const nav = JSON.parse(fs.readFileSync(path.join(dir, 'navigation.json')));
    const center = nav.teleportZones[0].position;
    const eye = [center[0], center[1] + 1.69, center[2]];
    const directions = {front: [0, 0, -1], rear: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0]};
    const shotdir = path.join(dir, 'directional-previews');
    fs.mkdirSync(shotdir, {recursive: false});
    const shots = [];
    for (const [name, direction] of Object.entries(directions)) {
      const camera = {position: eye, target: eye.map((value, index) => value + direction[index] * 4), fov: 64, cutaway: false};
      const performance = await page.evaluate(async options => window.renderScene(options),
        {url: urls[0], camera, id, profile: 'desktop'});
      if (errors.length) throw Error(errors.join('\n'));
      const file = path.join(shotdir, `${name}.png`);
      await page.screenshot({path: file});
      shots.push({direction: name, path: path.relative(dir, file), bytes: fs.statSync(file).size,
        sha256: hash(file), sourceGlbSha256: sourceHashes[0], camera, performance});
    }
    worlds.push({id, version, manifestSha256: hash(manifestPath), sourceHashes, ...imported, directionalShots: shots,
      coordinateSelection: {units: 'meters', up: '+Y', assetFront: '+Z', cameraForward: '-Z', geometryAxisConversionApplied: false,
        canonicalForwardRole: 'UNSELECTED', eyeHeightMeters: 1.69, eyeHeightRole: 'Explicit standalone review variant only'},
      runtimeIntegrated: false, visualAccepted: false, physicalDeviceTested: false});
    console.log(JSON.stringify({id, imports: imported.imports.length, lodSteps: imported.selection.length, directionalShots: shots.length}));
  }
  const result = {schemaVersion: 'urai-generic-standalone-consumer-audit-v1', observedAt: new Date().toISOString(),
    auditSourceSha256: hash(fileURLToPath(import.meta.url)), reviewHarnessSha256: hash(path.join(root, 'build/review.html')),
    threeVersion: JSON.parse(fs.readFileSync(path.join(flags.tools, 'three/package.json'))).version,
    browserVersion: await browser.version(), browserRole: 'Supplemental local Chromium; not standard managed browser or device certification',
    worlds, totalImports: worlds.reduce((n, world) => n + world.imports.length, 0),
    totalLodSelectionSteps: worlds.reduce((n, world) => n + world.selection.length, 0),
    totalDirectionalShots: worlds.reduce((n, world) => n + world.directionalShots.length, 0),
    passed: worlds.length > 0 && errors.length === 0, runtimeIntegrated: false, visualAccepted: false,
    physicalDeviceTested: false, independentApproval: false,
    scope: 'Actual standalone GLTFLoader imports, declared bounds, Three.js distance LOD and shader rendering; four non-cutaway review directions. No UrAi consumer binding or complete G8/human approval.'};
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
} finally {
  if (browser) await browser.close();
  server.close();
}
