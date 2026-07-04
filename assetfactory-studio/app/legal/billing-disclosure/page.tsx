'use client';
import { AppShell } from '../../../components/layout/DesignSystem';

const BillingDisclosurePage = () => {
    return (
        <AppShell>
            <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem', background: '#222', borderRadius: '8px' }}>
                <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>Billing Disclosure</h1>
                    <p style={{ fontSize: '1.1rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Publication status: not yet published
                    </p>
                </header>

                <div style={{ color: '#ccc', lineHeight: 1.6 }}>
                    <p>This disclosure has not been published. Do not activate paid production services until the final billing terms are available and accepted.</p>
                </div>
            </div>
        </AppShell>
    );
};

export default BillingDisclosurePage;
