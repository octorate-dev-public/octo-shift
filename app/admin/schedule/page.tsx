'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Calendar from '@/components/Calendar';
import DraggableUserList from '@/components/DraggableUserList';
import { shiftsAPI } from '@/lib/api/shifts';
import { usersAPI } from '@/lib/api/users';
import { schedulingAPI } from '@/lib/api/scheduling';
import { settingsAPI } from '@/lib/api/settings';
import { ShiftWithUser, User } from '@/types';
import { getMonthDays } from '@/lib/utils';

export default function SchedulePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<ShiftWithUser[]>([]);
  const [maxCapacity, setMaxCapacity] = useState(30);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draggedUser, setDraggedUser] = useState<User | null>(null);
  const [dragType, setDragType] = useState<'office' | 'smartwork' | null>(null);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, shiftsData, capacityData] = await Promise.all([
        usersAPI.getAllUsers(),
        shiftsAPI.getMonthShifts(year, month + 1),
        settingsAPI.getMaxOfficeCapacity(),
      ]);

      setUsers(usersData);
      setShifts(shiftsData);
      setMaxCapacity(capacityData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    try {
      setLoading(true);
      await schedulingAPI.generateMonthlySchedule(year, month + 1);
      await loadData();
      alert('Schedule creato con successo!');
    } catch (error) {
      console.error('Error generating schedule:', error);
      alert('Errore nella creazione dello schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (user: User, type: 'office' | 'smartwork') => {
    setDraggedUser(user);
    setDragType(type);
  };

  const handleDragEnd = () => {
    setDraggedUser(null);
    setDragType(null);
  };

  const handleDropOnDay = async (dateStr: string) => {
    if (!draggedUser || !dragType) return;

    try {
      await shiftsAPI.upsertShift(draggedUser.id, dateStr, dragType);
      await loadData();
    } catch (error) {
      console.error('Error updating shift:', error);
    }
  };

  const handleMonthChange = (delta: number) => {
    const newDate = new Date(year, month + delta);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth());
  };

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Schedule Mensile</h1>
            <p className="text-gray-600 mt-2">
              Crea e gestisci lo schedule dei dipendenti
            </p>
          </div>
          <button
            onClick={handleGenerateSchedule}
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? '⏳ Generando...' : '📅 Genera Schedule'}
          </button>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button
            onClick={() => handleMonthChange(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Mese Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900">
            {new Date(year, month).toLocaleDateString('it-IT', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <button
            onClick={() => handleMonthChange(1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            Mese Successivo →
          </button>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar with users */}
          <div className="lg:col-span-1">
            <DraggableUserList
              users={users}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              selectedDate={selectedDate || undefined}
            />
          </div>

          {/* Calendar */}
          <div
            className="lg:col-span-3"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('drag-over');
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('drag-over');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
            }}
          >
            <Calendar
              year={year}
              month={month + 1}
              shifts={shifts}
              maxCapacity={maxCapacity}
              onDayClick={setSelectedDate}
              editable={true}
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            💡 Come usare
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • Clicca su &quot;Genera Schedule&quot; per creare uno schedule
              automatico
            </li>
            <li>
              • Trascina i dipendenti sulla griglia per assegnarli a specifici
              giorni
            </li>
            <li>
              • Rosso significa capienza superata - il sistema avviserà
            </li>
            <li>
              • Le iniziali mostrano chi è in ufficio quel giorno (colore blu)
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
