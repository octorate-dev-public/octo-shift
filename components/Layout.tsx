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
    <div className="flex h-screen" style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #eef2ff 55%, #f0f9ff 100%)' }}>
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        userRole={userRole}
      />

      {/* Main content */}
      {/* min-w-0 è essenziale: senza, una tabella molto larga (es. matrice
          del calendario) fa espandere la colonna flex oltre la sua quota e
          finisce per coprire/spingere la sidebar. */}
      {/* isolate crea un nuovo stacking context: qualsiasi z-index interno
          (es. z-10 delle celle sticky della tabella Matrice) resta confinato
          qui dentro e non può mai "battere" il z-30 della sidebar a livello
          globale, evitando che le celle catturino i pointer events sopra la sidebar. */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 isolate">
        {/* Header */}
        <Header
          userName={userName}
          userRole={userRole}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          onLogout={onLogout}
        />

        {/* Page content — overflow-x-hidden impedisce a contenuti molto larghi
            (come la tabella della Matrice) di estendersi fisicamente fuori dal
            contenitore e sovrapporsi alla sidebar. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
