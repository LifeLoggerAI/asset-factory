'use client';
import { AppShell } from '../../../components/layout/DesignSystem';

const BillingDisclosurePage = () => {
    return (
        <AppShell>
            <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem', background: '#222', borderRadius: '8px' }}>
                <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>Billing Disclosure</h1>
                    <p style={{ fontSize: '1.1rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Last Updated: {new Date().toLocaleDateString()}
                    </p>
                </header>

                <div style={{ color: '#ccc', lineHeight: 1.6 }}>
                    <p>Asset Factory production rendering uses configured provider accounts and fails closed when billing, credentials, or promotion permissions are unavailable. Provider costs, limits, and account controls are managed through the configured provider and hosting accounts.</p>
                </div>
            </div>
        </AppShell>
    );
};

export default BillingDisclosurePage;
