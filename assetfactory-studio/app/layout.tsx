import type { Metadata } from 'next';
import './globals.css';
import AppShell from '../components/layout/AppShell';
export const metadata: Metadata = { title: 'Asset Factory Studio', description: 'Deterministic AI Media Production Engine' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang='en'><body style={{fontFamily:'Inter,system-ui,sans-serif'}}><AppShell>{children}</AppShell></body></html>; }
