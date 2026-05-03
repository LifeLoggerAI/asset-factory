import type { Metadata } from 'next';
import './globals.css';
import '@radix-ui/themes/styles.css';
import { Theme } from '@radix-ui/themes';
import AppShell from '../components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Asset Factory Studio',
  description: 'Deterministic AI Media Production Engine',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
        <Theme appearance="dark" accentColor="blue" grayColor="slate" scaling="100%">
          <AppShell>{children}</AppShell>
        </Theme>
      </body>
    </html>
  );
}
