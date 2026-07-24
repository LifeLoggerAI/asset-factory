import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(process.argv[2] ?? join(here, 'farm-to-lake.manifest.json'));
const outputDir = resolve(process.argv[3] ?? join(here, 'dist', 'farm-to-lake'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function fail(message) { throw new Error(`FINITE TIME no-spend animatic: ${message}`); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function xml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]); }
function wrap(value, width = 48) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width && line) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}
function srtTime(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
function scenePalette(sceneId) {
  const digest = hash(sceneId);
  const base = parseInt(digest.slice(0, 6), 16);
  const r = 20 + (base & 0x3f);
  const g = 24 + ((base >> 6) & 0x4f);
  const b = 30 + ((base >> 13) & 0x5f);
  const accent = [Math.min(235, r + 90), Math.min(235, g + 80), Math.min(235, b + 70)];
  return { base: `rgb(${r},${g},${b})`, accent: `rgb(${accent.join(',')})` };
}
function iconFor(shot, accent) {
  const x = 640;
  if (shot.sceneId.includes('cow')) return `<path d="M430 430 C480 350 570 350 620 420 C680 350 780 360 830 435 L790 500 L480 500 Z" fill="none" stroke="${accent}" stroke-width="10"/><circle cx="520" cy="410" r="16" fill="${accent}"/><circle cx="742" cy="414" r="16" fill="${accent}"/>`;
  if (shot.sceneId.includes('digital')) return `<rect x="420" y="245" width="440" height="300" rx="20" fill="none" stroke="${accent}" stroke-width="10"/><circle cx="640" cy="390" r="92" fill="none" stroke="${accent}" stroke-width="8"/><path d="M640 300 L690 390 L640 480 L590 390 Z" fill="none" stroke="${accent}" stroke-width="7"/>`;
  if (shot.sceneId.includes('school')) return `<path d="M390 470 L450 360 L800 360 L875 470 Z" fill="none" stroke="${accent}" stroke-width="10"/><circle cx="500" cy="485" r="48" fill="none" stroke="${accent}" stroke-width="10"/><circle cx="770" cy="485" r="48" fill="none" stroke="${accent}" stroke-width="10"/>`;
  if (shot.sceneId.includes('snake')) return `<path d="M390 400 C470 300 560 500 650 390 C735 285 820 475 885 360" fill="none" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`;
  if (shot.sceneId.includes('lake') || shot.sceneId.includes('ski')) return `<path d="M250 470 Q400 410 550 470 T850 470 T1130 470" fill="none" stroke="${accent}" stroke-width="12"/><path d="M465 400 L545 330 L785 330 L855 400 Z" fill="none" stroke="${accent}" stroke-width="10"/>`;
  if (shot.sceneId.includes('cat')) return `<path d="M510 470 Q520 335 640 350 Q760 335 770 470 Z" fill="none" stroke="${accent}" stroke-width="10"/><path d="M545 365 L510 290 L590 340 M735 365 L770 290 L690 340" fill="none" stroke="${accent}" stroke-width="10"/>`;
  if (shot.sceneId.includes('family')) return `<path d="M420 500 L420 350 L640 220 L860 350 L860 500 Z" fill="none" stroke="${accent}" stroke-width="10"/><rect x="585" y="390" width="110" height="110" fill="none" stroke="${accent}" stroke-width="8"/>`;
  return `<path d="M250 500 L430 390 L560 450 L710 300 L1030 500 Z" fill="none" stroke="${accent}" stroke-width="10"/><circle cx="835" cy="235" r="58" fill="none" stroke="${accent}" stroke-width="9"/>`;
}
function svgFor(shot, index) {
  const { base, accent } = scenePalette(shot.sceneId);
  const title = wrap(shot.title, 34);
  const visual = wrap(shot.visual, 58);
  const caption = wrap(shot.caption, 66);
  const textLines = (lines, x, y, size, gap, opacity = 1) => lines.map((line, lineIndex) => `<text x="${x}" y="${y + lineIndex * gap}" fill="white" opacity="${opacity}" font-family="Arial, sans-serif" font-size="${size}" text-anchor="middle">${xml(line)}</text>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#05070d"/><stop offset="1" stop-color="${base}"/></linearGradient><radialGradient id="glow"><stop offset="0" stop-color="${accent}" stop-opacity=".22"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="1280" height="720" fill="url(#bg)"/><circle cx="640" cy="380" r="360" fill="url(#glow)"/>
<text x="64" y="72" fill="white" opacity=".68" font-family="Arial, sans-serif" font-size="22">FINITE TIME · FARM TO LAKE · DETERMINISTIC ANIMATIC</text>
<text x="1216" y="72" fill="white" opacity=".68" font-family="Arial, sans-serif" font-size="22" text-anchor="end">${String(index + 1).padStart(2, '0')} / ${manifest.shots.length}</text>
${iconFor(shot, accent)}
${textLines(title, 640, 130, 46, 50)}
${textLines(visual, 640, 585, 25, 31, .82)}
<rect x="90" y="632" width="1100" height="58" rx="20" fill="#000" opacity=".62"/>
${textLines(caption, 640, 669, 25, 28)}
<text x="64" y="704" fill="white" opacity=".48" font-family="Arial, sans-serif" font-size="14">${xml(shot.id)} · ${xml(shot.sceneId)} · no provider · $0 spend · final rendering not authorized</text>
</svg>`;
}
function writeWav(path, seconds, shots) {
  const sampleRate = 48_000;
  const channels = 2;
  const bits = 16;
  const samples = Math.floor(sampleRate * seconds);
  const dataBytes = samples * channels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * channels * bits / 8, 28); buffer.writeUInt16LE(channels * bits / 8, 32); buffer.writeUInt16LE(bits, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    const time = i / sampleRate;
    const shotIndex = Math.min(shots.length - 1, Math.floor(time / 6));
    const sceneSeed = parseInt(hash(shots[shotIndex].sceneId).slice(0, 4), 16);
    const frequency = 82 + (sceneSeed % 90);
    const local = time % 6;
    const fade = Math.min(1, local / .6, (6 - local) / .6);
    const value = Math.round(Math.sin(2 * Math.PI * frequency * time) * 900 * Math.max(0, fade));
    buffer.writeInt16LE(value, offset); buffer.writeInt16LE(value, offset + 2); offset += 4;
  }
  writeFileSync(path, buffer);
}

if (manifest.schemaVersion !== 'finite-time-no-spend-animatic-v1') fail('unsupported manifest schema');
if (manifest.renderMode !== 'deterministic-local-proof') fail('renderMode must be deterministic-local-proof');
if (manifest.providerSpendAuthorized !== false || manifest.finalRenderingAuthorized !== false) fail('provider spend and final rendering must remain unauthorized');
if (process.env.ASSET_RENDERER_MODE === 'provider' || process.env.ASSET_FORGE_REQUIRE_PROVIDER === '1') fail('provider environment is prohibited');
if (manifest.shots.length !== 30) fail(`expected 30 shots, received ${manifest.shots.length}`);
const duration = manifest.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
if (duration !== manifest.targetDurationSeconds || duration !== 180) fail(`duration must be 180 seconds, received ${duration}`);
const ids = manifest.shots.map((shot) => shot.id);
if (new Set(ids).size !== ids.length) fail('shot IDs must be unique');
ids.forEach((id, index) => { if (id !== `ft-fl-${String(index + 1).padStart(3, '0')}`) fail(`unexpected shot order at ${id}`); });

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(join(outputDir, 'frames'), { recursive: true });
const concat = [];
const captions = [];
const descriptions = [];
const haptics = [];
let cursor = 0;
manifest.shots.forEach((shot, index) => {
  const frameName = `${shot.id}.svg`;
  writeFileSync(join(outputDir, 'frames', frameName), svgFor(shot, index));
  concat.push(`file '${join('frames', frameName).replaceAll("'", "'\\''")}'`, `duration ${shot.durationSeconds}`);
  captions.push(`${index + 1}\n${srtTime(cursor)} --> ${srtTime(cursor + shot.durationSeconds)}\n${shot.caption}\n`);
  descriptions.push(`[${srtTime(cursor).replace(',', '.')}] ${shot.id} — ${shot.audioDescription}`);
  for (const cue of shot.haptics) haptics.push({ shotId: shot.id, atSeconds: cursor + cue.atSeconds, pattern: cue.pattern, intensity: cue.intensity });
  cursor += shot.durationSeconds;
});
concat.push(`file '${join('frames', `${manifest.shots.at(-1).id}.svg`)}'`);
writeFileSync(join(outputDir, 'frames.ffconcat'), `ffconcat version 1.0\n${concat.join('\n')}\n`);
writeFileSync(join(outputDir, 'captions.srt'), captions.join('\n'));
writeFileSync(join(outputDir, 'audio-description.txt'), `${descriptions.join('\n')}\n`);
writeFileSync(join(outputDir, 'haptics.json'), `${JSON.stringify({ schemaVersion: 'finite-time-haptics-v1', cues: haptics }, null, 2)}\n`);
writeFileSync(join(outputDir, 'timeline.json'), `${JSON.stringify({ ...manifest, generatedAt: 'deterministic', providerCallsExecuted: 0, spendUsd: 0 }, null, 2)}\n`);
writeWav(join(outputDir, 'temp-score.wav'), duration, manifest.shots);
const gallery = manifest.shots.map((shot) => `<figure><img src="frames/${shot.id}.svg" alt="${xml(shot.audioDescription)}"><figcaption><strong>${shot.id} — ${xml(shot.title)}</strong><br>${xml(shot.caption)}</figcaption></figure>`).join('\n');
writeFileSync(join(outputDir, 'review-gallery.html'), `<!doctype html><html><head><meta charset="utf-8"><title>FINITE TIME Farm-to-Lake animatic</title><style>body{margin:0;background:#080b12;color:#fff;font:16px system-ui}main{max-width:1200px;margin:auto;padding:24px}figure{margin:0 0 36px}img{width:100%;border:1px solid #344;border-radius:14px}figcaption{padding:10px 2px;color:#dce4ef}</style></head><body><main><h1>FINITE TIME — Farm to Lake</h1><p>Deterministic no-spend animatic · 30 shots · 180 seconds · final rendering not authorized.</p>${gallery}</main></body></html>`);

let mp4Generated = false;
const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
if (ffmpeg.status === 0) {
  execFileSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', join(outputDir, 'frames.ffconcat'),
    '-i', join(outputDir, 'temp-score.wav'), '-vf', 'fps=24,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', join(outputDir, 'farm-to-lake-animatic.mp4')
  ], { stdio: 'inherit', cwd: outputDir });
  mp4Generated = existsSync(join(outputDir, 'farm-to-lake-animatic.mp4'));
}

const files = ['captions.srt', 'audio-description.txt', 'haptics.json', 'timeline.json', 'temp-score.wav', 'review-gallery.html'];
if (mp4Generated) files.push('farm-to-lake-animatic.mp4');
const fileHashes = Object.fromEntries(files.map((file) => [file, `sha256:${hash(readFileSync(join(outputDir, file)))}`]));
const receipt = {
  schemaVersion: 'finite-time-no-spend-receipt-v1',
  projectId: manifest.projectId,
  chapterId: manifest.chapterId,
  manifestHash: `sha256:${hash(readFileSync(manifestPath))}`,
  shotCount: manifest.shots.length,
  sceneCount: new Set(manifest.shots.map((shot) => shot.sceneId)).size,
  durationSeconds: duration,
  renderMode: manifest.renderMode,
  deterministic: true,
  providerCallsExecuted: 0,
  spendUsd: 0,
  secretsUsed: false,
  networkRequired: false,
  finalRenderingAuthorized: false,
  mp4Generated,
  fileHashes
};
writeFileSync(join(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
