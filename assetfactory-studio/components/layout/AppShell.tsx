
import React from 'react';

const AppShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar Navigation */}
      <aside className="w-64 flex-shrink-0 bg-gray-800 p-4">
        <div className="text-2xl font-bold mb-8">Asset Factory</div>
        <nav>
          <ul>
            <li className="mb-4"><a href="/" className="hover:text-gray-300">Dashboard</a></li>
            <li className="mb-4"><a href="/jobs" className="hover:text-gray-300">Jobs</a></li>
            <li className="mb-4"><a href="/billing" className="hover:text-gray-300">Billing</a></li>
            <li className="mb-4"><a href="/settings" className="hover:text-gray-300">Settings</a></li>
            <li className="mb-4"><a href="/docs" className="hover:text-gray-300">Docs</a></li>
          </ul>
        </nav>
      </aside>

      <div className="flex flex-col flex-1">
        {/* Top Status Bar */}
        <header className="bg-gray-800 p-4 flex justify-between items-center">
          <div>
            <span className="font-semibold">User Tier:</span> <span className="bg-blue-500 text-white px-2 py-1 rounded-full text-sm">Pro</span>
          </div>
          <div>
            <span className="font-semibold">Usage:</span> <span>[Mini Usage Meter]</span>
          </div>
          <button className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">Logout</button>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
