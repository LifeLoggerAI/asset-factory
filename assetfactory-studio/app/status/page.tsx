'use client';
import { AppShell } from '../../components/layout/DesignSystem';

const StatusPage = () => {
    return (
        <AppShell>
            <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem', background: '#222', borderRadius: '8px' }}>
                <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>System Status</h1>
                    <p style={{ fontSize: '1.1rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Verified deployment and service-health evidence.
                    </p>
                </header>

                <div style={{ color: '#ccc', lineHeight: 1.6, textAlign: 'center' }}>
                    <p>No public status dashboard is currently published.</p>
                    <p>Treat service health as unverified unless it is supported by a current deployment receipt.</p>
                </div>
            </div>
        </AppShell>
    );
};

export default StatusPage;
