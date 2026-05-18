'use client';

import React, { useState, ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
  userRole?: 'admin' | 'user';
  userName?: string;
  onLogout?: () => void;
}

export default function Layout({
  children,
  userRole = 'user',
  userName = 'User',
  onLogout,
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isOpen={sidebarOpen} userRole={userRole} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 isolate">
        <Header
          userName={userName}
          userRole={userRole}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          onLogout={onLogout}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-5 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
