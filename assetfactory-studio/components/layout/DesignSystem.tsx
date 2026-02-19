
'use client';

import Link from 'next/link';

export const AppShell = ({ children }) => {
    return (
        <div style={{ minHeight: '100vh', background: '#111', color: 'white' }}>
            <header style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '1rem 2rem', 
                background: '#1a1a1a', 
                borderBottom: '1px solid #333' 
            }}>
                <Link href="/" style={{ textDecoration: 'none', color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>
                    Asset Factory
                </Link>
                <nav style={{ display: 'flex', gap: '1.5rem' }}>
                    <Link href="/trust" style={{ textDecoration: 'none', color: '#00aaff', fontWeight: 'semibold' }}>
                        Trust & Security
                    </Link>
                    {/* Add other navigation links here */}
                </nav>
            </header>
            <main style={{ padding: '2rem' }}>
                {children}
            </main>
            <footer style={{ 
                textAlign: 'center', 
                padding: '2rem', 
                marginTop: 'auto', 
                fontSize: '0.9rem', 
                color: '#888', 
                borderTop: '1px solid #333'
            }}>
                <p>&copy; {new Date().getFullYear()} Asset Factory. All rights reserved.</p>
            </footer>
        </div>
    );
};

export const Button = ({ children, onClick, variant = 'primary', ...props }) => {
    const styles = {
        base: {
            padding: '0.8rem 1.5rem',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
        },
        primary: {
            background: '#007BFF',
            color: 'white',
        },
        secondary: {
            background: '#555',
            color: 'white',
        }
    };

    const combinedStyles = {
        ...styles.base,
        ...(variant === 'primary' ? styles.primary : styles.secondary),
    };

    return (
        <button onClick={onClick} style={combinedStyles} {...props}>
            {children}
        </button>
    );
};
