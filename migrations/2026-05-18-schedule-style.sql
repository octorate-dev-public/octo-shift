-- Migration: schedule_style per utente
-- Indica se l'algoritmo di scheduling deve mantenere una distribuzione
-- stabile (stessi giorni della settimana ogni settimana) o variata
-- (pattern settimanale diverso, più imprevedibile).
--
-- 'stable'  → l'algoritmo dà un bonus di coerenza per ripetere
--             gli stessi giorni di smartwork settimana dopo settimana
-- 'random'  → comportamento attuale + piccola variazione casuale
--             per evitare pattern rigidi
--
-- Default: 'random' → backward-compatible con il comportamento precedente.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS schedule_style VARCHAR(10)
    NOT NULL DEFAULT 'random'
    CHECK (schedule_style IN ('stable', 'random'));

COMMENT ON COLUMN users.schedule_style IS
  'Preferenza di distribuzione smart: stable = stessi giorni/settimana, random = variato';
