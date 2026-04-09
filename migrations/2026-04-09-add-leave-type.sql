-- Migration: introduce leave_type overlay column on `shifts`
-- Date: 2026-04-09
--
-- Cosa fa:
-- 1. Aggiunge la colonna `leave_type` (sick | vacation | permission | NULL).
-- 2. Migra i vecchi valori di `shift_type` ('vacation','permission','sick')
--    nella nuova colonna `leave_type`, ripristinando un `shift_type` valido
--    ('office' di default — modificare se serve un'altra logica).
-- 3. Sostituisce il CHECK su `shift_type` per ammettere solo 'office' e
--    'smartwork'.
-- 4. Aggiunge il CHECK su `leave_type`.
--
-- Eseguire dal SQL Editor di Supabase. Idempotente: si può rieseguire.

BEGIN;

-- 1. Aggiungi la colonna se non esiste
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS leave_type VARCHAR(20);

-- 2. Travasa i vecchi valori. Manteniamo `shift_type='office'` come fallback
--    perché non possiamo sapere a posteriori se la persona sarebbe stata in
--    smart o in ufficio. Cambiare manualmente se necessario.
UPDATE shifts
SET    leave_type = shift_type,
       shift_type = 'office'
WHERE  shift_type IN ('vacation', 'permission', 'sick')
  AND  leave_type IS NULL;

-- 3. Rimuovi il vecchio CHECK su shift_type (il nome può variare; lo
--    cerchiamo dinamicamente).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM   pg_constraint
  WHERE  conrelid = 'shifts'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) ILIKE '%shift_type%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE shifts DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE shifts
  ADD CONSTRAINT shifts_shift_type_check
  CHECK (shift_type IN ('office', 'smartwork'));

-- 4. CHECK su leave_type
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM   pg_constraint
  WHERE  conrelid = 'shifts'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) ILIKE '%leave_type%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE shifts DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE shifts
  ADD CONSTRAINT shifts_leave_type_check
  CHECK (leave_type IS NULL OR leave_type IN ('sick', 'vacation', 'permission'));

-- 5. Forza Supabase / PostgREST a ricaricare lo schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
