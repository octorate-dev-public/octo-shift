# 🚀 SmartWork Scheduler - Setup Guide

Una guida completa per installare e configurare l'applicazione SmartWork Scheduler.

## 📋 Prerequisiti

- **Node.js**: 18+ (su Mac: `brew install node`)
- **npm**: Viene installato con Node.js
- **Git**: Per clonare il repository
- **Account Supabase**: Gratuito su https://supabase.com
- **Account Vercel**: Gratuito su https://vercel.com (per deployment)

## 🔧 Setup Locale

### Passo 1: Clona il repository

```bash
git clone <repository-url>
cd octo-shift
```

### Passo 2: Installa le dipendenze

```bash
npm install
```

Se usi HomeBrew su Mac e hai problemi, assicurati di avere Node.js aggiornato:
```bash
brew upgrade node
```

### Passo 3: Configura Supabase

1. **Crea un nuovo progetto** su https://supabase.com
2. **Vai a SQL Editor** nel dashboard
3. **Copia tutto il contenuto** da `supabase-schema.sql`
4. **Incolla e esegui** nel SQL Editor

Questo creerà tutte le tabelle necessarie.

### Passo 4: Ottieni le credenziali Supabase

1. Vai a **Project Settings** → **API**
2. Copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

### Passo 5: Crea file .env.local

```bash
cp .env.example .env.local
```

Modifica `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id (optional)
GOOGLE_CLIENT_SECRET=your_google_client_secret (optional)
```

### Passo 6: Avvia il server di sviluppo

```bash
npm run dev
```

Apri http://localhost:3000 nel browser.

## 👤 Primo Accesso - Creare Utenti

Al primo accesso, dovrai creare gli utenti tramite Supabase:

1. **Vai a Supabase Dashboard** → **Authentication** → **Users**
2. **Clicca "Invite"**
3. **Crea admin iniziale**:
   - Email: `admin@example.com`
   - Password: scegli una password sicura

Poi nella tabella `users` aggiungi il record:
```sql
INSERT INTO users (id, email, full_name, role, seniority_date, is_active)
VALUES (
  'USER_ID_FROM_AUTH',
  'admin@example.com',
  'Admin User',
  'admin',
  '2020-01-01',
  true
);
```

## 🌐 Deployment su Vercel

### Passo 1: Push su GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### Passo 2: Connetti a Vercel

1. Vai a https://vercel.com/new
2. Clicca **Import Git Repository**
3. Seleziona il tuo repository
4. Clicca **Import**

### Passo 3: Configura Variabili d'Ambiente

Nel form di Vercel, aggiungi:
```
NEXT_PUBLIC_SUPABASE_URL = https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = your_anon_key
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key
NEXT_PUBLIC_APP_URL = https://your-app.vercel.app
```

### Passo 4: Deploy

Clicca **Deploy**. Vercel creerà l'app e ti darà un URL pubblico.

## 📱 Uso dell'Applicazione

### Per Admin

1. Accedi a `/` con le tue credenziali
2. **Dashboard Admin**: Visualizza statistiche
3. **Schedule**:
   - Clicca "Genera Schedule" per creare schedule automatico
   - Trascina dipendenti nei giorni per assegnarli
4. **Dipendenti**: Aggiungi nuovi dipendenti
5. **Impostazioni**: Configura capienza ufficio, reperibilità, etc.

### Per Utenti Normali

1. Accedi con le tue credenziali
2. **Il mio Schedule**: Visualizza i tuoi turni
3. **Richieste Scambio**: Crea richieste di scambio
4. **Ferie e Permessi**: Gestisci ferie/permessi
5. **Chi è Reperibile**: Visualizza chi è reperibile

### Pagina Pubblica Reperibilità

Accessibile senza login:
```
https://your-app.vercel.app/public-on-call
```

Mostra chi è reperibile oggi.

## 📊 Funzionalità Principali

### ✅ Scheduling Automatico
- Clicca "Genera Schedule" una volta al mese
- L'app crea uno schedule che rispetta:
  - Capienza massima dell'ufficio
  - Anzianità dei dipendenti
  - Riunioni team
  - Equità di rotazione

### ✅ Drag & Drop
- Trascina dipendenti dalla sidebar
- Rilascia su giorni specifici per assegnarli
- Cambia il tipo di turno (Ufficio/Smartwork)

### ✅ Lock (Blocco)
- Clicca il lucchetto su un turno per bloccarlo
- I turni bloccati non cambiano anche se rigeneri lo schedule

### ✅ Scambio Turni
- Dipendenti richiedono scambi
- Se entrambi accettano, lo scambio è automatico
- Admin non riceve notifiche

### ✅ Reperibilità
- Admin assegna turni di reperibilità (1 settimana a persona)
- Pagina pubblica mostra chi è reperibile oggi
- Parametro configurabile: numero di persone

## 🛠️ Troubleshooting

### Errore: "Cannot find module"
```bash
rm -rf node_modules
npm install
```

### Errore di connessione Supabase
- Verifica URL e chiavi in `.env.local`
- Assicurati che Supabase sia online
- Controlla firewall/VPN

### Porta 3000 già in uso
```bash
# Uccidi il processo
lsof -i :3000
kill -9 <PID>

# O usa una porta diversa
npm run dev -- -p 3001
```

### Su Mac con M1/M2/M4
Assicurati di installare le dipendenze correct:
```bash
npm install --arch=arm64
```

## 📚 Documentazione Aggiuntiva

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript](https://www.typescriptlang.org/docs/)

## 🎯 Prossimi Passi

1. ✅ Setup completato
2. ⚠️ Crea i primi dipendenti
3. ⚠️ Configura impostazioni (capienza, reperibilità)
4. ⚠️ Crea il primo schedule
5. ⚠️ Testa drag & drop
6. ⚠️ Testa pagina pubblica reperibilità

## 💡 Tips per Mac OS

### Creare uno script di avvio

Crea un file `~/.local/bin/smartwork`:
```bash
#!/bin/bash
cd ~/Projects/octo-shift
npm run dev
```

Rendi eseguibile:
```bash
chmod +x ~/.local/bin/smartwork
```

Ora puoi avviare con:
```bash
smartwork
```

### Usare VS Code
```bash
code .
```

### Build per produzione
```bash
npm run build
npm run start
```

## 📞 Support

Per problemi o domande durante il setup, contatta il team di sviluppo.

---

**Buona fortuna! 🚀**
