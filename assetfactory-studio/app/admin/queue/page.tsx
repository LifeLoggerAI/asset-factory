'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, Button } from '../../../components/layout/DesignSystem';

type QueueItem = {
  jobId: string;
  tenantId?: string;
  status?: string;
  queueStatus?: string;
  attempts?: number;
  maxAttempts?: number;
  workerId?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  failureReason?: string;
  queuedAt?: string;
  claimedAt?: string;
  heartbeatAt?: string;
  retryAfter?: string;
  deadLetteredAt?: string;
  updatedAt?: string;
};

type QueueSummary = {
  ok?: boolean;
  configured?: boolean;
  scope?: string;
  tenantId?: string;
  total?: number;
  byStatus?: Record<string, number>;
  failedOrDeadLettered?: number;
  staleClaimed?: number;
  items?: QueueItem[];
  error?: string;
};

const cardStyle = {
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 12,
  padding: '1.25rem',
} as const;

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 8,
  color: 'white',
} as const;

const statusOptions = ['all', 'dead-lettered', 'failed', 'retrying', 'claimed', 'queued'];

function formatDate(value?: string) {
  if (!value) return 'n/a';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function isRequeueable(item: QueueItem) {
  return item.status === 'dead-lettered' || item.status === 'failed' || item.status === 'retrying';
}

function statusBadge(status?: string) {
  const color = status === 'dead-lettered' || status === 'failed'
    ? '#fca5a5'
    : status === 'retrying'
      ? '#fbbf24'
      : status === 'claimed'
        ? '#93c5fd'
        : '#86efac';

  return (
    <span style={{ color, border: `1px solid ${color}`, borderRadius: 999, padding: '0.2rem 0.55rem', fontSize: '0.8rem', fontWeight: 700 }}>
      {status ?? 'unknown'}
    </span>
  );
}

export default function QueueAdminPage() {
  const [tenantId, setTenantId] = useState('demo');
  const [apiKey, setApiKey] = useState('');
  const [assetRole, setAssetRole] = useState('admin');
  const [status, setStatus] = useState('dead-lettered');
  const [allTenants, setAllTenants] = useState(false);
  const [limit, setLimit] = useState(50);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Ready to inspect queue failures.');
  const [error, setError] = useState('');
  const [requeueReason, setRequeueReason] = useState('Operator verified the failure is safe to retry.');
  const [resetAttempts, setResetAttempts] = useState(false);

  const requestHeaders = useMemo(() => {
    const headers: Record<string, string> = {
      'x-asset-role': assetRole || 'admin',
    };
    if (!allTenants && tenantId.trim()) headers['x-tenant-id'] = tenantId.trim();
    if (apiKey.trim()) headers['x-asset-factory-key'] = apiKey.trim();
    return headers;
  }, [allTenants, apiKey, assetRole, tenantId]);

  const loadQueue = useCallback(async () => {
    setBusy(true);
    setError('');
    setMessage('Loading queue state...');

    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      params.set('limit', String(limit));
      if (allTenants) params.set('allTenants', 'true');

      const response = await fetch(`/api/admin/queue?${params.toString()}`, {
        cache: 'no-store',
        headers: requestHeaders,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.reason || 'Queue load failed.');
      setSummary(data);
      setMessage(`Loaded ${data.total ?? 0} queue item(s).`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load queue.');
      setMessage('Queue load failed.');
    } finally {
      setBusy(false);
    }
  }, [allTenants, limit, requestHeaders, status]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function requeue(jobId: string) {
    if (!requeueReason.trim()) {
      setError('A requeue reason is required.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage(`Requeueing ${jobId}...`);

    try {
      const response = await fetch('/api/admin/queue/requeue', {
        method: 'POST',
        headers: {
          ...requestHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          reason: requeueReason.trim(),
          resetAttempts,
          allTenants,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.reason || data.error || 'Requeue failed.');
      setMessage(`Requeued ${jobId}.`);
      await loadQueue();
    } catch (requeueError) {
      setError(requeueError instanceof Error ? requeueError.message : 'Unable to requeue job.');
      setMessage('Requeue failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: '1.25rem' }}>
        <section style={{ ...cardStyle, background: 'linear-gradient(135deg, #111827, #1f2937)' }}>
          <p style={{ color: '#fbbf24', margin: 0, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Operator Console
          </p>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', lineHeight: 0.95, margin: '0.5rem 0', letterSpacing: '-0.05em' }}>
            Queue failures and dead letters.
          </h1>
          <p style={{ color: '#cbd5e1', maxWidth: 760, lineHeight: 1.6 }}>
            Inspect failed queue work, stale leases, and dead-lettered jobs. Requeue only after the underlying provider, auth, storage, or quota issue has been fixed.
          </p>
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              Tenant ID
              <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} disabled={allTenants} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              API key
              <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="optional in local/dev" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              Role header
              <input value={assetRole} onChange={(event) => setAssetRole(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              Limit
              <input type="number" min={1} max={200} value={limit} onChange={(event) => setLimit(Number(event.target.value))} style={inputStyle} />
            </label>
          </div>

          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#cbd5e1' }}>
            <input type="checkbox" checked={allTenants} onChange={(event) => setAllTenants(event.target.checked)} />
            All-tenant operator view
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            Requeue reason
            <input value={requeueReason} onChange={(event) => setRequeueReason(event.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#cbd5e1' }}>
            <input type="checkbox" checked={resetAttempts} onChange={(event) => setResetAttempts(event.target.checked)} />
            Reset attempts when requeueing
          </label>

          <div>
            <Button type="button" onClick={() => void loadQueue()} disabled={busy} variant="primary">
              {busy ? 'Working...' : 'Refresh queue'}
            </Button>
          </div>
        </section>

        <section aria-live="polite" style={{ ...cardStyle, borderColor: error ? '#ef4444' : '#374151' }}>
          <strong>Status:</strong>{' '}
          <span style={{ color: error ? '#fca5a5' : '#93c5fd' }}>{error || message}</span>
        </section>

        {summary && (
          <section style={{ ...cardStyle }}>
            <h2 style={{ marginTop: 0 }}>Queue summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div style={cardStyle}><strong>Total visible</strong><p>{summary.total ?? 0}</p></div>
              <div style={cardStyle}><strong>Failures/DLQ</strong><p>{summary.failedOrDeadLettered ?? 0}</p></div>
              <div style={cardStyle}><strong>Stale claimed</strong><p>{summary.staleClaimed ?? 0}</p></div>
              <div style={cardStyle}><strong>Scope</strong><p>{summary.scope ?? summary.tenantId ?? 'unknown'}</p></div>
            </div>
            <pre style={{ marginTop: '1rem', overflowX: 'auto', background: '#111827', padding: '1rem', borderRadius: 8, color: '#cbd5e1' }}>
              {JSON.stringify(summary.byStatus ?? {}, null, 2)}
            </pre>
          </section>
        )}

        <section style={{ ...cardStyle }}>
          <h2 style={{ marginTop: 0 }}>Queue items</h2>
          {!summary?.items?.length ? (
            <p style={{ color: '#9ca3af' }}>No queue items match the current filter.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {summary.items.map((item) => (
                <article key={item.jobId} style={{ ...cardStyle, background: '#111827' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 260 }}>
                      <h3 style={{ margin: 0 }}>{item.jobId}</h3>
                      <p style={{ color: '#94a3b8', margin: '0.35rem 0' }}>Tenant: {item.tenantId ?? 'unknown'}</p>
                      {statusBadge(item.status)}
                    </div>
                    <div style={{ color: '#cbd5e1', minWidth: 260 }}>
                      <p style={{ margin: '0.2rem 0' }}>Attempts: {item.attempts ?? 0}{item.maxAttempts ? ` / ${item.maxAttempts}` : ''}</p>
                      <p style={{ margin: '0.2rem 0' }}>Worker: {item.workerId ?? 'n/a'}</p>
                      <p style={{ margin: '0.2rem 0' }}>Lease expires: {formatDate(item.leaseExpiresAt)}</p>
                      <p style={{ margin: '0.2rem 0' }}>Updated: {formatDate(item.updatedAt)}</p>
                    </div>
                    <div style={{ minWidth: 180 }}>
                      <Button type="button" variant="secondary" disabled={busy || !isRequeueable(item)} onClick={() => void requeue(item.jobId)}>
                        Requeue
                      </Button>
                    </div>
                  </div>
                  {item.failureReason && (
                    <p style={{ color: '#fca5a5', marginBottom: 0 }}>Failure: {item.failureReason}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
