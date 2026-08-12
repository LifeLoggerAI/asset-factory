import type { Metadata, Viewport } from 'next';
import '@radix-ui/themes/styles.css';
import './globals.css';
import './production-polish.css';
import { Theme } from '@radix-ui/themes';
import AppShell from '../components/layout/AppShell';

export const metadata: Metadata = {
  title: 'URAI Asset Factory — Production Studio',
  description: 'Protected URAI production tooling for generating, reviewing, materializing, and publishing approved media assets.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07101a',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
        }}
      >
        <Theme
          appearance="dark"
          accentColor="blue"
          grayColor="slate"
          scaling="100%"
        >
          <AppShell>{children}</AppShell>
        </Theme>
      </body>
    </html>
  );
}
