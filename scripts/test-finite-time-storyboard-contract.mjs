import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

// Execute the actual committed drawing functions and validator. Media tools,
// provider dispatch, filesystem mutation and networking are unavailable here.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const film = join(root, 'film_foundry/finite_time');
const generatorPath = join(film, 'generate-storyboard-v2.mjs');
const validatorPath = join(film, 'validate-storyboard-v2.mjs');
const manifestPath = join(film, 'farm-to-lake.manifest.json');
const editPath = join(film, 'farm-to-lake.edit-plan.v2.json');
const narrationPath = join(film, 'farm-to-lake.narration.v2.txt');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const stripImports = source => source.replace(/^import .+;\r?\n/gm, '');
const prohibited = () => { throw new Error('media/provider/filesystem side effect prohibited'); };

function drawingRuntime({ source = manifest, env = {} } = {}) {
  const program = readFileSync(generatorPath, 'utf8');
  const boundary = program.indexOf('\nrmSync(out,');
  assert.ok(boundary > 0, 'drawing boundary must precede all media/filesystem effects');
  const permitted = new Set([manifestPath, editPath, narrationPath]);
  const read = (path, encoding) => {
    assert.ok(permitted.has(path), `unexpected source read: ${path}`);
    if (path === manifestPath) return encoding ? JSON.stringify(source) : Buffer.from(JSON.stringify(source));
    return readFileSync(path, encoding);
  };
  const context = vm.createContext({
    createHash, dirname, join, resolve, fileURLToPath, Buffer,
    process: { argv: ['node', generatorPath, manifestPath, editPath, narrationPath, '/virtual-output'],
      env: { ASSET_RENDERER_MODE: 'offline', ASSET_FORGE_REQUIRE_PROVIDER: '0', ...env } },
    readFileSync: read, execFileSync: prohibited, spawnSync: prohibited,
    existsSync: prohibited, mkdirSync: prohibited, readdirSync: prohibited,
    rmSync: prohibited, writeFileSync: prohibited, fetch: prohibited,
  });
  const prefix = stripImports(program.slice(0, boundary))
    .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(generatorPath).href));
  new vm.Script(`${prefix}\nglobalThis.contract = { shots, board, svg, timecode };`,
    { filename: generatorPath }).runInContext(context, { timeout: 1000 });
  return context.contract;
}

