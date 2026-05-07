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
  updatedAt?: string;
  completedAt?: string;
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
const JOB_API_ENDPOINT = '/api/jobs';
const ASSETS_API_ENDPOINT = '/api/assets';
const MATERIALIZE_ENDPOINT = (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/materialize`;
const PUBLISH_ENDPOINT = (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/publish`;

const assetTypes: { value: AssetType; label: string; description: string }[] = [
  {
    value: 'graphic',
    label: 'Graphic',
    description: 'SVG proof for images, icons, logos, textures, and visual assets.',
  },
  {
    value: 'model3d',
    label: '3D Model',
    description: 'GLTF proof mesh for avatars, props, spaces, and model assets.',
  },
  {
    value: 'audio',
    label: 'Sound',
    description: 'WAV proof tone for SFX, voice, music, and ambience assets.',
  },
  {
    value: 'bundle',
    label: 'Bundle',
    description: 'JSON pack manifest for grouping generated assets.',
  },
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
  const [prompt, setPrompt] = useState('A premium cinematic AI infrastructure dashboard with glowing asset pipelines.');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [durationSeconds, setDurationSeconds] = useState(2);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [assets, setAssets] = useState<Record<string, StudioAsset>>({});
  const [status, setStatus] = useState('Ready to generate production-proof assets.');
  const [busy, setBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const selectedType = useMemo(
    () => assetTypes.find((type) => type.value === assetType) ?? assetTypes[0],
    [assetType]
  );

  const requestHeaders = useMemo(
    () => ({
      'x-tenant-id': tenantId.trim() || 'demo',
    }),
    [tenantId]
  );

  const refreshJobs = useCallback(async () => {
    const response = await fetch(JOB_API_ENDPOINT, {
      cache: 'no-store',
      headers: requestHeaders,
    });

    if (!response.ok) throw new Error('Failed to fetch jobs.');

    const data = await response.json();
    setJobs(Array.isArray(data) ? data : []);
  }, [requestHeaders]);

  const refreshAssets = useCallback(async () => {
    const response = await fetch(ASSETS_API_ENDPOINT, {
      cache: 'no-store',
      headers: requestHeaders,
    });

    if (!response.ok) return;

    const data = await response.json();
    if (!Array.isArray(data)) return;

    setAssets(
      Object.fromEntries(data.map((asset: StudioAsset) => [asset.jobId, asset]))
    );
  }, [requestHeaders]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all([refreshJobs(), refreshAssets()]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh jobs.');
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshAssets, refreshJobs]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim()) {
      setStatus('Enter a prompt before generating.');
      return;
    }

    setBusy(true);
    setError('');
    setStatus('Submitting generation job...');

    try {
      const jobId = `studio-${assetType}-${uuidv4()}`;
      const tenant = tenantId.trim() || 'demo';

      const body = {
        jobId,
        tenantId: tenant,
        prompt,
        type: assetType,
        size: assetType === 'graphic' || assetType === 'model3d' ? { width, height } : undefined,
        transparentBackground: false,
        metadata:
          assetType === 'audio'
            ? { source: 'assetfactory-studio', durationSeconds }
            : assetType === 'bundle'
              ? { source: 'assetfactory-studio', assets: [] }
              : { source: 'assetfactory-studio' },
      };

      const response = await fetch(GENERATE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': jobId,
          'x-tenant-id': tenant,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Job submission failed.');

      setStatus(
        `Queued ${result.canonicalType ?? assetType} job ${result.jobId}. Estimated ${
          result.estimatedUnits ?? 0
        } unit(s).`
      );

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
      const response = await fetch(MATERIALIZE_ENDPOINT(jobId), {
        method: 'POST',
        headers: requestHeaders,
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
      const response = await fetch(PUBLISH_ENDPOINT(jobId), {
        method: 'POST',
        headers: requestHeaders,
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
          <p style={{ color: '#93c5fd', margin: 0, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Asset Factory Studio
          </p>
          <h1 style={{ fontSize: 'clamp(2.25rem, 6vw, 4.75rem)', lineHeight: 0.95, margin: '0.5rem 0', letterSpacing: '-0.06em' }}>
            Generate graphics, models, sounds, and bundles.
          </h1>
          <p style={{ color: '#cbd5e1', maxWidth: 780, lineHeight: 1.6 }}>
            Queue, render, persist, review, and publish deterministic proof assets through the canonical generate → materialize → fetch → publish flow, backed by Firebase production storage or a safe local fallback.
          </p>
        </section>

        <form onSubmit={createJob} style={{ ...cardStyle, display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="tenantId" style={{ fontWeight: 700 }}>Tenant ID</label>
            <input
              id="tenantId"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              style={inputStyle}
              placeholder="demo"
            />
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            <legend style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Asset type</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
              {assetTypes.map((type) => (
                <label
                  key={type.value}
                  style={{
                    ...cardStyle,
                    cursor: 'pointer',
                    borderColor: assetType === type.value ? '#38bdf8' : '#374151',
                  }}
                >
                  <input
                    type="radio"
                    name="assetType"
                    value={type.value}
                    checked={assetType === type.value}
                    onChange={() => setAssetType(type.value)}
                    style={{ marginRight: 8 }}
                  />
                  <strong>{type.label}</strong>
                  <p style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.4 }}>
                    {type.description}
                  </p>
                </label>
              ))}
            </div>
          </fieldset>

          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="prompt" style={{ fontWeight: 700 }}>Prompt</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the production asset to generate"
              style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }}
            />
          </div>

          {(assetType === 'graphic' || assetType === 'model3d') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                Width
                <input
                  type="number"
                  min={64}
                  max={4096}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                Height
                <input
                  type="number"
                  min={64}
                  max={4096}
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                  style={inputStyle}
                />
              </label>
            </div>
          )}

          {assetType === 'audio' && (
            <label style={{ display: 'grid', gap: '0.4rem' }}>
              Duration seconds
              <input
                type="number"
                min={1}
                max={30}
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
          )}

          <Button type="submit" disabled={busy || !prompt.trim()} variant="primary">
            {busy ? 'Working...' : `Create ${selectedType.label} Job`}
          </Button>
        </form>

        <section aria-live="polite" style={{ ...cardStyle, borderColor: error ? '#ef4444' : '#374151' }}>
          <strong>Status:</strong>{' '}
          <span style={{ color: error ? '#fca5a5' : '#93c5fd' }}>
            {error || status}
          </span>
        </section>

        <section style={{ ...cardStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>Job history</h2>
              <p style={{ color: '#9ca3af', margin: '0.25rem 0 0' }}>
                Latest queued, materialized, and published assets.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void refreshAll()} disabled={busy || isRefreshing}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {jobs.length === 0 ? (
            <p style={{ color: '#9ca3af' }}>
              No jobs yet. Create a graphic, 3D model, sound, or bundle to verify the pipeline end-to-end.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
              {jobs.map((job) => {
                const asset = assets[job.jobId];

                return (
                  <article key={job.jobId} style={{ ...cardStyle, background: '#111827' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{job.canonicalType ?? job.type ?? 'asset'}</h3>
                        <p style={{ color: '#9ca3af', margin: '0.35rem 0', maxWidth: 760 }}>
                          {job.prompt ?? 'No prompt'}
                        </p>
                        <code style={{ color: '#7dd3fc' }}>{job.jobId}</code>
                        <p style={{ color: '#64748b', margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
                          {job.status ?? 'unknown'} · {job.queueStatus ?? 'no queue status'} ·{' '}
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'no date'}
                        </p>
                        {typeof job.estimatedUnits === 'number' && (
                          <p style={{ color: '#64748b', margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
                            Estimated {job.estimatedUnits} unit(s)
                            {typeof job.estimatedCostCents === 'number'
                              ? ` · ${job.estimatedCostCents}¢`
                              : ''}
                          </p>
                        )}
                        {job.failureReason && <p style={{ color: '#fca5a5' }}>{job.failureReason}</p>}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {!asset && (
                          <Button type="button" onClick={() => void materializeJob(job.jobId)} disabled={busy}>
                            Materialize
                          </Button>
                        )}
                        {asset && !asset.published && (
                          <Button type="button" onClick={() => void publishJob(job.jobId)} disabled={busy}>
                            Publish
                          </Button>
                        )}
                        {asset && (
                          <a href={`/api/generated-assets/${asset.fileName}`} style={{ color: '#38bdf8' }}>
                            Open asset
                          </a>
                        )}
                        {asset && (
                          <a href={`/api/generated-assets/${asset.manifestFile}`} style={{ color: '#38bdf8' }}>
                            Manifest
                          </a>
                        )}
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