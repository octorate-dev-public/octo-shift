'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface SidebarProps {
  isOpen: boolean;
  userRole: 'admin' | 'user';
}

export default function Sidebar({ isOpen, userRole }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    schedule: true,
    management: false,
    admin: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const adminMenuItems = [
    { label: 'Dashboard', href: '/admin', icon: '📊' },
    { label: 'Dipendenti', href: '/admin/users', icon: '👥' },
    { label: 'Team', href: '/admin/teams', icon: '🏢' },
    { label: 'Impostazioni', href: '/admin/settings', icon: '⚙️' },
  ];

  const userMenuItems = [
    { label: 'Il mio Schedule', href: '/schedule', icon: '📅' },
    { label: 'Preferenze Turno', href: '/preferences', icon: '⭐' },
    { label: 'Richieste Scambio', href: '/swaps', icon: '🔄' },
    { label: 'Ferie e Permessi', href: '/leave', icon: '✈️' },
  ];

  const commonMenuItems = [
    { label: 'Calendario', href: '/calendar', icon: '📆' },
    { label: 'Chi è Reperibile', href: '/on-call', icon: '📞' },
  ];

  return (
    <aside
      className={`${
        isOpen ? 'w-64' : 'w-20'
      } bg-white border-r border-gray-200 h-screen overflow-y-auto transition-all duration-300 sticky top-0`}
    >
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-lg text-white font-bold text-lg">
          SW
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
        {/* Admin Section */}
        {userRole === 'admin' && (
          <div>
            <button
              onClick={() => toggleSection('admin')}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <span className={isOpen ? '' : 'hidden'}>Amministrazione</span>
              <svg
                className={`w-4 h-4 transition-transform ${
                  expandedSections.admin ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </button>
            {expandedSections.admin && isOpen && (
              <div className="ml-2 mt-2 space-y-1">
                {adminMenuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Schedule Section */}
        <div>
          <button
            onClick={() => toggleSection('schedule')}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <span className={isOpen ? '' : 'hidden'}>Scheduling</span>
            <svg
              className={`w-4 h-4 transition-transform ${
                expandedSections.schedule ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
          {expandedSections.schedule && isOpen && (
            <div className="ml-2 mt-2 space-y-1">
              {userRole === 'admin' && (
                <Link
                  href="/admin/schedule"
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  <span>📋</span>
                  <span>Crea Schedule</span>
                </Link>
              )}
              {userRole === 'user' &&
                userMenuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              {commonMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  <span>{item.icon}</span>
                  <span className={isOpen ? '' : 'hidden'}>{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Management Section (Ferie, Permessi) */}
        {userRole === 'admin' && (
          <div>
            <button
              onClick={() => toggleSection('management')}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <span className={isOpen ? '' : 'hidden'}>Gestione</span>
              <svg
                className={`w-4 h-4 transition-transform ${
                  expandedSections.management ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </button>
            {expandedSections.management && isOpen && (
              <div className="ml-2 mt-2 space-y-1">
                <Link
                  href="/admin/leave"
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  <span>✈️</span>
                  <span>Ferie e Permessi</span>
                </Link>
                <Link
                  href="/admin/on-call"
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  <span>📞</span>
                  <span>Reperibilità</span>
                </Link>
                <Link
                  href="/admin/swaps"
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  <span>🔄</span>
                  <span>Richieste Scambio</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Help Section */}
      {isOpen && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-gray-50">
          <button className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-center">
            💬 Aiuto
          </button>
        </div>
      )}
    </aside>
  );
}
