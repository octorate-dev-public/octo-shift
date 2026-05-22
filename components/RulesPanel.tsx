'use client';

import React, { useState } from 'react';

export interface RulesSection {
  icon: string;
  title: string;
  items: string[];
}

interface RulesPanelProps {
  /** Testo mostrato accanto all'icona ℹ️ quando il pannello è chiuso */
  label?: string;
  sections: RulesSection[];
}

/**
 * Pannello informativo collassabile che spiega le regole/logiche di un algoritmo.
 * Di default è chiuso — l'utente lo apre solo se vuole saperne di più.
 */
export default function RulesPanel({ label = 'Come funziona questo algoritmo', sections }: RulesPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border transition-colors ${open ? 'border-blue-200 bg-blue-50/50' : 'border-blue-100 bg-blue-50/30'}`}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-blue-700 hover:bg-blue-100/60 transition-colors rounded-xl"
      >
        <span className="text-base leading-none">ℹ️</span>
        <span className="flex-1">{label}</span>
        <span className="text-xs font-normal text-blue-400 flex-shrink-0">
          {open ? '▲ Nascondi' : '▼ Mostra regole'}
        </span>
      </button>

      {/* Corpo espanso */}
      {open && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {sections.map((s, i) => (
            <div key={i} className="bg-white rounded-lg border border-blue-100 p-3.5 space-y-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{s.icon}</span>
                <span className="text-sm font-semibold text-gray-800">{s.title}</span>
              </div>
              <ul className="space-y-1.5">
                {s.items.map((item, j) => (
                  <li key={j} className="flex gap-1.5 text-xs text-gray-600 leading-snug">
                    <span className="text-blue-300 flex-shrink-0 mt-px">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
