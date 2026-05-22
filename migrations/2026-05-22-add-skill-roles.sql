-- Aggiunge la colonna skill_roles (es. BACKEND, FRONTEND, QUALITY) agli utenti.
-- Un dipendente può avere più ruoli tecnici contemporaneamente (array).
-- I nomi dei ruoli disponibili sono configurabili in settings.user_skill_roles.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS skill_roles text[] DEFAULT '{}';

-- Imposta il valore di default per i nuovi utenti
ALTER TABLE users
  ALTER COLUMN skill_roles SET DEFAULT '{}';
