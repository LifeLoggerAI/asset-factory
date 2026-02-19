
'use client';

import { AppShell } from '../../components/layout/DesignSystem';

const TrustPage = () => {
    return (
        <AppShell>
            <div style={{ maxWidth: '960px', margin: '2rem auto', padding: '2rem' }}>
                <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>Trust & Security</h1>
                    <p style={{ fontSize: '1.2rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Our commitment to a secure, reliable, and enterprise-ready platform.
                    </p>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                    {/* Secure by Design */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Secure by Design</h2>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>JWT-based authentication providing robust, stateless security.</li>
                            <li>Strict tenant isolation enforced at the API layer.</li>
                            <li>Secure token exchange mechanism for frontend applications.</li>
                            <li>Removed insecure direct download endpoints.</li>
                        </ul>
                    </div>

                    {/* Reliable & Scalable Architecture */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Reliable & Scalable</h2>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Scalable Firestore-based job queue for high throughput.</li>
                            <li>Decoupled worker architecture for resilient processing.</li>
                            <li>Near real-time job status tracking for users.</li>
                            <li>Production-ready process management using PM2.</li>
                        </ul>
                    </div>

                    {/* Monetization & Auditability */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Monetization & Audit</h2>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Immutable, auditable log of all billable events via an event-sourcing pattern.</li>
                            <li>Full traceability of every job from creation to completion.</li>
                            <li>Granular ledger system for clear cost attribution per tenant.</li>
                            <li>Version-locked generation pipelines and cryptographic hashing of output manifests to guarantee platform integrity.</li>
                            <li>Formal security policies and quarterly access reviews to ensure robust governance.</li>
                        </ul>
                    </div>

                    {/* Enterprise Readiness Roadmap */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Enterprise Roadmap</h2>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Full schema registry for API versioning.</li>
                            <li>99.5%+ uptime commitment for enterprise tiers.</li>
                            <li>Documented Disaster Recovery Plan (in progress).</li>
                            <li>Daily encrypted backups of all critical data.</li>
                        </ul>
                    </div>

                    {/* Incident Response & Reporting */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Incident Response & Reporting</h2>
                        <p style={{ color: '#ccc', lineHeight: '1.6' }}>
                            We are committed to resolving security vulnerabilities quickly and transparently. If you have discovered a security issue, please report it to us at:
                        </p>
                        <p style={{ marginTop: '1rem', fontWeight: 'bold', color: '#00aaff' }}>
                            security@assetfactory.app
                        </p>
                        <p style={{ color: '#ccc', marginTop: '1rem', lineHeight: '1.6' }}>
                            Our security team will acknowledge your report and keep you updated on our progress.
                        </p>
                    </div>
                </div>
            </div>
        </AppShell>
    );
};

export default TrustPage;
