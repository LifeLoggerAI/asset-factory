import dns from 'node:dns/promises';
import https from 'node:https';
import tls from 'node:tls';

const targets = (process.env.ASSET_FACTORY_CUSTOM_DOMAIN || 'uraiassetfactory.com,www.uraiassetfactory.com')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const healthPath = process.env.ASSET_FACTORY_CUSTOM_HEALTH_PATH || '/api/health';
const timeoutMs = Number(process.env.ASSET_FACTORY_DOMAIN_TIMEOUT_MS || 10000);

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function logResult(label, value) {
  console.log(`${label}: ${value}`);
}

async function safeStep(label, fn) {
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error && typeof error === 'object' ? error.cause : undefined;
    const causeBits = [];
    if (cause && typeof cause === 'object') {
      for (const key of ['code', 'errno', 'syscall', 'hostname', 'host', 'port']) {
        if (cause[key]) causeBits.push(`${key}=${cause[key]}`);
      }
    }
    console.log(`${label}: FAIL ${message}${causeBits.length ? ` (${causeBits.join(', ')})` : ''}`);
    return { ok: false, error };
  }
}

function inspectTls(hostname) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol();
      const authorized = socket.authorized;
      const authorizationError = socket.authorizationError;
      socket.end();
      resolve({
        authorized,
        authorizationError: authorizationError || null,
        protocol,
        subject: cert?.subject || null,
        issuer: cert?.issuer || null,
        validFrom: cert?.valid_from || null,
        validTo: cert?.valid_to || null,
        subjectaltname: cert?.subjectaltname || null,
      });
    });
    socket.on('timeout', () => {
      socket.destroy(new Error(`TLS connection timed out after ${timeoutMs}ms`));
    });
    socket.on('error', reject);
  });
}

function requestHealth(hostname) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      port: 443,
      path: healthPath,
      method: 'GET',
      timeout: timeoutMs,
      headers: { 'user-agent': 'asset-factory-domain-diagnostic' },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: body.slice(0, 1000) });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`HTTPS request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

function looksLikeNextJs404(response) {
  return Boolean(
    response?.statusCode === 404 &&
      (String(response.headers?.['x-powered-by'] || '').toLowerCase().includes('next') ||
        String(response.body || '').includes('This page could not be found'))
  );
}

async function diagnoseTarget(target) {
  printSection(`Target ${target}`);
  console.log(`Health path: ${healthPath}`);

  printSection(`DNS ${target}`);
  await safeStep('A records', async () => {
    const records = await dns.resolve4(target);
    logResult('A records', records.join(', ') || 'none');
  });
  await safeStep('AAAA records', async () => {
    const records = await dns.resolve6(target);
    logResult('AAAA records', records.join(', ') || 'none');
  });
  await safeStep('CNAME records', async () => {
    const records = await dns.resolveCname(target);
    logResult('CNAME records', records.join(', ') || 'none');
  });

  printSection(`TLS ${target}`);
  await safeStep('TLS certificate', async () => {
    const tlsInfo = await inspectTls(target);
    logResult('authorized', tlsInfo.authorized);
    logResult('authorizationError', tlsInfo.authorizationError || 'none');
    logResult('protocol', tlsInfo.protocol || 'unknown');
    logResult('subject', JSON.stringify(tlsInfo.subject));
    logResult('issuer', JSON.stringify(tlsInfo.issuer));
    logResult('validFrom', tlsInfo.validFrom || 'unknown');
    logResult('validTo', tlsInfo.validTo || 'unknown');
    logResult('subjectaltname', tlsInfo.subjectaltname || 'unknown');
  });

  printSection(`HTTPS health ${target}`);
  const health = await safeStep(`GET https://${target}${healthPath}`, async () => {
    const response = await requestHealth(target);
    logResult('statusCode', response.statusCode);
    logResult('server', response.headers.server || 'unknown');
    logResult('x-powered-by', response.headers['x-powered-by'] || 'unknown');
    logResult('content-type', response.headers['content-type'] || 'unknown');
    logResult('body', response.body || '(empty)');
    if (response.statusCode !== 200) throw new Error(`Expected 200 from ${target}${healthPath}, got ${response.statusCode}`);
    return response;
  });

  printSection(`Interpretation ${target}`);
  if (health.ok) {
    console.log('PASS custom domain API health is routed to Asset Factory.');
    return true;
  }

  const response = health.error?.response;
  if (looksLikeNextJs404(response)) {
    console.log('FAIL custom domain is still served by the previous Next.js host.');
  } else {
    console.log('FAIL custom domain API health is not routed to Asset Factory.');
  }
  console.log('Fix by attaching this host to Firebase Hosting site urai-4dc1d or by adding the /api/:path* proxy rewrite on the current host.');
  return false;
}

async function main() {
  console.log(`Asset Factory custom domain diagnostic targets: ${targets.join(', ')}`);
  let allOk = true;
  for (const target of targets) {
    const ok = await diagnoseTarget(target);
    allOk = allOk && ok;
  }
  if (!allOk && process.env.ASSET_FACTORY_DOMAIN_DIAG_STRICT === 'true') process.exit(1);
}

main().catch((error) => {
  console.error('Diagnostic failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
