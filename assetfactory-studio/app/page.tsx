'use client';

import { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppShell, Button } from '../components/layout/DesignSystem';

const GENERATE_API_ENDPOINT = '/api/generate';
const JOB_API_ENDPOINT = '/api/jobs';
const MATERIALIZE_ENDPOINT = (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/materialize`;

type Job = {
  jobId: string;
  tenantId?: string;
  type?: string;
  prompt?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
};

export default function StudioPage() {
  const [tenantId, setTenantId] = useState('default');
  const [assetType, setAssetType] = useState('cinematic-poster');
  const [prompt, setPrompt] = useState('A premium cinematic AI infrastructure dashboard with glowing asset pipelines.');
  const [status, setStatus] = useState('Ready to generate production-proof assets.');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(JOB_API_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch jobs.');
      const data = (await response.json()) as Job[];
      setJobs(data);
    } catch (error) {
      setStatus(`Error fetching jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCreateJob = async () => {
    if (!prompt.trim()) {
      setStatus('Enter a prompt before generating.');
      return;
    }

    setIsSubmitting(true);
    setStatus('Submitting generation job...');
    const jobId = uuidv4();

    try {
      const response = await fetch(GENERATE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': jobId,
        },
        body: JSON.stringify({
          jobId,
          tenantId: tenantId.trim() || 'default',
          type: assetType.trim() || 'generic-asset',
          prompt,
          transparentBackground: false,
          metadata: {
            source: 'assetfactory-studio',
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Job submission failed.');

      setStatus(`Job queued: ${payload.jobId}. Rendering proof asset...`);

      const materializeResponse = await fetch(MATERIALIZE_ENDPOINT(payload.jobId), { method: 'POST' });
      const materializePayload = await materializeResponse.json();
      if (!materializeResponse.ok) throw new Error(materializePayload.error || 'Render failed.');

      setStatus(`Asset materialized for job ${payload.jobId}.`);
      await fetchJobs();
    } catch (error) {
      setStatus(`Generation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '2rem 0 4rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <p style={{ color: '#7dd3fc', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Asset Factory Studio
          </p>
          <h1 style={{ fontSize: 'clamp(2.5rem, 7vw, 5.5rem)', lineHeight: 0.92, margin: '0.5rem 0', letterSpacing: '-0.07em' }}>
            Production-grade creative infrastructure.
          </h1>
          <p style={{ color: '#cbd5e1', maxWidth: '720px', fontSize: '1.1rem', lineHeight: 1.7 }}>
            Queue, render, persist, review, and publish deterministic proof assets with Firebase-backed production storage and a safe local fallback for development.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
          <div style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #111827, #0f172a)', border: '1px solid #243244', borderRadius: '20px', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.5rem', color: '#cbd5e1' }}>
                Tenant
                <input
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  style={{ padding: '0.9rem 1rem', background: '#020617', border: '1px solid #334155', borderRadius: '12px', color: 'white' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.5rem', color: '#cbd5e1' }}>
                Asset type
                <input
                  value={assetType}
                  onChange={(event) => setAssetType(event.target.value)}
                  style={{ padding: '0.9rem 1rem', background: '#020617', border: '1px solid #334155', borderRadius: '12px', color: 'white' }}
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: '0.5rem', color: '#cbd5e1' }}>
              Prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the production asset to generate"
                style={{ width: '100%', minHeight: '140px', padding: '1rem', background: '#020617', border: '1px solid #334155', borderRadius: '16px', color: 'white', resize: 'vertical' }}
              />
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
              <Button onClick={handleCreateJob} variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Generating...' : 'Generate proof asset'}
              </Button>
              <Button onClick={fetchJobs} variant="secondary" disabled={isRefreshing}>
                {isRefreshing ? 'Refreshing...' : 'Refresh jobs'}
              </Button>
              <span role="status" aria-live="polite" style={{ color: '#7dd3fc' }}>{status}</span>
            </div>
          </div>

          <JobHistory jobs={jobs} />
        </div>
      </section>
    </AppShell>
  );
}

function JobHistory({ jobs }: { jobs: Job[] }) {
  return (
    <section style={{ padding: '1.25rem', background: '#0f172a', border: '1px solid #243244', borderRadius: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Job History</h2>
          <p style={{ color: '#94a3b8', margin: '0.25rem 0 0' }}>Latest queued and materialized assets.</p>
        </div>
        <span style={{ color: '#94a3b8' }}>{jobs.length} jobs</span>
      </div>

      {jobs.length === 0 ? (
        <div style={{ border: '1px dashed #334155', borderRadius: '16px', padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
          No jobs yet. Generate your first proof asset to verify the pipeline end-to-end.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {jobs.map((job) => (
            <article key={job.jobId} style={{ background: '#020617', padding: '1rem', borderRadius: '16px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                <div>
                  <strong>{job.type ?? 'asset'}</strong>
                  <p style={{ color: '#94a3b8', margin: '0.35rem 0', maxWidth: '780px' }}>{job.prompt ?? 'No prompt'}</p>
                  <code style={{ color: '#7dd3fc' }}>{job.jobId}</code>
                </div>
                <span style={{ background: getStatusColor(job.status), color: 'white', padding: '0.35rem 0.75rem', borderRadius: '999px', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 700 }}>
                  {job.status ?? 'unknown'}
                </span>
              </div>
              <p style={{ color: '#64748b', margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
                Created {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'unknown'}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function getStatusColor(status?: string) {
  switch (status) {
    case 'materialized':
      return '#15803d';
    case 'processing':
      return '#b45309';
    case 'failed':
      return '#b91c1c';
    case 'queued':
      return '#0369a1';
    default:
      return '#475569';
  }
}
