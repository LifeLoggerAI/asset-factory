import { AppShell, Button } from '../components/layout/DesignSystem';

const MetricCard = ({ title, value, description }) => (
    <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#222' }}>
        <h3 style={{ fontSize: '1.2rem', color: '#00aaff', margin: '0 0 0.5rem 0' }}>{title}</h3>
        <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0 0 1rem 0' }}>{value}</p>
        <p style={{ fontSize: '0.9rem', color: '#aaa', margin: 0 }}>{description}</p>
    </div>
);

const DashboardPage = () => {
    return (
        <AppShell>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 600 }}>Dashboard</h2>
                <Button onClick={() => { /* Navigate to new job page */ }}>+ New Job</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                <MetricCard title="Jobs Executed" value="1,428" description="This billing cycle" />
                <MetricCard title="Render Minutes Used" value="8,560" description="65% of monthly quota" />
                <MetricCard title="Storage Utilized" value="75.2 GB" description="37% of plan limit" />
                <MetricCard title="Errors" value="3" description="In the last 7 days" />
            </div>
            <div style={{ marginTop: '3rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>Recent Jobs</h3>
                {/* A real implementation would fetch and display a list of recent jobs here */}
                <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '1rem', backgroundColor: '#222' }}>
                    <p>Job #12345 - Video - Completed</p>
                    <p>Job #12344 - Image Batch - Completed</p>
                    <p>Job #12343 - Audio - Failed</p>
                </div>
            </div>
        </AppShell>
    );
};

export default DashboardPage;
