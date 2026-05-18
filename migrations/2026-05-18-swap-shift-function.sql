-- Migration: swap_shift_users function
-- Permette lo scambio atomico di due turni senza violare
-- UNIQUE(user_id, shift_date) anche quando i turni cadono nello stesso giorno.

-- 1. Rendi il constraint deferrable
--    (DROP + ADD perché non si può alterare un constraint inline direttamente)
ALTER TABLE shifts
  DROP CONSTRAINT IF EXISTS shifts_user_id_shift_date_key;

ALTER TABLE shifts
  ADD CONSTRAINT shifts_user_id_shift_date_key
  UNIQUE (user_id, shift_date)
  DEFERRABLE INITIALLY IMMEDIATE;

-- 2. Crea (o sostituisci) la funzione di swap
CREATE OR REPLACE FUNCTION public.swap_shift_users(
  p_requester_shift_id UUID,
  p_responder_shift_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requester_user UUID;
  v_responder_user UUID;
BEGIN
  -- Leggi e blocca le righe per evitare race conditions
  SELECT user_id INTO STRICT v_requester_user
    FROM shifts WHERE id = p_requester_shift_id FOR UPDATE;

  SELECT user_id INTO STRICT v_responder_user
    FROM shifts WHERE id = p_responder_shift_id FOR UPDATE;

  -- Se sono già dello stesso utente non c'è nulla da fare
  IF v_requester_user = v_responder_user THEN
    RETURN;
  END IF;

  -- Defer il constraint per tutta la transazione: i due UPDATE intermedi
  -- possono violare transitoriamente UNIQUE(user_id, shift_date)
  -- (caso same-date), ma il controllo finale avverrà a fine transazione
  -- quando lo stato è di nuovo valido.
  SET CONSTRAINTS shifts_user_id_shift_date_key DEFERRED;

  UPDATE shifts SET user_id = v_responder_user WHERE id = p_requester_shift_id;
  UPDATE shifts SET user_id = v_requester_user  WHERE id = p_responder_shift_id;
END;
$$;

-- 3. Permessi di esecuzione ai ruoli Supabase
GRANT EXECUTE ON FUNCTION public.swap_shift_users(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.swap_shift_users(UUID, UUID) TO authenticated;
