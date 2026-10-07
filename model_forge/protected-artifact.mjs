/** Read an admitted artifact once, using only the validated DNS result. No credentials. */
import dns from 'node:dns/promises';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { createHash } from 'node:crypto';

const blocked4 = new BlockList(), global6 = new BlockList(), blocked6 = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blocked4.addSubnet(address, prefix, 'ipv4');
global6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 32], ['2001:10::', 28], ['2001:20::', 28], ['2001:db8::', 32], ['2002::', 16]]) blocked6.addSubnet(address, prefix, 'ipv6');
function need(ok, reason) { if (!ok) throw new Error(`ARTIFACT_BLOCKED: ${reason}`); }
export function publicArtifactAddress(address, family) {
  if (family !== isIP(address)) return false;
  return family === 4 ? !blocked4.check(address, 'ipv4') : family === 6 && global6.check(address, 'ipv6') && !blocked6.check(address, 'ipv6');
}
export function admittedArtifactHosts(value) {
  need(Array.isArray(value) && value.length > 0 && value.length <= 10 && new Set(value).size === value.length, 'exact artifact host admission missing');
  need(value.every(host => typeof host === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host)), 'artifact hosts must be exact DNS names');
  return [...value];
}
export async function retrievePublicArtifact(raw, { hosts, maxBytes = 64 * 1024 * 1024, timeoutMs = 120_000, signal, checkAdmission, onChunk, lookup = dns.lookup, request = https.get }) {
  const allowed = admittedArtifactHosts(hosts);
  need(typeof checkAdmission === 'function', 'active protected admission required'); checkAdmission();
  need(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 250 * 1024 * 1024, 'artifact byte ceiling invalid');
  need(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 180_000, 'artifact time ceiling invalid');
  let url; try { url = new URL(raw); } catch { need(false, 'artifact URL invalid'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port && allowed.includes(url.hostname), 'artifact origin differs from admitted HTTPS host');
  const limitSignal = AbortSignal.timeout(timeoutMs), abort = signal ? AbortSignal.any([signal, limitSignal]) : limitSignal;
  const addresses = await new Promise((resolve, reject) => {
    const stop = () => reject(new Error('ARTIFACT_BLOCKED: DNS exceeded protected deadline'));
    if (abort.aborted) return stop();
    abort.addEventListener('abort', stop, { once: true });
    Promise.resolve().then(() => lookup(url.hostname, { all: true, verbatim: true })).then(resolve, reject).finally(() => abort.removeEventListener('abort', stop));
  }); checkAdmission();
  need(Array.isArray(addresses) && addresses.length > 0 && addresses.every(a => publicArtifactAddress(a.address, a.family)), 'artifact DNS includes nonpublic address');
  const address = addresses[0];
  const response = await new Promise((resolve, reject) => {
    // URL hostname remains the TLS SNI/certificate identity. The socket's only
    // lookup uses the already validated numeric address; pooling is disabled.
    const req = request(url, { agent: false, headers: { 'user-agent': 'urai-protected-artifact/1' }, signal: abort, lookup: (hostname, options, callback) => {
      try { checkAdmission(); need(hostname === url.hostname, 'artifact socket hostname changed'); callback(null, options?.all ? [address] : address.address, address.family); }
      catch (error) { callback(error); }
    } }, resolve);
    req.once('error', reject);
  });
  try {
    checkAdmission(); need(response.statusCode === 200, 'artifact must return HTTP 200 without redirects');
    const length = response.headers['content-length'];
    need(length === undefined || (/^\d+$/.test(String(length)) && Number.isSafeInteger(Number(length)) && Number(length) <= maxBytes), 'artifact declared size exceeds ceiling');
    const chunks = [], hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of response) {
      checkAdmission(); bytes += chunk.length; need(bytes <= maxBytes, 'artifact stream exceeds byte ceiling');
      hash.update(chunk); if (onChunk) onChunk(chunk); else chunks.push(chunk); checkAdmission();
    }
    checkAdmission(); need(bytes > 0, 'artifact stream empty');
    return { bytes, sha256: hash.digest('hex'), contentType: typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined, ...(onChunk ? {} : { buffer: Buffer.concat(chunks, bytes) }) };
  } catch (error) { response.destroy(); throw error; }
}
