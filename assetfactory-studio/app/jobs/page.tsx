'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell, Button } from '../../components/layout/DesignSystem';

const JOBS_API_ENDPOINT = '/api/jobs';

const getStatusColor = (status) => {
    if (!status) return '#555';
    switch (status.toLowerCase()) {
        case 'completed':
        case 'complete': // Handle both cases for robustness
             return '#00cc88';
        case 'processing': return '#00aaff';
        case 'failed': return '#ff4444';
        case 'pending': return '#888';
        case 'retrying': return '#ffae42';
        case 'dead': return '#222';
        default: return '#555';
    }
};

const StatusPill = ({ status }) => {
    const style = {
        borderRadius: '9999px',
        padding: '0.25rem 0.75rem',
        fontSize: '0.8rem',
        fontWeight: 500,
        color: 'white',
        backgroundColor: getStatusColor(status),
        textTransform: 'capitalize',
    };

    return <span style={style}>{status}</span>;
};


const JobsPage = () => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [jwt, setJwt] = useState('');

    const fetchJobs = useCallback(async (token) => {
        if (!token) {
            setLoading(false);
            setError('Not authenticated.');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(JOBS_API_ENDPOINT, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch jobs.');
            }
            const data = await response.json();
            setJobs(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Assume JWT is stored in localStorage after login
        const token = localStorage.getItem('jwt');
        if (token) {
            setJwt(token);
        }
        fetchJobs(token);
        
        // Optional: refresh jobs periodically
        const interval = setInterval(() => fetchJobs(token), 5000);
        return () => clearInterval(interval);

    }, [fetchJobs]);

    return (
        <AppShell>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 600 }}>Job History</h2>
                <Button onClick={() => { window.location.href = '/jobs/new' }}>+ New Job</Button>
            </div>
            {loading && <p>Loading jobs...</p>}
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            {!loading && !error && (
                 <div style={{ border: '1px solid #333', borderRadius: '8px', backgroundColor: '#222', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>Job ID</th>
                                <th style={{ padding: '1rem' }}>Status</th>
                                <th style={{ padding: '1rem' }}>Prompt</th>
                                <th style={{ padding: '1rem' }}>Created</th>
                                <th style={{ padding: '1rem' }}>Duration (ms)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.length > 0 ? jobs.map(job => (
                                <tr key={job.jobId} style={{ borderBottom: '1px solid #333' }}>
                                    <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{job.jobId.substring(0,15)}...</td>
                                    <td style={{ padding: '1rem' }}><StatusPill status={job.status} /></td>
                                    <td style={{ padding: '1rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.prompt}</td>
                                    <td style={{ padding: '1rem' }}>{new Date(job.createdAt).toLocaleString()}</td>
                                    <td style={{ padding: '1rem' }}>{job.processingTimeMs || 'N/A'}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No jobs found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </AppShell>
    );
};

export default JobsPage;
