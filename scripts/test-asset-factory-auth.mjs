import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const studioRoot = path.join(root, 'assetfactory-studio');
const studioNodeModules = path.join(studioRoot, 'node_modules');
const typescriptPath = path.join(studioNodeModules, 'typescript', 'lib', 'typescript.js');

if (!fs.existsSync(typescriptPath)) {
  console.error(`Missing TypeScript dependency at ${typescriptPath}. Run npm --prefix assetfactory-studio install first.`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-auth-'));
const compiledDir = path.join(tmpDir, 'compiled');
fs.mkdirSync(path.join(compiledDir, 'lib', 'server'), { recursive: true });

function compileTsModule(relativePath) {
  const sourcePath = path.join(studioRoot, relativePath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: relativePath,
  }).outputText;
  const outputPath = path.join(compiledDir, relativePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  return outputPath;
}

function base64Url(value) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  return raw.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signHs256(payload, secret = 'asset-test-secret') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64Url(header);
  const encodedPayload = base64Url(payload);
  const signature = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest();
  return `${encodedHeader}.${encodedPayload}.${base64Url(signature)}`;
}

function request(headers = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    headers: {
      get(name) {
        return normalized.get(String(name).toLowerCase()) ?? null;
      },
    },
  };
}

function resetAuthEnv() {
  delete process.env.ASSET_FACTORY_REQUIRE_AUTH;
  delete process.env.ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH;
  delete process.env.ASSET_FACTORY_JWT_HS256_SECRET;
  delete process.env.ASSET_FACTORY_REQUIRE_JWT_SIGNATURE;
  delete process.env.ASSET_FACTORY_JWT_ISSUER;
  delete process.env.ASSET_FACTORY_JWT_AUDIENCE;
  delete process.env.ASSET_FACTORY_TENANT_CLAIM;
  delete process.env.ASSET_FACTORY_ROLE_CLAIM;
}

const authModulePath = compileTsModule('lib/server/assetAuth.ts');
const { authorizeAssetRequest } = await import(pathToFileURL(authModulePath).href);

try {
  resetAuthEnv();
  {
    const result = authorizeAssetRequest(request({ 'x-tenant-id': 'tenant-local', 'x-user-id': 'user-local' }));
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'disabled');
    assert.equal(result.tenantId, 'tenant-local');
    assert.deepEqual(result.roles, ['admin']);
  }

  resetAuthEnv();
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'true';
  {
    const result = authorizeAssetRequest(request({ 'x-tenant-id': 'tenant-a', 'x-asset-role': 'admin' }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.match(result.error, /bearer token/i);
  }

  resetAuthEnv();
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'true';
  process.env.ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH = 'true';
  {
    const result = authorizeAssetRequest(request({ 'x-tenant-id': 'tenant-a', 'x-asset-role': 'publisher' }), 'tenant-a', 'publisher');
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'legacy-headers');
    assert.equal(result.tenantId, 'tenant-a');
    assert.deepEqual(result.roles, ['publisher']);
  }

  resetAuthEnv();
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'true';
  process.env.ASSET_FACTORY_JWT_HS256_SECRET = 'asset-test-secret';
  process.env.ASSET_FACTORY_JWT_ISSUER = 'https://issuer.example';
  process.env.ASSET_FACTORY_JWT_AUDIENCE = 'asset-factory';
  {
    const token = signHs256({
      iss: 'https://issuer.example',
      aud: 'asset-factory',
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'user-1',
      tenantId: 'tenant-a',
      roles: ['creator'],
    });
    const result = authorizeAssetRequest(request({ authorization: `Bearer ${token}` }), 'tenant-a', 'creator');
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'jwt');
    assert.equal(result.tenantId, 'tenant-a');
    assert.equal(result.userId, 'user-1');
    assert.deepEqual(result.roles, ['creator']);
  }

  resetAuthEnv();
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'true';
  process.env.ASSET_FACTORY_JWT_HS256_SECRET = 'asset-test-secret';
  {
    const token = signHs256({
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'user-2',
      tenantId: 'tenant-a',
      roles: ['admin'],
    });
    const result = authorizeAssetRequest(request({ authorization: `Bearer ${token}` }), 'tenant-b', 'viewer');
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.equal(result.error, 'Tenant mismatch');
  }

  resetAuthEnv();
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'true';
  process.env.ASSET_FACTORY_JWT_HS256_SECRET = 'asset-test-secret';
  {
    const token = signHs256({
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'user-3',
      tenantId: 'tenant-a',
      roles: ['viewer'],
    });
    const result = authorizeAssetRequest(request({ authorization: `Bearer ${token}` }), 'tenant-a', 'publisher');
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.match(result.error, /Role publisher required/);
  }

  resetAuthEnv();
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'true';
  process.env.ASSET_FACTORY_JWT_HS256_SECRET = 'asset-test-secret';
  {
    const token = signHs256({
      exp: Math.floor(Date.now() / 1000) - 1,
      sub: 'user-4',
      tenantId: 'tenant-a',
      roles: ['admin'],
    });
    const result = authorizeAssetRequest(request({ authorization: `Bearer ${token}` }), 'tenant-a', 'viewer');
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.match(result.error, /expired/);
  }

  resetAuthEnv();
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'true';
  process.env.ASSET_FACTORY_REQUIRE_JWT_SIGNATURE = 'true';
  {
    const token = signHs256({
      exp: Math.floor(Date.now() / 1000) + 3600,
      tenantId: 'tenant-a',
      roles: ['admin'],
    });
    const result = authorizeAssetRequest(request({ authorization: `Bearer ${token}` }), 'tenant-a', 'viewer');
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.match(result.error, /signature enforcement/i);
  }

  console.log('PASS Asset Factory auth guard tests');
} finally {
  resetAuthEnv();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
