'use client';
import { AppShell, Button } from '../../components/layout/DesignSystem';

const JOBS = [
    { id: 'job_1771242649854', status: 'Completed', type: 'Video', created: '2024-07-28T10:30:00Z', duration: '45s' },
    { id: 'job_1771242733278', status: 'Completed', type: 'Image Batch (x10)', created: '2024-07-28T10:32:00Z', duration: 'N/A' },
    { id: 'job_1771242812345', status: 'Processing', type: 'Audio', created: '2024-07-28T10:35:00Z', duration: 'In Progress' },
    { id: 'job_1771242900987', status: 'Failed', type: 'Storyboard', created: '2024-07-28T10:36:00Z', duration: '-' },
    { id: 'job_1771242987654', status: 'Queued', type: 'Video', created: '2024-07-28T10:38:00Z', duration: '-' },
];

const StatusPill = ({ status }) => {
    const style = {
        borderRadius: '9999px',
        padding: '0.25rem 0.75rem',
        fontSize: '0.8rem',
        fontWeight: 500,
        color: 'white',
    };
    if (status === 'Completed') style.backgroundColor = '#00cc88';
    else if (status === 'Processing') style.backgroundColor = '#00aaff';
    else if (status === 'Failed') style.backgroundColor = '#ff4444';
    else style.backgroundColor = '#555';

    return <span style={style}>{status}</span>;
};

const JobsPage = () => {
    return (
        <AppShell>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 600 }}>Job History</h2>
                <Button onClick={() => { window.location.href = '/jobs/new' }}>+ New Job</Button>
            </div>
            <div style={{ border: '1px solid #333', borderRadius: '8px', backgroundColor: '#222', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
                            <th style={{ padding: '1rem' }}>Job ID</th>
                            <th style={{ padding: '1rem' }}>Status</th>
                            <th style={{ padding: '1rem' }}>Asset Type</th>
                            <th style={{ padding: '1rem' }}>Created</th>
                            <th style={{ padding: '1rem' }}>Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        {JOBS.map(job => (
                            <tr key={job.id} style={{ borderBottom: '1px solid #333' }}>
                                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{job.id}</td>
                                <td style={{ padding: '1rem' }}><StatusPill status={job.status} /></td>
                                <td style={{ padding: '1rem' }}>{job.type}</td>
                                <td style={{ padding: '1rem' }}>{new Date(job.created).toLocaleString()}</td>
                                <td style={{ padding: '1rem' }}>{job.duration}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </AppShell>
    );
};

export default JobsPage;
