# 📋 Implementation Guide - Completamento della App

Questo documento spiega come completare le pagine e funzionalità rimaste della SmartWork Scheduler.

## 🎯 Stato Attuale

La struttura base è completa con:
- ✅ Database schema (Supabase)
- ✅ API services
- ✅ Componenti base (Layout, Sidebar, Header, Calendar)
- ✅ Pagina Login
- ✅ Dashboard Admin
- ✅ Pagina Scheduling con drag & drop
- ✅ Pagina Calendario (visualizzazione)
- ✅ Pagina Pubblica Reperibilità

## 📝 Pagine da Completare

### 1. Admin Pages

#### `/admin/users` - Gestione Dipendenti
```typescript
// Funzionalità:
- Tabella di tutti i dipendenti
- Colonne: Nome, Email, Team, Anzianità, Ruolo, Azioni
- Pulsanti: Aggiungi, Modifica, Elimina, Disattiva
- Modali per add/edit
- Cerca dipendenti
```

**File da creare**: `app/admin/users/page.tsx`

Segui il pattern:
```typescript
'use client';

import Layout from '@/components/Layout';
import { usersAPI } from '@/lib/api/users';
import { User } from '@/types';

export default function UsersPage() {
  // useState per users, loading, etc.
  // useEffect per loadData
  // Render tabella con usersAPI
}
```

#### `/admin/teams` - Gestione Team
```typescript
// Funzionalità:
- Tabella team
- Colonne: Nome, Giorno Riunione, Dipendenti, Azioni
- Aggiungi/modifica/elimina team
// File: app/admin/teams/page.tsx
```

#### `/admin/settings` - Impostazioni Globali
```typescript
// Funzionalità:
- Capienza massima ufficio (numero input)
- Numero persone in reperibilità (numero input)
- Fuso orario (select)
- Salva modifiche

// File: app/admin/settings/page.tsx
// Usa: settingsAPI.getMaxOfficeCapacity(), etc.
```

#### `/admin/leave` - Ferie e Permessi
```typescript
// Funzionalità:
- Tabella richieste ferie/permessi
- Colonne: Dipendente, Tipo, Date, Stato, Azioni
- Stato: Pending, Approved, Rejected
- Pulsanti: Approva, Rifiuta
// File: app/admin/leave/page.tsx
```

#### `/admin/on-call` - Gestione Reperibilità
```typescript
// Funzionalità:
- Tabella settimane e assegnamenti
- Colonne: Settimana, Dipendente, Azioni
- Pulsante "Genera Rotazione" per il mese
- Modifica assegnamenti

// File: app/admin/on-call/page.tsx
// Usa: onCallAPI.generateMonthOnCall()
```

#### `/admin/swaps` - Richieste di Scambio
```typescript
// Funzionalità:
- Tabella richieste scambio
- Colonne: Richiedente, Contraente, Date, Stato, Azioni
- Stato: Pending, Accepted, Rejected
- Pulsanti: Accetta, Rifiuta

// File: app/admin/swaps/page.tsx
// Usa: swapRequestsAPI
```

### 2. User Pages (Non-Admin)

#### `/schedule` - Il mio Schedule
```typescript
// Visualizza turni dell'utente loggato
// Mese/settimana view
// Filtri per tipo turno

// File: app/schedule/page.tsx
// Usa: shiftsAPI.getUserShifts()
```

#### `/swaps` - Richieste Scambio Utente
```typescript
// Tabella scambi richiesti/ricevuti
// Stato richieste
// Pulsanti per crearne di nuove

// File: app/swaps/page.tsx
```

#### `/leave` - Ferie e Permessi Utente
```typescript
// Visualizza ferie e permessi personali
// Pulsante per fare richiesta
// Calendario con giorni già prenotati

// File: app/leave/page.tsx
```

#### `/on-call` - Reperibilità Utente
```typescript
// Visualizza turni di reperibilità assegnati
// Calendario with on-call weeks highlighted
// Info sulla settimana corrente

// File: app/on-call/page.tsx
```

## 🔧 Pattern di Implementazione

### Pattern per Pagina Tabel

```typescript
'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { apiFunction } from '@/lib/api/module';
import { DataType } from '@/types';

export default function PageName() {
  const [data, setData] = useState<DataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const result = await apiFunction();
      setData(result);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Sei sicuro?')) {
      try {
        await apiFunction.delete(id);
        await loadData();
      } catch (error) {
        alert('Errore');
      }
    }
  };

  return (
    <Layout userRole="admin">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Page Title</h1>
          <button className="btn-primary">+ Aggiungi</button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Col1</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Col2</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">{item.field1}</td>
                  <td className="px-6 py-4">{item.field2}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button className="text-blue-600 hover:text-blue-800">
                      ✏️ Modifica
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      🗑️ Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
```

### Pattern per Modal Add/Edit

```typescript
interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>;
  initialData?: DataType;
}

export function AddModal({ isOpen, onClose, onSubmit, initialData }: AddModalProps) {
  const [formData, setFormData] = useState<FormData>(
    initialData || { /* default values */ }
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await onSubmit(formData);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Form fields */}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? '⏳' : '✓'} Salva
          </button>
        </form>
      </div>
    </div>
  );
}
```

## 🔐 Protezione delle Rotte

Aggiungi middleware per proteggere le rotte:

```typescript
// lib/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from './supabase';

export async function middleware(request: NextRequest) {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (!session && request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/schedule/:path*', '/swaps/:path*'],
};
```

## 📊 Componenti Riutilizzabili da Creare

### Button Component
```typescript
// components/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}
```

### Modal Component
```typescript
// components/Modal.tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}
```

### Table Component
```typescript
// components/Table.tsx
interface TableProps {
  columns: ColumnDef[];
  data: any[];
  onEdit?: (item: any) => void;
  onDelete?: (id: string) => void;
}
```

## 🔄 Workflow di Completamento Consigliato

1. **Priorità Alta**
   - [ ] `/admin/users` - Gestire dipendenti è fondamentale
   - [ ] `/admin/settings` - Configurare app
   - [ ] `/schedule` - Utenti vedono loro turni

2. **Priorità Media**
   - [ ] `/admin/on-call` - Gestire reperibilità
   - [ ] `/admin/leave` - Gestire ferie/permessi
   - [ ] `/admin/teams` - Gestire team

3. **Priorità Bassa**
   - [ ] `/admin/swaps` - Gestire scambi
   - [ ] `/swaps` - Utenti richiedono scambi
   - [ ] `/leave` - Utenti richiedono ferie
   - [ ] Google Calendar sync

## 🚀 Feature da Aggiungere Dopo

### Autenticazione Migliorata
- Reset password
- 2FA
- OAuth con Google/GitHub

### Notifiche
- Email notifications
- In-app notifications
- SMS (optional)

### Reporting
- Report PDF mensili
- Excel export
- Analytics dashboard

### Integrazioni
- Google Calendar
- Slack notifications
- Microsoft Teams

## 🧪 Testing

Per cada pagina, testa:
- [ ] Loading state
- [ ] Error handling
- [ ] CRUD operations
- [ ] Permissions
- [ ] Mobile responsiveness

Comando test:
```bash
npm run test
```

## 📚 Risorse Utili

- [Supabase Docs](https://supabase.com/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Hooks](https://react.dev/reference/react)

## 💬 Tips

1. Usa sempre TypeScript types
2. Error handling sempre con try/catch
3. Loading states per UX migliore
4. Validazione input client + server
5. Componenti riutilizzabili
6. CSS Tailwind per styling

---

**Buona fortuna con il completamento! 🚀**
