'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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
  href: string;
  items: MenuItem[];
}

export default function Sidebar({ isOpen, userRole }: SidebarProps) {
  const pathname = usePathname() ?? '';

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    schedule: true,
    management: true,
    admin: true,
  });

  const toggleSection = (e: React.MouseEvent, section: string) => {
    // Solo stopPropagation per evitare bubbling al div padre.
    // NON chiamare preventDefault(): su type="button" è no-op per il browser
    // ma imposta defaultPrevented=true sul SyntheticEvent React, che Chrome
    // interpreta come "click intercettato" e potrebbe confondere l'event tracing.
    e.stopPropagation();
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const adminMenuItems: MenuItem[] = [
    { label: 'Dashboard',     href: '/admin',          icon: '📊' },
    { label: 'Dipendenti',    href: '/admin/users',     icon: '👥' },
    { label: 'Team',          href: '/admin/teams',     icon: '🏢' },
    { label: 'Impostazioni',  href: '/admin/settings',  icon: '⚙️' },
  ];

  const userMenuItems: MenuItem[] = [
    { label: 'Il mio Schedule',    href: '/schedule',    icon: '📅' },
    { label: 'Preferenze Turno',   href: '/preferences', icon: '⭐' },
    { label: 'Richieste Scambio',  href: '/swaps',       icon: '🔄' },
    { label: 'Ferie e Permessi',   href: '/leave',       icon: '✈️' },
  ];

  const commonMenuItems: MenuItem[] = [
    { label: 'Calendario',       href: '/calendar', icon: '📆' },
    { label: 'Chi è Reperibile', href: '/on-call',  icon: '📞' },
  ];

  const sections: MenuSection[] = [];

  if (userRole === 'admin') {
    // ── Sezione amministrazione (solo admin) ──
    sections.push({ key: 'admin', label: 'Amministrazione', href: '/admin', items: adminMenuItems });

    // ── Scheduling e strumenti condivisi ──
    sections.push({
      key: 'schedule',
      label: 'Scheduling',
      href: '/admin/schedule',
      items: [
        { label: 'Crea Schedule',     href: '/admin/schedule', icon: '📋' },
        { label: 'Calendario',        href: '/calendar',       icon: '📆' },
        { label: 'Chi è Reperibile',  href: '/on-call',        icon: '📞' },
      ],
    });

    // ── Gestione (admin) ──
    sections.push({
      key: 'management',
      label: 'Gestione',
      href: '/admin/leave',
      items: [
        { label: 'Ferie e Permessi',   href: '/admin/leave',    icon: '✈️' },
        { label: 'Reperibilità',       href: '/admin/on-call',  icon: '📞' },
        { label: 'Richieste Scambio',  href: '/admin/swaps',    icon: '🔄' },
      ],
    });

    // ── Sezione personale: l'admin può usare tutte le funzioni utente ──
    sections.push({
      key: 'personal',
      label: 'Personale',
      href: '/schedule',
      items: [
        { label: 'Il mio Schedule',    href: '/schedule',    icon: '📅' },
        { label: 'Le mie Preferenze',  href: '/preferences', icon: '⭐' },
        { label: 'I miei Scambi',      href: '/swaps',       icon: '🔄' },
        { label: 'Ferie e Permessi',   href: '/leave',       icon: '✈️' },
      ],
    });
  } else {
    // ── Utente normale ──
    sections.push({
      key: 'schedule',
      label: 'Scheduling',
      href: '/schedule',
      items: [...userMenuItems, ...commonMenuItems],
    });
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const allItems: MenuItem[] = sections.flatMap((s) => s.items);

  const activeItemStyle: React.CSSProperties = {
    background: 'rgba(99,102,241,0.22)',
    color: '#c7d2fe',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 16px rgba(99,102,241,0.12)',
  };

  const inactiveItemStyle: React.CSSProperties = {
    color: 'rgba(148,163,184,0.7)',
  };

  return (
    <aside
      className={`${isOpen ? 'w-64' : 'w-16'} shrink-0 h-screen overflow-y-auto transition-all duration-[280ms] cubic-bezier(0.4,0,0.2,1) sticky top-0 z-30 flex flex-col`}
      style={{
        /* Liquid glass dark — il mesh del body è visibile attraverso il blur */
        background: 'rgba(6, 8, 24, 0.78)',
        backdropFilter: 'blur(56px) saturate(180%) brightness(0.85)',
        WebkitBackdropFilter: 'blur(56px) saturate(180%) brightness(0.85)',
        borderRight: '0.5px solid rgba(255,255,255,0.08)',
        /* Specular highlight sul bordo sinistro */
        boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.04), 4px 0 40px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── Logo ── */}
      <div
        className={`${isOpen ? 'px-4 py-4' : 'px-2 py-3'} flex items-center ${isOpen ? 'gap-3' : 'justify-center'} flex-shrink-0`}
        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <Image
            src="/project_icon.png"
            alt="Logo"
            width={36}
            height={36}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            priority
          />
        </div>
        {isOpen && (
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              SmartWork
            </p>
            <p style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(148,163,184,0.6)', letterSpacing: '0.03em' }}>
              Scheduler
            </p>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className={`${isOpen ? 'p-3' : 'p-2'} flex-1 space-y-0.5 overflow-y-auto`}>
        {isOpen ? (
          sections.map((section) => {
            const expanded = expandedSections[section.key];
            return (
              <div key={section.key} className="mb-1">
                {/* Section header */}
                <div className="flex items-center justify-between px-2 pt-3 pb-1">
                  <a
                    href={section.href}
                    style={{ flex: 1, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(100,116,139,0.65)', textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#818cf8'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(100,116,139,0.65)'; }}
                  >
                    {section.label}
                  </a>
                  <button
                    type="button"
                    onClick={(e) => toggleSection(e, section.key)}
                    aria-label={expanded ? 'Comprimi' : 'Espandi'}
                    className="p-0.5 rounded transition-colors"
                    style={{ color: 'rgba(100,116,139,0.7)' }}
                  >
                    <svg
                      className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Items */}
                {expanded && (
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
                          style={active ? activeItemStyle : inactiveItemStyle}
                          onMouseEnter={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                              (e.currentTarget as HTMLElement).style.color = 'rgba(226,232,240,1)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = '';
                              (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,0.85)';
                            }
                          }}
                        >
                          <span className="text-base leading-none w-5 text-center flex-shrink-0">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* ── Vista collassata: icone centrate ── */
          <div className="flex flex-col gap-0.5 pt-1">
            {allItems.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl text-lg transition-all duration-150"
                  style={active
                    ? { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }
                    : { color: 'rgba(148,163,184,0.7)' }
                  }
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                      (e.currentTarget as HTMLElement).style.color = 'rgba(226,232,240,1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = '';
                      (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,0.7)';
                    }
                  }}
                >
                  {item.icon}
                </a>
              );
            })}
          </div>
        )}
      </nav>

      {/* ── Bottom ── */}
      <div
        className={`flex-shrink-0 ${isOpen ? 'p-3' : 'p-2'}`}
        style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}
      >
        {isOpen ? (
          <button
            className="w-full px-3 py-2 text-sm rounded-xl text-center transition-all duration-150"
            style={{ color: 'rgba(100,116,139,0.8)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = '';
              (e.currentTarget as HTMLElement).style.color = 'rgba(100,116,139,0.8)';
            }}
          >
            💬 Aiuto
          </button>
        ) : (
          <button
            title="Aiuto"
            className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl text-lg transition-all duration-150"
            style={{ color: 'rgba(100,116,139,0.7)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = '';
              (e.currentTarget as HTMLElement).style.color = 'rgba(100,116,139,0.7)';
            }}
          >
            💬
          </button>
        )}
      </div>
    </aside>
  );
}
