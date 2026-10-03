'use client';

import Link from 'next/link';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

type AppShellProps = { children: ReactNode; };

type ButtonProps = {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  disabled?: boolean;
};

const palette = {
  bg: '#0b0d10',
  panel: '#12161b',
  panelStrong: '#171c22',
  line: '#2a3139',
  text: '#f1f3f5',
  muted: '#9aa3ad',
  accent: '#d6b76f',
  signal: '#93c5d5',
};

export const AppShell = ({ children }: AppShellProps) => (
  <div style={{ minHeight: '100vh', background: palette.bg, color: palette.text, display: 'flex', flexDirection: 'column' }}>
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 2rem',
        background: palette.panel,
        borderBottom: `1px solid ${palette.line}`,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'grid', gap: '0.15rem' }}>
        <Link href="/" style={{ textDecoration: 'none', color: palette.text, fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
          URAI Asset Factory
        </Link>
        <span style={{ color: palette.muted, fontSize: '0.74rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Production laboratory
        </span>
      </div>
      <nav aria-label="Asset Factory navigation" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link href="/admin/queue" style={{ textDecoration: 'none', color: palette.accent, fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Operator Queue
        </Link>
        <Link href="/trust" style={{ textDecoration: 'none', color: palette.signal, fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Trust &amp; Security
        </Link>
      </nav>
    </header>
    <main style={{ padding: '2rem', flex: 1 }}>{children}</main>
    <footer
      style={{
        padding: '1.5rem 2rem',
        color: palette.muted,
        borderTop: `1px solid ${palette.line}`,
        background: palette.panel,
        fontSize: '0.85rem',
      }}
    >
      Candidate → inspect → validate → accept or reject → promote. Generated output is not production authority by default.
    </footer>
  </div>
);

export const Button = ({ children, onClick, variant = 'primary', style, ...props }: ButtonProps) => {
  const styles: Record<'base' | 'primary' | 'secondary', CSSProperties> = {
    base: {
      minHeight: 44,
      padding: '0.78rem 1.1rem',
      borderRadius: '8px',
      fontWeight: 800,
      cursor: 'pointer',
      transition: 'background-color 0.16s ease, border-color 0.16s ease',
      border: '1px solid transparent',
    },
    primary: {
      background: palette.accent,
      color: '#17130b',
      borderColor: palette.accent,
    },
    secondary: {
      background: palette.panelStrong,
      color: palette.text,
      borderColor: palette.line,
    },
  };

  return (
    <button onClick={onClick} style={{ ...styles.base, ...(variant === 'primary' ? styles.primary : styles.secondary), ...style }} {...props}>
      {children}
    </button>
  );
};
