-- Migration: swap_shift_assignments
-- Scambio "giorni" tra due dipendenti: scambia shift_type tra i due utenti sui
-- giorni coinvolti (quello del requester e quello del responder), lasciando
-- INVARIATO user_id/shift_date. Così NON viola mai UNIQUE(user_id, shift_date)
-- (il vecchio swap_shift_users scambiava user_id → duplicato 23505 su date diverse,
-- perché ogni utente ha già un turno ogni giorno).
--
-- Regole: rifiuta se un giorno coinvolto è bloccato o in ferie/permesso.

CREATE OR REPLACE FUNCTION public.swap_shift_assignments(
  p_requester_shift_id UUID,
  p_responder_shift_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  u_req  UUID; d_req  DATE;
  u_resp UUID; d_resp DATE;
  d DATE;
  dates DATE[];
  t_req  shifts.shift_type%TYPE;
  t_resp shifts.shift_type%TYPE;
BEGIN
  SELECT user_id, shift_date INTO u_req,  d_req  FROM shifts WHERE id = p_requester_shift_id FOR UPDATE;
  SELECT user_id, shift_date INTO u_resp, d_resp FROM shifts WHERE id = p_responder_shift_id FOR UPDATE;

  IF u_req IS NULL OR u_resp IS NULL THEN RAISE EXCEPTION 'shift_not_found'; END IF;
  IF u_req = u_resp THEN RETURN; END IF;

  IF d_req = d_resp THEN dates := ARRAY[d_req]; ELSE dates := ARRAY[d_req, d_resp]; END IF;

  FOREACH d IN ARRAY dates LOOP
    -- entrambe le righe devono esistere
    IF (SELECT count(*) FROM shifts WHERE user_id IN (u_req, u_resp) AND shift_date = d) < 2 THEN
      RAISE EXCEPTION 'missing_row';
    END IF;
    -- nessun giorno bloccato
    IF EXISTS (SELECT 1 FROM shifts WHERE user_id IN (u_req, u_resp) AND shift_date = d AND locked) THEN
      RAISE EXCEPTION 'locked';
    END IF;
    -- nessun giorno in ferie/permesso (non si scambia un'assenza)
    IF EXISTS (SELECT 1 FROM shifts WHERE user_id IN (u_req, u_resp) AND shift_date = d AND leave_type IS NOT NULL) THEN
      RAISE EXCEPTION 'leave';
    END IF;

    SELECT shift_type INTO t_req  FROM shifts WHERE user_id = u_req  AND shift_date = d;
    SELECT shift_type INTO t_resp FROM shifts WHERE user_id = u_resp AND shift_date = d;

    UPDATE shifts SET shift_type = t_resp WHERE user_id = u_req  AND shift_date = d;
    UPDATE shifts SET shift_type = t_req  WHERE user_id = u_resp AND shift_date = d;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_shift_assignments(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.swap_shift_assignments(UUID, UUID) TO authenticated;
