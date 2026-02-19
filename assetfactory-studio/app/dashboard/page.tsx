
'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../components/layout/DesignSystem';

const DASHBOARD_API_ENDPOINT = '/api/dashboard';

const DashboardPage = () => {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [jwt, setJwt] = useState('');

    const fetchMetrics = useCallback(async (token) => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(DASHBOARD_API_ENDPOINT, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Failed to fetch dashboard data.');
            const data = await response.json();
            setMetrics(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('jwt'); 
        if (token) {
            setJwt(token);
            fetchMetrics(token);
        }
    }, [fetchMetrics]);

    return (
        <AppShell>
            <div style={{ maxWidth: '1200px', margin: '2rem auto', padding: '2rem' }}>
                <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>Observability Dashboard</h1>
                    <p style={{ fontSize: '1.2rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Real-time system health and performance metrics.
                    </p>
                </header>

                {loading && <p>Loading metrics...</p>}
                {error && <p style={{ color: 'red' }}>{error}</p>}

                {metrics && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
                        <MetricCard title="Jobs Per Minute" value={metrics.jobsPerMinute.toFixed(2)} />
                        <MetricCard title="Failure Rate" value={`${(metrics.failureRate * 100).toFixed(2)}%`} />
                        <MetricCard title="Dead-Letter Queue Size" value={metrics.dlqSize} />
                        <MetricCard title="Avg. Cost Per Job" value={`$${metrics.avgCostPerJob.toFixed(4)}`} />
                        <MetricCard title="Avg. Processing Time" value={`${metrics.avgProcessingTimeMs.toFixed(0)}ms`} />
                    </div>
                )}
            </div>
        </AppShell>
    );
};

const MetricCard = ({ title, value }) => (
    <div style={styles.card}>
        <h3 style={styles.cardTitle}>{title}</h3>
        <p style={styles.cardValue}>{value}</p>
    </div>
);

const styles = {
    card: {
        background: '#222',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center',
    },
    cardTitle: {
        color: '#aaa',
        fontSize: '1rem',
        marginBottom: '1rem',
    },
    cardValue: {
        color: 'white',
        fontSize: '2.5rem',
        fontWeight: 'bold',
    },
};

export default DashboardPage;
