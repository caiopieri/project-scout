-- F7.3: persistent idempotency/audit ledger only. It does not execute the
-- authorization envelope or grant permission to authenticated clients.
CREATE TABLE IF NOT EXISTS public.authorization_envelope_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  authorization_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED')),
  envelope_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(envelope_snapshot) = 'object'
    AND envelope_snapshot->>'authorizationVersion' = 'authorization-envelope.v1'
    AND envelope_snapshot->>'status' = 'PENDING_HUMAN_APPROVAL'
    AND envelope_snapshot->>'humanApproved' = 'false'
    AND envelope_snapshot->>'executable' = 'false'
    AND NOT (envelope_snapshot ?| ARRAY['payment', 'secret', 'command', 'send', 'bid'])
  ),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > issued_at),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (user_id, authorization_id),
  CHECK ((status = 'CONSUMED') = (consumed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS authorization_envelope_ledger_user_created_idx
  ON public.authorization_envelope_ledger (user_id, created_at DESC);

REVOKE ALL ON public.authorization_envelope_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.authorization_envelope_ledger TO authenticated;
GRANT ALL ON public.authorization_envelope_ledger TO service_role;
ALTER TABLE public.authorization_envelope_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authorization_envelope_ledger_owner_read
  ON public.authorization_envelope_ledger;
CREATE POLICY authorization_envelope_ledger_owner_read
  ON public.authorization_envelope_ledger FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
