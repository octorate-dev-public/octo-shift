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
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Lista piatta di tutti gli item → usata nella vista collassata (solo icone)
  const allItems: MenuItem[] = sections.flatMap((s) => s.items);

  return (
    <aside
      className={`${
        isOpen ? 'w-64' : 'w-16'
      } shrink-0 bg-white border-r border-gray-200 h-screen overflow-y-auto transition-all duration-300 sticky top-0 z-30 flex flex-col`}
    >
      {/* Logo */}
      <div className={`${isOpen ? 'p-4' : 'p-3'} border-b border-gray-200 flex items-center justify-center`}>
        <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg text-white font-bold text-sm flex-shrink-0">
          SW
        </div>
      </div>

      {/* Navigation */}
      <nav className={`${isOpen ? 'p-3' : 'p-2'} space-y-1 flex-1`}>
        {isOpen ? (
          /* Vista espansa: sezioni con label e chevron */
          sections.map((section) => {
            const expanded = expandedSections[section.key];
            return (
              <div key={section.key}>
                <div className="flex items-center w-full rounded-lg hover:bg-gray-100 transition-colors">
                  <Link
                    href={section.href}
                    className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-l-lg ${
                      isActive(section.href) ? 'text-blue-700' : 'text-gray-500'
                    }`}
                  >
                    {section.label}
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => toggleSection(e, section.key)}
                    aria-label={expanded ? 'Comprimi sezione' : 'Espandi sezione'}
                    className="px-3 py-2 text-gray-400 hover:text-gray-700 rounded-r-lg"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {expanded && (
                  <div className="mt-1 space-y-0.5">
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
                          <span className="text-base leading-none">{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* Vista collassata: solo icone centrate con tooltip nativo al hover */
          <div className="flex flex-col gap-0.5">
            {allItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-colors text-lg ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {item.icon}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Help / bottom */}
      <div className={`border-t border-gray-200 bg-gray-50 ${isOpen ? 'p-3' : 'p-2'}`}>
        {isOpen ? (
          <button className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-center transition-colors">
            💬 Aiuto
          </button>
        ) : (
          <button
            title="Aiuto"
            className="flex items-center justify-center w-10 h-10 mx-auto rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg"
          >
            💬
          </button>
        )}
      </div>
    </aside>
  );
}
