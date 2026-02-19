
'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../components/layout/DesignSystem';

const USAGE_API_ENDPOINT = '/api/usage';

const UsagePage = () => {
    const [usage, setUsage] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [jwt, setJwt] = useState('');

    const fetchUsage = useCallback(async (token) => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(USAGE_API_ENDPOINT, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Failed to fetch usage data.');
            const data = await response.json();
            setUsage(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // In a real app, you'd get the JWT from your auth context
        const token = localStorage.getItem('jwt'); 
        if (token) {
            setJwt(token);
            fetchUsage(token);
        }
    }, [fetchUsage]);

    return (
        <AppShell>
            <div style={{ maxWidth: '960px', margin: '2rem auto', padding: '2rem' }}>
                <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>Usage Dashboard</h1>
                    <p style={{ fontSize: '1.2rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Your recent job history and associated costs.
                    </p>
                </header>

                {loading && <p>Loading usage data...</p>}
                {error && <p style={{ color: 'red' }}>{error}</p>}

                {!loading && !error && (
                    <div style={{ background: '#222', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Job ID</th>
                                    <th style={styles.th}>Created At</th>
                                    <th style={styles.th}>Status</th>
                                    <th style={styles.th}>Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usage.map(job => (
                                    <tr key={job.jobId} style={styles.tr}>
                                        <td style={styles.td}>{job.jobId.substring(0, 12)}...</td>
                                        <td style={styles.td}>{new Date(job.createdAt).toLocaleString()}</td>
                                        <td style={styles.td}>
                                            <span style={getStatusChipStyle(job.status)}>{job.status}</span>
                                        </td>
                                        <td style={styles.td}>${(job.cost || 0).toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppShell>
    );
};

const styles = {
    th: {
        background: '#333',
        color: 'white',
        padding: '1rem',
        textAlign: 'left',
        borderBottom: '1px solid #444',
    },
    tr: {
        borderBottom: '1px solid #444',
    },
    td: {
        padding: '1rem',
        color: '#ccc',
    },
};

const getStatusChipStyle = (status) => {
    const baseStyle = {
        padding: '0.3rem 0.8rem',
        borderRadius: '12px',
        fontSize: '0.9rem',
        fontWeight: 'bold',
        color: 'white',
    };
    switch (status) {
        case 'complete': return { ...baseStyle, background: '#28a745' };
        case 'processing': return { ...baseStyle, background: '#ffc107' };
        case 'failed': return { ...baseStyle, background: '#dc3545' };
        case 'queued': return { ...baseStyle, background: '#17a2b8' };
        default: return { ...baseStyle, background: '#6c757d' };
    }
};

export default UsagePage;
