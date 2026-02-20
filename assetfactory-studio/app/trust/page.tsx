
'use client';

import { AppShell } from '../../components/layout/DesignSystem';

const TrustPage = () => {
    return (
        <AppShell>
            <div style={{ maxWidth: '1280px', margin: '2rem auto', padding: '2rem' }}>
                <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '3.5rem', fontWeight: 'bold' }}>Sovereign-Grade Infrastructure</h1>
                    <p style={{ fontSize: '1.2rem', color: '#aaa', marginTop: '0.5rem' }}>
                        This is not a SaaS application. This is a distributed, financial-grade infrastructure.
                    </p>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem' }}>

                    {/* Byzantine-Resistant 3-Cloud Quorum */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Byzantine-Resistant Quorum</h2>
                        <p style={{ color: '#ccc', lineHeight: '1.6', marginBottom: '1rem' }}>
                            We operate a 3-cloud quorum (GCP, AWS, Azure) to achieve distributed consensus and financial-grade resilience. Every event is replicated, cryptographically signed, and confirmed by a majority of clouds before finality.
                        </p>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Tolerates one cloud failure, network partition, or malicious actor.</li>
                            <li>No single point of failure.</li>
                            <li>Cryptographic proof of all transactions.</li>
                        </ul>
                    </div>

                    {/* Decentralized & Resilient by Design */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Decentralized by Design</h2>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Federated validator network for job submission and ordering.</li>
                            <li>Removes single point of failure of a centralized job queue.</li>
                            <li>Enhanced security and resilience against attacks.</li>
                        </ul>
                    </div>

                    {/* Tamper-Proof Audit Anchoring */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Tamper-Proof Auditing</h2>
                        <p style={{ color: '#ccc', lineHeight: '1.6', marginBottom: '1rem' }}>
                            We anchor cryptographic hashes of our ledgers to public blockchains. This provides a permanent, immutable, and publicly verifiable record of all system activity.
                        </p>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Immutable, auditable log of all billable events.</li>
                            <li>Full traceability for every job from creation to completion.</li>
                            <li>Cryptographic guarantee of platform integrity.</li>
                        </ul>
                    </div>

                    {/* Global Load Balancing Fabric */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Global Traffic Fabric</h2>
                        <p style={{ color: '#ccc', lineHeight: '1.6', marginBottom: '1rem' }}>
                            Our global DNS and latency-aware routing ensures that your requests are always served by the fastest and most reliable cloud, with automatic failover in the event of a regional outage.
                        </p>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Multi-cloud resilience (GCP, AWS, Azure).</li>
                            <li>Latency-aware routing for optimal performance.</li>
                            <li>Automated failover for high availability.</li>
                        </ul>
                    </div>

                    {/* Economic Simulation & Revenue Optimization */}
                    <div style={{ background: '#222', padding: '2rem', borderRadius: '8px' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'semibold', marginBottom: '1rem' }}>Autonomous Optimization</h2>
                        <p style={{ color: '#ccc', lineHeight: '1.6', marginBottom: '1rem' }}>
                            Our system uses a predictive economic simulation engine to model costs and an autonomous revenue optimizer to adjust pricing and resource allocation in real-time. This is economic foresight, not reactive panic.
                        </p>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <li>Predictive cost modeling to anticipate market shifts.</li>
                            <li>Automated price adjustments within policy bounds.</li>
                            <li>Self-tuning revenue optimization.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </AppShell>
    );
};

export default TrustPage;
