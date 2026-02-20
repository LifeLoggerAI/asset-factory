'use client';
import { AppShell } from '../../components/layout/DesignSystem';
import Link from 'next/link';

const TrustPage = () => {
    return (
        <AppShell>
            <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem', background: '#222', borderRadius: '8px' }}>
                <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>Trust & Transparency</h1>
                    <p style={{ fontSize: '1.1rem', color: '#aaa', marginTop: '0.5rem' }}>
                        Your security, privacy, and satisfaction are our top priorities.
                    </p>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <InfoCard 
                        title="Terms of Service" 
                        description="The rules of the road for using Asset Factory."
                        link="/legal/terms-of-service"
                    />
                    <InfoCard 
                        title="Privacy Policy" 
                        description="How we collect, use, and protect your data."
                        link="/legal/privacy-policy"
                    />
                    <InfoCard 
                        title="Refund Policy" 
                        description="Our policy on refunds and subscription cancellations."
                        link="/legal/refund-policy"
                    />
                    <InfoCard 
                        title="Billing Disclosure" 
                        description="Clear, upfront information about our pricing and billing."
                        link="/legal/billing-disclosure"
                    />
                     <InfoCard 
                        title="Security Measures" 
                        description="How we secure our platform and your assets."
                        link="/legal/security"
                    />
                    <InfoCard 
                        title="System Status" 
                        description="Check real-time and historical uptime data."
                        link="/status"
                    />
                </div>
                 <div style={{ textAlign: 'center', marginTop: '3rem', color: '#888' }}>
                    <p>Have questions? Contact us at <a href="mailto:support@assetfactory.com" style={{ color: '#00aaff' }}>support@assetfactory.com</a>.</p>
                </div>
            </div>
        </AppShell>
    );
};

const InfoCard = ({ title, description, link }) => (
    <Link href={link} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{
            background: '#333',
            borderRadius: '8px',
            padding: '1.5rem',
            height: '100%',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer',
        }} onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
        }} onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = 'none';
        }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{title}</h3>
            <p style={{ fontSize: '0.9rem', color: '#aaa' }}>{description}</p>
        </div>
    </Link>
);

export default TrustPage;
