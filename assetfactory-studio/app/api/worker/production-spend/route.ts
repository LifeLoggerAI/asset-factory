import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { authenticateSpend, authenticateSpendWorker, isDedicatedSpendProject, spendAction, spendGatewaySourceSha, spendRecord, SpendRejected, type SpendDb, type SpendKeys } from '@/lib/server/productionSpend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PAYLOAD_LIMIT = 65_536;
class SpendPayloadRejected extends Error {
  status: number; code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
/** Bound actual streamed bytes before JSON parsing, including chunked requests. */
async function readSpendPayload(req: NextRequest) {
  if (Number(req.headers.get('content-length') || '0') > PAYLOAD_LIMIT) throw new SpendPayloadRejected(413, 'payload_too_large');
  const reader = req.body?.getReader();
  if (!reader) throw new SpendPayloadRejected(400, 'spend_body_required');
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15_000)]);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Buffer[] = []; let count = 0, complete = false;
  try {
    while (true) {
      if (signal.aborted) throw new SpendPayloadRejected(408, 'spend_request_aborted');
      const { done, value } = await reader.read();
      if (signal.aborted) throw new SpendPayloadRejected(408, 'spend_request_aborted');
      if (done) { complete = true; break; }
      count += value.byteLength;
      if (count > PAYLOAD_LIMIT) throw new SpendPayloadRejected(413, 'payload_too_large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, count).toString('utf8');
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}
function keys(name: string): SpendKeys {
  const parsed = spendRecord(JSON.parse(process.env[name] || '{}'), 'signer configuration');
  return Object.fromEntries(Object.entries(parsed).map(([id, value]) => {
    const key = spendRecord(value, 'signer key');
    if (Object.keys(key).some(field => !['subject', 'publicKey'].includes(field))) throw new SpendRejected('signer configuration invalid');
    if (typeof key.subject !== 'string' || !key.subject.trim() || typeof key.publicKey !== 'string' || !key.publicKey.trim()) throw new SpendRejected('signer configuration invalid');
    return [id, { subject: key.subject, publicKey: key.publicKey }];
  }));
}
export async function POST(req: NextRequest) {
  try {
    const raw = await readSpendPayload(req);
    const body = spendRecord(JSON.parse(raw), 'spend request'), action = body.action;
    if (typeof action !== 'string') throw new SpendRejected('spend action missing');
    const reconcile = action === 'reconcile';
    const worker = process.env.ASSET_FACTORY_SPEND_WORKER_TOKEN, reconciler = process.env.ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN;
    if (reconcile && worker === reconciler) return NextResponse.json({ ok: false, code: 'separate_reconciliation_auth_required' }, { status: 503 });
    const supplied = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const identity = authenticateSpendWorker(JSON.parse(process.env.ASSET_FACTORY_SPEND_WORKER_TOKENS_JSON || '{}'), reconcile ? undefined : supplied, worker, reconciler);
    if (reconcile ? !authenticateSpend(reconciler, supplied) : !identity && !authenticateSpend(worker, supplied)) return NextResponse.json({ ok: false, code: 'spend_auth_required' }, { status: 401 });
    const project = process.env.ASSET_FACTORY_FIREBASE_PROJECT_ID, sourceSha = process.env.URAI_SOURCE_SHA || '';
    if (!isDedicatedSpendProject(project) || process.env.FIREBASE_PROJECT_ID !== project || !/^[0-9a-f]{40}$/.test(sourceSha)) return NextResponse.json({ ok: false, code: 'canonical_spend_store_or_source_unbound' }, { status: 503 });
    if (!reconcile) spendGatewaySourceSha(sourceSha);
    const db = getAdminDb(); if (!db) return NextResponse.json({ ok: false, code: 'spend_store_unavailable' }, { status: 503 });
    if (!('projectId' in db) || typeof db.projectId !== 'string' || db.projectId !== project) return NextResponse.json({ ok: false, code: 'canonical_spend_store_mismatch' }, { status: 503 });
    // Resolve path handles through this SDK instance; the helper never receives
    // an asserted Firestore type or a foreign reference object.
    const store: SpendDb = {
      doc: path => ({ path }),
      runTransaction: fn => db.runTransaction(tx => fn({
        get: ref => tx.get(db.doc(ref.path)),
        set: (ref, value) => { tx.set(db.doc(ref.path), value); },
      })),
    };
    const result = await spendAction(store, action, body, { now: Date.now, approvalKeys: keys('ASSET_FACTORY_SPEND_APPROVER_PUBLIC_KEYS'), reconciliationKeys: keys('ASSET_FACTORY_SPEND_RECONCILER_PUBLIC_KEYS'), verifierKeys: keys('ASSET_FACTORY_SPEND_VERIFIER_PUBLIC_KEYS'), worker: identity, sourceSha });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SpendPayloadRejected) return NextResponse.json({ ok: false, code: error.code, provider_call_authorized: false, execution_performed: false }, { status: error.status });
    return NextResponse.json({ ok: false, code: error instanceof SpendRejected ? error.code : 'spend_store_unavailable', provider_call_authorized: false, execution_performed: false }, { status: error instanceof SpendRejected ? 409 : 503 });
  }
}

