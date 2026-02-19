'use client';

import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppShell, Button } from '../components/layout/DesignSystem';

const JOB_API_ENDPOINT = '/api/jobs';
const TOKEN_API_ENDPOINT = '/api/get-token';

// --- Main Application Component ---
const StudioPage = () => {
    const [tenantId, setTenantId] = useState('');
    const [jwt, setJwt] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [prompt, setPrompt] = useState('A futuristic city skyline at sunset.');
    const [status, setStatus] = useState('');
    const [jobs, setJobs] = useState([]);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!tenantId) {
            setStatus('Please enter a Tenant ID.');
            return;
        }
        try {
            const response = await fetch(TOKEN_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId }),
            });
            if (!response.ok) throw new Error('Failed to get token.');
            const { token } = await response.json();
            setJwt(token);
            setIsLoggedIn(true);
            setStatus(`Logged in as ${tenantId}. You can now submit jobs.`);
        } catch (error) {
            setStatus(`Login failed: ${error.message}`);
            setIsLoggedIn(false);
        }
    };

    const handleCreateJob = async () => {
        if (!isLoggedIn) {
            setStatus('You must be logged in to create a job.');
            return;
        }
        setStatus('Submitting job...');
        const idempotencyKey = uuidv4();
        try {
            const response = await fetch(JOB_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`,
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({ prompt }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Job submission failed.');
            }
            const job = await response.json();
            setStatus(`Job successfully submitted! Job ID: ${job.jobId}`);
            fetchJobs(); // Refresh job list immediately
        } catch (error) {
            setStatus(`Error: ${error.message}`);
        }
    };

    const fetchJobs = useCallback(async () => {
        if (!jwt) return;
        try {
            const response = await fetch(JOB_API_ENDPOINT, {
                headers: { 'Authorization': `Bearer ${jwt}` },
            });
            if (!response.ok) throw new Error('Failed to fetch jobs.');
            const data = await response.json();
            setJobs(data);
        } catch (error) {
            console.error('Error fetching jobs:', error);
        }
    }, [jwt]);

    useEffect(() => {
        if (isLoggedIn) {
            fetchJobs();
            const interval = setInterval(fetchJobs, 5000); // Refresh every 5 seconds
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, fetchJobs]);

    return (
        <AppShell>
            <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem', background: '#222', borderRadius: '8px' }}>
                <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Asset Factory Studio</h1>
                
                {!isLoggedIn ? (
                    <LoginForm tenantId={tenantId} setTenantId={setTenantId} handleLogin={handleLogin} />
                ) : (
                    <div>
                        <JobForm prompt={prompt} setPrompt={setPrompt} handleCreateJob={handleCreateJob} />
                        <JobHistory jobs={jobs} />
                    </div>
                )}

                {status && <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#00aaff' }}>{status}</p>}
            </div>
        </AppShell>
    );
};

// --- Child Components ---

const LoginForm = ({ tenantId, setTenantId, handleLogin }) => (
    <form onSubmit={handleLogin}>
        <h2 style={{ marginBottom: '1rem' }}>Login</h2>
        <p style={{ color: '#aaa', marginBottom: '1rem' }}>Enter your Tenant ID to get a secure session token.</p>
        <input 
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Enter your Tenant ID (e.g., tenant-123)"
            style={{ width: '100%', padding: '0.8rem', background: '#333', border: '1px solid #444', borderRadius: '4px', color: 'white', marginBottom: '1rem' }}
        />
        <Button type="submit" variant="primary" style={{ width: '100%' }}>Login</Button>
    </form>
);

const JobForm = ({ prompt, setPrompt, handleCreateJob }) => (
    <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Create New Job</h2>
        <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your asset generation prompt"
            style={{ width: '100%', minHeight: '120px', padding: '0.8rem', background: '#333', border: '1px solid #444', borderRadius: '4px', color: 'white', marginBottom: '1rem' }}
        />
        <Button onClick={handleCreateJob} variant="primary" style={{ width: '100%' }}>Submit Job</Button>
    </div>
);

const JobHistory = ({ jobs }) => (
    <div>
        <h2 style={{ marginBottom: '1rem' }}>Job History</h2>
        {jobs.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center' }}>No jobs found.</p>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {jobs.map(job => (
                    <div key={job.jobId} style={{ background: '#333', padding: '1rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ color: 'white', fontWeight: 'bold' }}>{job.jobId.substring(0, 8)}...</p>
                            <p style={{ color: '#aaa', fontSize: '0.9rem' }}>{new Date(job.createdAt).toLocaleString()}</p>
                        </div>
                        <p style={{
                            color: 'white', 
                            background: getStatusColor(job.status), 
                            padding: '0.3rem 0.8rem', 
                            borderRadius: '12px', 
                            fontSize: '0.9rem',
                            fontWeight: 'bold'
                        }}>
                            {job.status}
                        </p>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const getStatusColor = (status) => {
    switch (status) {
        case 'complete': return '#28a745';
        case 'processing': return '#ffc107';
        case 'failed': return '#dc3545';
        case 'queued': return '#17a2b8';
        default: return '#6c757d';
    }
};

export default StudioPage;
