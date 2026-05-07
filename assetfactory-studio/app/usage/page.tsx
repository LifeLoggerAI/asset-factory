'use client';

import { useEffect, useState } from 'react';
import { AppShell, Button } from '../../components/layout/DesignSystem';

type UsageResponse = {
  ok: boolean;
  totals?: {
    jobs: number;
    assets: number;
    publishedAssets: number;
    draftAssets: number;
    usageEvents?: number;
    estimatedUnits?: number;
    estimatedCostCents?: number;
  };
  jobsByStatus?: Record<string, number>;
  jobsByType?: Record<string, number>;
  assetsByType?: Record<string, number>;
  assetsByRendererMode?: Record<string, number>;
  assetsByFormat?: Record<string, number>;
  usageByAction?: Record<string, number>;
  usageEventsByTenant?: Record<string, number>;
  usageUnitsByType?: Record<string, number>;
  usageCostCentsByType?: Record<string, number>;
};

const cardStyle = {
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 12,
  padding: '1.25rem',
} as const;

function formatCents(value = 0) {
  return `$${(value / 100).toFixed(2)}`;
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={cardStyle}>
      <p style={{ color: '#9ca3af', margin: 0 }}>{label}</p>
      <strong style={{ display: 'block', fontSize: '2rem', marginTop: '0.35rem' }}>{value}</strong>
    </div>
  );
}

function Breakdown({ title, data, formatValue }: { title: string; data?: Record<string, number>; formatValue?: (value: number) => string }) {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {entries.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>No data yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {entries.map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid #374151', paddingBottom: '0.5rem' }}>
              <span>{key}</span>
              <strong>{formatValue ? formatValue(value) : value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadUsage() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load usage metrics.');
      setUsage(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load usage metrics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsage();
  }, []);

  return (
    <AppShell>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <section style={{ ...cardStyle, background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
          <p style={{ color: '#93c5fd', fontWeight: 700, margin: 0 }}>Usage</p>
          <h1 style={{ fontSize: '2rem', margin: '0.5rem 0' }}>Multimodal asset metrics</h1>
          <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
            Track proof jobs, generated artifacts, lifecycle events, estimated units, and estimated cost by modality.
          </p>
          <Button type="button" variant="secondary" onClick={() => void loadUsage()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh metrics'}
          </Button>
        </section>

        {error && <section style={{ ...cardStyle, borderColor: '#ef4444', color: '#fca5a5' }}>{error}</section>}
        {loading && !usage && <section style={cardStyle}>Loading usage metrics...</section>}

        {usage && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <MetricCard label="Jobs" value={usage.totals?.jobs ?? 0} />
              <MetricCard label="Assets" value={usage.totals?.assets ?? 0} />
              <MetricCard label="Published" value={usage.totals?.publishedAssets ?? 0} />
              <MetricCard label="Draft" value={usage.totals?.draftAssets ?? 0} />
              <MetricCard label="Usage events" value={usage.totals?.usageEvents ?? 0} />
              <MetricCard label="Estimated units" value={usage.totals?.estimatedUnits ?? 0} />
              <MetricCard label="Estimated cost" value={formatCents(usage.totals?.estimatedCostCents ?? 0)} />
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <Breakdown title="Jobs by status" data={usage.jobsByStatus} />
              <Breakdown title="Jobs by type" data={usage.jobsByType} />
              <Breakdown title="Assets by type" data={usage.assetsByType} />
              <Breakdown title="Renderer modes" data={usage.assetsByRendererMode} />
              <Breakdown title="Output formats" data={usage.assetsByFormat} />
              <Breakdown title="Usage events" data={usage.usageByAction} />
              <Breakdown title="Usage units by type" data={usage.usageUnitsByType} />
              <Breakdown title="Usage cost by type" data={usage.usageCostCentsByType} formatValue={formatCents} />
              <Breakdown title="Events by tenant" data={usage.usageEventsByTenant} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
