'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Calendar from '@/components/Calendar';
import { shiftsAPI } from '@/lib/api/shifts';
import { settingsAPI } from '@/lib/api/settings';
import { ShiftWithUser } from '@/types';

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [shifts, setShifts] = useState<ShiftWithUser[]>([]);
  const [maxCapacity, setMaxCapacity] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shiftsData, capacityData] = await Promise.all([
        shiftsAPI.getMonthShifts(year, month + 1),
        settingsAPI.getMaxOfficeCapacity(),
      ]);

      setShifts(shiftsData);
      setMaxCapacity(capacityData);
    } catch (error) {
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
    <Layout userRole="user" userName="Utente">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendario</h1>
          <p className="text-gray-600 mt-2">
            Visualizza lo schedule del mese
          </p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button
            onClick={() => handleMonthChange(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Precedente
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
            Successivo →
          </button>
        </div>

        {/* Calendar */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">
            Caricamento calendario...
          </div>
        ) : (
          <Calendar
            year={year}
            month={month + 1}
            shifts={shifts}
            maxCapacity={maxCapacity}
            editable={false}
          />
        )}

        {/* Legend */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Legenda
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <div className="w-6 h-6 bg-blue-100 rounded mb-2 border border-blue-300"></div>
              <span className="text-gray-700">Ufficio</span>
            </div>
            <div>
              <div className="w-6 h-6 bg-green-100 rounded mb-2 border border-green-300"></div>
              <span className="text-gray-700">Smart</span>
            </div>
            <div>
              <div className="w-6 h-6 bg-yellow-100 rounded mb-2 border border-yellow-300"></div>
              <span className="text-gray-700">Ferie</span>
            </div>
            <div>
              <div className="w-6 h-6 bg-purple-100 rounded mb-2 border border-purple-300"></div>
              <span className="text-gray-700">Permesso</span>
            </div>
            <div>
              <div className="w-6 h-6 bg-red-100 rounded mb-2 border border-red-300"></div>
              <span className="text-gray-700">Malato</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
