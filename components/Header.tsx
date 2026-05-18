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
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      className="shrink-0 z-20 px-5 py-3 flex items-center justify-between"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.55)',
        boxShadow: '0 1px 12px rgba(15,23,42,0.06)',
      }}
    >
      {/* Hamburger */}
      <button
        onClick={onMenuClick}
        aria-label="Toggle menu"
        className="w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Role badge */}
        <span
          className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{
            background: userRole === 'admin'
              ? 'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(79,70,229,0.08))'
              : 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(5,150,105,0.08))',
            color: userRole === 'admin' ? '#6366f1' : '#059669',
            border: `1px solid ${userRole === 'admin' ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)'}`,
          }}
        >
          {userRole === 'admin' ? '⚡ Admin' : '👤 Utente'}
        </span>

        {/* User chip */}
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.65)',
            border: '1px solid rgba(203,213,225,0.5)',
          }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
          >
            {initials || '?'}
          </div>
          <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-[120px] truncate">
            {userName}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          aria-label="Esci"
          title="Esci"
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 text-slate-400 hover:text-rose-500 hover:bg-rose-50"
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
