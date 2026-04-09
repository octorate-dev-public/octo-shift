'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  isOpen: boolean;
  userRole: 'admin' | 'user';
}

interface MenuItem {
  label: string;
  href: string;
  icon: string;
}

interface MenuSection {
  key: string;
  label: string;
  href: string; // dove andare quando si clicca sul titolo della sezione
  items: MenuItem[];
}

export default function Sidebar({ isOpen, userRole }: SidebarProps) {
  const pathname = usePathname() ?? '';

  // Tutte le sezioni partono espanse: i menu devono essere immediatamente
  // visibili e cliccabili senza un toggle preliminare.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    schedule: true,
    management: true,
    admin: true,
  });

  const toggleSection = (e: React.MouseEvent, section: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const adminMenuItems: MenuItem[] = [
    { label: 'Dashboard', href: '/admin', icon: '📊' },
    { label: 'Dipendenti', href: '/admin/users', icon: '👥' },
    { label: 'Team', href: '/admin/teams', icon: '🏢' },
    { label: 'Impostazioni', href: '/admin/settings', icon: '⚙️' },
  ];

  const userMenuItems: MenuItem[] = [
    { label: 'Il mio Schedule', href: '/schedule', icon: '📅' },
    { label: 'Preferenze Turno', href: '/preferences', icon: '⭐' },
    { label: 'Richieste Scambio', href: '/swaps', icon: '🔄' },
    { label: 'Ferie e Permessi', href: '/leave', icon: '✈️' },
  ];

  const commonMenuItems: MenuItem[] = [
    { label: 'Calendario', href: '/calendar', icon: '📆' },
    { label: 'Chi è Reperibile', href: '/on-call', icon: '📞' },
  ];

  // Costruisce dinamicamente le sezioni in base al ruolo
  const sections: MenuSection[] = [];

  if (userRole === 'admin') {
    sections.push({
      key: 'admin',
      label: 'Amministrazione',
      href: '/admin',
      items: adminMenuItems,
    });
  }

  sections.push({
    key: 'schedule',
    label: 'Scheduling',
    href: userRole === 'admin' ? '/admin/schedule' : '/schedule',
    items:
      userRole === 'admin'
        ? [
            { label: 'Crea Schedule', href: '/admin/schedule', icon: '📋' },
            ...commonMenuItems,
          ]
        : [...userMenuItems, ...commonMenuItems],
  });

  if (userRole === 'admin') {
    sections.push({
      key: 'management',
      label: 'Gestione',
      href: '/admin/leave',
      items: [
        { label: 'Ferie e Permessi', href: '/admin/leave', icon: '✈️' },
        { label: 'Reperibilità', href: '/admin/on-call', icon: '📞' },
        { label: 'Richieste Scambio', href: '/admin/swaps', icon: '🔄' },
      ],
    });
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    // Match esatto, oppure è una sotto-rotta
    return pathname === href || pathname.startsWith(href + '/');
  };

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
        {sections.map((section) => {
          const expanded = expandedSections[section.key];
          return (
            <div key={section.key}>
              {/* Header di sezione: il titolo è un Link, il chevron è un button separato */}
              <div className="flex items-center w-full rounded-lg hover:bg-gray-100 transition-colors">
                <Link
                  href={section.href}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-l-lg ${
                    isActive(section.href) ? 'text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <span className={isOpen ? '' : 'hidden'}>{section.label}</span>
                </Link>
                {isOpen && (
                  <button
                    type="button"
                    onClick={(e) => toggleSection(e, section.key)}
                    aria-label={expanded ? 'Comprimi sezione' : 'Espandi sezione'}
                    className="px-3 py-2 text-gray-500 hover:text-gray-900 rounded-r-lg"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
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
                )}
              </div>

              {/* Voci di sezione */}
              {expanded && isOpen && (
                <div className="ml-2 mt-2 space-y-1">
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
