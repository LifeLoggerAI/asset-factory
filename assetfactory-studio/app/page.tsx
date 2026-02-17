import { AppShell, Button } from '../components/layout/DesignSystem';

const Feature = ({ title, children }) => (
    <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#00aaff', borderBottom: '2px solid #00aaff', paddingBottom: '0.5rem', display: 'inline-block' }}>{title}</h3>
        <p style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>{children}</p>
    </div>
);

const LandingPage = () => {
    return (
        <AppShell>
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <h1 style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '1rem' }}>From Creative Chaos to Production Infrastructure.</h1>
                <p style={{ fontSize: '1.25rem', color: '#aaa', maxWidth: '700px', margin: '0 auto 2rem auto' }}>
                    Asset Factory is a deterministic content production engine that enables you to generate, govern, and scale branded digital assets at industrial throughput. Stop making content. Start manufacturing it.
                </p>
                <Button onClick={() => { /* Navigate to sign up */ }} variant="primary">Request Early Access</Button>
            </div>

            <div style={{ maxWidth: '900px', margin: '4rem auto' }}>
                <Feature title="Deterministic by Design">
                    Unlike generative AI tools that produce unpredictable outputs, Asset Factory operates on deterministic production templates. Given the same inputs, you get repeatable, brand-consistent outcomes every time. Your brand, your rules.
                </Feature>

                <Feature title="Structured, Multi-Format Output">
                    Move beyond single assets. Define a structured campaign and generate everything you need in one job: videos, images, voice-overs, subtitles, and storyboards. One command, a dozen assets.
                </Feature>

                <Feature title="Built for Scale">
                    Our job-based architecture and scalable engine are designed for high-volume workflows. Whether you're a creator managing a single brand or an agency managing fifty, Asset Factory is your production backbone.
                </Feature>
            </div>
        </AppShell>
    );
};

export default LandingPage;

