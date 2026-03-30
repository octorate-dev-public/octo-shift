'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Calendar from '@/components/Calendar';
import { api } from '@/lib/fetcher';
import { ShiftWithUser, Team, User } from '@/types';
import { useAuth } from '@/lib/useAuth';

export default function CalendarPage() {
  const { userName, userRole, logout } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [shifts, setShifts] = useState<ShiftWithUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [maxCapacity, setMaxCapacity] = useState(30);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [workDays, setWorkDays] = useState<string[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      const m = month + 1;
      const [shiftsData, settingsData, teamsData, usersData] = await Promise.all([
        api.get<ShiftWithUser[]>(`/api/shifts?year=${year}&month=${m}`),
        api.get<Record<string, string>>('/api/settings'),
        api.get<Team[]>('/api/teams'),
        api.get<User[]>('/api/users'),
      ]);
      setShifts(shiftsData);
      setTeams(teamsData);
      setUsers(usersData);
      setMaxCapacity(
        settingsData.max_office_capacity ? parseInt(settingsData.max_office_capacity) : 30,
      );
      const newHolidays = Object.keys(settingsData)
        .filter((k) => k.startsWith('holiday:'))
        .map((k) => k.replace('holiday:', ''));
      setHolidays(newHolidays);
      if (settingsData.work_days) {
        setWorkDays(settingsData.work_days.split(',').map((d: string) => d.trim()).filter(Boolean));
      }
    } catch (error: any) {
      console.error('Error loading calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    const newDate = new Date(year, month + delta);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth());
  };

  return (
    <Layout userRole={userRole} userName={userName} onLogout={logout}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendario</h1>
          <p className="text-gray-600 mt-2">Visualizza lo schedule del mese</p>
        </div>

        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button onClick={() => handleMonthChange(-1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
            ← Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900">
            {new Date(year, month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => handleMonthChange(1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
            Successivo →
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Calendar
            year={year}
            month={month + 1}
            shifts={shifts}
            maxCapacity={maxCapacity}
            teams={teams}
            users={users}
            holidays={holidays}
            workDays={workDays}
            editable={false}
          />
        )}
      </div>
    </Layout>
  );
}
