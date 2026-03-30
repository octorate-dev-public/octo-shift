'use client';

import React from 'react';

interface HeaderProps {
  userName: string;
  userRole: 'admin' | 'user';
  onMenuClick: () => void;
  onLogout?: () => void;
}

export default function Header({
  userName,
  userRole,
  onMenuClick,
  onLogout,
}: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="text-gray-600 hover:text-gray-900"
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            SmartWork Scheduler
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900">{userName}</p>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {userRole === 'admin' ? 'Admin' : 'Utente'}
            </p>
          </div>

          <button
            onClick={onLogout}
            className="text-gray-600 hover:text-gray-900"
            aria-label="Logout"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
