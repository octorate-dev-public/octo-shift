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
      style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(245,245,240,0.85)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Toggle sidebar */}
      <button
        onClick={onMenuClick}
        aria-label="Toggle menu"
        style={{
          width: 32, height: 32, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none',
          color: '#6B7280', cursor: 'pointer',
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)'; (e.currentTarget as HTMLElement).style.color = '#111'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#6B7280'; }}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {/* Destra */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Badge ruolo */}
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
          background: userRole === 'admin' ? '#EBEBFF' : '#ECFDF5',
          color: userRole === 'admin' ? '#5B5BD6' : '#059669',
          letterSpacing: '0.01em',
        }}>
          {userRole === 'admin' ? 'Admin' : 'Utente'}
        </span>

        {/* Chip utente */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 10px 4px 4px', borderRadius: 99,
          background: 'rgba(255,255,255,0.75)',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: '#5B5BD6',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <span style={{
            fontSize: 13, fontWeight: 500, color: '#1A1A1A',
            maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} className="hidden sm:block">
            {userName}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          title="Esci"
          style={{
            width: 30, height: 30, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: '#9CA3AF', cursor: 'pointer',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLElement).style.color = '#DC2626'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#9CA3AF'; }}
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
