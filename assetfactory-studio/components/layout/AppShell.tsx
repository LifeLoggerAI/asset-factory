import React from 'react';

const AppShell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: '100vh', background: '#0b1020', color: '#e2e8f0' }}>
    <aside style={{ padding: 16, borderRight: '1px solid #1e293b' }}>
      <h2>Asset Factory</h2>
      <nav style={{ display: 'grid', gap: 8 }}>
        <a href="/">Dashboard</a><a href="/jobs">Jobs</a><a href="/assets">Assets</a><a href="/system">System</a><a href="/usage">Usage</a>
      </nav>
    </aside>
    <main style={{ padding: 20 }}>{children}</main>
  </div>
);
export default AppShell;
