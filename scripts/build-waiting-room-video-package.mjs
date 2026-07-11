import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const studioRoot = path.join(root, 'assetfactory-studio');
const typescriptPath = path.join(studioRoot, 'node_modules', 'typescript', 'lib', 'typescript.js');

function usage() {
  console.error('Usage: node scripts/build-waiting-room-video-package.mjs <animatic-file> <output-dir> [options-file] [--force]');
}

const positional = process.argv.slice(2).filter((arg) => arg !== '--force');
const force = process.argv.includes('--force');
if (positional.length < 2 || positional.length > 3) {
  usage();
  process.exit(2);
}

const [animaticFile, outputDir, optionsFile] = positional.map((value) => path.resolve(process.cwd(), value));
if (!fs.existsSync(animaticFile) || !fs.statSync(animaticFile).isFile()) {
  console.error(`Animatic file not found: ${animaticFile}`);
  process.exit(2);
}
if (optionsFile && (!fs.existsSync(optionsFile) || !fs.statSync(optionsFile).isFile())) {
  console.error(`Options file not found: ${optionsFile}`);
  process.exit(2);
}
if (!fs.existsSync(typescriptPath)) {
  console.error(`Missing TypeScript dependency at ${typescriptPath}. Run npm --prefix assetfactory-studio install first.`);
  process.exit(2);
}

function readJson(fileName, label) {
  try {
    return JSON.parse(fs.readFileSync(fileName, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertSafeFileName(fileName) {
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName) || fileName.includes('..')) {
    throw new Error(`Unsafe package artifact filename: ${fileName}`);
  }
}

const existingEntries = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
if (existingEntries.length > 0 && !force) {
  console.error(`Output directory is not empty: ${outputDir}. Use --force only after reviewing existing artifacts.`);
  process.exit(3);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waiting-room-video-package-'));
const compiledPath = path.join(tmpDir, 'assetVideoPackage.mjs');

try {
  const sourcePath = path.join(studioRoot, 'lib', 'server', 'assetVideoPackage.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: sourcePath,
  }).outputText;
  fs.writeFileSync(compiledPath, output);

  const { buildVideoPackage } = await import(pathToFileURL(compiledPath).href);
  const animatic = readJson(animaticFile, 'Animatic');
  const options = optionsFile ? readJson(optionsFile, 'Options') : {};
  const result = buildVideoPackage(animatic, options);

  fs.mkdirSync(outputDir, { recursive: true });
  for (const artifact of result.artifacts) {
    assertSafeFileName(artifact.fileName);
    const target = path.join(outputDir, artifact.fileName);
    const resolved = path.resolve(target);
    if (!resolved.startsWith(`${path.resolve(outputDir)}${path.sep}`)) {
      throw new Error(`Artifact escaped output directory: ${artifact.fileName}`);
    }
    const temporary = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, artifact.content, { encoding: 'utf8', mode: 0o600 });
    if (fs.existsSync(target) && !force) {
      fs.rmSync(temporary, { force: true });
      throw new Error(`Artifact already exists: ${target}`);
    }
    fs.renameSync(temporary, target);
  }

  console.log(JSON.stringify({
    ok: true,
    jobId: animatic.jobId,
    outputDir,
    artifactCount: result.artifacts.length,
    receiptHash: result.receipt.receiptHash,
    rendered: false,
    providerSpend: false,
  }, null, 2));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}