'use client';
import { AppShell } from '../../../components/layout/DesignSystem';

const sections = [
  {
    title: 'What Asset Factory processes',
    body: 'URAI Asset Factory processes account identifiers, tenant metadata, generation prompts and configuration, generated media assets, job metadata, usage and billing events, audit logs, support metadata, and optional LifeMap or Replay inputs that you explicitly connect.'
  },
  {
    title: 'Why we process data',
    body: 'We use this information to authenticate users, enforce subscriptions and usage limits, generate and package assets, preserve asset provenance, support export and replay workflows, secure the service, investigate abuse, and provide support.'
  },
  {
    title: 'Storage and retention',
    body: 'Generated assets are stored in tenant-scoped Cloud Storage paths. Job, usage, billing, webhook, audit, and export records are retained only as long as needed for product operation, security, legal, billing, and compliance obligations. Production deployments must configure lifecycle policies before launch.'
  },
  {
    title: 'Access controls',
    body: 'Direct client access must be scoped to the authenticated owner or tenant. Backend functions issue short-lived download access, write immutable billing ledgers, and record sensitive administrative actions in audit logs.'
  },
  {
    title: 'Your controls',
    body: 'Users may request account export, generated asset export, asset deletion, billing record review, and account deletion. Some records may be retained when required for security, fraud prevention, tax, or legal obligations.'
  },
  {
    title: 'Enterprise and ecosystem integrations',
    body: 'When Asset Factory is used inside the URAI ecosystem, integrations with Studio, Replay Engine, LifeMap, Admin, Privacy, Labs, and Foundation systems must follow tenant boundaries, purpose limitation, consent requirements, and audit logging.'
  },
  {
    title: 'Contact',
    body: 'For privacy, deletion, export, or security requests, contact support@uraiassetfactory.com. This page is product guidance and must be reviewed by counsel before public production launch.'
  }
];

const PrivacyPolicyPage = () => {
  return (
    <AppShell>
      <main style={{ maxWidth: '920px', margin: '2rem auto', padding: '2rem', background: '#151923', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <p style={{ color: '#8fd3ff', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.78rem' }}>URAI Asset Factory Trust</p>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0.5rem 0' }}>Privacy Policy</h1>
          <p style={{ fontSize: '1rem', color: '#aaa', marginTop: '0.5rem' }}>Last updated: May 4, 2026</p>
          <p style={{ color: '#cbd5e1', lineHeight: 1.7, maxWidth: '720px', margin: '1.25rem auto 0' }}>
            Asset Factory is designed as both a commercial asset-generation product and an internal URAI infrastructure layer. Privacy, tenant isolation, asset provenance, and deletion/export readiness are release requirements, not optional add-ons.
          </p>
        </header>

        <section style={{ display: 'grid', gap: '1rem' }}>
          {sections.map((section) => (
            <article key={section.title} style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.04)' }}>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{section.title}</h2>
              <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>{section.body}</p>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
};

export default PrivacyPolicyPage;
