import React from 'react';

// A professional, infrastructure-focused color palette
const colors = {
    background: '#1a1a1a',
    text: '#e0e0e0',
    primary: '#00aaff',
    border: '#333333',
    success: '#00cc88',
    error: '#ff4444',
};

// Consistent typography
const typography = {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h1: { fontSize: '2.5rem', fontWeight: 700 },
    h2: { fontSize: '2rem', fontWeight: 600 },
    body: { fontSize: '1rem', fontWeight: 400 },
};

// A reusable, branded button component
export const Button = ({ children, onClick, variant = 'primary' }) => (
    <button
        onClick={onClick}
        style={{
            backgroundColor: colors[variant],
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontFamily: typography.fontFamily,
            fontWeight: 500,
            transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = 0.9}
        onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
    >
        {children}
    </button>
);

// A layout component to ensure consistency
export const AppShell = ({ children }) => (
    <div style={{ backgroundColor: colors.background, color: colors.text, fontFamily: typography.fontFamily, minHeight: '100vh', padding: '2rem' }}>
        <header style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '1rem', marginBottom: '2rem' }}>
            <h1 style={{ ...typography.h1, color: colors.primary }}>Asset Factory</h1>
            <p style={{ ...typography.body, color: colors.text }}>The Deterministic Content Production Engine</p>
        </header>
        <main>
            {children}
        </main>
    </div>
);
