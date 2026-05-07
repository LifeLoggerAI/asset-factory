'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppShell, Button } from '../components/layout/DesignSystem';

type AssetType = 'graphic' | 'model3d' | 'audio' | 'bundle';

type StudioJob = {
  jobId: string;
  tenantId?: string;
  prompt?: string;
  type?: string;
  canonicalType?: string;
  assetFamily?: string;
  status?: string;
  queueStatus?: string;
  createdAt?: string;
  estimatedUnits?: number;
  estimatedCostCents?: number;
  assetFileName?: string;
  manifestFile?: string;
  failureReason?: string;
};

type StudioAsset = {
  jobId: string;
  fileName: string;
  manifestFile: string;
  published?: boolean;
  manifest?: {
    rendererMode?: string;
    formats?: string[];
    metadata?: Record<string, unknown>;
  };
};

const GENERATE_API_ENDPOINT = '/api/generate';
const assetTypes: { value: AssetType; label: string; description: string }[] = [
  { value: 'graphic', label: 'Graphic', description: 'SVG proof for images, icons, logos, textures, and visual assets.' },
  { value: 'model3d', label: '3D Model', description: 'GLTF proof mesh for avatars, props, spaces, and model assets.' },
  { value: 'audio', label: 'Sound', description: 'WAV proof tone for SFX, voice, music, and ambience assets.' },
  { value: 'bundle', label: 'Bundle', description: 'JSON pack manifest for grouping generated assets.' },
];

const cardStyle = {
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 12,
  padding: '1.25rem',
} as const;

const inputStyle = {
  width: '100%',
  padding: '0.8rem',
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 8,
  color: 'white',
} as const;

