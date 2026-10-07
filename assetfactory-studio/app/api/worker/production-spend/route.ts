import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { authenticateSpend, spendAction, spendRecord, SpendRejected, type SpendDb, type SpendKeys } from '@/lib/server/productionSpend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function keys(name: string): SpendKeys {
  const parsed = spendRecord(JSON.parse(process.env[name] || '{}'), 'signer configuration');
  return Object.fromEntries(Object.entries(parsed).map(([id, value]) => {
    const key = spendRecord(value, 'signer key');
    if (typeof key.subject !== 'string' || !key.subject.trim() || typeof key.publicKey !== 'string' || !key.publicKey.trim()) throw new SpendRejected('signer configuration invalid');
    return [id, { subject: key.subject, publicKey: key.publicKey }];
  }));
}
export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get('content-length') || '0') > 65536) return NextResponse.json({ ok: false, code: 'payload_too_large' }, { status: 413 });
    const raw = await req.text(); if (Buffer.byteLength(raw) > 65536) return NextResponse.json({ ok: false, code: 'payload_too_large' }, { status: 413 });
    const body = spendRecord(JSON.parse(raw), 'spend request'), action = body.action;
    if (typeof action !== 'string') throw new SpendRejected('spend action missing');
    const reconcile = action === 'reconcile';
    const worker = process.env.ASSET_FACTORY_SPEND_WORKER_TOKEN, reconciler = process.env.ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN;
    if (reconcile && worker === reconciler) return NextResponse.json({ ok: false, code: 'separate_reconciliation_auth_required' }, { status: 503 });
    if (!authenticateSpend(reconcile ? reconciler : worker, req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''))) return NextResponse.json({ ok: false, code: 'spend_auth_required' }, { status: 401 });
    const project = process.env.ASSET_FACTORY_FIREBASE_PROJECT_ID, sourceSha = process.env.URAI_SOURCE_SHA || '';
    if (!project || ['urai-4dc1d', 'asset-factory-dev-id', 'geturai-landing-hub'].includes(project) || process.env.FIREBASE_PROJECT_ID !== project || !/^[0-9a-f]{40}$/.test(sourceSha)) return NextResponse.json({ ok: false, code: 'canonical_spend_store_or_source_unbound' }, { status: 503 });
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
    const result = await spendAction(store, action, body, { now: Date.now, approvalKeys: keys('ASSET_FACTORY_SPEND_APPROVER_PUBLIC_KEYS'), reconciliationKeys: keys('ASSET_FACTORY_SPEND_RECONCILER_PUBLIC_KEYS'), sourceSha });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof SpendRejected ? error.code : 'spend_store_unavailable', provider_call_authorized: false, execution_performed: false }, { status: error instanceof SpendRejected ? 409 : 503 });
  }
}

