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

  // ── Colori sidebar chiara (iOS 26 / macOS style) ──
  const ACCENT = '#5B5BD6';
  const ACCENT_BG = '#EBEBFF';
  const ACCENT_TEXT = '#5B5BD6';

  return (
    <aside
      className={`${isOpen ? 'w-60' : 'w-14'} shrink-0 h-screen overflow-y-auto transition-all duration-300 sticky top-0 z-30 flex flex-col`}
      style={{
        background: 'rgba(252,252,250,0.88)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        borderRight: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* ── Logo ── */}
      <div style={{
        padding: isOpen ? '16px 16px 12px' : '12px 8px',
        display: 'flex', alignItems: 'center',
        gap: isOpen ? 10 : 0,
        justifyContent: isOpen ? 'flex-start' : 'center',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
        }}>
          <Image src="/project_icon.png" alt="Logo" width={32} height={32}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} priority />
        </div>
        {isOpen && (
          <div>
            <p style={{ fontWeight: 700, fontSize: 13.5, color: '#111', letterSpacing: '-0.02em', lineHeight: 1.1 }}>SmartWork</p>
            <p style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 500, letterSpacing: '0.01em' }}>Scheduler</p>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav style={{ padding: isOpen ? '8px 8px' : '8px 6px', flex: 1, overflowY: 'auto' }}>
        {isOpen ? (
          sections.map((section) => {
            const expanded = expandedSections[section.key];
            return (
              <div key={section.key} style={{ marginBottom: 4 }}>
                {/* Section label */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px 4px' }}>
                  <a href={section.href} style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.10em', color: '#B0B0B0',
                    textDecoration: 'none', transition: 'color 0.12s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = ACCENT; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#B0B0B0'; }}
                  >{section.label}</a>
                  <button type="button" onClick={(e) => toggleSection(e, section.key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#C0C0C0', transition: 'color 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#555'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#C0C0C0'; }}
                  >
                    <svg style={{ width: 12, height: 12, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {expanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <a key={item.href} href={item.href}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', borderRadius: 8,
                            fontSize: 13.5, fontWeight: active ? 600 : 450,
                            letterSpacing: '-0.01em',
                            background: active ? ACCENT_BG : 'transparent',
                            color: active ? ACCENT_TEXT : '#4B5563',
                            textDecoration: 'none',
                            transition: 'background 0.12s, color 0.12s',
                          }}
                          onMouseEnter={e => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)';
                              (e.currentTarget as HTMLElement).style.color = '#111';
                            }
                          }}
                          onMouseLeave={e => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                              (e.currentTarget as HTMLElement).style.color = '#4B5563';
                            }
                          }}
                        >
                          <span style={{ fontSize: 14, lineHeight: 1, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* ── Collassata: solo icone ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
            {allItems.map((item) => {
              const active = isActive(item.href);
              return (
                <a key={item.href} href={item.href} title={item.label}
                  style={{
                    width: 36, height: 36, borderRadius: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, margin: '0 auto',
                    background: active ? ACCENT_BG : 'transparent',
                    transition: 'background 0.12s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {item.icon}
                </a>
              );
            })}
          </div>
        )}
      </nav>

      {/* ── Bottom ── */}
      <div style={{
        borderTop: '1px solid rgba(0,0,0,0.06)',
        padding: isOpen ? '8px' : '6px',
        flexShrink: 0,
      }}>
        <button style={{
          width: '100%', padding: isOpen ? '6px 10px' : '8px',
          borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'transparent', color: '#9CA3AF',
          fontSize: 12, fontWeight: 500,
          display: 'flex', alignItems: 'center',
          justifyContent: isOpen ? 'flex-start' : 'center', gap: 6,
          transition: 'background 0.12s, color 0.12s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLElement).style.color = '#555'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#9CA3AF'; }}
        >
          <span style={{ fontSize: 14 }}>💬</span>
          {isOpen && <span>Aiuto</span>}
        </button>
      </div>
    </aside>
  );
}
