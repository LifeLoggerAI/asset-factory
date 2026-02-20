'use client';
import { AppShell } from '../../../components/layout/DesignSystem';

const RefundPolicyPage = () => {
    return (
        <AppShell>
            <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem', background: '#222', borderRadius: '8px' }}>
                <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>Refund Policy</h1>
                    <p style={{ fontSize: '1.1rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Last Updated: {new Date().toLocaleDateString()}
                    </p>
                </header>

                <div style={{ color: '#ccc', lineHeight: 1.6 }}>
                    <p>Coming soon. Please check back later.</p>
                    {/* Placeholder for full Refund Policy content */}
                </div>
            </div>
        </AppShell>
    );
};

export default RefundPolicyPage;
