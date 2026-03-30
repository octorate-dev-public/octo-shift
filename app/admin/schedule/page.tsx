'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Calendar from '@/components/Calendar';
import DraggableUserList from '@/components/DraggableUserList';
import DayShiftPanel from '@/components/DayShiftPanel';
import { api } from '@/lib/fetcher';
import { ShiftWithUser, User, Team, ShiftPreference, PreferenceType } from '@/types';
import type { SwapCell } from '@/components/Calendar';

export default function SchedulePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [shifts, setShifts] = useState<ShiftWithUser[]>([]);
  const [maxCapacity, setMaxCapacity] = useState(30);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [workDays, setWorkDays] = useState<string[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draggedUser, setDraggedUser] = useState<User | null>(null);
  const [dragType, setDragType] = useState<'office' | 'smartwork' | null>(null);
  const [preferences, setPreferences] = useState<ShiftPreference[]>([]);
  const [showPreferences, setShowPreferences] = useState(true);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      const m = month + 1; // API expects 1-based month
      const monthYear = `${year}-${String(m).padStart(2, '0')}`;
      const [usersData, shiftsData, settingsData, teamsData, prefsData] = await Promise.all([
        api.get<User[]>('/api/users'),
        api.get<ShiftWithUser[]>(`/api/shifts?year=${year}&month=${m}`),
        api.get<Record<string, string>>('/api/settings'),
        api.get<Team[]>('/api/teams'),
        api.get<ShiftPreference[]>(`/api/preferences?monthYear=${monthYear}`),
      ]);

      setUsers(usersData);
      setShifts(shiftsData);
      setTeams(teamsData);
      setPreferences(prefsData);
      setMaxCapacity(
        settingsData.max_office_capacity ? parseInt(settingsData.max_office_capacity) : 30,
      );
      // Parse holidays from settings
      const newHolidays = Object.keys(settingsData)
        .filter((k) => k.startsWith('holiday:'))
        .map((k) => k.replace('holiday:', ''));
      setHolidays(newHolidays);
      // Parse work days from settings
      if (settingsData.work_days) {
        setWorkDays(settingsData.work_days.split(',').map((d: string) => d.trim()).filter(Boolean));
      }
    } catch (error: any) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShiftChange = async (userId: string, shiftDate: string, newType: 'office' | 'smartwork') => {
    await api.post('/api/shifts', { userId, shiftDate, shiftType: newType });
    await loadData();
  };

  const handleSwapShifts = async (a: SwapCell, b: SwapCell) => {
    const tasks: Promise<any>[] = [];

    // Position A → gets B's type
    if (b.shiftType) {
      tasks.push(api.post('/api/shifts', { userId: a.userId, shiftDate: a.date, shiftType: b.shiftType }));
    } else if (a.shiftType) {
      tasks.push(api.del(`/api/shifts?userId=${a.userId}&shiftDate=${a.date}`));
    }

    // Position B → gets A's type
    if (a.shiftType) {
      tasks.push(api.post('/api/shifts', { userId: b.userId, shiftDate: b.date, shiftType: a.shiftType }));
    } else if (b.shiftType) {
      tasks.push(api.del(`/api/shifts?userId=${b.userId}&shiftDate=${b.date}`));
    }

    await Promise.all(tasks);
    await loadData();
  };

  const handleToggleHoliday = async (date: string) => {
    if (holidays.includes(date)) {
      await api.del(`/api/settings?key=${encodeURIComponent(`holiday:${date}`)}`);
    } else {
      await api.post('/api/settings', { key: `holiday:${date}`, value: '1' });
    }
    // Refresh settings to get updated holidays
    const settingsData = await api.get<Record<string, string>>('/api/settings');
    const newHolidays = Object.keys(settingsData)
      .filter((k) => k.startsWith('holiday:'))
      .map((k) => k.replace('holiday:', ''));
    setHolidays(newHolidays);
  };

  const handleGenerateSchedule = async () => {
    try {
      setGenerating(true);
      await api.post('/api/scheduling', {
        action: 'generate',
        year,
        month: month + 1, // 1-based
      });
      await loadData();
      alert('Schedule creato con successo!');
    } catch (error: any) {
      console.error('Error generating schedule:', error);
      alert(`Errore nella creazione dello schedule: ${error.message}`);
    } finally {
      setGenerating(false);
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

  const handleMonthChange = (delta: number) => {
    const newDate = new Date(year, month + delta);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth()); // keep 0-based
  };

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Schedule Mensile</h1>
            <p className="text-gray-600 mt-2">Crea e gestisci lo schedule dei dipendenti</p>
          </div>
          <button
            onClick={handleGenerateSchedule}
            disabled={generating}
            className="btn-primary disabled:opacity-50"
          >
            {generating ? '⏳ Generando...' : '📅 Genera Smart Per Questo Mese'}
          </button>
        </div>

        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button onClick={() => handleMonthChange(-1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
            ← Mese Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900">
            {new Date(year, month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => handleMonthChange(1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
            Mese Successivo →
          </button>
        </div>

        {/* Preferences summary */}
        {preferences.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Preferenze dipendenti ({preferences.length} espresse)
              </h3>
              <button
                onClick={() => setShowPreferences(!showPreferences)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showPreferences ? 'Nascondi dettagli' : 'Mostra dettagli'}
              </button>
            </div>
            {showPreferences && (() => {
              // Build summary: per user, count home/office prefs
              const userPrefSummary = new Map<string, { home: number; office: number }>();
              preferences.forEach((p) => {
                if (p.preference === 'indifferent') return;
                if (!userPrefSummary.has(p.user_id)) userPrefSummary.set(p.user_id, { home: 0, office: 0 });
                const entry = userPrefSummary.get(p.user_id)!;
                if (p.preference === 'home') entry.home++;
                if (p.preference === 'office') entry.office++;
              });

              return (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {[...userPrefSummary.entries()].map(([uid, counts]) => {
                    const user = users.find((u) => u.id === uid);
                    return (
                      <div key={uid} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                        <span className="font-medium text-gray-800">
                          {user?.full_name ?? uid.slice(0, 8)}
                        </span>
                        <div className="flex gap-2 mt-0.5 text-gray-500">
                          {counts.office > 0 && <span>🏢 {counts.office}g</span>}
                          {counts.home > 0 && <span>🏠 {counts.home}g</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <DraggableUserList
              users={users}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              selectedDate={selectedDate || undefined}
            />
          </div>
          <div className="lg:col-span-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Calendar
                year={year}
                month={month + 1}  // Calendar expects 1-based
                shifts={shifts}
                teams={teams}
                users={users}
                holidays={holidays}
                workDays={workDays}
                maxCapacity={maxCapacity}
                onDayClick={setSelectedDate}
                selectedDate={selectedDate}
                editable={true}
                onSwapShifts={handleSwapShifts}
              />
            )}
          </div>
        </div>
      </div>

      <DayShiftPanel
        date={selectedDate}
        shifts={shifts}
        users={users}
        maxCapacity={maxCapacity}
        isHoliday={selectedDate ? holidays.includes(selectedDate) : false}
        onClose={() => setSelectedDate(null)}
        onShiftChange={handleShiftChange}
        onToggleHoliday={handleToggleHoliday}
      />
    </Layout>
  );
}
