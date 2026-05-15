-- Migration: on_call_daily_assignments
-- Tabella per la reperibilità giornaliera (un dipendente per giorno).
-- Sostituisce la granularità settimanale per permettere swap giorno per giorno.

CREATE TABLE IF NOT EXISTS on_call_daily_assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(assignment_date)   -- un solo reperibile per giorno
);

CREATE INDEX IF NOT EXISTS idx_on_call_daily_date ON on_call_daily_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_on_call_daily_user ON on_call_daily_assignments(user_id);

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_on_call_daily_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_on_call_daily_updated_at ON on_call_daily_assignments;
CREATE TRIGGER set_on_call_daily_updated_at
  BEFORE UPDATE ON on_call_daily_assignments
  FOR EACH ROW EXECUTE FUNCTION update_on_call_daily_updated_at();
