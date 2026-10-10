// Exact literal Next consumer comparisons; no account/provider/release authority.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
assert.ok(process.env.URAI_GLOB_BASELINE_ROOT, 'Exact upstream comparison tools are required');
const baseline = createRequire(path.join(process.env.URAI_GLOB_BASELINE_ROOT, 'package.json'));
const probe = process.env.URAI_GLOB_REPLACEMENT_PROBE_ROOT;
const current = createRequire(path.join(probe || root, probe ? 'package.json' : 'assetfactory-studio/package.json'));
const baselinePath = baseline.resolve('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
const currentPath = current.resolve('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
const helperPath = path.join(path.dirname(currentPath), 'urai-next-root-glob.js');
const before = baseline(baselinePath).getRootDirs;
const after = current(currentPath).getRootDirs;
const helperSource = fs.readFileSync(helperPath, 'utf8');
const helperRequire = createRequire(helperPath);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const expectedDependencies = {'@nodelib/fs.walk': '1.2.8', 'brace-expansion': '5.0.12', 'glob-parent': '5.1.2', picomatch: '2.3.2'};
const regression = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/factory-next-root-pattern-regressions.json'), 'utf8'));
const receipt = {schemaVersion: 'urai-next-root-dirs-exact-differential-v1', node: process.version,
  upstreamNext: '16.3.8', upstreamFastGlob: '3.3.1',
  upstreamLiteralSha256: sha256(fs.readFileSync(baselinePath)), currentLiteralSha256: sha256(fs.readFileSync(currentPath)),
  helperSha256: sha256(helperSource), dependencies: expectedDependencies,
  orderedDirectoryCases: 0, expansionCases: 0, resourceCases: 0, fixedExpectedCases: 0, filesystemCaseSensitive: null,
  scope: probe ? 'selected-package source comparison; not a whole installed workspace' : 'actual installed candidate consumers; full graph/advisory acceptance is separate',
  humanIndependentAcceptance: false, productionAcceptance: false, providerCallsExecuted: 0};
function observe(fn, value) {
  try { return [...fn(value)]; } catch (error) { return {error: error.name, message: error.message}; }
}
function fixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-next-exact-'));
  const previous = process.cwd();
  try {
    const caseProbe = path.join(dir, '.urai-case-probe');
    const caseAlias = path.join(dir, '.URAI-CASE-PROBE');
    fs.writeFileSync(caseProbe, 'fixture filesystem identity');
    const caseSensitive = !fs.existsSync(caseAlias);
    if (!caseSensitive) {
      const original = fs.statSync(caseProbe), alias = fs.statSync(caseAlias);
      assert.equal(alias.dev, original.dev); assert.equal(alias.ino, original.ino);
    }
    fs.unlinkSync(caseProbe);
    if (receipt.filesystemCaseSensitive !== null) assert.equal(caseSensitive, receipt.filesystemCaseSensitive);
    receipt.filesystemCaseSensitive = caseSensitive;
    const names = ['web','admin','api','.hidden','unicodé','01','02','03','literal{directory}','a,b','c','"a','b"',"'a","b'",'0','1','2','3','-1','-2','-3','{-3..+3}','a','z','_','Z','b','λ','μ','ν','001','002','003','-01','-02','-03','-001','-002','-003','+1','+2','+3','a,{b,c}','a{b,c}','ab,cd','web:admin','true','__proto__','constructor','toString'];
    for (const name of names) fs.mkdirSync(path.join(dir, 'apps', name), {recursive: true});
    for (const name of ['apps/web/child','apps/admin/nested/deep','apps/.hidden/sub']) fs.mkdirSync(path.join(dir, name), {recursive: true});
    fs.symlinkSync(path.join(dir, 'apps/missing'), path.join(dir, 'apps/broken-symlink'), 'dir');
    fs.symlinkSync(path.join(dir, 'apps/web'), path.join(dir, 'apps/symlink-web'), 'dir');
    fs.writeFileSync(path.join(dir, 'apps/not-a-directory.js'), 'fixture');
    const upper = fs.statSync(path.join(dir, 'apps/Z')), lower = fs.statSync(path.join(dir, 'apps/z'));
    assert.equal(upper.dev, lower.dev);
    if (caseSensitive) assert.notEqual(upper.ino, lower.ino);
    else {
      assert.equal(upper.ino, lower.ino);
      const actualNames = fs.readdirSync(path.join(dir, 'apps'));
      assert.ok(actualNames.includes('z')); assert.ok(!actualNames.includes('Z'));
    }
    process.chdir(dir); callback(dir, caseSensitive);
  } finally {process.chdir(previous); fs.rmSync(dir, {recursive: true, force: true});}
}
test('the real literal Next helper uses exact maintained directory-only dependencies', () => {
  assert.equal(receipt.upstreamLiteralSha256, '886677432990a735e5ebdfb345ff1cbd40e264f9947a8432eeeb254b3a926bde');
  assert.equal(regression.upstreamLiteralSha256, receipt.upstreamLiteralSha256);
  assert.equal(baseline('@next/eslint-plugin-next/package.json').version, '16.3.8');
  assert.equal(current('@next/eslint-plugin-next/package.json').version, '16.3.8');
  assert.equal(baseline('fast-glob/package.json').version, '3.3.1');
  for (const [name, version] of Object.entries(expectedDependencies)) {
    const manifest = helperRequire(name + '/package.json');
    assert.equal(manifest.name, name); assert.equal(manifest.version, version);
  }
  assert.ok(!/require\(["'](?:glob(?:\/raw)?|braces|micromatch|fast-glob)["']\)/.test(helperSource));
});
test('actual Next literal roots preserve every selected directory, exact path and task/filesystem order', () => fixture(dir => {
  const a = path.join(dir, 'apps'), parentApps = `../${path.basename(dir)}/apps`;
  const patterns = [undefined,null,false,{unsupported:true},'.','./','apps','apps/','apps/web','./apps/web','apps/web/','apps/*','./apps/*','apps/*/','apps/**','apps/**/','apps/**/child','apps/{web,admin}','apps/{admin,web}','apps/{web,*}','apps/{*,web}','apps/{web,admin}/','apps/{01..03}','apps/{0{1,2},03}','apps/@(web|api)','apps/!(web)','apps/missing*','!apps/web','apps/.hidden','apps/symlink-web','apps/literal{directory}',`${a}/*`,`${a}/**`,`${a}/{web,admin}`,`${a}/@(web|api)`,`${a}/web/`,`${a}\\{web,admin}`,['apps/web',false,'apps/admin','apps/web/'],[`${a}/web`,{},`${a}/admin`,null],'apps/{"a,b",c}',"apps/{'a,b',c}",'apps/{-3..+3}','apps/{a..Z}','apps/{a,}','apps/{,}','apps/{a,{b,c}}','apps/{a,b}{c,d}','apps/{a..z..3}','apps/{01..-03}','apps/{-03..01}','apps/{a,b,c}','apps/{a,{b,c}d,e}','apps/\\{a,b\\}','apps/${a,b}','apps/${x}/*','apps/{{a,b}}','apps/{x{a,b}y}','apps/{0..9..2}','apps/{3..1}','apps/{a..c}','apps/{a,b}}','apps/{{a,b}','apps/{a,b}.js','apps/{a\\,b,c}','apps/{}','{a,b}','{a,,b}',
    '', '/', '**', '**/', './**', './**/', '*', '*/', './*', './*/', [], ['apps/*','apps/web','apps/*'], ['apps/admin','apps/web','apps/admin'],
    'apps/.','apps/./','./apps/.','apps/./*','apps//*/','apps///web/','apps/broken-symlink','apps/not-a-directory.js','apps/not-a-directory.js/*',
    `${parentApps}/*`,`./${parentApps}/*`,`${parentApps}/**/`,`${parentApps}/{web,admin}`,`${parentApps}/web/`,
    `${a}/.`,`${a}/**/`,`${a}/./*`,`/${a}/*`,`./${parentApps}/@(web|admin)`,
    'apps/**/*','apps/**/.','apps/*/**','apps/*/**/','apps/!(web)/**','apps/!(web)/**/','apps/@(web|admin)/**/','apps/**/!(web)',
    'apps/[a-c]*','apps/[!a-c]*','apps/[^w]*','apps/(web|admin)','apps/+(web|admin)','apps/?(web|admin)','apps/*(web|admin)',
    'apps/{+1..+3}','apps/{+01..+03}','apps/{1..+03}','apps/{-03..+01}','apps/{01..03..02}','apps/{-001..003..2}',
    'apps/{λ..ν}','apps/{ν..λ}','apps/{1..a}','apps/{a..1..8}','apps/{01..a}','apps/{web,admin}/{,}','apps/{{web},admin}',
    'apps/{"a,{b,c}",web}',"apps/{'a,{b,c}',web}",'apps/{a"b,c"d,c}',"apps/{a'b,c'd,c}",'apps/{"web",admin}',
    'apps/{"web"}','apps/{web,"admin"}/','apps/"web"','apps/{"a,b",{web,admin}}','apps/{{"a,b",web},admin}',
    'apps/{"a{b,c}",web}','apps/{"a,b",web}/*','apps/{a,b}','apps/{,web,}','apps/{,web}/','apps/{web,}/child',
    'apps/{web,admin}/*','apps/{web,admin}/**/','apps/{*,web}/child','apps/{web,**}','apps/{**,web}',
    'apps/{web:admin}','apps/{$a,web}','apps/${web,admin}','apps/${x}/{web,admin}','apps/{__proto__,web}','apps/{constructor,web}','apps/{toString,web}',
    'apps/{web,admin,web}','apps/{w{e,e}b,admin}', ['apps/{web,*}','apps/{admin,web}'], [false,'apps/*',null,'apps/web',{}],
    'apps/{a},b}','apps/{1..3..01}','apps/{a..01}','apps/{+1..03}',
    ...regression.boundaryExpansion.map(row => row.pattern)];
  for (const pattern of patterns) {
    const context = {cwd: dir, settings: {next: {rootDir: pattern}}};
    assert.deepEqual(observe(after, context), observe(before, context), JSON.stringify(pattern));
    receipt.orderedDirectoryCases++;
  }
}));
function exposeExpansion() {
  const module = {exports: {}};
  // Expose the private function only in this test's VM memory; installed source
  // bytes/API stay unchanged and still use actual installed dependencies.
  vm.runInNewContext(helperSource + '\nmodule.exports.reviewExpand = expandPatterns;', {module, exports: module.exports, require: helperRequire, Buffer, process}, {filename: helperPath, timeout: 1000});
  return module.exports.reviewExpand;
}
function expectedNegativeWalk(row, caseSensitive) {
  assert.equal(typeof caseSensitive, 'boolean', 'Actual filesystem case identity required');
  assert.ok(Array.isArray(row.expected)); assert.ok(Array.isArray(row.expectedCaseInsensitive));
  // The only declared fixture collision is z/Z. Keep every other literal path,
  // ordering and negative-depth result; never normalize arbitrary output.
  assert.deepEqual(row.expectedCaseInsensitive, row.expected.filter(entry => entry !== 'apps/Z'));
  return caseSensitive ? row.expected : row.expectedCaseInsensitive;
}
test('fixed filesystem expectations retain every original case-sensitive and case-folded path', () => {
  for (const row of regression.negativeWalk) {
    assert.equal(expectedNegativeWalk(row, true), row.expected);
    assert.equal(expectedNegativeWalk(row, false), row.expectedCaseInsensitive);
    assert.throws(() => expectedNegativeWalk(row, undefined), /Actual filesystem case identity/);
    assert.throws(() => expectedNegativeWalk({...row, expectedCaseInsensitive: [...row.expectedCaseInsensitive, 'apps/invented']}, false));
  }
});
test('retained legacy boundary and negative-depth results match exact ordered fixtures', () => {
  fixture((dir, caseSensitive) => {
    for (const row of regression.negativeWalk) {
      const context = {cwd: dir, settings: {next: {rootDir: row.pattern}}};
      const expected = expectedNegativeWalk(row, caseSensitive);
      assert.deepEqual(observe(before, context), expected, 'upstream fixture ' + row.pattern);
      assert.deepEqual(observe(after, context), expected, row.pattern);
      receipt.orderedDirectoryCases++; receipt.fixedExpectedCases++;
    }
  });
  const expand = exposeExpansion(), micromatch = baseline('micromatch');
  for (const row of regression.boundaryExpansion) {
    const original = value => micromatch.braces(value, {expand: true, nodupes: true}).sort((a,b) => a.length - b.length).filter(value => value !== '').map(value => value.replace(/(?!^)\/{2,}/g, '/'));
    assert.deepEqual(observe(original, row.pattern), row.expected, 'upstream fixture ' + row.pattern);
    assert.deepEqual(observe(expand, row.pattern), row.expected, row.pattern);
    receipt.expansionCases++; receipt.fixedExpectedCases++;
  }
});
test('actual private helper expansion matches the upstream bounded numeric, quote and nested-brace mechanics', () => {
  const expand = exposeExpansion(), micromatch = baseline('micromatch');
  const patterns = [], ends = ['1','3','01','03','+1','+3','+01','+03','-1','-3','-01','-03','a','c','Z','λ','ν'];
  for (const a of ends) for (const b of ends) {
    if (!Number.isInteger(Number(a)) || !Number.isInteger(Number(b))) {if (Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) > 150) continue;}
    else if (Math.abs(Number(a) - Number(b)) > 100) continue;
    patterns.push(`apps/{${a}..${b}}`);
  }
  for (const [a,b] of [['1','3'],['01','03'],['a','c'],['a','Z'],['-01','03'],['+01','+03']]) for (const step of ['1','2','01','02','-1','-01','+1','+01','00001']) patterns.push(`apps/{${a}..${b}..${step}}`);
  for (const body of ['a,b','a,','a,,b',',','a,{b,c}','{a,b}','a,{b,c}d,e','"a,b",c',"'a,b',c",'"a{b,c}",d','{a,b},"c,d"','"a..c",d','{a..c},d','{01..a},b']) for (const suffix of ['', '/', '/{x,y}', '{x,y}']) patterns.push(`apps/{${body}}${suffix}`);
  patterns.push('apps/{a,b}}','apps/{{a,b}','apps/{a,b}{c,d}','apps/{a},b}','apps/{}','apps/${a,b}','apps/{$a,b}','apps/{"a,b"}','apps/{a"b,c"d,e}','apps/{a,b}{,}','apps/{a,{b,c}}/{,}','apps/{a,,b}');
  for (const pattern of patterns) {
    const original = micromatch.braces(pattern, {expand: true, nodupes: true}).sort((a,b) => a.length - b.length).filter(value => value !== '').map(value => value.replace(/(?!^)\/{2,}/g, '/'));
    assert.deepEqual(Array.from(expand(pattern)), original, pattern); receipt.expansionCases++;
  }
});
test('actual helper rejects malformed and excessive inputs before stat or walk under a bounded heap', () => {
  const patterns = ['apps/{a..b..0}','apps/{a..b..oops}','apps/{1..3..0}','apps/{1..1001}',
    '{'.repeat(129) + 'a,b' + '}'.repeat(129), '{'.repeat(4000) + 'a,b' + '}'.repeat(4000),
    '('.repeat(4000) + 'x' + ')'.repeat(4000), '{a,b}'.repeat(1024), '(a|b)'.repeat(1025),
    'x'.repeat(65537), 'x'.repeat(3000) + '{a,b}'.repeat(12),
    '{"' + 'x'.repeat(65000) + '"}{1..1000}', '{a}' + '}'.repeat(1025) + ',b}',
    'apps/{9007199254740992..9007199254740993}', '\0invalid', '',
    'apps/' + '('.repeat(129) + 'a|b' + ')'.repeat(129), 'apps/' + '{a}'.repeat(1025),
    'apps/{0..1000}', 'apps/{-9007199254740993..-9007199254740992}', 'apps/{a..b..9007199254740992}',
    'apps/' + '{a,b}'.repeat(14), 'apps/' + '{a,a}'.repeat(14),
    'apps/' + 'p'.repeat(4000) + '{a,b}'.repeat(10), 'apps/' + 'λ'.repeat(1000) + '{a,b}'.repeat(11),
    'apps/{"' + 'λ'.repeat(2000) + '",web}{1..1000}',
    'apps/"' + '{'.repeat(129) + 'a,b' + '}'.repeat(129),
    "apps/'" + '{'.repeat(129) + 'a,b' + '}'.repeat(129),
    'apps/{"' + '('.repeat(129) + 'a|b' + ')'.repeat(129) + '}'];
  const code = `const fs=require('fs'),{createRequire}=require('module');const r=createRequire(${JSON.stringify(helperPath)}),g=r(${JSON.stringify(helperPath)}).rootDirectories,walk=r('@nodelib/fs.walk');const patterns=JSON.parse(fs.readFileSync(0,'utf8'));fs.statSync=()=>{throw Error('PATTERN_REACHED_STAT')};walk.walkSync=()=>{throw Error('PATTERN_REACHED_WALK')};for(const p of patterns){let e;try{g(p)}catch(x){e=x}if(!e||e.name!=='TypeError')throw Error('RESOURCE_NOT_REJECTED:'+p.slice(0,40)+':'+e?.message)}process.stdout.write(JSON.stringify({rejected:patterns.length,filesystemCalls:0}));`;
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', code], {input: JSON.stringify(patterns), timeout: 8000, encoding: 'utf8'});
  assert.equal(result.error, undefined, result.error?.message); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {rejected: patterns.length, filesystemCalls: 0});
  receipt.resourceCases = patterns.length;
  fs.mkdirSync(path.join(root, 'artifacts'), {recursive: true});
  fs.writeFileSync(path.join(root, 'artifacts/factory-next-root-dirs-exact-differential.json'), JSON.stringify(receipt, null, 2) + '\n');
});
