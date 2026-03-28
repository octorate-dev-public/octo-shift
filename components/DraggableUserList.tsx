'use client';

import React, { useState } from 'react';
import { User } from '@/types';
import { getInitials, getSeniorityDays } from '@/lib/utils';

interface DraggableUserListProps {
  users: User[];
  onDragStart: (user: User, type: 'office' | 'smartwork') => void;
  onDragEnd: () => void;
  selectedDate?: string;
}

export default function DraggableUserList({
  users,
  onDragStart,
  onDragEnd,
  selectedDate,
}: DraggableUserListProps) {
  const [draggedUser, setDraggedUser] = useState<string | null>(null);

  const handleDragStart = (user: User, type: 'office' | 'smartwork') => {
    setDraggedUser(user.id);
    onDragStart(user, type);
  };

  const handleDragEnd = () => {
    setDraggedUser(null);
    onDragEnd();
  };

  // Sort users by seniority (most senior first)
  const sortedUsers = [...users].sort((a, b) => {
    const aDays = getSeniorityDays(a.seniority_date);
    const bDays = getSeniorityDays(b.seniority_date);
    return bDays - aDays;
  });

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Dipendenti
        {selectedDate && (
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({new Date(selectedDate).toLocaleDateString('it-IT')})
          </span>
        )}
      </h3>

      <div className="space-y-2">
        {sortedUsers.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
          >
            {/* Avatar */}
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              {getInitials(user.full_name)}
            </div>

            {/* User info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {user.full_name}
              </div>
              <div className="text-xs text-gray-500">
                {Math.floor(getSeniorityDays(user.seniority_date) / 365)} anni
              </div>
            </div>

            {/* Drag buttons */}
            <div className="flex gap-2">
              <button
                draggable
                onDragStart={() => handleDragStart(user, 'office')}
                onDragEnd={handleDragEnd}
                className={`px-2 py-1 text-xs font-medium rounded transition cursor-move ${
                  draggedUser === user.id
                    ? 'bg-blue-600 text-white opacity-50'
                    : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                }`}
                title="Trascinare per assegnare in ufficio"
              >
                Ufficio
              </button>
              <button
                draggable
                onDragStart={() => handleDragStart(user, 'smartwork')}
                onDragEnd={handleDragEnd}
                className={`px-2 py-1 text-xs font-medium rounded transition cursor-move ${
                  draggedUser === user.id
                    ? 'bg-green-600 text-white opacity-50'
                    : 'bg-green-100 text-green-800 hover:bg-green-200'
                }`}
                title="Trascinare per assegnare in smartwork"
              >
                Smart
              </button>
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Nessun dipendente disponibile
        </div>
      )}
    </div>
  );
}
