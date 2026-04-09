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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        userRole={userRole}
      />

      {/* Main content */}
      {/* min-w-0 è essenziale: senza, una tabella molto larga (es. matrice
          del calendario) fa espandere la colonna flex oltre la sua quota e
          finisce per coprire/spingere la sidebar. */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <Header
          userName={userName}
          userRole={userRole}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          onLogout={onLogout}
        />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
