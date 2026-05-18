'use client';

import React from 'react';

interface HeaderProps {
  userName: string;
  userRole: 'admin' | 'user';
  onMenuClick: () => void;
  onLogout?: () => void;
}

export default function Header({ userName, userRole, onMenuClick, onLogout }: HeaderProps) {
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <header
      className="shrink-0 z-20 h-14 px-4 flex items-center justify-between"
      style={{
        background: 'rgba(255, 255, 255, 0.055)',
        backdropFilter: 'blur(48px) saturate(160%)',
        WebkitBackdropFilter: 'blur(48px) saturate(160%)',
        borderBottom: '0.5px solid rgba(255, 255, 255, 0.10)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.15)',
      }}
    >
      {/* Hamburger */}
      <button
        onClick={onMenuClick}
        aria-label="Toggle menu"
        style={{
          width: 36, height: 36, borderRadius: 10, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.07)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer', transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.background = 'rgba(99,102,241,0.25)';
          el.style.borderColor = 'rgba(99,102,241,0.4)';
          el.style.color = '#a5b4fc';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.background = 'rgba(255,255,255,0.07)';
          el.style.borderColor = 'rgba(255,255,255,0.1)';
          el.style.color = 'rgba(255,255,255,0.7)';
        }}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Destra */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Badge ruolo */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
            background: userRole === 'admin'
              ? 'rgba(99,102,241,0.2)'
              : 'rgba(16,185,129,0.2)',
            color: userRole === 'admin' ? '#a5b4fc' : '#6ee7b7',
            border: `0.5px solid ${userRole === 'admin' ? 'rgba(99,102,241,0.35)' : 'rgba(16,185,129,0.35)'}`,
          }}
        >
          {userRole === 'admin' ? '⚡ Admin' : '● Utente'}
        </span>

        {/* User chip */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '5px 12px 5px 5px', borderRadius: 999,
            background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              boxShadow: '0 0 12px rgba(99,102,241,0.5)',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <span
            className="hidden sm:block"
            style={{
              fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
              color: 'rgba(255,255,255,0.85)',
              maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {userName}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          aria-label="Esci"
          title="Esci"
          style={{
            width: 36, height: 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.background = 'rgba(244,63,94,0.18)';
            el.style.color = '#fda4af';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.background = 'transparent';
            el.style.color = 'rgba(255,255,255,0.35)';
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