const drawing = drawingRuntime();
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function validFixture() {
  const files = new Map();
  const put = (name, value) => files.set(name, Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
  let cursor = 0;
  const shots = drawing.shots.map((shot, index) => {
    const timed = { ...shot, startSeconds: cursor, endSeconds: cursor + shot.durationSeconds,
      boardSvg: `frames-svg/${shot.id}.svg`, boardPng: `frames-png/${shot.id}.png` };
    put(timed.boardSvg, drawing.svg(shot, index, cursor));
    // Synthetic size fixture only; no PNG or media acceptance is asserted.
    put(timed.boardPng, 'synthetic-size-fixture'.repeat(1024));
    cursor = timed.endSeconds;
    return timed;
  });
  const srt = property => shots.map((shot, index) =>
    `${index + 1}\n${drawing.timecode(shot.startSeconds)} --> ${drawing.timecode(shot.endSeconds)}\n${shot[property]}\n`).join('\n');
  put('captions.srt', srt('scratchNarration'));
  put('audio-description.srt', srt('audioDescription'));
  put('timeline.json', { schemaVersion: 'finite-time-storyboard-timeline-v2',
    providerSpendAuthorized: false, finalRenderingAuthorized: false, shots });
  put('haptics.json', { cues: shots.flatMap(shot => shot.haptics.map(cue =>
    ({ ...cue, shotId: shot.id, atSeconds: shot.startSeconds + cue.atSeconds }))) });
  put('scratch-narration.wav', 'synthetic-size-fixture');
  put('scratch-mix.wav', 'synthetic-size-fixture');
  put('review-gallery.html', '30 scene-specific boards');
  put('README.md', 'separate from the audited static-card v1');
  put('sha256sums.txt', 'synthetic test identity only');
  put('receipt.json', { schemaVersion: 'finite-time-no-spend-storyboard-receipt-v2',
    storyboardVersion: 2, sceneSpecificBoards: true, renderMode: 'deterministic-local-proof',
    deterministic: true, providerCallsExecuted: 0, spendUsd: 0, secretsUsed: false,
    networkRequired: false, finalRenderingAuthorized: false, shotCount: 30, sceneCount: 10,
    durationSeconds: 180, distinctDurations: new Set(shots.map(shot => shot.durationSeconds)).size,
    scratchNarrationLabel: 'timing-only-not-approved', temporaryAmbienceFoleyGenerated: true,
    captionsGenerated: true, audioDescriptionGenerated: true, hapticsGenerated: true,
    reviewGalleryGenerated: true, scratchNarrationGenerated: false, mp4Generated: false,
    contactSheetGenerated: false, fileHashes: { 'captions.srt': digest(files.get('captions.srt')) } });
  return files;
}

function validate(files) {
  const output = '/virtual-output';
  const key = path => relative(output, path).split('\\').join('/');
  const get = path => {
    const value = files.get(key(path));
    assert.ok(value, `fixture missing ${key(path)}`);
    return value;
  };
  const context = vm.createContext({ assert, createHash, join, resolve,
    process: { argv: ['node', validatorPath, output] },
    readFileSync: (path, encoding) => encoding ? get(path).toString(encoding) : get(path),
    existsSync: path => files.has(key(path)), statSync: path => ({ size: get(path).length }),
    fixtureDirectoryEntries: path => [...files.keys()].filter(name => name.startsWith(`${key(path)}/`))
      .map(name => name.slice(key(path).length + 1)).filter(name => !name.includes('/')),
    console: { log() {} }, fetch: prohibited,
  });
  // Node's real fs arrays share the consumer realm. Recreate that boundary in
  // the VM instead of changing the production validator's deep comparisons.
  new vm.Script('globalThis.readdirSync = path => JSON.parse(JSON.stringify(fixtureDirectoryEntries(path)));')
    .runInContext(context, { timeout: 1000 });
  new vm.Script(stripImports(readFileSync(validatorPath, 'utf8')), { filename: validatorPath })
    .runInContext(context, { timeout: 1000 });
}

function editJson(files, path, fn) {
  const value = JSON.parse(files.get(path));
  fn(value);
  files.set(path, Buffer.from(JSON.stringify(value)));
}

for (const [index, shot] of drawing.shots.entries()) {
  test(`${shot.id} draws actual scene-specific geometry`, () => {
    assert.ok(drawing.board(shot, index).trim(), `${shot.sceneId} must draw`);
    const svg = drawing.svg(shot, index, 0);
    assert.ok((svg.match(/<(?:line|path|circle|ellipse|rect)\b/g) ?? []).length >= 3);
    assert.ok(svg.includes(shot.id));
  });
}

const sequence = [
  ['ft-fl-021', ['SCHOOL', 'DROP-OFF · DRIVE AWAY'], ['AFTER BOOT CAMP']],
  ['ft-fl-022', ['AFTER BOOT CAMP · BIGGER / STRONGER', 'LEAVING FOR SCHOOL'], ['DEAD SNAKE · SHOE']],
  ['ft-fl-023', ['DEAD SNAKE · SHOE'], ['COULD NOT. TRIED ANYWAY.']],
  ['ft-fl-024', ['COULD NOT. TRIED ANYWAY.'], []],
];
for (const [id, required, forbidden] of sequence) {
  test(`${id} preserves the actual canonical action sequence`, () => {
    const index = drawing.shots.findIndex(shot => shot.id === id);
    const svg = drawing.svg(drawing.shots[index], index, 0);
    for (const value of required) assert.ok(svg.includes(value), `${id} missing ${value}`);
    for (const value of forbidden) assert.ok(!svg.includes(value), `${id} contains stale ${value}`);
  });
}
test('unknown scene cannot emit a blank storyboard', () => {
  assert.throws(() => drawing.svg({ ...drawing.shots[0], sceneId: 'unknown-scene' }, 0, 0), /missing storyboard board/);
});
test('SVG title and narration remain escaped text', () => {
  const svg = drawing.svg({ ...drawing.shots[0], title: '<script>&"', scratchNarration: '<foreignObject>&' }, 0, 0);
  assert.ok(svg.includes('&lt;script&gt;&amp;&quot;'));
  assert.ok(svg.includes('&lt;foreignObject&gt;&amp;'));
  assert.ok(!svg.includes('<script>') && !svg.includes('<foreignObject>'));
});
test('offline drawing rejects paid source flags', () => {
  assert.throws(() => drawingRuntime({ source: { ...manifest, providerSpendAuthorized: true } }), /authorization must remain false/);
});
test('offline drawing rejects provider mode', () => {
  assert.throws(() => drawingRuntime({ env: { ASSET_RENDERER_MODE: 'provider' } }), /provider mode prohibited/);
});
test('actual validator accepts complete synthetic source-contract fixture', () => validate(validFixture()));

const faults = [
  ['blank drawing', files => files.set('frames-svg/ft-fl-001.svg', Buffer.from(drawing.svg(drawing.shots[0], 0, 0)
    .replace(/<(?:line|path|circle|ellipse|rect)\b[^>]*\/>/g, '')))],
  ['stale action sequence', files => files.set('frames-svg/ft-fl-021.svg', Buffer.from(files.get('frames-svg/ft-fl-021.svg')
    .toString().replace('DROP-OFF · DRIVE AWAY', 'AFTER BOOT CAMP')))],
  ['wrong scene sequence', files => editJson(files, 'timeline.json', value => { value.shots[21].sceneId = 'scene-school-mornings'; })],
  ['duplicate shot identity', files => editJson(files, 'timeline.json', value => { value.shots[1].id = value.shots[0].id; })],
  ['timeline gap', files => editJson(files, 'timeline.json', value => { value.shots[1].startSeconds += 1; })],
  ['caption timing drift', files => files.set('captions.srt', Buffer.from(files.get('captions.srt').toString().replace('00:00:00,000', '00:00:01,000')))],
  ['audio-description text drift', files => files.set('audio-description.srt', Buffer.from(files.get('audio-description.srt').toString().replace(manifest.shots[0].audioDescription, 'incorrect description')))],
  ['incomplete captions', files => files.set('captions.srt', Buffer.from('1\n00:00:00,000 --> 00:00:08,000\n'))],
  ['haptic unknown owner shot', files => editJson(files, 'haptics.json', value => { value.cues[0].shotId = 'unknown'; })],
  ['haptic outside owner shot', files => editJson(files, 'haptics.json', value => { value.cues[0].atSeconds = 179; })],
  ['haptic invalid intensity', files => editJson(files, 'haptics.json', value => { value.cues[0].intensity = 2; })],
  ['haptic unsupported pattern', files => editJson(files, 'haptics.json', value => { value.cues[0].pattern = 'unbounded'; })],
  ['duplicate haptic', files => editJson(files, 'haptics.json', value => { value.cues.push({ ...value.cues[0] }); })],
  ['secret-bearing timeline', files => editJson(files, 'timeline.json', value => { value.extra = 'OPENAI_API_KEY'; })],
  ['secret-bearing SVG', files => files.set('frames-svg/ft-fl-001.svg', Buffer.from(`${files.get('frames-svg/ft-fl-001.svg')}sk-proj-secret`))],
  ['missing frame', files => files.delete('frames-png/ft-fl-030.png')],
  ['empty hashed file', files => files.set('captions.srt', Buffer.alloc(0))],
  ['hash mismatch', files => editJson(files, 'receipt.json', value => { value.fileHashes['captions.srt'] = `sha256:${'0'.repeat(64)}`; })],
  ['nonzero provider calls', files => editJson(files, 'receipt.json', value => { value.providerCallsExecuted = 1; })],
  ['nonzero spend', files => editJson(files, 'receipt.json', value => { value.spendUsd = 1; })],
  ['final render authority', files => editJson(files, 'receipt.json', value => { value.finalRenderingAuthorized = true; })],
];
for (const [name, fault] of faults) {
  test(`actual validator rejects ${name}`, () => {
    const fixture = validFixture();
    fault(fixture);
    // Content defects must be rejected by their semantic guard even when a
    // producer consistently rehashes the defective output.
    if (name !== 'hash mismatch' && name !== 'empty hashed file') {
      editJson(fixture, 'receipt.json', receipt => {
        for (const path of Object.keys(receipt.fileHashes)) {
          if (fixture.has(path)) receipt.fileHashes[path] = digest(fixture.get(path));
        }
      });
    }
    assert.throws(() => validate(fixture));
  });
}