export default function StudioPage() {
  const [tenantId, setTenantId] = useState('demo');
  const [assetType, setAssetType] = useState<AssetType>('graphic');
  const [prompt, setPrompt] = useState('A futuristic city skyline at sunset.');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [durationSeconds, setDurationSeconds] = useState(2);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [assets, setAssets] = useState<Record<string, StudioAsset>>({});
  const [status, setStatus] = useState('Ready. Create a multimodal proof asset.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedType = useMemo(
    () => assetTypes.find((type) => type.value === assetType) ?? assetTypes[0],
    [assetType]
  );

  const refreshJobs = useCallback(async () => {
    const response = await fetch(GENERATE_API_ENDPOINT, {
      headers: { 'x-tenant-id': tenantId || 'demo' },
    });
    if (!response.ok) throw new Error('Failed to fetch jobs.');
    const data = await response.json();
    setJobs(Array.isArray(data) ? data : []);
  }, [tenantId]);

  const refreshAssets = useCallback(async () => {
    const response = await fetch('/api/assets', {
      headers: { 'x-tenant-id': tenantId || 'demo' },
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data)) return;
    setAssets(
      Object.fromEntries(data.map((asset: StudioAsset) => [asset.jobId, asset]))
    );
  }, [tenantId]);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([refreshJobs(), refreshAssets()]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh jobs.');
    }
  }, [refreshAssets, refreshJobs]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setStatus('Submitting job...');

    try {
      const jobId = `studio-${assetType}-${uuidv4()}`;
      const body = {
        jobId,
        tenantId: tenantId || 'demo',
        prompt,
        type: assetType,
        size: assetType === 'graphic' || assetType === 'model3d' ? { width, height } : undefined,
        metadata: assetType === 'audio' ? { durationSeconds } : assetType === 'bundle' ? { assets: [] } : {},
      };

      const response = await fetch(GENERATE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': tenantId || 'demo',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Job submission failed.');

      setStatus(`Queued ${result.canonicalType} job ${result.jobId}. Estimated ${result.estimatedUnits} unit(s).`);
      await refreshAll();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create job.');
      setStatus('Job creation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function materializeJob(jobId: string) {
    setBusy(true);
    setError('');
    setStatus(`Materializing ${jobId}...`);

    try {
      const response = await fetch(`/api/jobs/${jobId}/materialize`, {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId || 'demo' },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Materialization failed.');
      setStatus(`Materialized ${jobId} as ${result.asset?.fileName ?? 'asset'}.`);
      await refreshAll();
    } catch (materializeError) {
      setError(materializeError instanceof Error ? materializeError.message : 'Unable to materialize job.');
      setStatus('Materialization failed.');
    } finally {
      setBusy(false);
    }
  }

  async function publishJob(jobId: string) {
    setBusy(true);
    setError('');
    setStatus(`Publishing ${jobId}...`);

    try {
      const response = await fetch(`/api/jobs/${jobId}/publish`, {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId || 'demo' },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Publish failed.');
      setStatus(`Published ${jobId}.`);
      await refreshAll();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Unable to publish asset.');
      setStatus('Publish failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: '1.25rem' }}>
        <section style={{ ...cardStyle, background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
          <p style={{ color: '#93c5fd', margin: 0, fontWeight: 700 }}>Asset Factory Studio</p>
          <h1 style={{ fontSize: '2.25rem', margin: '0.5rem 0' }}>Generate graphics, models, sounds, and bundles</h1>
          <p style={{ color: '#cbd5e1', maxWidth: 760, lineHeight: 1.6 }}>
            This Studio runs the canonical generate → materialize → fetch → publish flow against the local proof renderer or configured provider adapter.
          </p>
        </section>

        <form onSubmit={createJob} style={{ ...cardStyle, display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="tenantId" style={{ fontWeight: 700 }}>Tenant ID</label>
            <input id="tenantId" value={tenantId} onChange={(event) => setTenantId(event.target.value)} style={inputStyle} placeholder="demo" />
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            <legend style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Asset type</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
              {assetTypes.map((type) => (
                <label key={type.value} style={{ ...cardStyle, cursor: 'pointer', borderColor: assetType === type.value ? '#38bdf8' : '#374151' }}>
                  <input
                    type="radio"
                    name="assetType"
                    value={type.value}
                    checked={assetType === type.value}
                    onChange={() => setAssetType(type.value)}
                    style={{ marginRight: 8 }}
                  />
                  <strong>{type.label}</strong>
                  <p style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.4 }}>{type.description}</p>
                </label>
              ))}
            </div>
          </fieldset>

          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="prompt" style={{ fontWeight: 700 }}>Prompt</label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} style={{ ...inputStyle, minHeight: 140 }} />
          </div>

          {(assetType === 'graphic' || assetType === 'model3d') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                Width
                <input type="number" min={64} max={4096} value={width} onChange={(event) => setWidth(Number(event.target.value))} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                Height
                <input type="number" min={64} max={4096} value={height} onChange={(event) => setHeight(Number(event.target.value))} style={inputStyle} />
              </label>
            </div>
          )}

          {assetType === 'audio' && (
            <label style={{ display: 'grid', gap: '0.4rem' }}>
              Duration seconds
              <input type="number" min={1} max={30} value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))} style={inputStyle} />
            </label>
          )}

          <Button type="submit" disabled={busy || !prompt.trim()} variant="primary">
            {busy ? 'Working...' : `Create ${selectedType.label} Job`}
          </Button>
        </form>

        <section aria-live="polite" style={{ ...cardStyle, borderColor: error ? '#ef4444' : '#374151' }}>
          <strong>Status:</strong> <span style={{ color: error ? '#fca5a5' : '#93c5fd' }}>{error || status}</span>
        </section>

        <section style={{ ...cardStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Job history</h2>
            <Button type="button" variant="secondary" onClick={() => void refreshAll()} disabled={busy}>Refresh</Button>
          </div>
          {jobs.length === 0 ? (
            <p style={{ color: '#9ca3af' }}>No jobs yet. Create a graphic, 3D model, sound, or bundle to begin.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
              {jobs.map((job) => {
                const asset = assets[job.jobId];
                return (
                  <article key={job.jobId} style={{ ...cardStyle, background: '#111827' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{job.jobId}</h3>
                        <p style={{ color: '#9ca3af', marginBottom: 0 }}>{job.canonicalType ?? job.type} · {job.status ?? 'unknown'} · {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'no date'}</p>
                        {job.failureReason && <p style={{ color: '#fca5a5' }}>{job.failureReason}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {!asset && <Button type="button" onClick={() => void materializeJob(job.jobId)} disabled={busy}>Materialize</Button>}
                        {asset && !asset.published && <Button type="button" onClick={() => void publishJob(job.jobId)} disabled={busy}>Publish</Button>}
                        {asset && <a href={`/api/generated-assets/${asset.fileName}`} style={{ color: '#38bdf8', alignSelf: 'center' }}>Open asset</a>}
                        {asset && <a href={`/api/generated-assets/${asset.manifestFile}`} style={{ color: '#38bdf8', alignSelf: 'center' }}>Manifest</a>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
